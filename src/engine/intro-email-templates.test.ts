import { describe, expect, it } from "vitest";
import {
  assertUnder200Words,
  renderRecipientApprovalEmail,
  renderRequesterApprovalEmail,
  renderWarmIntroThreadEmail,
  wordCount,
} from "./intro-email-templates";

describe("intro decision email templates", () => {
  it("renderRequesterApprovalEmail builds a subject + body under 200 words", () => {
    const result = renderRequesterApprovalEmail({
      requesterFirstName: "Rob",
      recipientDisplayName: "Priya Shankar",
      whyThisFits: "Priya has run Series-A GTM hiring three times in 18 months.",
      whyNow: "Rob just hit his Find-Head-of-Sales request.",
      costLabel: "Free intro · 2 of 5 this month",
      magicLinkUrl: "https://ditto.partners/intros/abc/approve?t=xyz",
      chatUrl: "https://ditto.partners/network/intros/abc/chat",
    });

    expect(result.subject).toBe("Mira: intro to Priya Shankar?");
    expect(result.body).toContain("Approve: https://ditto.partners/intros/abc/approve");
    expect(result.body).toContain("Why this fits:");
    expect(result.body).toContain("Why now:");
    expect(wordCount(result.body)).toBeLessThan(200);
  });

  it("renderRecipientApprovalEmail surfaces what-stays-private and asks before sharing", () => {
    const result = renderRecipientApprovalEmail({
      recipientFirstName: "Priya",
      requesterDisplayName: "Rob Chen",
      whyThisFits: "He needs the exact GTM-hiring shape you've delivered before.",
      whatStaysPrivate: ["Rob's budget range", "anti-persona notes"],
      magicLinkUrl: "https://ditto.partners/intros/abc/approve?t=zyx",
      chatUrl: "https://ditto.partners/network/intros/abc/chat",
    });

    expect(result.subject).toContain("would like an intro");
    expect(result.body).toContain("Before I do, I want your OK.");
    expect(result.body).toContain("What stays private:");
    expect(result.body).toContain("Rob's budget range");
    expect(wordCount(result.body)).toBeLessThan(200);
  });

  it("renderWarmIntroThreadEmail names both parties and steps out", () => {
    const result = renderWarmIntroThreadEmail({
      requesterFirstName: "Rob",
      recipientFirstName: "Priya",
      requesterOneLine: "founder ramping a sales motion",
      recipientOneLine: "fractional head-of-sales who has done this loop",
      context: "Priya has built the exact loop Rob is hiring for.",
    });

    expect(result.subject).toBe("Intro: Rob <> Priya");
    expect(result.body).toContain("I'll step out of the thread now");
    expect(result.body).toContain("Rob — founder ramping a sales motion.");
    expect(result.body).toContain("Priya — fractional head-of-sales");
    expect(wordCount(result.body)).toBeLessThan(200);
  });

  it("assertUnder200Words throws when body exceeds the cap", () => {
    const long = Array.from({ length: 220 }, (_, i) => `word${i}`).join(" ");
    expect(() => assertUnder200Words(long, "test")).toThrow(
      /must be under 200/,
    );
  });
});
