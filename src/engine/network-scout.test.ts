import { describe, expect, it } from "vitest";
import type { JobRequestCardBlock, SuggestedCandidate } from "./content-blocks";
import {
  buildScoutQuery,
  parseScoutedCandidatesFromSearch,
  scoutOffNetwork,
  scrubScoutVisibleText,
} from "./network-scout";

function card(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Find a RevOps operator for founder-led B2B services",
    referenceShape: "Someone like Pat who fixed HubSpot and outbound sequencing",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 qualified booked calls per week",
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

function seed(overrides: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "operator",
    name: "Pat Operator",
    oneLineRole: "RevOps operator",
    rationaleMd: "Strong fit.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: "2026-05-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("off-network scout", () => {
  it("builds scout queries without budget or private filters and treats seed candidates as hints", () => {
    const query = buildScoutQuery(
      card({
        jtbd: "Find someone, not pure copywriters, around $8-12k/month",
      }),
      seed({
        oneLineRole: "RevOps operator for $8-12k/month work",
      }),
    );

    expect(query).toContain("Pat Operator");
    expect(query).toContain("loose pattern only");
    expect(query).not.toContain("$8-12k/month");
    expect(query).not.toContain("pure copywriters");
  });

  it("scrubs budget and anti-persona text from visible scout copy", () => {
    expect(
      scrubScoutVisibleText("Avoid pure copywriters around $8-12k/month", card()),
    ).toBe("Avoid [private] around [private]");
  });

  it("parses only candidates that include a public URL", () => {
    const candidates = parseScoutedCandidatesFromSearch(
      [
        "- Jordan Ops - RevOps consultant https://example.com/jordan Builds HubSpot systems.",
        "- No Url - Looks good but no source",
      ].join("\n"),
      card(),
      new Date("2026-05-12T01:00:00.000Z"),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      handle: expect.stringMatching(/^scouted:/),
      source: "scouted",
      sourceUrl: "https://example.com/jordan",
      sourceLabel: "example.com",
    });
  });

  it("drops candidates whose visible name or role echoes private values", () => {
    const candidates = parseScoutedCandidatesFromSearch(
      [
        "- $8-12k/month operator - RevOps consultant https://example.com/private-name",
        "- Jordan Ops - pure copywriters specialist https://example.com/private-role",
        "- Jordan Ops - RevOps consultant https://example.com/jordan",
      ].join("\n"),
      card(),
      new Date("2026-05-12T01:00:00.000Z"),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.name).toBe("Jordan Ops");
  });

  it("fails closed when web search is unavailable", async () => {
    const result = await scoutOffNetwork({
      jobRequestCard: card(),
      stepRunId: "network-lane-step:scout",
      search: async () => null,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.review.confidence).toBe("low");
    expect(result.review.outputText).toContain("unavailable");
  });

  it("rejects direct web action stepRunIds", async () => {
    await expect(
      scoutOffNetwork({
        jobRequestCard: card(),
        stepRunId: "web-direct-action:test",
        search: async () => "",
      }),
    ).rejects.toThrow("requires a network-lane or harness stepRunId");
  });
});
