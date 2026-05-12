import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  hasTrustedNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  scoutOffNetwork: vi.fn(),
}));

vi.mock("../kb/session", () => ({
  hasTrustedNetworkLaneSession: mocks.hasTrustedNetworkLaneSession,
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../src/engine/network-scout", () => ({
  scoutOffNetwork: mocks.scoutOffNetwork,
  scrubScoutVisibleText: (text: string, card: JobRequestCardBlock) =>
    text
      .replaceAll(card.budgetShape.ballpark, "[private]")
      .replaceAll(card.antiPersonaMd, "[private]")
      .replace(/\s+/g, " ")
      .trim(),
}));

const { POST } = await import("./route");

function card(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Find a RevOps operator",
    referenceShape: "Someone like Pat who fixed HubSpot",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 booked calls per week",
    budgetShape: {
      ballpark: "$8-12k/month",
      cadence: "monthly",
    },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-12T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(overrides: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "scouted:abc123",
    name: "Public Lead",
    oneLineRole: "RevOps consultant",
    rationaleMd: "Strong public fit, not pure copywriters, not $8-12k/month.",
    fitConfidence: "medium",
    source: "scouted",
    sourceUrl: "https://example.com/lead",
    sourceLabel: "example.com",
    sourceSnippet: "Can work around $8-12k/month.",
    computedAt: "2026-05-12T01:00:00.000Z",
    ...overrides,
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/scout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasTrustedNetworkLaneSession.mockResolvedValue(true);
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:scout");
  mocks.scoutOffNetwork.mockResolvedValue({
    query: "safe query",
    review: {
      type: "review_card",
      processRunId: "network-lane-step:scout",
      stepName: "scout_off_network",
      outputText: "Found 1 source-backed off-network lead.",
      confidence: "medium",
      actions: [],
      knowledgeUsed: ["Job request card", "Public web search"],
    },
    candidates: [candidate()],
  });
});

describe("POST /api/v1/network/scout", () => {
  it("creates an audited wrapper step run and returns source-backed candidates without budget/private fields", async () => {
    const response = await POST(request({
      sessionId: "client-session",
      jobRequestCard: card(),
    }));

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toMatchObject({
      status: "success",
      candidates: [
        {
          handle: "scouted:abc123",
          sourceUrl: "https://example.com/lead",
          rationaleMd: expect.stringContaining("[private]"),
        },
      ],
    });
    const bodyText = JSON.stringify(json);
    expect(bodyText).not.toContain("$8-12k/month");
    expect(bodyText).not.toContain("pure copywriters");
    expect(bodyText).not.toContain("antiPersonaMd");
    expect(bodyText).not.toContain("budgetShape");
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-scout",
        sessionId: "client-session",
      }),
    );
    expect(mocks.scoutOffNetwork).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:scout",
      }),
    );
  });

  it("rejects caller-supplied stepRunId bypass attempts", async () => {
    const response = await POST(request({
      sessionId: "client-session",
      stepRunId: "web-direct-action:bad",
      jobRequestCard: card(),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.scoutOffNetwork).not.toHaveBeenCalled();
  });

  it("returns cached scout results without rerunning search", async () => {
    const first = await POST(request({
      sessionId: "client-session",
      jobRequestCard: card({ jtbd: "Find a cache-test RevOps operator" }),
    }));
    const second = await POST(request({
      sessionId: "client-session",
      jobRequestCard: card({ jtbd: "Find a cache-test RevOps operator" }),
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).status).toBe("cached");
    expect(mocks.scoutOffNetwork).toHaveBeenCalledTimes(1);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledTimes(2);
  });

  it("does not reuse cached scout results when private fields change", async () => {
    const firstCard = card({
      jtbd: "Find a cache-privacy RevOps operator",
      antiPersonaMd: "old private filter",
      budgetShape: { ballpark: "$1k/month", cadence: "monthly" },
    });
    const secondCard = card({
      jtbd: "Find a cache-privacy RevOps operator",
      antiPersonaMd: "pure copywriters",
      budgetShape: { ballpark: "$8-12k/month", cadence: "monthly" },
    });

    const first = await POST(request({
      sessionId: "client-session",
      jobRequestCard: firstCard,
    }));
    const second = await POST(request({
      sessionId: "client-session",
      jobRequestCard: secondCard,
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).status).not.toBe("cached");
    expect(mocks.scoutOffNetwork).toHaveBeenCalledTimes(2);
  });

  it("drops scouted candidates whose visible fields echo private values", async () => {
    mocks.scoutOffNetwork.mockResolvedValueOnce({
      query: "safe query",
      review: {
        type: "review_card",
        processRunId: "network-lane-step:scout",
        stepName: "scout_off_network",
        outputText: "Found source-backed leads.",
        confidence: "medium",
        actions: [],
        knowledgeUsed: ["Job request card"],
      },
      candidates: [
        candidate({
          handle: "scouted:private-role",
          oneLineRole: "Works for $8-12k/month",
        }),
      ],
    });

    const response = await POST(request({
      sessionId: "client-session",
      jobRequestCard: card({ jtbd: "Find a privacy-test RevOps operator" }),
    }));

    expect(response.status).toBe(200);
    const json = await response.json() as { status: string; candidates: unknown[] };
    expect(json.status).toBe("empty");
    expect(json.candidates).toHaveLength(0);
  });
});
