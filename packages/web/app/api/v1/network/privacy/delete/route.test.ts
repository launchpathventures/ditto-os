/**
 * Route-level tests for POST /api/v1/network/privacy/delete (Brief 284, R-Q9).
 *
 * Engine-level coverage of recordPrivacyDeletion (the soft-delete +
 * tombstone + suppression hybrid in one transaction) lives in
 * src/engine/network-tombstones.test.ts. Here we exercise the HTTP seam:
 *  - caller-supplied stepRunId → 400 with zero side effects (AC #2)
 *  - tombstoned subject → 410 (idempotent re-delete)
 *  - happy path delegates to recordPrivacyDeletion + writes a `delete` audit (AC #4)
 *  - verification failure → 403 with zero side effects
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNetworkLaneStepRun: vi.fn(),
  findActiveTombstone: vi.fn(),
  recordPrivacyDeletion: vi.fn(),
  initiateEmailChallenge: vi.fn(),
  verifyNetworkIdentity: vi.fn(),
  resolveSubjectOwner: vi.fn(),
  writeNetworkAuditEvent: vi.fn(),
  checkEmailChallengeRateLimit: vi.fn(),
  resolveNetworkLaneSession: vi.fn(),
  networkDb: {
    transaction: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));
vi.mock("../../../../../../../../src/engine/network-identity-verification", () => ({
  initiateEmailChallenge: mocks.initiateEmailChallenge,
  verifyNetworkIdentity: mocks.verifyNetworkIdentity,
  resolveSubjectOwner: mocks.resolveSubjectOwner,
}));
vi.mock("../../../../../../../../src/engine/network-tombstones", () => ({
  findActiveTombstone: mocks.findActiveTombstone,
  recordPrivacyDeletion: mocks.recordPrivacyDeletion,
}));
vi.mock("../../../../../../../../src/engine/network-audit", () => ({
  writeNetworkAuditEvent: mocks.writeNetworkAuditEvent,
}));
vi.mock("../../../../../../../../src/engine/network-abuse-controls", () => ({
  checkEmailChallengeRateLimit: mocks.checkEmailChallengeRateLimit,
}));
vi.mock("../../kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));
vi.mock("../../../../../../../../src/db/network-db", () => ({
  networkDb: mocks.networkDb,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/privacy/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findActiveTombstone.mockResolvedValue(null);
  mocks.createNetworkLaneStepRun.mockResolvedValue(
    "network-lane-step:network-privacy-delete-verify-and-delete:abc",
  );
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "sess-1",
    userId: "user-1",
    actorId: "user-1",
    email: "owner@example.com",
    context: "client",
  });
  mocks.verifyNetworkIdentity.mockResolvedValue({
    verified: true,
    actorType: "user",
    actorId: "user-1",
  });
  mocks.resolveSubjectOwner.mockResolvedValue({
    userId: "user-1",
    email: "owner@example.com",
  });
  mocks.recordPrivacyDeletion.mockImplementation(async () => ({
    tombstone: {
      id: "tomb-1",
      deletedAt: new Date("2026-05-18T12:00:00.000Z"),
      purgeAfter: new Date("2026-06-17T12:00:00.000Z"),
      permanentStubAt: new Date("2028-05-18T12:00:00.000Z"),
    },
    created: true,
  }));
  mocks.writeNetworkAuditEvent.mockResolvedValue({
    id: "audit-1",
    createdAt: new Date("2026-05-18T12:00:00.000Z"),
  });
  mocks.checkEmailChallengeRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSec: 60,
  });
});

describe("POST /api/v1/network/privacy/delete — bypass (AC #2)", () => {
  it.each([false, "", null, "network-lane-step:bad"])(
    "rejects caller-supplied stepRunId %j with zero side effects",
    async (stepRunId) => {
      const response = await POST(
        request({
          subjectType: "member-signal",
          subjectId: "sig-1",
          sessionId: "sess-1",
          method: "session",
          stepRunId,
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "step_run_bypass_rejected",
      });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.findActiveTombstone).not.toHaveBeenCalled();
      expect(mocks.recordPrivacyDeletion).not.toHaveBeenCalled();
      expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/v1/network/privacy/delete — tombstone idempotency", () => {
  it("returns 410 when subject is already tombstoned (no double-delete)", async () => {
    mocks.findActiveTombstone.mockResolvedValueOnce({
      id: "tomb-1",
      deletedAt: new Date("2026-05-18T12:00:00.000Z"),
    });
    const response = await POST(
      request({
        subjectType: "member-signal",
        subjectId: "sig-1",
        sessionId: "sess-1",
        method: "session",
      }),
    );
    expect(response.status).toBe(410);
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordPrivacyDeletion).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/network/privacy/delete — happy path (AC #4)", () => {
  it("delegates to recordPrivacyDeletion and writes a delete audit", async () => {
    const response = await POST(
      request({
        subjectType: "member-signal",
        subjectId: "sig-1",
        sessionId: "sess-1",
        method: "session",
        reason: "user requested cleanup",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      tombstone: { id: "tomb-1" },
      created: true,
    });

    expect(mocks.recordPrivacyDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId:
          "network-lane-step:network-privacy-delete-verify-and-delete:abc",
        subjectType: "member-signal",
        subjectId: "sig-1",
        deletedByActorType: "user",
        actorId: "user-1",
        suppressionIdentifier: {
          identifier: "owner@example.com",
          identifierKind: "email",
        },
      }),
      expect.any(Function),
    );
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventClass: "delete",
        subjectType: "privacy_delete:member-signal",
        subjectId: "sig-1",
        actorType: "user",
        actorId: "user-1",
        reasonCode: "user requested cleanup",
      }),
    );
  });

  it("uses the caller's verified lane context for session identity", async () => {
    mocks.resolveNetworkLaneSession.mockResolvedValueOnce({
      sessionId: "expert-sess",
      userId: "user-1",
      actorId: "user-1",
      email: "owner@example.com",
      context: "expert",
    });

    const response = await POST(
      request({
        subjectType: "public-profile",
        subjectId: "user-1",
        sessionId: "expert-sess",
        method: "session",
        context: "expert",
        reason: "profile owner requested deletion",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveNetworkLaneSession).toHaveBeenCalledWith({
      sessionId: "expert-sess",
      context: "expert",
      fallbackUserId: null,
    });
    expect(mocks.verifyNetworkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ sessionUserId: "user-1" }),
    );
  });

  it("writes the dedicated profile_deleted audit event for public-profile deletion", async () => {
    const response = await POST(
      request({
        subjectType: "public-profile",
        subjectId: "user-1",
        sessionId: "sess-1",
        method: "session",
        reason: "profile owner requested deletion",
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventClass: "profile_deleted",
        subjectType: "privacy_delete:public-profile",
        subjectId: "user-1",
        actorType: "user",
        actorId: "user-1",
        reasonCode: "profile owner requested deletion",
      }),
    );
  });

  it("returns 403 with no deletion when verification fails", async () => {
    mocks.verifyNetworkIdentity.mockResolvedValueOnce({
      verified: false,
      error: "verification_failed",
    });
    const response = await POST(
      request({
        subjectType: "member-signal",
        subjectId: "sig-1",
        sessionId: "sess-1",
        method: "session",
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.recordPrivacyDeletion).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("supports discovery-profile deletion with a claim token and no lane session", async () => {
    const response = await POST(
      request({
        subjectType: "discovery-profile",
        subjectId: "profile-1",
        method: "claim-token",
        claimToken: "raw-token",
        reason: "delete discovered seed",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-privacy-delete-verify-and-delete",
        sessionId: "claim-token",
      }),
    );
    expect(mocks.verifyNetworkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "claim-token",
        subject: { subjectType: "discovery-profile", subjectId: "profile-1" },
        claimToken: "raw-token",
      }),
    );
    expect(mocks.recordPrivacyDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "discovery-profile",
        subjectId: "profile-1",
        deletedReason: "delete discovered seed",
      }),
      expect.any(Function),
    );
  });

  it("rate-limits initiate-challenge before verifier work", async () => {
    mocks.checkEmailChallengeRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 120,
    });
    const response = await POST(
      request({
        subjectType: "member-signal",
        subjectId: "sig-1",
        sessionId: "sess-1",
        action: "initiate-challenge",
        email: "owner@example.com",
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "too_many_requests",
      retryAfterSec: 120,
    });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.initiateEmailChallenge).not.toHaveBeenCalled();
    expect(mocks.verifyNetworkIdentity).not.toHaveBeenCalled();
  });
});
