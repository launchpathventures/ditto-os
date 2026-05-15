import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationRequestBlock, JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  emitIntroRequest: vi.fn(),
  updateIntroductionStateForAuthorization: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../src/engine/emit-intro-request", () => ({
  emitIntroRequest: mocks.emitIntroRequest,
  updateIntroductionStateForAuthorization: mocks.updateIntroductionStateForAuthorization,
}));

vi.mock("../../../../../../../src/db/network-db", () => ({
  networkDb: { select: mocks.select },
}));

const { POST } = await import("./route");

function card(): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Find a CRM-touch outbound operator",
    referenceShape: "Jake built this before",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 booked calls",
    budgetShape: { ballpark: "$8k/mo", cadence: "monthly" },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-13T00:00:00.000Z",
  };
}

function candidate(): SuggestedCandidate {
  return {
    handle: "tim-green",
    name: "Tim Green",
    oneLineRole: "Revenue operator",
    rationaleMd: "Strong CRM-touch fit.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: "2026-05-13T00:00:00.000Z",
  };
}

function authBlock(): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: "Intro request for Tim Green",
    preview: null,
    recipientLabel: "Tim Green",
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
    authorizationId: "intro-auth-1",
    costLabel: "1st of 2 free intros (1 left after this)",
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/intros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "client-session",
    userId: "requester-user",
    actorId: "requester-user",
    email: "requester@example.com",
    context: "client",
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:intro");
  mocks.emitIntroRequest.mockResolvedValue({
    block: authBlock(),
    introduction: { id: "intro-1", state: "queued" },
    delivery: { id: "delivery-1" },
  });
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "target-user", name: "Tim Green", handle: "tim-green" }]),
      }),
    }),
  });
});

describe("POST /api/v1/network/intros", () => {
  it("rejects caller-supplied stepRunId before invoking emit_intro_request", async () => {
    const response = await POST(
      request({
        sessionId: "client-session",
        stepRunId: "fake",
        jobRequestCard: card(),
        selectedCandidate: candidate(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
  });

  it.each(["", null, false, 0])(
    "rejects falsy caller-supplied stepRunId fields before invoking emit_intro_request: %s",
    async (stepRunId) => {
      const response = await POST(
        request({
          sessionId: "client-session",
          stepRunId,
          jobRequestCard: card(),
          selectedCandidate: candidate(),
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
    },
  );

  it("creates an audited wrapper step run before emitting the intro request", async () => {
    const response = await POST(
      request({
        sessionId: "client-session",
        jobRequestCard: card(),
        selectedCandidate: candidate(),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-client-intro-request",
        sessionId: "client-session",
        actorId: "requester-user",
      }),
    );
    expect(mocks.emitIntroRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:intro",
        originContext: "client",
        requesterUserId: "requester-user",
        targetUserId: "target-user",
      }),
    );
  });
});
