import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  checkRateLimits: vi.fn(),
  buildNetworkKbContext: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  forwardNoteToUser: vi.fn(),
  buildFrontDoorPrompt: vi.fn(),
  generateVisitorGreeterResponseFromPrompt: vi.fn(),
  appendVisitorProfileTurn: vi.fn(),
  clearPendingVisitorForward: vi.fn(),
  clearPendingVisitorIntro: vi.fn(),
  consumePendingVisitorForward: vi.fn(),
  getVisitorProfileTranscript: vi.fn(),
  setPendingVisitorForward: vi.fn(),
  setPendingVisitorIntro: vi.fn(),
  extractIntentKeywords: vi.fn(),
  inferVisitorIntent: vi.fn(),
}));

vi.mock("../../../../../../../../../src/db/network-db", () => ({
  networkDb: { select: mocks.select },
  withNetworkDbAvailability: (handler: unknown) => handler,
}));

vi.mock("../../../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimits: mocks.checkRateLimits,
}));

vi.mock("../../../../../../../../../src/engine/network-kb-context", () => ({
  buildNetworkKbContext: mocks.buildNetworkKbContext,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/forward-note-to-user", () => ({
  forwardNoteToUser: mocks.forwardNoteToUser,
}));

vi.mock("../../../../../../../../../src/engine/network-chat-prompt", () => ({
  buildFrontDoorPrompt: mocks.buildFrontDoorPrompt,
}));

vi.mock("../../../../../../../../../src/engine/visitor-profile-chat", () => ({
  generateVisitorGreeterResponseFromPrompt: mocks.generateVisitorGreeterResponseFromPrompt,
}));

vi.mock("../../../../../../../../../src/engine/visitor-profile-session", () => ({
  appendVisitorProfileTurn: mocks.appendVisitorProfileTurn,
  clearPendingVisitorForward: mocks.clearPendingVisitorForward,
  clearPendingVisitorIntro: mocks.clearPendingVisitorIntro,
  consumePendingVisitorForward: mocks.consumePendingVisitorForward,
  getVisitorProfileTranscript: mocks.getVisitorProfileTranscript,
  setPendingVisitorForward: mocks.setPendingVisitorForward,
  setPendingVisitorIntro: mocks.setPendingVisitorIntro,
}));

vi.mock("../../../../../../../../../src/engine/visitor-intent-inference", () => ({
  extractIntentKeywords: mocks.extractIntentKeywords,
  inferVisitorIntent: mocks.inferVisitorIntent,
}));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/people/tim-green/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([
          {
            id: "target-user",
            handle: "tim-green",
            name: "Tim Green",
            businessContext: "Revenue operator",
            wantsVisibility: true,
            personaAssignment: "alex",
            card: null,
          },
        ]),
      }),
    }),
  });
  mocks.checkRateLimits.mockResolvedValue({ allowed: true, retryAfterSec: 60 });
  mocks.buildNetworkKbContext.mockResolvedValue({ facts: [], privateFilters: [] });
  mocks.getVisitorProfileTranscript.mockReturnValue([]);
  mocks.buildFrontDoorPrompt.mockReturnValue("You are their REPRESENTATIVE for Tim Green.");
  mocks.generateVisitorGreeterResponseFromPrompt.mockResolvedValue({
    kind: "reply",
    reply: "Tim works on revenue systems.",
  });
  mocks.appendVisitorProfileTurn.mockReturnValue([
    { role: "visitor", content: "Can Tim help?" },
    { role: "greeter", content: "Tim works on revenue systems." },
  ]);
  mocks.extractIntentKeywords.mockReturnValue(["revenue", "systems"]);
  mocks.inferVisitorIntent.mockReturnValue({
    highlighted: ["helper-seeker"],
    whisper: "Sounds like you have something specific in mind - Ditto can keep watch.",
    scores: {
      curious: 0.2,
      "similar-expertise": 0,
      "helper-seeker": 0.72,
      "intro-seeker": 0,
    },
  });
});

describe("POST /api/v1/network/people/:id/chat", () => {
  it("uses the shared Postgres-backed profile-chat limiter before generating a reply", async () => {
    mocks.checkRateLimits.mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 120,
    });

    const response = await POST(
      request({ sessionId: "visitor-session", message: "Can Tim help?" }),
      { params: Promise.resolve({ id: "tim-green" }) },
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      rateLimited: true,
      retryAfterSec: 120,
    });
    expect(mocks.checkRateLimits).toHaveBeenCalledWith([
      expect.objectContaining({
        limitName: "profile-chat",
        actor: { kind: "session", id: "visitor-session:no-fingerprint" },
      }),
      expect.objectContaining({
        limitName: "profile-chat",
        actor: { kind: "ip", id: "127.0.0.1" },
      }),
    ]);
    expect(mocks.generateVisitorGreeterResponseFromPrompt).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("returns pure in-process visitor intent inference without minting a wrapper run", async () => {
    const response = await POST(
      request({ sessionId: "visitor-session", message: "Can Tim help?" }),
      { params: Promise.resolve({ id: "tim-green" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reply: "Tim works on revenue systems.",
      intentInference: {
        highlighted: ["helper-seeker"],
      },
    });
    expect(mocks.extractIntentKeywords).toHaveBeenCalledWith(expect.arrayContaining([
      "Revenue operator",
    ]));
    expect(mocks.inferVisitorIntent).toHaveBeenCalledWith(
      [
        { role: "visitor", content: "Can Tim help?" },
        { role: "greeter", content: "Tim works on revenue systems." },
      ],
      ["revenue", "systems"],
    );
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });
});
