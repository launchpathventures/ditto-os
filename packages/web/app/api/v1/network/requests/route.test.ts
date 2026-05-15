import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: vi.fn(async () => null),
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: vi.fn(async () => "network-lane-step:request:test"),
}));

vi.mock("../../../../../../../src/engine/need-request-draft", () => ({
  draftNeedRequest: vi.fn(async () => ({
    rawNeed: "Need a fractional CMO",
    outcomeNeeded: "fractional CMO",
    idealPerson: "fractional CMO",
    proofRequired: "B2B SaaS",
    badFit: "",
    urgency: "",
    geography: "Europe",
    commercialShape: "paid advisory",
    successOutcome: "CMO found",
    outcomeValueHint: "$20k/month",
    budgetPrivate: "$20k/month",
    budgetShareableLabel: "",
    shareableSummary: "Need a fractional CMO | Proof: B2B SaaS | Geography: Europe",
    privateNotes: "$20k/month",
    sourcesAllowed: "both",
    contactPolicy: "ask-before-contact",
    mode: "manual-search",
    identity: {},
    missingFields: [],
    quickAnswerField: null,
    quickAnswers: [],
    jobRequestCard: {
      type: "job-request-card",
      jtbd: "fractional CMO",
      referenceShape: "B2B SaaS",
      antiPersonaMd: "Bad fit still being clarified",
      successCriteria: "CMO found",
      budgetShape: { ballpark: "$20k/month", cadence: "monthly" },
      scoutOptIn: true,
      suggestedCandidates: [],
      greeterCuratedBy: "mira",
      matchCuratedBy: "mira",
      lastUpdatedAt: "2026-05-14T00:00:00.000Z",
    },
  })),
}));

vi.mock("../../../../../../../src/engine/network-match", () => ({
  matchOnNetwork: vi.fn(async () => [
    {
      handle: "mira-fit",
      name: "Priya Shah",
      oneLineRole: "Agentic CRM engineer for real estate teams",
      rationaleMd: "Mira: production CRM workflow experience with AI agents.",
      fitConfidence: "high",
      source: "on-network",
      computedAt: "2026-05-14T00:00:00.000Z",
    },
  ]),
}));

vi.mock("../../../../../../../src/engine/network-scout", () => ({
  scoutOffNetwork: vi.fn(async () => ({
    query: "public scout query",
    review: {
      type: "review_card",
      processRunId: "network-lane-step:request:test",
      stepName: "scout_off_network",
      outputText: "Found one public lead.",
      confidence: "medium",
      actions: [],
      knowledgeUsed: ["Public web search"],
    },
    candidates: [
      {
        handle: "scouted:public-fit",
        name: "Jordan Lee",
        oneLineRole: "Publicly sourced CRM automation engineer",
        rationaleMd: "Mira: public source shows CRM automation work.",
        fitConfidence: "medium",
        source: "scouted",
        sourceUrl: "https://example.com/jordan",
        sourceLabel: "example.com",
        computedAt: "2026-05-14T00:00:00.000Z",
      },
    ],
  })),
}));

vi.mock("../../../../../../../src/engine/need-request-storage", () => ({
  listNeedRequests: vi.fn(async () => []),
  saveNeedRequest: vi.fn(async () => ({ id: "request-1", status: "active" })),
  updateNeedRequestState: vi.fn(async () => ({ id: "request-1", status: "paused" })),
}));

import { GET, POST, PATCH } from "./route";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { draftNeedRequest } from "../../../../../../../src/engine/need-request-draft";
import { matchOnNetwork } from "../../../../../../../src/engine/network-match";
import { scoutOffNetwork } from "../../../../../../../src/engine/network-scout";
import { listNeedRequests, saveNeedRequest, updateNeedRequestState } from "../../../../../../../src/engine/need-request-storage";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/v1/network/requests", () => {
  it("rejects caller-supplied stepRunId before drafting or writing", async () => {
    const response = await POST(request({
      rawNeed: "Need a fractional CMO",
      stepRunId: "web-direct-action:bad",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(draftNeedRequest).not.toHaveBeenCalled();
    expect(saveNeedRequest).not.toHaveBeenCalled();
  });

  it.each([null, "", 0, false])(
    "rejects falsy caller-supplied stepRunId before write: %s",
    async (stepRunId) => {
      const response = await POST(request({
        rawNeed: "Need a fractional CMO",
        stepRunId,
      }));

      expect(response.status).toBe(400);
      expect(saveNeedRequest).not.toHaveBeenCalled();
    },
  );

  it("mints a wrapper step run and saves an active request", async () => {
    const response = await POST(request({
      rawNeed: "Need a fractional CMO",
      visitorSessionId: "visitor-1",
      publish: true,
    }));

    expect(response.status).toBe(200);
    expect(createNetworkLaneStepRun).toHaveBeenCalledWith(expect.objectContaining({
      route: "network-request-save",
      sessionId: "visitor-1",
    }));
    expect(draftNeedRequest).toHaveBeenCalledWith(expect.objectContaining({
      stepRunId: "network-lane-step:request:test",
    }));
    expect(saveNeedRequest).toHaveBeenCalledWith(expect.objectContaining({
      visitorSessionId: "visitor-1",
      stepRunId: "network-lane-step:request:test",
      status: "active",
    }));
  });

  it("runs an initial non-contact on-network and public scout pass for draft requests", async () => {
    const response = await POST(request({
      action: "draft",
      rawNeed: "Need a fractional CMO",
      visitorSessionId: "visitor-1",
    }));

    expect(response.status).toBe(200);
    expect(matchOnNetwork).toHaveBeenCalledWith(expect.objectContaining({
      type: "job-request-card",
    }), { sampleLimit: 200 });
    expect(createNetworkLaneStepRun).toHaveBeenCalledWith(expect.objectContaining({
      route: "network-request-initial-scout",
      sessionId: "visitor-1",
    }));
    expect(scoutOffNetwork).toHaveBeenCalledWith(expect.objectContaining({
      stepRunId: "network-lane-step:request:test",
    }));
    const json = await response.json() as { draft: { jobRequestCard: { suggestedCandidates: unknown[] } } };
    expect(json.draft.jobRequestCard.suggestedCandidates).toHaveLength(2);
    expect(saveNeedRequest).not.toHaveBeenCalled();
  });

  it("requires a resolved session or visitor session before drafting", async () => {
    const response = await POST(request({
      rawNeed: "Need a fractional CMO",
      publish: true,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_actor_required" });
    expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(saveNeedRequest).not.toHaveBeenCalled();
  });

  it("lists by visitor session without accepting arbitrary userId lookup", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/network/requests?userId=someone-else&visitorSessionId=visitor-1"),
    );

    expect(response.status).toBe(200);
    expect(listNeedRequests).toHaveBeenCalledWith({
      userId: null,
      visitorSessionId: "visitor-1",
    });
  });

  it("rejects list calls with no resolved actor", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/network/requests?userId=someone-else"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_actor_required" });
    expect(listNeedRequests).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied stepRunId on status updates", async () => {
    const response = await PATCH(request({
      requestId: "request-1",
      action: "pause",
      stepRunId: null,
    }));

    expect(response.status).toBe(400);
    expect(updateNeedRequestState).not.toHaveBeenCalled();
  });
});
