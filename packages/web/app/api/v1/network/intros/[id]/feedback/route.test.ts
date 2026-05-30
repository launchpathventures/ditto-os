import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  parseIntroMagicLinkToken: vi.fn(),
  recordIntroFeedback: vi.fn(),
}));

vi.mock("../../../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/intro-proposal", () => ({
  parseIntroMagicLinkToken: mocks.parseIntroMagicLinkToken,
}));

vi.mock("../../../../../../../../../src/engine/intro-feedback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../../../../../src/engine/intro-feedback")>();
  return {
    ...actual,
    recordIntroFeedback: mocks.recordIntroFeedback,
  };
});

vi.mock("../../../../../../../../../src/db/network-db", () => ({
  networkDb: {},
  withNetworkDbAvailability: (h: unknown) => h,
}));

const { POST } = await import("./route");

const INTRO_ID = "intro-feedback-route";

function request(body: unknown) {
  return new Request(
    `http://localhost/api/v1/network/intros/${INTRO_ID}/feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function ctx() {
  return { params: Promise.resolve({ id: INTRO_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createNetworkLaneStepRun.mockResolvedValue("step-run-server-minted");
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSec: 0,
  });
  mocks.parseIntroMagicLinkToken.mockReturnValue({
    typ: "intro-approval",
    v: 1,
    introId: INTRO_ID,
    party: "requester",
    email: "rob@example.com",
    exp: Date.now() + 60_000,
    iat: Date.now(),
    jti: "jti-feedback-1",
  });
  mocks.recordIntroFeedback.mockResolvedValue({
    feedback: { id: "feedback-1" },
    introduction: { state: "feedback-collected" },
    fanOutApplied: true,
  });
});

describe("POST /api/v1/network/intros/[id]/feedback", () => {
  for (const value of [null, "", 0, false, "client-step"]) {
    it(`rejects caller-supplied stepRunId (${JSON.stringify(value)}) before mint`, async () => {
      const res = await POST(
        request({
          token: "imlt_x",
          party: "requester",
          eventType: "button-click",
          classifiedCategory: "outcome:useful",
          stepRunId: value,
        }),
        ctx(),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.recordIntroFeedback).not.toHaveBeenCalled();
    });
  }

  it("validates event type, category, and outcome class before minting", async () => {
    const malformed = [
      { eventType: "reply", classifiedCategory: "outcome:useful" },
      { eventType: "button-click", classifiedCategory: "unknown" },
      {
        eventType: "button-click",
        classifiedCategory: "outcome:useful",
        outcomeClass: "enterprise-sale",
      },
    ];

    for (const body of malformed) {
      const res = await POST(
        request({
          token: "imlt_x",
          party: "requester",
          ...body,
        }),
        ctx(),
      );
      expect(res.status).toBe(400);
    }
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("verifies token before minting", async () => {
    mocks.parseIntroMagicLinkToken.mockReturnValueOnce(null);
    const res = await POST(
      request({
        token: "imlt_bad",
        party: "requester",
        eventType: "button-click",
        classifiedCategory: "outcome:useful",
      }),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("routes ambiguous feedback to chat without writing state", async () => {
    const res = await POST(
      request({
        token: "imlt_x",
        party: "requester",
        eventType: "chat-disambiguator-submit",
        classifiedCategory: "ambiguous",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: false,
      action: "chat-disambiguation-required",
    });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordIntroFeedback).not.toHaveBeenCalled();
  });

  it("rate-limits by token email before minting", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 120,
    });
    const res = await POST(
      request({
        token: "imlt_x",
        party: "requester",
        eventType: "button-click",
        classifiedCategory: "outcome:useful",
      }),
      ctx(),
    );
    expect(res.status).toBe(429);
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("records feedback with a server-minted step run", async () => {
    const res = await POST(
      request({
        token: "imlt_x",
        party: "requester",
        eventType: "button-click",
        classifiedCategory: "outcome:useful",
        outcomeClass: "advisory",
        freeText: "great",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      feedbackId: "feedback-1",
      state: "feedback-collected",
      fanOutApplied: true,
    });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith({
      route: "network-intro-feedback",
      sessionId: INTRO_ID,
      actorId: "rob@example.com",
    });
    expect(mocks.recordIntroFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "step-run-server-minted",
        introId: INTRO_ID,
        party: "requester",
      }),
    );
  });
});
