/**
 * Route-level tests for POST /api/v1/network/privacy/export (Brief 284, R-Q6).
 *
 * Engine-level coverage of identity verification, export bundle, and audit
 * lives in src/engine/. Here we exercise the HTTP seam:
 *  - caller-supplied stepRunId (incl. falsy) → 400, zero side effects (AC #2)
 *  - tombstoned subject → 410 (AC #5 precondition / Insight-234 #4)
 *  - happy path mints wrapper run, writes audit event, returns transient bundle (AC #3)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createNetworkLaneStepRun: vi.fn(),
  findActiveTombstone: vi.fn(),
  initiateEmailChallenge: vi.fn(),
  verifyNetworkIdentity: vi.fn(),
  assembleExportBundle: vi.fn(),
  writeNetworkAuditEvent: vi.fn(),
  checkEmailChallengeRateLimit: vi.fn(),
  resolveNetworkLaneSession: vi.fn(),
}));

vi.mock("../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));
vi.mock("../../../../../../../../src/engine/network-identity-verification", () => ({
  initiateEmailChallenge: mocks.initiateEmailChallenge,
  verifyNetworkIdentity: mocks.verifyNetworkIdentity,
}));
vi.mock("../../../../../../../../src/engine/network-export-bundle", () => ({
  assembleExportBundle: mocks.assembleExportBundle,
}));
vi.mock("../../../../../../../../src/engine/network-audit", () => ({
  writeNetworkAuditEvent: mocks.writeNetworkAuditEvent,
}));
vi.mock("../../../../../../../../src/engine/network-tombstones", () => ({
  findActiveTombstone: mocks.findActiveTombstone,
}));
vi.mock("../../../../../../../../src/engine/network-abuse-controls", () => ({
  checkEmailChallengeRateLimit: mocks.checkEmailChallengeRateLimit,
}));
vi.mock("../../kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/privacy/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findActiveTombstone.mockResolvedValue(null);
  mocks.createNetworkLaneStepRun.mockResolvedValue(
    "network-lane-step:network-privacy-export-verify-and-export:abc",
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
  mocks.assembleExportBundle.mockResolvedValue({
    sections: { network_member_signals: { rows: [{ id: "sig-1" }] } },
    skippedTombstoned: 0,
    snapshotAt: new Date("2026-05-18T12:00:00.000Z"),
  });
  mocks.writeNetworkAuditEvent.mockResolvedValue({
    id: "audit-1",
    createdAt: new Date("2026-05-18T12:00:00.000Z"),
  });
  mocks.checkEmailChallengeRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSec: 60,
  });
});

describe("POST /api/v1/network/privacy/export — bypass + bypass-shape (AC #2)", () => {
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
      expect(mocks.verifyNetworkIdentity).not.toHaveBeenCalled();
      expect(mocks.assembleExportBundle).not.toHaveBeenCalled();
      expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/v1/network/privacy/export — tombstone (AC #5)", () => {
  it("returns 410 for a tombstoned subject before any side effect", async () => {
    mocks.findActiveTombstone.mockResolvedValueOnce({
      id: "tomb-1",
      deletedAt: new Date(),
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
    expect(await response.json()).toEqual({ error: "subject_tombstoned" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.assembleExportBundle).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/network/privacy/export — happy path (AC #3)", () => {
  it("mints wrapper run, assembles transient bundle, writes privacy_export audit", async () => {
    const response = await POST(
      request({
        subjectType: "member-signal",
        subjectId: "sig-1",
        sessionId: "sess-1",
        method: "session",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true });
    expect(body.bundle).toBeDefined();

    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-privacy-export-verify-and-export",
        sessionId: "sess-1",
      }),
    );
    expect(mocks.verifyNetworkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId:
          "network-lane-step:network-privacy-export-verify-and-export:abc",
        method: "session",
        subject: { subjectType: "member-signal", subjectId: "sig-1" },
      }),
    );
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventClass: "privacy_export",
        subjectType: "export:member-signal",
        subjectId: "sig-1",
        actorType: "user",
      }),
    );
  });

  it("returns 403 with no audit when verification fails", async () => {
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
    expect(mocks.assembleExportBundle).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("initiate-challenge action returns masked email (202) without verifying", async () => {
    mocks.initiateEmailChallenge.mockResolvedValueOnce({
      ok: true,
      maskedEmail: "o***@e***.com",
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
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      maskedEmail: "o***@e***.com",
    });
    expect(mocks.verifyNetworkIdentity).not.toHaveBeenCalled();
    expect(mocks.assembleExportBundle).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
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

  it("supports discovery-profile export with a claim token and no lane session", async () => {
    const response = await POST(
      request({
        subjectType: "discovery-profile",
        subjectId: "profile-1",
        method: "claim-token",
        claimToken: "raw-token",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-privacy-export-verify-and-export",
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
    expect(mocks.assembleExportBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "discovery-profile",
        subjectId: "profile-1",
      }),
    );
  });
});
