import { describe, expect, it } from "vitest";
import {
  renderBlockToText,
  type AuthorizationRequestBlock,
  type ContentBlock,
  type JobRequestCardBlock,
  type NetworkProfileCardBlock,
  type ReviewCardBlock,
} from "./content-blocks";

function makeNetworkProfileCard(overrides: Partial<NetworkProfileCardBlock> = {}): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "GTM operator for founder-led teams",
    signalDots: [
      { id: "uvp", label: "Clear offer", filled: true, color: "petal" },
      { id: "fit", label: "Fit", filled: true, color: "mint" },
      { id: "proof", label: "Proof", filled: false, color: "canary" },
    ],
    badges: [
      { label: "B2B SaaS", color: "mint" },
      { label: "Outbound", color: "petal" },
    ],
    narrativeMd:
      "Hunting his next *thing*: operator-founder who likes crisp GTM systems and practical sales loops.",
    antiPersonaMd: "\"advisor\" titles without operating scars",
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-08T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/people/timhgreen",
    ogImageUrl: "https://ditto.partners/people/timhgreen/opengraph-image",
    ...overrides,
  };
}

function makeJobRequestCard(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound with someone who can touch the CRM",
    referenceShape: "Jake set up sequences and fixed the CRM mess last time.",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 booked discovery calls per week by day 30",
    budgetShape: {
      ballpark: "$8-12k/month, 3-month commitment",
      cadence: "monthly",
    },
    scoutOptIn: true,
    suggestedCandidates: [
      {
        handle: "mira-ops",
        name: "Mira Ops",
        oneLineRole: "GTM operator for founder-led teams",
        rationaleMd: "Mira has the CRM-touch shape you described.",
        fitConfidence: "high",
        source: "on-network",
        computedAt: "2026-05-10T08:30:00.000Z",
      },
    ],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  };
}

describe("ContentBlock network profile card", () => {
  it("is part of the discriminated ContentBlock union and has a text fallback", () => {
    const block: ContentBlock = makeNetworkProfileCard();

    const text = renderBlockToText(block);

    expect(text).toContain("Tim Green");
    expect(text).toContain("GTM operator");
    expect(text).toContain("https://ditto.partners/people/timhgreen");
    expect(text).toContain("Allergic to:");
    expect(text).toContain("Curated by Alex");
  });

  it("renders the required anti-persona placeholder when the value is still unknown", () => {
    const text = renderBlockToText(makeNetworkProfileCard({ antiPersonaMd: null }));

    expect(text).toContain("still asking Tim");
  });
});

describe("ContentBlock job request card", () => {
  it("is part of the discriminated ContentBlock union and has a safe text fallback", () => {
    const block: ContentBlock = makeJobRequestCard();

    const text = renderBlockToText(block);

    expect(text).toContain("Opportunity brief");
    expect(text).toContain("Ramp outbound");
    expect(text).toContain("Mira Ops (@mira-ops)");
    expect(text).toContain("Curated by Mira");
    expect(text).toContain("Budget: internal-only");
    expect(text).not.toContain("$8-12k/month");
  });

  it("keeps card edit time distinct from match computation time", () => {
    const block = makeJobRequestCard();

    expect(block.lastUpdatedAt).toBe("2026-05-10T08:00:00.000Z");
    expect(block.suggestedCandidates[0]?.computedAt).toBe("2026-05-10T08:30:00.000Z");
  });

  it("narrows the discriminated union to JobRequestCardBlock", () => {
    const block: ContentBlock = makeJobRequestCard();

    if (block.type !== "job-request-card") {
      throw new Error("expected job request card");
    }

    expect(block.budgetShape.cadence).toBe("monthly");
    expect(block.suggestedCandidates[0]?.fitConfidence).toBe("high");
  });
});

describe("AuthorizationRequestBlock forward compatibility", () => {
  it("accepts an optional nullable costLabel without requiring old fixtures to change", () => {
    const legacyBlock: AuthorizationRequestBlock = {
      type: "authorization-request",
      state: "pending",
      header: "Want me to send this?",
      preview: null,
      recipientLabel: "ops@example.com",
      actionClass: "email-send",
      executionResult: null,
      expiresAt: null,
    };
    const futureBlock: AuthorizationRequestBlock = {
      ...legacyBlock,
      costLabel: null,
    };

    expect(renderBlockToText(legacyBlock)).toContain("Want me to send this?");
    expect(futureBlock.costLabel).toBeNull();
  });
});

describe("ReviewCardBlock contract", () => {
  it("keeps the existing flat outputText shape unchanged", () => {
    const block: ReviewCardBlock = {
      type: "review_card",
      processRunId: "run-1",
      stepName: "Draft",
      outputText: "Plain output",
      confidence: "high",
      actions: [],
      knowledgeUsed: ["source"],
    };

    expect(Object.keys(block).sort()).toEqual([
      "actions",
      "confidence",
      "knowledgeUsed",
      "outputText",
      "processRunId",
      "stepName",
      "type",
    ]);
    expect(renderBlockToText(block)).toContain("Plain output");
  });
});
