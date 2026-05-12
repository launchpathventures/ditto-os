import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  recordVoiceIntake: vi.fn(),
}));

vi.mock("../session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../src/engine/network-voice-intake", () => ({
  recordVoiceIntake: mocks.recordVoiceIntake,
}));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/kb/voice", {
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
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:voice");
  mocks.recordVoiceIntake.mockResolvedValue({
    intake: { id: "voice-1", status: "complete" },
    document: { id: "doc-voice" },
    facts: [{ id: "fact-voice", visibility: "on-request" }],
  });
});

describe("POST /api/v1/network/kb/voice", () => {
  it("records a reviewed transcript through an audited network-lane step run", async () => {
    const response = await POST(request({
      sessionId: "expert-session",
      transcriptMd: "I am strongest with messy founder-led sales systems.",
      inputMode: "paste",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      intake: { id: "voice-1", status: "complete" },
      facts: [{ id: "fact-voice" }],
    });
    expect(mocks.recordVoiceIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        transcriptMd: "I am strongest with messy founder-led sales systems.",
        inputMode: "paste",
        stepRunId: "network-lane-step:voice",
        actorId: "user-1",
        sessionId: "expert-session",
      }),
    );
  });

  it("rejects empty transcripts", async () => {
    const response = await POST(request({
      sessionId: "expert-session",
      transcriptMd: "   ",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "transcript_required" });
    expect(mocks.recordVoiceIntake).not.toHaveBeenCalled();
  });
});
