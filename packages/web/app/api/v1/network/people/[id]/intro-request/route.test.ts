import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationRequestBlock } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  emitIntroRequest: vi.fn(),
  checkVisitorRateLimit: vi.fn(),
}));

vi.mock("../../../../../../../../../src/db/network-db", () => ({
  networkDb: { select: mocks.select },
  withNetworkDbAvailability: (handler: unknown) => handler,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/emit-intro-request", () => ({
  emitIntroRequest: mocks.emitIntroRequest,
}));

vi.mock("../../../../../../../../../src/engine/visitor-rate-limit", () => ({
  checkVisitorRateLimit: mocks.checkVisitorRateLimit,
  visitorRateLimitCopy: () => "Too many requests.",
}));

const [{ POST }, session] = await Promise.all([
  import("./route"),
  import("../../../../../../../../../src/engine/visitor-profile-session"),
]);

function authBlock(): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: "Intro request for Tim",
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
  return new Request("http://localhost/api/v1/network/people/tim-green/intro-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session._resetVisitorProfileSessionsForTesting();
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([
          {
            id: "target-user",
            handle: "tim-green",
            name: "Tim Green",
            personaAssignment: "alex",
          },
        ]),
      }),
    }),
  });
  mocks.checkVisitorRateLimit.mockResolvedValue({ allowed: true });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:visitor-intro");
  mocks.emitIntroRequest.mockResolvedValue({
    block: authBlock(),
    introduction: { id: "intro-1", state: "queued" },
    delivery: { id: "delivery-1" },
  });
});

describe("POST /api/v1/network/people/:id/intro-request", () => {
  it("rejects caller-supplied stepRunId before invoking emit_intro_request", async () => {
    const response = await POST(
      request({ sessionId: "visitor-session", stepRunId: "fake", draft: "Hi Tim" }),
      { params: Promise.resolve({ id: "tim-green" }) },
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
        request({ sessionId: "visitor-session", stepRunId, draft: "Hi Tim" }),
        { params: Promise.resolve({ id: "tim-green" }) },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
    },
  );

  it("uses the audited wrapper step run and emits a populated-cost intro block", async () => {
    const transcript = session.appendVisitorProfileTurn("visitor-session", {
      role: "visitor",
      content: "I'd like an intro to Tim.",
    });
    session.setPendingVisitorIntro({
      sessionId: "visitor-session",
      userId: "target-user",
      draft: "Hi Tim - Avery asked for an introduction.",
      transcript,
    });

    const response = await POST(
      request({
        sessionId: "visitor-session",
        draft: "Hi Tim - Avery asked for an introduction.",
        visitorName: "Avery",
        visitorOrg: "Acme",
      }),
      { params: Promise.resolve({ id: "tim-green" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "people-profile-intro-request",
        sessionId: "visitor-session",
      }),
    );
    expect(mocks.emitIntroRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:visitor-intro",
        originContext: "visitor",
        targetUserId: "target-user",
        visitorSessionId: "visitor-session",
      }),
    );
    expect(await response.json()).toMatchObject({
      block: { costLabel: "1st of 2 free intros (1 left after this)" },
      introductionId: "intro-1",
    });
  });
});
