import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JobRequestCardBlock, ReviewCardBlock, SuggestedCandidate } from "@/lib/engine";
import {
  CLIENT_LANE_UPSELL_COPY,
  ClientCardActions,
  emitDebugWorkspaceUpsell,
  introStubCopy,
  scanOffNetwork,
} from "./client-card-actions";
import { WORKSPACE_UPSELL_OQ1_WARN, resetWorkspaceUpsellGuardsForTest } from "./workspace-upsell";

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

  it("renders the intro stub with selected-candidate copy and debug affordance", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialNotice: "intro",
      }),
    );

    expect(introStubCopy("Lisa Chen")).toBe(
      "Coming in sub-brief 261 — the intro flow drops here. For now, your selection — Lisa Chen — is captured.",
    );
    expect(html).toContain("Coming in sub-brief 261");
    expect(html).toContain("your selection — Lisa Chen — is captured");
    expect(html).toContain("[ Pretend it sent ]");
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

  it("fires the client OQ1 guard and renders the workspace upsell copy from the debug path", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emitted: string[] = [];

    const copy = emitDebugWorkspaceUpsell({
      mode: "client",
      sessionId: "client-session",
      onUpsell: (value) => emitted.push(value),
    });
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialUpsellCopy: copy,
      }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(WORKSPACE_UPSELL_OQ1_WARN);
    expect(emitted).toEqual([CLIENT_LANE_UPSELL_COPY]);
    expect(html).toContain("Brief&#x27;s saved.");
    expect(html).toContain("Yes, set up workspace");
    expect(html).toContain("Not now, just my brief");
  });

  it("keeps the intro stub path side-effect-free while scout points at the real route", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    introStubCopy("Lisa Chen");

    expect(fetchSpy).not.toHaveBeenCalled();

    const source = readFileSync(
      "packages/web/app/network/chat/client-card-actions.tsx",
      "utf8",
    );
    expect(source).toContain("/api/v1/network/scout");
    expect(source).not.toContain("emit_intro_request");
    expect(source).not.toContain("gmail-authorized-send");
    expect(source).toContain("TODO: remove when sub-brief 261 lands");
  });
});
