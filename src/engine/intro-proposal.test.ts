import { describe, expect, it } from "vitest";
import type {
  IntroProposalCardBlock,
  NetworkProfileCardBlock,
  TextBlock,
} from "./content-blocks";

process.env.DITTO_TEST_MODE = "true";

const {
  createIntroMagicLinkToken,
  parseIntroMagicLinkToken,
  buildIntroApproveUrl,
  buildIntroDecisionUrl,
  scrubProposalCardForRecipient,
} = await import("./intro-proposal");

describe("intro magic-link tokens (Brief 288)", () => {
  it("round-trips a valid payload through sign + parse", () => {
    const { token, jti, expiresAt } = createIntroMagicLinkToken({
      introId: "intro-1",
      party: "requester",
      email: "rob@example.com",
    });

    expect(token.startsWith("imlt_")).toBe(true);

    const parsed = parseIntroMagicLinkToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.typ).toBe("intro-approval");
    expect(parsed?.v).toBe(1);
    expect(parsed?.introId).toBe("intro-1");
    expect(parsed?.party).toBe("requester");
    expect(parsed?.email).toBe("rob@example.com");
    expect(parsed?.jti).toBe(jti);
    expect(parsed?.exp).toBe(expiresAt.getTime());
  });

  it("rejects tokens past the 24h expiry", () => {
    const issuedAt = new Date("2026-05-01T00:00:00.000Z");
    const { token } = createIntroMagicLinkToken({
      introId: "intro-2",
      party: "recipient",
      email: "priya@example.com",
      now: issuedAt,
    });
    const justInside = new Date(issuedAt.getTime() + 23 * 60 * 60 * 1000);
    expect(parseIntroMagicLinkToken(token, justInside)).not.toBeNull();

    const justOutside = new Date(issuedAt.getTime() + 25 * 60 * 60 * 1000);
    expect(parseIntroMagicLinkToken(token, justOutside)).toBeNull();
  });

  it("rejects tokens with a tampered signature", () => {
    const { token } = createIntroMagicLinkToken({
      introId: "intro-3",
      party: "requester",
      email: "rob@example.com",
    });
    const [payloadPart, sigPart] = token.replace(/^imlt_/, "").split(".");
    const tamperedSig = sigPart.slice(0, -2) + "AA";
    const tamperedToken = `imlt_${payloadPart}.${tamperedSig}`;
    expect(parseIntroMagicLinkToken(tamperedToken)).toBeNull();
  });

  it("rejects tokens with a tampered payload", () => {
    const { token } = createIntroMagicLinkToken({
      introId: "intro-4",
      party: "requester",
      email: "rob@example.com",
    });
    const [payloadPart, sigPart] = token.replace(/^imlt_/, "").split(".");
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    decoded.introId = "different-intro";
    const repayload = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    const tamperedToken = `imlt_${repayload}.${sigPart}`;
    expect(parseIntroMagicLinkToken(tamperedToken)).toBeNull();
  });

  it("rejects tokens without the imlt_ prefix", () => {
    expect(parseIntroMagicLinkToken("xyz.abc")).toBeNull();
    expect(parseIntroMagicLinkToken("")).toBeNull();
  });

  it("lowercases the email field at issue time", () => {
    const { token } = createIntroMagicLinkToken({
      introId: "intro-5",
      party: "requester",
      email: "ROB@Example.com",
    });
    const parsed = parseIntroMagicLinkToken(token);
    expect(parsed?.email).toBe("rob@example.com");
  });
});

describe("intro URL builders (Brief 288)", () => {
  it("buildIntroApproveUrl lands the recipient on the chat surface with intent", () => {
    const url = buildIntroApproveUrl("intro-1", "imlt_test", "requester", "approve");
    expect(url).toContain("/network/intros/intro-1/chat");
    expect(url).toContain("token=imlt_test");
    expect(url).toContain("party=requester");
    expect(url).toContain("action=approve");
  });

  it("buildIntroDecisionUrl is the chat surface without a forced action", () => {
    const url = buildIntroDecisionUrl("intro-1", "imlt_test", "recipient");
    expect(url).toContain("/network/intros/intro-1/chat");
    expect(url).toContain("token=imlt_test");
    expect(url).toContain("party=recipient");
    expect(url).not.toContain("action=");
  });
});

