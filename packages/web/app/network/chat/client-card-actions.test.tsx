import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JobRequestCardBlock, ReviewCardBlock, SuggestedCandidate } from "@/lib/engine";
import {
  CLIENT_LANE_UPSELL_COPY,
  ClientCardActions,
  requestIntroduction,
  scanOffNetwork,
} from "./client-card-actions";
import { resetWorkspaceUpsellGuardsForTest } from "./workspace-upsell";

function selectedCandidate(overrides: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "lisa-chen",
    name: "Lisa Chen",
    oneLineRole: "Outbound operator who touches CRM",
    rationaleMd: "Mira: exactly the CRM-touch outbound shape.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  };
}

function jobRequestCard(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound",
    referenceShape: "Jake built sequences and fixed HubSpot",
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
    lastUpdatedAt: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

function reviewBlock(overrides: Partial<ReviewCardBlock> = {}): ReviewCardBlock {
  return {
    type: "review_card",
    processRunId: "network-lane-step:network-scout:test",
    stepName: "scout_off_network",
    outputText: "Found 1 source-backed off-network lead.",
    confidence: "medium",
    actions: [],
    knowledgeUsed: ["Job request card", "Public web search"],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetWorkspaceUpsellGuardsForTest();
});

describe("ClientCardActions", () => {
  it("renders the parent scout action as a real loading state, not a Brief 258 stub", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialNotice: "scout",
        initialScoutStatus: "loading",
        jobRequestCard: jobRequestCard(),
      }),
    );

    expect(html).toContain("Scanning public sources");
    expect(html).not.toContain("Coming in sub-brief 258");
    expect(html).not.toContain("[ Pretend it scanned ]");
  });

  it("posts the scout request without accepting a caller supplied stepRunId", async () => {
    const payload = {
      status: "success" as const,
      review: reviewBlock(),
      candidates: [selectedCandidate({ source: "scouted", handle: "scouted:lead" })],
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    })) as unknown as typeof fetch;

    await expect(
      scanOffNetwork({
        jobRequestCard: jobRequestCard(),
        sessionId: "client-session",
        fetchImpl,
      }),
    ).resolves.toEqual(payload);

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/network/scout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(String),
      }),
    );
    const body = JSON.parse((fetchImpl as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body) as Record<string, unknown>;
    expect(body).toMatchObject({
      sessionId: "client-session",
      jobRequestCard: expect.objectContaining({ type: "job-request-card" }),
    });
    expect(body).not.toHaveProperty("stepRunId");
  });

  it("posts intro requests without accepting a caller supplied stepRunId", async () => {
    const payload = {
      introductionId: "intro-1",
      state: "queued",
      block: {
        type: "authorization-request",
        state: "pending",
        header: "Intro request for Lisa Chen",
        preview: null,
        recipientLabel: "Lisa Chen",
        actionClass: "email-send",
        executionResult: null,
        expiresAt: null,
        costLabel: "1st of 2 free intros (1 left after this)",
      },
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    })) as unknown as typeof fetch;

    await expect(
      requestIntroduction({
        jobRequestCard: jobRequestCard(),
        selectedCandidate: selectedCandidate(),
        sessionId: "client-session",
        fetchImpl,
      }),
    ).resolves.toEqual(payload);

    const call = (fetchImpl as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0];
    expect(call[0]).toBe("/api/v1/network/intros");
    expect(call[1]).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    const body = JSON.parse(call[1].body) as Record<string, unknown>;
    expect(body).toMatchObject({
      sessionId: "client-session",
      jobRequestCard: expect.objectContaining({ type: "job-request-card" }),
      selectedCandidate: expect.objectContaining({ handle: "lisa-chen" }),
    });
    expect(body).not.toHaveProperty("stepRunId");
  });

  it("renders the intro action without the old Brief 261 stub copy", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialNotice: "intro",
      }),
    );

    expect(html).toContain("Intro:");
    expect(html).not.toContain("Coming in sub-brief 261");
    expect(html).not.toContain("[ Pretend it sent ]");
  });

  it("disables the primary action with cursor-wait during candidate refresh", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: true,
      }),
    );

    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("cursor-wait");
  });

  it("renders the workspace upsell copy when supplied by the durable Q6 trigger", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialUpsellCopy: CLIENT_LANE_UPSELL_COPY,
      }),
    );

    expect(html).toContain("Brief&#x27;s saved.");
    expect(html).toContain("Yes, set up workspace");
    expect(html).toContain("Not now, just my brief");
  });

  it("keeps scout and intro pointed at their audited HTTP routes", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(fetchSpy).not.toHaveBeenCalled();

    const source = readFileSync(
      "packages/web/app/network/chat/client-card-actions.tsx",
      "utf8",
    );
    expect(source).toContain("/api/v1/network/scout");
    expect(source).toContain("/api/v1/network/intros");
    expect(source).not.toContain("gmail-authorized-send");
    expect(source).not.toContain("Coming in sub-brief 261");
  });
});
