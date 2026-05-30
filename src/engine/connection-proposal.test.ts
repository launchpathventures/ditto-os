import { describe, expect, it } from "vitest";
import type { JobRequestCardBlock, SuggestedCandidate } from "./content-blocks";
import {
  buildPossibleConnection,
  buildPossibleConnections,
  scrubProposalText,
  type BuildPossibleConnectionContext,
} from "./connection-proposal";

const NOW = new Date("2026-05-16T00:00:00.000Z");

function card(partial: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "a marketplace operations expert",
    referenceShape: "",
    antiPersonaMd: "no agency middlemen",
    successCriteria: "",
    budgetShape: { ballpark: "$25k/month", cadence: "monthly" },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: NOW.toISOString(),
    ...partial,
  };
}

function candidate(partial: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "priya-ops",
    name: "Priya Shah",
    oneLineRole: "Marketplace operations lead for two-sided networks",
    rationaleMd:
      "Ran ops for a messy two-sided marketplace and rebuilt supply liquidity end to end.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: NOW.toISOString(),
    ...partial,
  };
}

function ctx(partial: Partial<BuildPossibleConnectionContext> = {}): BuildPossibleConnectionContext {
  return { card: card(), consentFoundationAvailable: false, ...partial };
}

describe("scrubProposalText", () => {
  it("redacts anti-persona and budget ballpark from seeker copy", () => {
    const result = scrubProposalText(
      "Great fit but charges $25k/month and dislikes no agency middlemen.",
      card(),
    );
    expect(result.scrubbed).toBe(true);
    expect(result.text).not.toContain("$25k/month");
    expect(result.text).not.toContain("no agency middlemen");
    expect(result.text).toContain("[private]");
  });

  it("leaves clean copy untouched", () => {
    const result = scrubProposalText("Strong operator with marketplace depth.", card());
    expect(result.scrubbed).toBe(false);
    expect(result.text).toBe("Strong operator with marketplace depth.");
  });
});

describe("buildPossibleConnection", () => {
  it("produces a why, evidence with provenance, and honest confidence", () => {
    const pc = buildPossibleConnection(
      candidate({
        sourceLabel: "Ditto member signal",
        sourceSnippet: "Scaled supply ops for a regional marketplace.",
      }),
      ctx(),
      NOW,
    );
    expect(pc.whyThisFits.length).toBeGreaterThan(0);
    expect(pc.evidence).toHaveLength(1);
    expect(pc.evidence[0].sourceLabel).toBe("Ditto member signal");
    expect(pc.evidence[0].claimId).toBe("priya-ops");
    expect(pc.isDittoMember).toBe(true);
    expect(pc.source).toBe("ditto-member");
  });

  it("scrubs private values out of the why and reports the scrub", () => {
    const pc = buildPossibleConnection(
      candidate({
        rationaleMd: "Fits well; comfortable at $25k/month engagements.",
      }),
      ctx(),
      NOW,
    );
    expect(pc.whyThisFits).not.toContain("$25k/month");
    expect(pc.scrubApplied).toBe(true);
  });

  it("flags missing public proof for scouted leads with no URL", () => {
    const pc = buildPossibleConnection(
      candidate({ source: "scouted", handle: "scouted:lead", sourceUrl: undefined }),
      ctx(),
      NOW,
    );
    expect(pc.risks.some((r) => /public proof/i.test(r))).toBe(true);
    expect(pc.source).toBe("public-web");
    expect(pc.isDittoMember).toBe(false);
  });

  it("flags a stale source older than 30 days", () => {
    const pc = buildPossibleConnection(
      candidate({ computedAt: "2026-01-01T00:00:00.000Z" }),
      ctx(),
      NOW,
    );
    expect(pc.risks.some((r) => /stale/i.test(r))).toBe(true);
  });

  it("renders ask-if-open as save until the consent foundation exists", () => {
    const pc = buildPossibleConnection(candidate(), ctx({ consentFoundationAvailable: false }), NOW);
    expect(pc.introEligibility).toBe("consent-unavailable");
    expect(pc.nextAction).toBe("save");
  });

  it("allows ask-if-open once the consent foundation is available", () => {
    const pc = buildPossibleConnection(candidate(), ctx({ consentFoundationAvailable: true }), NOW);
    expect(pc.introEligibility).toBe("eligible");
    expect(pc.nextAction).toBe("ask-if-open");
  });

  it("suppresses a blocked person with visible not-recommended copy", () => {
    const pc = buildPossibleConnection(
      candidate(),
      ctx({ health: { "priya-ops": { blocked: true } } }),
      NOW,
    );
    expect(pc.recommended).toBe(false);
    expect(pc.confidence).toBe("low");
    expect(pc.notRecommendedReason).toMatch(/blocked/i);
    expect(pc.introEligibility).toBe("blocked");
  });

  it("downgrades a high-demand person but keeps it recommended", () => {
    const pc = buildPossibleConnection(
      candidate({ fitConfidence: "high" }),
      ctx({ health: { "priya-ops": { highDemand: true } } }),
      NOW,
    );
    expect(pc.recommended).toBe(true);
    expect(pc.confidence).toBe("medium");
    expect(pc.notRecommendedReason).toMatch(/high demand/i);
    expect(pc.networkHealthFlags).toContain("high-demand");
  });
});

describe("buildPossibleConnections", () => {
  it("dedupes by proposal key and ranks members first when fit is equal", () => {
    const member = candidate({ handle: "m1", name: "Member One", fitConfidence: "medium" });
    const dupMember = candidate({ handle: "m1", name: "Member One", fitConfidence: "medium" });
    const scouted = candidate({
      handle: "scouted:p1",
      name: "Public One",
      source: "scouted",
      sourceUrl: "https://example.com/p1",
      sourceLabel: "example.com",
      fitConfidence: "medium",
    });
    const built = buildPossibleConnections([scouted, member, dupMember], ctx(), NOW);
    expect(built).toHaveLength(2);
    expect(built[0].isDittoMember).toBe(true);
  });

  it("ranks recommended results ahead of suppressed ones", () => {
    const ok = candidate({ handle: "ok", name: "OK Person" });
    const blocked = candidate({ handle: "blocked", name: "Blocked Person" });
    const built = buildPossibleConnections(
      [blocked, ok],
      ctx({ health: { blocked: { blocked: true } } }),
      NOW,
    );
    expect(built[0].recommended).toBe(true);
    expect(built[built.length - 1].recommended).toBe(false);
  });
});