// ============================================================
// Brief 288 AC #11 / B4 — antiPersonaMd must be null on every
// non-owner render path. `scrubProposalCardForRecipient` is the
// owner-only scrub applied to the recipient preview before any
// recipient surface (email / chat / inbox card) is rendered. It
// nulls antiPersonaMd on every embedded network-profile-card and
// passes non-NPC preview blocks through untouched.
// ============================================================

const ANTI_PERSONA_SECRET =
  "internal: never pitch this person on agency retainers";

function networkProfileCard(
  over: Partial<NetworkProfileCardBlock> = {},
): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "priya-rao",
    name: "Priya Rao",
    portraitUrl: null,
    cityLabel: null,
    oneLineRole: "Founder, infra startup",
    signalDots: [],
    badges: [],
    narrativeMd: "Public bio sentence.",
    antiPersonaMd: ANTI_PERSONA_SECRET,
    greeterCuratedBy: "mira",
    lastUpdatedAt: "2026-05-19T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/p/priya-rao",
    ogImageUrl: "https://ditto.partners/og/priya-rao.png",
    ...over,
  };
}

function introProposalCard(
  preview: IntroProposalCardBlock["recipientPreview"]["preview"],
): IntroProposalCardBlock {
  return {
    type: "intro-proposal-card",
    state: "requester-approved",
    introId: "intro-scrub-1",
    header: "Mira: intro to Priya Rao?",
    whyThisFits: "Strong operator fit for the hire.",
    whyNow: "She just closed a round.",
    evidence: [],
    risks: null,
    recipientPreview: {
      type: "authorization-request",
      state: "pending",
      header: "Rob would like an intro",
      preview,
      recipientLabel: "Priya Rao",
      actionClass: "email-send",
      executionResult: null,
      expiresAt: null,
      authorizationId: "intro-scrub-1-recipient",
      request: "intro",
      draft: "draft",
      requesterId: "user-rob",
      costLabel: null,
    },
    whatStaysPrivate: ["Your pipeline notes"],
    costLabel: null,
    confidence: 0.8,
    affordances: ["approve", "decline", "not-now", "edit-draft", "open-chat"],
  };
}

describe("scrubProposalCardForRecipient (Brief 288 AC #11 / B4)", () => {
  it("nulls antiPersonaMd on every embedded network-profile-card", () => {
    const npc = networkProfileCard();
    expect(npc.antiPersonaMd).toBe(ANTI_PERSONA_SECRET); // sanity: secret present pre-scrub

    const scrubbed = scrubProposalCardForRecipient(introProposalCard([npc]));

    const scrubbedNpc = scrubbed.recipientPreview.preview?.find(
      (b): b is NetworkProfileCardBlock =>
        typeof b === "object" &&
        b !== null &&
        "type" in b &&
        b.type === "network-profile-card",
    );
    expect(scrubbedNpc).toBeDefined();
    expect(scrubbedNpc?.antiPersonaMd).toBeNull();
    // Non-sensitive fields stay intact — this scrub only owner-gates
    // antiPersonaMd; content redaction is scrubForSurface's job.
    expect(scrubbedNpc?.narrativeMd).toBe("Public bio sentence.");
    expect(scrubbedNpc?.handle).toBe("priya-rao");
  });

  it("passes non-network-profile-card preview blocks through unchanged", () => {
    const textBlock: TextBlock = {
      type: "text",
      text: "Here's why I think you two should talk.",
    };
    const scrubbed = scrubProposalCardForRecipient(
      introProposalCard([networkProfileCard(), textBlock]),
    );

    const passthrough = scrubbed.recipientPreview.preview?.[1];
    expect(passthrough).toEqual(textBlock);
  });

  it("does not mutate the input card and preserves all non-preview fields", () => {
    const npc = networkProfileCard();
    const input = introProposalCard([npc]);
    const scrubbed = scrubProposalCardForRecipient(input);

    // Source object untouched (owner-side card keeps antiPersonaMd).
    expect(npc.antiPersonaMd).toBe(ANTI_PERSONA_SECRET);
    expect(scrubbed).not.toBe(input);
    // Everything outside the recipient preview is carried verbatim.
    expect(scrubbed.introId).toBe(input.introId);
    expect(scrubbed.state).toBe(input.state);
    expect(scrubbed.whyThisFits).toBe(input.whyThisFits);
    expect(scrubbed.whatStaysPrivate).toEqual(input.whatStaysPrivate);
    expect(scrubbed.affordances).toEqual(input.affordances);
  });
});
