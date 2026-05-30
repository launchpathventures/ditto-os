import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNetworkLaneStepRun: vi.fn(),
  getClaimInvitePreview: vi.fn(),
  redeemClaimToken: vi.fn(),
  declineClaimInvite: vi.fn(),
  suppressClaimInvite: vi.fn(),
  deleteDiscoveryProfile: vi.fn(),
}));

vi.mock("../../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../../src/engine/claim-invite", () => ({
  getClaimInvitePreview: mocks.getClaimInvitePreview,
  redeemClaimToken: mocks.redeemClaimToken,
  declineClaimInvite: mocks.declineClaimInvite,
  suppressClaimInvite: mocks.suppressClaimInvite,
  deleteDiscoveryProfile: mocks.deleteDiscoveryProfile,
}));

import { GET, POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/invites/token-1/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ token: "token-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:claim-invite:abc");
  mocks.getClaimInvitePreview.mockResolvedValue({
    discoveryProfileId: "profile-1",
    displayName: "Rina",
    headline: "Operator",
    canonicalUrl: null,
    claims: [],
    candidateId: "cand-1",
    status: "internal",
    expiresAt: new Date("2026-06-17T12:00:00.000Z"),
  });
  mocks.redeemClaimToken.mockResolvedValue({
    userId: "user-1",
    memberSignalId: "signal-1",
    redirectTo: "/network/signal?claim=signal-1&claimToken=token-1&seed=discovery-profile",
  });
  mocks.declineClaimInvite.mockResolvedValue({ ok: true, discoveryProfileId: "profile-1" });
  mocks.suppressClaimInvite.mockResolvedValue({ ok: true, discoveryProfileId: "profile-1" });
  mocks.deleteDiscoveryProfile.mockResolvedValue({ ok: true, discoveryProfileId: "profile-1" });
});

describe("/api/v1/network/invites/[token]/claim", () => {
  it("returns a token preview without minting a step run", async () => {
    const response = await GET(new Request("http://localhost"), ctx);
    expect(response.status).toBe(200);
    expect(mocks.getClaimInvitePreview).toHaveBeenCalledWith("token-1");
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it.each([null, "", false, "network-lane-step:spoof"])(
    "rejects caller-supplied stepRunId before claim action: %s",
    async (stepRunId) => {
      const response = await POST(request({ action: "claim", stepRunId }), ctx);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.redeemClaimToken).not.toHaveBeenCalled();
    },
  );

  it("mints a wrapper step run for claim redemption", async () => {
    const response = await POST(
      request({ action: "claim", email: "rina@example.com", name: "Rina" }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({ route: "claim-invite-claim" }),
    );
    expect(mocks.redeemClaimToken).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:claim-invite:abc",
        token: "token-1",
        email: "rina@example.com",
      }),
    );
  });

  it("routes decline, suppress, and delete actions", async () => {
    expect((await POST(request({ action: "decline" }), ctx)).status).toBe(200);
    expect(mocks.declineClaimInvite).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-1" }),
    );

    expect((await POST(request({ action: "suppress" }), ctx)).status).toBe(200);
    expect(mocks.suppressClaimInvite).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-1" }),
    );

    expect((await POST(request({ action: "delete" }), ctx)).status).toBe(200);
    expect(mocks.deleteDiscoveryProfile).toHaveBeenCalledWith(
      expect.objectContaining({ token: "token-1" }),
    );
  });
});
