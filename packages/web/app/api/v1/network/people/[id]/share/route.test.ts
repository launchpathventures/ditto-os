import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkProfileCardBlock } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  generateShareVariants: vi.fn(),
  writeNetworkAuditEvent: vi.fn(),
  checkRateLimit: vi.fn(),
  loadApprovedPublicMemberSignalClaims: vi.fn(),
  applyApprovedPublicClaimsToCard: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../../kb/session", () => ({ resolveNetworkLaneSession: mocks.resolveNetworkLaneSession }));
vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({ createNetworkLaneStepRun: mocks.createNetworkLaneStepRun }));
vi.mock("../../../../../../../../../src/engine/generate-share-variants", () => ({
  generateShareVariants: mocks.generateShareVariants,
  isShareChannel: (value: unknown) =>
    typeof value === "string" &&
    ["linkedin", "x", "instagram", "email-signature", "website-badge"].includes(value),
}));
vi.mock("../../../../../../../../../src/engine/network-audit", () => ({
  writeNetworkAuditEvent: mocks.writeNetworkAuditEvent,
}));
vi.mock("../../../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("../../../../../../../../../src/engine/member-signal-review", () => ({
  loadApprovedPublicMemberSignalClaims: mocks.loadApprovedPublicMemberSignalClaims,
  applyApprovedPublicClaimsToCard: mocks.applyApprovedPublicClaimsToCard,
}));
vi.mock("../../../../../../../../../src/db/network-db", () => ({
  isNetworkDbConnectionError: () => false,
  networkDb: { select: mocks.select },
}));

const { POST } = await import("./route");

function card(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "RevOps operator",
    signalDots: [{ id: "value", label: "Value", filled: true, color: "canary" }],
    badges: [],
    narrativeMd: "I *untangle* sales motion.",
    antiPersonaMd: null,
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-13T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/people/timhgreen",
    ogImageUrl: "https://ditto.partners/people/timhgreen/opengraph-image",
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/people/timhgreen/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "expert-session",
    userId: "user-1",
    actorId: "user-1",
    context: "expert",
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue(
    "network-lane-step:network-share:00000000-0000-4000-8000-000000000001",
  );
  mocks.generateShareVariants.mockResolvedValue({
    quiet: "quiet https://ditto.partners/people/timhgreen",
    loud: "loud https://ditto.partners/people/timhgreen",
    ask: "ask https://ditto.partners/people/timhgreen",
  });
  mocks.writeNetworkAuditEvent.mockResolvedValue({ id: "audit-share-1" });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 60 });
  mocks.loadApprovedPublicMemberSignalClaims.mockResolvedValue([]);
  mocks.applyApprovedPublicClaimsToCard.mockImplementation((input: NetworkProfileCardBlock) => input);
  let call = 0;
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "user-1", card: card() }]),
      }),
    }),
  }));
  mocks.select.mockImplementation(() => {
    call += 1;
    if (call % 2 === 1) {
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: "user-1", card: card() }]),
          }),
        }),
      };
    }
    return {
      from: () => ({
        where: () => Promise.resolve([{ factMd: "Public fact", visibility: "public", status: "active", sourceLabel: "Source" }]),
      }),
    };
  });
});

describe("POST /api/v1/network/people/:id/share", () => {
  it("rejects caller-supplied stepRunId bypass attempts before invoking the tool", async () => {
    const response = await POST(
      request({ sessionId: "expert-session", stepRunId: "web-direct-action:bad", card: card() }),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.generateShareVariants).not.toHaveBeenCalled();
  });

  it("rejects UUID-shaped caller-supplied network stepRunIds before minting its own", async () => {
    const response = await POST(
      request({
        sessionId: "expert-session",
        stepRunId: "network-lane-step:network-share:00000000-0000-4000-8000-000000000002",
        card: card(),
      }),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.generateShareVariants).not.toHaveBeenCalled();
  });

  it("rejects falsy caller-supplied stepRunId fields as bypass attempts", async () => {
    for (const stepRunId of ["", null, false, 0]) {
      vi.clearAllMocks();
      const response = await POST(
        request({ sessionId: "expert-session", stepRunId, card: card() }),
        { params: Promise.resolve({ id: "timhgreen" }) },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.generateShareVariants).not.toHaveBeenCalled();
    }
  });

  it("creates an audited wrapper step run before generating variants", async () => {
    const response = await POST(
      request({ sessionId: "expert-session", card: card() }),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(expect.objectContaining({ route: "network-share" }));
    expect(mocks.generateShareVariants).toHaveBeenCalledWith(expect.objectContaining({
      stepRunId: "network-lane-step:network-share:00000000-0000-4000-8000-000000000001",
    }));
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:network-share:00000000-0000-4000-8000-000000000001",
        eventClass: "share_studio_variant_generated",
        subjectType: "network_profile_share",
        subjectId: "user-1",
        actorType: "user",
        actorId: "user-1",
      }),
    );
  });

  it("accepts each valid channel and threads it into generation + audit", async () => {
    for (const channel of ["linkedin", "x", "instagram", "email-signature", "website-badge"]) {
      vi.clearAllMocks();
      mocks.resolveNetworkLaneSession.mockResolvedValue({
        sessionId: "expert-session", userId: "user-1", actorId: "user-1", context: "expert",
      });
      mocks.createNetworkLaneStepRun.mockResolvedValue(
        "network-lane-step:network-share:00000000-0000-4000-8000-000000000001",
      );
      mocks.generateShareVariants.mockResolvedValue({ quiet: "q", loud: "l", ask: "a" });
      mocks.writeNetworkAuditEvent.mockResolvedValue({ id: "audit-share-1" });
      mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 60 });
      mocks.loadApprovedPublicMemberSignalClaims.mockResolvedValue([]);
      mocks.applyApprovedPublicClaimsToCard.mockImplementation((input: NetworkProfileCardBlock) => input);
      let call = 0;
      mocks.select.mockImplementation(() => {
        call += 1;
        if (call % 2 === 1) {
          return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "user-1", card: card() }]) }) }) };
        }
        return { from: () => ({ where: () => Promise.resolve([]) }) };
      });
      const response = await POST(
        request({ sessionId: "expert-session", channel, card: card() }),
        { params: Promise.resolve({ id: "timhgreen" }) },
      );
      expect(response.status).toBe(200);
      expect(mocks.generateShareVariants).toHaveBeenCalledWith(expect.objectContaining({ channel }));
      expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ channel }) }),
      );
    }
  });

  it("rejects an unknown channel with 400 before minting a wrapper run", async () => {
    const response = await POST(
      request({ sessionId: "expert-session", channel: "tiktok", card: card() }),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_channel" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.generateShareVariants).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("defaults a missing channel to linkedin (Brief 260 back-compat)", async () => {
    const response = await POST(
      request({ sessionId: "expert-session", card: card() }),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.generateShareVariants).toHaveBeenCalledWith(expect.objectContaining({ channel: "linkedin" }));
  });

  it("rate-limits share generation before minting a wrapper run", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 90 });
    const response = await POST(
      request({ sessionId: "expert-session", card: card() }),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too_many_requests", retryAfterSec: 90 });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.generateShareVariants).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });
});
