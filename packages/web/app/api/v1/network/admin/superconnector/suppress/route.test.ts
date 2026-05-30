/**
 * Route-level tests for POST /api/v1/network/admin/superconnector/suppress.
 *
 * The engine modules (writeNetworkAuditEvent, recordNetworkSuppression) own
 * their own spoofed-stepRunId tests; here we exercise the HTTP seam and the
 * route-specific suppression-identifier parsing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  suppressInvitationCandidate: vi.fn(),
  recordNetworkSuppression: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateAdminRequest: mocks.authenticateAdminRequest,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/network-suppression", () => ({
  recordNetworkSuppression: mocks.recordNetworkSuppression,
}));

vi.mock("../../../../../../../../../src/engine/claim-invite", () => ({
  suppressInvitationCandidate: mocks.suppressInvitationCandidate,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/suppress",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  vi.stubEnv("DITTO_DEPLOYMENT", "public");
  vi.clearAllMocks();
  mocks.authenticateAdminRequest.mockResolvedValue({
    authenticated: true,
    userId: "admin-user-1",
    isAdmin: true,
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue(
    "network-lane-step:admin-superconnector-suppress:abc",
  );
  mocks.suppressInvitationCandidate.mockResolvedValue({
    candidateId: "cand-1",
    auditEventId: "audit-1",
    suppressedAt: new Date("2026-05-18T12:00:00.000Z"),
  });
  mocks.recordNetworkSuppression.mockResolvedValue({
    row: { id: "supp-1" },
    created: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/network/admin/superconnector/suppress", () => {
  it("rejects caller-supplied stepRunId before minting or writing", async () => {
    const response = await POST(
      request({ candidateId: "cand-1", reason: "operator-suppressed", stepRunId: "x" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "step_run_bypass_rejected",
    });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.suppressInvitationCandidate).not.toHaveBeenCalled();
    expect(mocks.recordNetworkSuppression).not.toHaveBeenCalled();
  });

  it("rejects unknown identifier kind without writing", async () => {
    const response = await POST(
      request({
        candidateId: "cand-1",
        reason: "operator-suppressed",
        suppressionIdentifier: {
          identifier: "abuse@example.com",
          identifierKind: "phone",
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "suppression_identifier_kind_invalid",
    });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordNetworkSuppression).not.toHaveBeenCalled();
  });

  it("rejects per-user scope without scopeUserId", async () => {
    const response = await POST(
      request({
        candidateId: "cand-1",
        reason: "operator-suppressed",
        suppressionIdentifier: {
          identifier: "abuse@example.com",
          identifierKind: "email",
          scope: "per-user",
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "suppression_scope_user_id_required",
    });
    expect(mocks.recordNetworkSuppression).not.toHaveBeenCalled();
  });

  it("rejects unstructured reasons without writing", async () => {
    const response = await POST(
      request({ candidateId: "cand-1", reason: "not a fit" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "structured_reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.suppressInvitationCandidate).not.toHaveBeenCalled();
  });

  it("suppresses the candidate when no identifier is supplied", async () => {
    const response = await POST(
      request({ candidateId: "cand-1", reason: "operator-suppressed" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, auditEventId: "audit-1" });
    expect(body.suppression).toBeNull();
    expect(mocks.recordNetworkSuppression).not.toHaveBeenCalled();
    expect(mocks.suppressInvitationCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "cand-1",
        actorId: "admin-user-1",
        reason: "operator-suppressed",
      }),
    );
  });

  it("calls recordNetworkSuppression and audit on happy identifier path", async () => {
    const response = await POST(
      request({
        candidateId: "cand-1",
        reason: "operator-suppressed",
        suppressionIdentifier: {
          identifier: "abuse@example.com",
          identifierKind: "email",
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.recordNetworkSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:admin-superconnector-suppress:abc",
        identifier: "abuse@example.com",
        identifierKind: "email",
        scope: "global",
        reason: "operator-suppressed",
        source: "admin-superconnector:admin-user-1",
        actorId: "admin-user-1",
      }),
    );
    expect(mocks.suppressInvitationCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "cand-1",
        reason: "operator-suppressed",
      }),
    );
  });
});
