import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: vi.fn(async () => null),
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: vi.fn(async () => "network-lane-step:search:test"),
}));

vi.mock("../../../../../../../src/engine/network-manual-search", () => ({
  runNetworkSearch: vi.fn(async () => ({
    searchRunId: "run-1",
    mode: "both",
    query: "marketplace operations expert",
    webSearchAvailable: true,
    partial: false,
    scrubApplied: false,
    connections: [],
    webUnavailableNotice: null,
  })),
}));

vi.mock("../../../../../../../src/engine/network-search-feedback", () => ({
  recordNetworkSearchFeedback: vi.fn(async () => ({
    feedbackId: "fb-1",
    kind: "not-a-fit",
    lifecycleState: "not-a-fit",
    consentGated: false,
    notice: "Noted.",
  })),
}));
vi.mock("../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSec: 60 })),
  isNetworkOperationPaused: vi.fn(async () => ({ paused: false })),
}));

import { POST, PATCH } from "./route";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { runNetworkSearch } from "../../../../../../../src/engine/network-manual-search";
import { recordNetworkSearchFeedback } from "../../../../../../../src/engine/network-search-feedback";
import {
  checkRateLimit,
  isNetworkOperationPaused,
} from "../../../../../../../src/engine/network-abuse-controls";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 60 });
  vi.mocked(isNetworkOperationPaused).mockResolvedValue({ paused: false });
});

describe("/api/v1/network/search", () => {
  it("rejects caller-supplied stepRunId before searching or writing", async () => {
    const response = await POST(
      request({ query: "ops expert", stepRunId: "web-direct-action:bad" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(runNetworkSearch).not.toHaveBeenCalled();
  });

  it.each([null, "", 0, false])(
    "rejects falsy caller-supplied stepRunId before search: %s",
    async (stepRunId) => {
      const response = await POST(request({ query: "ops expert", stepRunId }));

      expect(response.status).toBe(400);
      expect(runNetworkSearch).not.toHaveBeenCalled();
      expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
    },
  );

  it("rejects caller-supplied stepRunId on feedback before write", async () => {
    const response = await PATCH(
      request({ searchRunId: "run-1", kind: "not-a-fit", stepRunId: false }),
    );

    expect(response.status).toBe(400);
    expect(recordNetworkSearchFeedback).not.toHaveBeenCalled();
  });

  it("requires a query", async () => {
    const response = await POST(request({ visitorSessionId: "v1" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "query_required" });
    expect(runNetworkSearch).not.toHaveBeenCalled();
  });

  it("requires a resolved actor before searching", async () => {
    const response = await POST(request({ query: "ops expert" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "search_actor_required" });
    expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("mints a wrapper step run and runs the search", async () => {
    const response = await POST(
      request({
        query: "marketplace operations expert",
        visitorSessionId: "visitor-1",
        sourcesAllowed: "ditto-members",
        mode: "member",
      }),
    );

    expect(response.status).toBe(200);
    expect(createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({ route: "network-manual-search", sessionId: "visitor-1" }),
    );
    expect(runNetworkSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "marketplace operations expert",
        sourcesAllowed: "ditto-members",
        mode: "member",
        stepRunId: "network-lane-step:search:test",
      }),
    );
  });

  it("honors a paused Active Request before minting a wrapper step run", async () => {
    vi.mocked(isNetworkOperationPaused).mockImplementation(async (input) => {
      if (input.requestId === "request-1") {
        return { paused: true, reason: "person-ref_paused" };
      }
      return { paused: false };
    });

    const response = await POST(
      request({
        query: "marketplace operations expert",
        visitorSessionId: "visitor-1",
        requestId: "request-1",
      }),
    );

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({
      error: "network_operation_paused",
      reason: "person-ref_paused",
    });
    expect(isNetworkOperationPaused).toHaveBeenCalledWith({
      requestId: "request-1",
      memberId: null,
    });
    expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(runNetworkSearch).not.toHaveBeenCalled();
  });

  it("rate-limits manual search before pause checks or wrapper run minting", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      retryAfterSec: 90,
      limitName: "network-search",
      bucketKey: "network-search:visitor:hash",
      count: 21,
      limit: 20,
      remaining: 0,
      resetAt: new Date("2026-05-19T12:00:00.000Z"),
      source: "postgres",
      reason: "limit_exceeded",
    });

    const response = await POST(
      request({
        query: "marketplace operations expert",
        visitorSessionId: "visitor-1",
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "rate_limited",
      retryAfterSec: 90,
    });
    expect(isNetworkOperationPaused).not.toHaveBeenCalled();
    expect(createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(runNetworkSearch).not.toHaveBeenCalled();
  });

  it("forwards a structurally-valid Active Request card so private facts get scrubbed", async () => {
    const card = {
      type: "job-request-card",
      jtbd: "marketplace ops",
      antiPersonaMd: "no agency middlemen",
      budgetShape: { ballpark: "$30k/month", cadence: "monthly" },
    };
    const response = await POST(
      request({
        query: "marketplace ops",
        visitorSessionId: "visitor-1",
        jobRequestCard: card,
      }),
    );

    expect(response.status).toBe(200);
    expect(runNetworkSearch).toHaveBeenCalledWith(
      expect.objectContaining({ jobRequestCard: card }),
    );
  });

  it("drops a non-job-request-card jobRequestCard rather than passing junk", async () => {
    const response = await POST(
      request({
        query: "marketplace ops",
        visitorSessionId: "visitor-1",
        jobRequestCard: { type: "not-a-card", evil: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(runNetworkSearch).toHaveBeenCalledWith(
      expect.objectContaining({ jobRequestCard: undefined }),
    );
  });

  it("records search feedback with a minted wrapper step run", async () => {
    const response = await PATCH(
      request({
        searchRunId: "run-1",
        kind: "not-a-fit",
        possibleConnectionId: "pc-1",
        reasonText: "too academic",
        visitorSessionId: "visitor-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({ route: "network-search-feedback-not-a-fit" }),
    );
    expect(recordNetworkSearchFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        searchRunId: "run-1",
        kind: "not-a-fit",
        possibleConnectionId: "pc-1",
        stepRunId: "network-lane-step:search:test",
      }),
    );
  });

  it("rejects an invalid feedback kind", async () => {
    const response = await PATCH(
      request({ searchRunId: "run-1", kind: "delete-everything", visitorSessionId: "v1" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_feedback_kind" });
    expect(recordNetworkSearchFeedback).not.toHaveBeenCalled();
  });
});
