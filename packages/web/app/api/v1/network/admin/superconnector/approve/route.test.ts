/**
 * Route-level tests for POST /api/v1/network/admin/superconnector/approve.
 *
 * Engine-level rejection of spoofed/falsy stepRunId is covered in
 * src/engine/network-audit.test.ts; here we exercise the HTTP seam:
 *  - caller-supplied stepRunId → 400 step_run_bypass_rejected
 *  - missing reason / candidateId → 400 with structured error
 *  - happy path: mints a wrapper run and writes operator_approved audit
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  isOutboundDiscoveryPaused: vi.fn(),
  approveInvitationCandidate: vi.fn(),
  composeClaimInvite: vi.fn(),
  sendClaimInvite: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateAdminRequest: mocks.authenticateAdminRequest,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/network-discovery-runtime", () => ({
  isOutboundDiscoveryPaused: mocks.isOutboundDiscoveryPaused,
}));

vi.mock("../../../../../../../../../src/engine/claim-invite", () => ({
  approveInvitationCandidate: mocks.approveInvitationCandidate,
  composeClaimInvite: mocks.composeClaimInvite,
  sendClaimInvite: mocks.sendClaimInvite,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/approve",
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
    "network-lane-step:admin-superconnector-approve:abc",
  );
  mocks.isOutboundDiscoveryPaused.mockResolvedValue(false);
  mocks.approveInvitationCandidate.mockResolvedValue({
    candidateId: "cand-1",
    auditEventId: "audit-1",
    approvedAt: new Date("2026-05-18T12:00:00.000Z"),
  });
  mocks.composeClaimInvite.mockResolvedValue({
    candidateId: "cand-1",
    subject: "subject",
    body: "body",
  });
  mocks.sendClaimInvite.mockResolvedValue({
    candidateId: "cand-1",
    tokenId: "tok-1",
    messageId: "msg-1",
    claimUrl: "http://localhost/network/claim/t",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/network/admin/superconnector/approve", () => {
  it("rejects caller-supplied stepRunId (including falsy) before minting", async () => {
    for (const stepRunId of [false, "", null, "network-lane-step:bad"]) {
      mocks.createNetworkLaneStepRun.mockClear();
      mocks.approveInvitationCandidate.mockClear();

      const response = await POST(
        request({ candidateId: "cand-1", reason: "operator-approved", stepRunId }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "step_run_bypass_rejected",
      });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.approveInvitationCandidate).not.toHaveBeenCalled();
    }
  });

  it("rejects missing candidateId with no audit write", async () => {
    const response = await POST(request({ reason: "fit" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "candidate_id_required" });
    expect(mocks.approveInvitationCandidate).not.toHaveBeenCalled();
  });

  it("rejects missing reason with no audit write", async () => {
    const response = await POST(request({ candidateId: "cand-1" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "reason_required" });
    expect(mocks.approveInvitationCandidate).not.toHaveBeenCalled();
  });

  it("rejects unstructured reasons before minting", async () => {
    const response = await POST(
      request({ candidateId: "cand-1", reason: "fit" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "structured_reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.approveInvitationCandidate).not.toHaveBeenCalled();
  });

  it("rejects non-admin auth response without minting or writing", async () => {
    const { NextResponse } = await import("next/server");
    mocks.authenticateAdminRequest.mockResolvedValueOnce({
      authenticated: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await POST(
      request({ candidateId: "cand-1", reason: "fit" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.approveInvitationCandidate).not.toHaveBeenCalled();
  });

  it("mints wrapper run and writes operator_approved audit on happy path", async () => {
    const response = await POST(
      request({
        candidateId: "cand-1",
        reason: "operator-approved",
        notes: "great connector",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      auditEventId: "audit-1",
    });

    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "admin-superconnector-approve",
        actorId: "admin-user-1",
      }),
    );
    expect(mocks.approveInvitationCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:admin-superconnector-approve:abc",
        candidateId: "cand-1",
        actorId: "admin-user-1",
        reason: "operator-approved",
        notes: "great connector",
      }),
    );
  });

  it("can compose and send immediately after approval", async () => {
    const response = await POST(
      request({
        candidateId: "cand-1",
        reason: "operator-approved",
        sendNow: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.composeClaimInvite).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "cand-1" }),
    );
    expect(mocks.sendClaimInvite).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: "cand-1" }),
    );
  });

  it("rejects sendNow while outbound discovery is globally paused before approval", async () => {
    mocks.isOutboundDiscoveryPaused.mockResolvedValueOnce(true);
    const response = await POST(
      request({
        candidateId: "cand-1",
        reason: "operator-approved",
        sendNow: true,
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "outbound_discovery_paused" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.approveInvitationCandidate).not.toHaveBeenCalled();
    expect(mocks.sendClaimInvite).not.toHaveBeenCalled();
  });
});
