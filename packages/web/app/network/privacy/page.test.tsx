import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  verifyNetworkIdentity: vi.fn(),
  getClaimInvitePreview: vi.fn(),
}));

vi.mock("../../api/v1/network/kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../src/engine/network-identity-verification", () => ({
  maskEmail: (email: string) => email.replace(/^(.).+(@.+)$/, "$1***$2"),
  verifyNetworkIdentity: mocks.verifyNetworkIdentity,
}));

vi.mock("../../../../../src/engine/claim-invite", () => ({
  getClaimInvitePreview: mocks.getClaimInvitePreview,
}));

describe("loadPrivacyCenterData identity boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:test");
  });

  it("returns fail-closed empty data when no session can be verified", async () => {
    const { loadPrivacyCenterData } = await import("./page");

    const data = await loadPrivacyCenterData({
      subjectType: "public-profile",
      subjectId: "user-1",
    });

    expect(data.sources).toEqual([]);
    expect(data.claims).toEqual([]);
    expect(data.requests).toEqual([]);
    expect(data.blocks).toEqual([]);
    expect(data.identity.verified).toBe(false);
    expect(data.partialNotice).toContain("Identity verification is required");
    expect(mocks.resolveNetworkLaneSession).not.toHaveBeenCalled();
    expect(mocks.verifyNetworkIdentity).not.toHaveBeenCalled();
  });

  it("does not expose owner data after verifier rejection", async () => {
    const { loadPrivacyCenterData } = await import("./page");
    mocks.resolveNetworkLaneSession.mockResolvedValue({
      sessionId: "session-1",
      userId: "user-1",
      actorId: "user-1",
      email: "owner@example.com",
      context: "expert",
    });
    mocks.verifyNetworkIdentity.mockResolvedValue({
      verified: false,
      actorType: "visitor",
      actorId: null,
      subjectOwnerEmail: "owner@example.com",
      error: "session_owner_mismatch",
    });

    const data = await loadPrivacyCenterData({
      subjectType: "public-profile",
      subjectId: "someone-else",
      sessionId: "session-1",
      context: "expert",
    });

    expect(mocks.resolveNetworkLaneSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      context: "expert",
    });
    expect(mocks.verifyNetworkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "session",
        sessionUserId: "user-1",
        subject: {
          subjectType: "public-profile",
          subjectId: "someone-else",
        },
      }),
    );
    expect(data.sources).toEqual([]);
    expect(data.claims).toEqual([]);
    expect(data.identity.verified).toBe(false);
    expect(data.partialNotice).toContain("Identity verification is required");
  });

  it("fails closed for discovery-profile without a claim token", async () => {
    const { loadPrivacyCenterData } = await import("./page");

    const data = await loadPrivacyCenterData({
      subjectType: "discovery-profile",
      subjectId: "disc-1",
    });

    expect(data.discoveryProfile).toBeNull();
    expect(data.sources).toEqual([]);
    expect(data.claims).toEqual([]);
    expect(data.identity.verified).toBe(false);
    expect(data.partialNotice).toContain("Identity verification is required");
    expect(mocks.getClaimInvitePreview).not.toHaveBeenCalled();
    expect(mocks.verifyNetworkIdentity).not.toHaveBeenCalled();
  });

  it("renders discovery-profile controls only after claim-token verification", async () => {
    const { loadPrivacyCenterData } = await import("./page");
    mocks.getClaimInvitePreview.mockResolvedValue({
      discoveryProfileId: "disc-1",
      displayName: "Dana Discovery",
      headline: "Marketplace operator",
      canonicalUrl: "https://example.com/dana",
      candidateId: "candidate-1",
      status: "internal",
      expiresAt: new Date("2026-06-18T00:00:00.000Z"),
      claims: [
        {
          id: "claim-1",
          claimText: "Runs marketplace supply operations.",
          evidenceSnippet: "Public website evidence.",
          sourceLabel: "Public website",
          sourceUrl: "https://example.com/dana",
          confidence: "high",
        },
      ],
    });
    mocks.verifyNetworkIdentity.mockResolvedValue({
      verified: true,
      actorType: "visitor",
      actorId: "claim-token:token-1",
      subjectOwnerEmail: "dana@example.com",
    });

    const data = await loadPrivacyCenterData({
      subjectType: "discovery-profile",
      claimToken: "plain-token",
    });

    expect(mocks.getClaimInvitePreview).toHaveBeenCalledWith("plain-token");
    expect(mocks.verifyNetworkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "claim-token",
        subject: {
          subjectType: "discovery-profile",
          subjectId: "disc-1",
        },
        claimToken: "plain-token",
      }),
    );
    expect(data.discoveryProfile?.enabled).toBe(true);
    expect(data.discoveryProfile?.claimToken).toBe("plain-token");
    expect(data.identity.verified).toBe(true);
    expect(data.identity.subjectId).toBe("disc-1");
    expect(data.identity.emailMasked).toBe("d***@example.com");
    expect(data.sources).toHaveLength(1);
    expect(data.claims.map((claim) => claim.claimText)).toEqual([
      "Runs marketplace supply operations.",
    ]);
  });
});
