import { describe, expect, it } from "vitest";
import {
  renderBlockToText,
  type AuthorizationRequestBlock,
  type ContentBlock,
  type IntroProposalCardBlock,
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
    expect(text).toContain("owner-visible only");
    expect(text).not.toContain("\"advisor\" titles without operating scars");
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

function makeIntroProposalCard(
  overrides: Partial<IntroProposalCardBlock> = {},
): IntroProposalCardBlock {
  const recipientPreview: AuthorizationRequestBlock = {
    type: "authorization-request",
    state: "pending",
    header: "Priya — Mira wants to introduce you to Rob (3-min read).",
    preview: null,
    recipientLabel: "priya@example.com",
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
  };
  return {
    type: "intro-proposal-card",
    state: "proposed",
    introId: "intro-123",
    header: "Mira: intro to Priya?",
    whyThisFits:
      "Priya has run Series-A GTM hiring loops three times in the last 18 months.",
    whyNow:
      "Rob just hit the 'find a head of sales' Active Request and Priya is open to advisory work.",
    evidence: [
      { label: "Priya's profile", sourceId: "ns-1", kind: "profile" },
      { label: "Two prior advisory engagements", sourceId: "ns-2", kind: "watch" },
    ],
    risks: ["Priya prefers async first; Rob is more synchronous"],
    recipientPreview,
    whatStaysPrivate: [
      "Rob's budget range",
      "Anti-persona notes",
    ],
    costLabel: "Free intro · 2 of 5 this month",
    confidence: 0.82,
    affordances: ["approve", "decline", "not-now", "edit-draft", "open-chat"],
    ...overrides,
  };
}

describe("ContentBlock intro proposal card", () => {
  it("is part of the discriminated ContentBlock union and has a text fallback", () => {
    const block: ContentBlock = makeIntroProposalCard();

    const text = renderBlockToText(block);

    expect(text).toContain("Intro proposal — proposed");
    expect(text).toContain("Mira: intro to Priya?");
    expect(text).toContain("Why this fits:");
    expect(text).toContain("Series-A GTM hiring loops");
    expect(text).toContain("Why now:");
    expect(text).toContain("Evidence:");
    expect(text).toContain("Priya's profile");
    expect(text).toContain("ns-1");
    expect(text).toContain("Risks:");
    expect(text).toContain("What stays private:");
    expect(text).toContain("Confidence: 0.82");
    expect(text).toContain("Cost: Free intro");
    expect(text).toContain("Recipient will see:");
    expect(text).toContain("Priya — Mira wants to introduce you to Rob");
    expect(text).toContain("Affordances: approve, decline, not-now, edit-draft, open-chat");
  });

  it("narrows the discriminated union and exposes the recipient preview block", () => {
    const block: ContentBlock = makeIntroProposalCard({ state: "recipient-asked" });

    if (block.type !== "intro-proposal-card") {
      throw new Error("expected intro proposal card");
    }

    expect(block.state).toBe("recipient-asked");
    expect(block.recipientPreview.type).toBe("authorization-request");
    expect(block.recipientPreview.actionClass).toBe("email-send");
    expect(block.evidence.length).toBe(2);
    expect(block.confidence).toBeGreaterThanOrEqual(0);
    expect(block.confidence).toBeLessThanOrEqual(1);
  });

  it("renders without an optional cost label or risks", () => {
    const text = renderBlockToText(
      makeIntroProposalCard({ costLabel: null, risks: null }),
    );

    expect(text).not.toContain("Cost:");
    expect(text).not.toContain("Risks:");
    expect(text).toContain("Confidence: 0.82");
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
