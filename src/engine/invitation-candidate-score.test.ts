import { describe, expect, it } from "vitest";
import { scoreInvitationCandidate } from "./invitation-candidate-score";

const NOW = new Date("2026-05-18T12:00:00.000Z");

describe("invitation candidate scoring", () => {
  it("returns all score dimensions for a strong source-backed candidate", () => {
    const score = scoreInvitationCandidate({
      now: NOW,
      profile: {
        displayName: "Rina Patel",
        headline: "Marketplace operator and AI workflow advisor",
        contactEmail: "rina@example.com",
        sourceClass: "public-website",
      },
      request: {
        status: "active",
        outcomeNeeded: "marketplace AI workflow operator",
        idealPerson: "operator with marketplace proof",
      },
      claims: [
        {
          claimText: "Marketplace operator with AI workflow proof",
          evidenceSnippet: "Rina writes about marketplace AI workflow operations.",
          confidence: "high",
          sourceClass: "public-website",
          retrievalAt: NOW,
        },
      ],
    });

    expect(score.inviteable).toBe(true);
    expect(score.totalScore).toBeGreaterThanOrEqual(65);
    expect(score).toMatchObject({
      superconnectorFit: expect.any(Number),
      activeOpportunityFit: expect.any(Number),
      activeRequestFit: expect.any(Number),
      sourceConfidence: expect.any(Number),
      inviteRisk: expect.any(Number),
      networkHealth: expect.any(Number),
    });
    expect(score.suppressionReasons).toEqual([]);
  });

  it("suppresses missing contact path, stale evidence, sensitive inference, and LinkedIn pointer-only evidence", () => {
    const score = scoreInvitationCandidate({
      now: NOW,
      profile: {
        displayName: "Candidate",
        headline: "Interesting person",
        sourceClass: "linkedin-pointer",
      },
      claims: [
        {
          claimText: "Political affiliation and medical history inferred from posts",
          evidenceSnippet: "Old profile snippet",
          confidence: "low",
          sourceClass: "linkedin-pointer",
          retrievalAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      ],
      priorDeclineOrComplaint: true,
    });

    expect(score.inviteable).toBe(false);
    expect(score.suppressionReasons).toEqual(
      expect.arrayContaining([
        "no_contact_path",
        "sensitive_or_protected_class_inference",
        "stale_or_missing_evidence",
        "prior_decline_or_complaint",
        "source_not_invite_eligible",
      ]),
    );
  });
});
