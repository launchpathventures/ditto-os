import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";
import {
  SuggestedCandidatesPanel,
  handleCandidateIntroduce,
  handleCandidatePanelKeyDown,
  rationaleText,
  refreshSuggestedCandidates,
  staleSuggestionAgeHours,
  scrubCandidateVisibleText,
} from "./suggested-candidates-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function candidate(index: number, overrides: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: `candidate-${index}`,
    name: `Candidate ${index}`,
    oneLineRole: "Outbound operator who touches CRM",
    rationaleMd: "Mira: CRM-touch shape with strong outbound setup signal.",
    fitConfidence: index % 3 === 0 ? "low" : index % 2 === 0 ? "medium" : "high",
    source: "on-network",
    computedAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  };
}

function jobRequest(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound",
    referenceShape: "A contractor who built sequences and kept the CRM clean.",
    antiPersonaMd: "pure copywriter",
    successCriteria: "5 booked calls per week by day 30",
    budgetShape: {
      ballpark: "$8-12k/month",
      cadence: "monthly",
    },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(candidates: SuggestedCandidate[], selectedCandidateHandle: string | null = null): string {
  return renderToStaticMarkup(
    React.createElement(SuggestedCandidatesPanel, {
      candidates,
      jobRequestCard: jobRequest({ suggestedCandidates: candidates }),
      selectedCandidateHandle,
      setSelectedCandidateHandle: () => {},
      now: new Date("2026-05-11T09:00:00.000Z").getTime(),
    }),
  );
}

describe("SuggestedCandidatesPanel", () => {
  it("renders at most five candidates with the responsive grid-to-carousel classes and FitConfidenceDot", () => {
    const html = renderPanel([1, 2, 3, 4, 5, 6].map((index) => candidate(index)));

    expect((html.match(/Candidate:/g) ?? []).length).toBe(5);
    expect(html).toContain("flex gap-3 overflow-x-auto snap-x snap-mandatory");
    expect(html).toContain("md:grid md:grid-cols-2 md:gap-3");
    expect(html).toContain("w-[80vw]");
    expect(html).toContain("Fit confidence: high");
  });

  it("surfaces staleness after 24 hours using the latest candidate computedAt", () => {
    const now = new Date("2026-05-11T09:00:00.000Z").getTime();
    const staleCandidates = [
      candidate(1, { computedAt: "2026-05-10T08:00:00.000Z" }),
      candidate(2, { computedAt: "2026-05-10T07:00:00.000Z" }),
    ];

    expect(staleSuggestionAgeHours(staleCandidates, now)).toBe(25);
    expect(renderPanel(staleCandidates)).toContain("Suggestions from 25h ago — refresh ▸");
  });

  it("refreshes candidates with exactly one POST and reports the in-flight state", async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchImpl = vi.fn(() => fetchPromise) as unknown as typeof fetch;
    const inFlight: boolean[] = [];
    const refreshed = [candidate(7)];

    const refreshPromise = refreshSuggestedCandidates({
      jobRequestCard: jobRequest(),
      sessionId: "client-session",
      fetchImpl,
      onRefreshInFlightChange: (value) => inFlight.push(value),
    });

    expect(inFlight).toEqual([true]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/network/match",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );

    resolveFetch({
      ok: true,
      json: async () => refreshed,
    });

    await expect(refreshPromise).resolves.toEqual(refreshed);
    expect(inFlight).toEqual([true, false]);
  });

  it("keeps per-card Introduce as a UI-only setter with no fetch or stub-contract reference", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const selected: string[] = [];

    handleCandidateIntroduce("candidate-1", (handle) => selected.push(handle));

    expect(selected).toEqual(["candidate-1"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(handleCandidateIntroduce.toString()).not.toContain("fetch");

    const source = readFileSync(
      "packages/web/app/network/chat/suggested-candidates-panel.tsx",
      "utf8",
    );
    expect(source).not.toContain("IntroRequestStub");
    expect(source).not.toContain("network-intro-stub-contract");
    expect(source).not.toContain("emit_intro_request");
  });

  it("clears the selected candidate on Escape", () => {
    const selected: Array<string | null> = [];
    const preventDefault = vi.fn();

    handleCandidatePanelKeyDown(
      { key: "Escape", preventDefault },
      "candidate-1",
      (handle) => selected.push(handle),
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(selected).toEqual([null]);
  });

  it("does not render the client's anti-persona text inside the panel", () => {
    const html = renderPanel([candidate(1)]);

    expect(html).not.toContain("pure copywriter");
    expect(html).not.toContain("$8-12k/month");
  });

  it("suppresses rationale text that repeats the private anti-persona filter", () => {
    const card = jobRequest({ antiPersonaMd: "pure copywriter" });
    const leakyCandidate = candidate(1, {
      rationaleMd: "Mira: not a pure copywriter, strong CRM operator.",
    });

    const rationale = rationaleText(leakyCandidate, card);
    const html = renderToStaticMarkup(
      React.createElement(SuggestedCandidatesPanel, {
        candidates: [leakyCandidate],
        jobRequestCard: card,
        selectedCandidateHandle: null,
        setSelectedCandidateHandle: () => {},
      }),
    );

    expect(rationale).not.toContain("pure copywriter");
    expect(html).not.toContain("pure copywriter");
    expect(html).toContain("private filters");
  });

  it("suppresses rationale text that repeats the private budget", () => {
    const card = jobRequest({ budgetShape: { ballpark: "$8-12k/month", cadence: "monthly" } });
    const leakyCandidate = candidate(1, {
      rationaleMd: "Mira: available around $8-12k/month and strong CRM operator.",
    });

    const rationale = rationaleText(leakyCandidate, card);

    expect(rationale).not.toContain("$8-12k/month");
    expect(rationale).toContain("budget");
    expect(scrubCandidateVisibleText("Costs $8-12k/month", card)).toBe("Costs [private]");
  });

  it("renders scouted candidates with public source labels and review-only CTA copy", () => {
    const html = renderPanel([
      candidate(1, {
        handle: "scouted:abc123",
        name: "Public Lead",
        source: "scouted",
        sourceUrl: "https://example.com/public-lead",
        sourceLabel: "example.com",
        sourceSnippet: "Runs outbound systems for B2B services.",
      }),
    ]);

    expect(html).toContain("example.com");
    expect(html).toContain("https://example.com/public-lead");
    expect(html).toContain("Runs outbound systems");
    expect(html).toContain("Use as hint");
    expect(html).not.toContain("@scouted:abc123");
  });
});
