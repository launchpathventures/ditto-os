import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  researchMemberSignal: vi.fn(),
  draftMemberSignal: vi.fn(),
  updateMemberSignalClaim: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../src/engine/member-signal-research", () => ({
  researchMemberSignal: mocks.researchMemberSignal,
}));

vi.mock("../../../../../../../src/engine/member-signal-draft", () => ({
  draftMemberSignal: mocks.draftMemberSignal,
}));

vi.mock("../../../../../../../src/engine/member-signal-review", () => ({
  updateMemberSignalClaim: mocks.updateMemberSignalClaim,
}));

vi.mock("../../../../../../../src/db/network-db", () => ({
  isNetworkDbConnectionError: () => false,
  networkDb: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/signal", {
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
    email: "user@example.com",
    context: "expert",
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:signal");
  mocks.researchMemberSignal.mockResolvedValue({
    memberSignal: { id: "signal-1" },
    sources: [],
    webEnrichment: { status: "unconfigured" },
  });
  mocks.draftMemberSignal.mockResolvedValue({
    memberSignal: { id: "signal-1" },
    claims: [{ id: "claim-1", visibility: "on-request", approvalState: "suggested" }],
  });
  mocks.updateMemberSignalClaim.mockResolvedValue({
    id: "claim-1",
    visibility: "public",
    approvalState: "approved",
  });
});

describe("POST /api/v1/network/signal", () => {
  it.each(["bad", "", null, false, 0])("rejects caller stepRunId before invoking tools: %s", async (stepRunId) => {
    const response = await POST(request({
      action: "research",
      sessionId: "expert-session",
      stepRunId,
      sources: [{ value: "https://example.com" }],
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.researchMemberSignal).not.toHaveBeenCalled();
  });

  it("creates wrapper step run for research and never accepts client stepRunId", async () => {
    const response = await POST(request({
      action: "research",
      sessionId: "expert-session",
      sources: [{ type: "linkedin", value: "https://linkedin.com/in/tim" }],
    }));

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(expect.objectContaining({
      route: "network-signal-research",
      sessionId: "expert-session",
    }));
    expect(mocks.researchMemberSignal).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      stepRunId: "network-lane-step:signal",
    }));
  });

  it("creates wrapper step run for drafting", async () => {
    const response = await POST(request({
      action: "draft",
      sessionId: "expert-session",
      memberSignalId: "signal-1",
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).claims).toHaveLength(1);
    expect(mocks.draftMemberSignal).toHaveBeenCalledWith(expect.objectContaining({
      memberSignalId: "signal-1",
      stepRunId: "network-lane-step:signal",
    }));
  });

  it("creates wrapper step run for claim review updates", async () => {
    const response = await POST(request({
      action: "update_claim",
      sessionId: "expert-session",
      claimId: "claim-1",
      claimAction: "approve",
      visibility: "public",
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).claim.approvalState).toBe("approved");
    expect(mocks.updateMemberSignalClaim).toHaveBeenCalledWith(expect.objectContaining({
      claimId: "claim-1",
      action: "approve",
      visibility: "public",
      stepRunId: "network-lane-step:signal",
    }));
  });
});
