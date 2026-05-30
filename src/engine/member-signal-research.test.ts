import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import {
  memberSignalLimitedAccessNote,
  normalizeMemberSignalSource,
} from "./member-signal-source";
import { researchMemberSignal } from "./member-signal-research";
import { draftMemberSignal, memberSignalSections } from "./member-signal-draft";
import {
  applyApprovedPublicClaimsToCard,
  loadApprovedPublicMemberSignalClaims,
  updateMemberSignalClaim,
} from "./member-signal-review";
import type { NetworkProfileCardBlock } from "./content-blocks";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "member-signal-"));
}

function baseCard(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "Operator",
    signalDots: [{ id: "value", label: "Value", filled: true, color: "canary" }],
    badges: [],
    narrativeMd: "Old public card text",
    antiPersonaMd: null,
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-14T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/people/timhgreen",
    ogImageUrl: "https://ditto.partners/people/timhgreen/opengraph-image",
  };
}

describe("Member Signal source normalization", () => {
  it("classifies source types and preserves original provenance", () => {
    const linkedIn = normalizeMemberSignalSource({ value: "linkedin.com/in/tim", label: "LinkedIn profile" });
    expect(linkedIn).toMatchObject({
      sourceType: "linkedin",
      sourceLabel: "LinkedIn profile",
      sourceUrl: "https://linkedin.com/in/tim",
      originalInput: "linkedin.com/in/tim",
      limited: true,
    });
    expect(memberSignalLimitedAccessNote("instagram")).toMatch(/public bio/i);

    const pasted = normalizeMemberSignalSource({ value: "I redesign RevOps for founder-led B2B teams." });
    expect(pasted).toMatchObject({
      sourceType: "pasted_text",
      sourceUrl: null,
      sourceLabel: "Pasted text",
      text: "I redesign RevOps for founder-led B2B teams.",
    });
  });
});

describe("Member Signal research, draft, and review", () => {
  it("refuses guarded research without stepRunId outside DITTO_TEST_MODE", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    await expect(
      researchMemberSignal({
        db: {} as never,
        userId: "user",
        sources: [{ value: "https://example.com" }],
        webSearchFn: async () => null,
      }),
    ).rejects.toThrow("research_member_signal requires stepRunId");
    if (previous === undefined) delete process.env.DITTO_TEST_MODE;
    else process.env.DITTO_TEST_MODE = previous;
  });

  it("persists source rows, limited-source fallback, KB document pointer, and unconfigured enrichment", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "member-signal-user",
        email: "signal@example.com",
        name: "Signal User",
      });

      const result = await researchMemberSignal({
        db,
        rootDir,
        userId: "member-signal-user",
        stepRunId: "network-lane-step:signal-research",
        webSearchFn: async () => null,
        sources: [
          { value: "https://example.com/tim", label: "Website" },
          { value: "https://linkedin.com/in/tim", label: "LinkedIn" },
          {
            type: "pasted_text",
            value: "I untangle sales systems and HubSpot for practical founder-led B2B teams.",
            label: "Bio paste",
          },
        ],
      });

      expect(result.webEnrichment.status).toBe("unconfigured");
      expect(result.sources.map((source) => source.status).sort()).toEqual([
        "found",
        "found",
        "limited",
      ]);
      const paste = result.sources.find((source) => source.sourceType === "pasted_text");
      expect(paste?.kbDocumentId).toBeTruthy();
      const limited = result.sources.find((source) => source.sourceType === "linkedin");
      expect(limited?.accessNote).toMatch(/Could not read beyond public bio/);

      const events = await db
        .select()
        .from(networkSchema.networkSignalReviewEvents)
        .where(eq(networkSchema.networkSignalReviewEvents.memberSignalId, result.memberSignal.id));
      expect(events.filter((event) => event.eventType === "source_added")).toHaveLength(3);
    });
  }, 20_000);

  it("drafts every required section with provenance and inferred labels", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "member-signal-draft-user",
        email: "draft@example.com",
      });
      const research = await researchMemberSignal({
        db,
        rootDir,
        userId: "member-signal-draft-user",
        stepRunId: "network-lane-step:research",
        webSearchFn: async () => "Tim works on RevOps. Source: https://example.com/tim",
        sources: [
          { value: "https://example.com/tim", label: "Website" },
          { type: "pasted_text", value: "I build operating rhythm for B2B founders.", label: "Bio" },
        ],
      });

      const draft = await draftMemberSignal({
        db,
        userId: "member-signal-draft-user",
        researchBundle: research,
        stepRunId: "network-lane-step:draft",
        completion: async () => ({
          content: [{
            type: "text",
            text: JSON.stringify({
              claims: [
                {
                  section: "knownFor",
                  claimText: "Builds operating rhythm for B2B founders.",
                  evidenceSnippet: "Bio: I build operating rhythm for B2B founders.",
                  confidence: "medium",
                },
              ],
            }),
          }],
          tokensUsed: 120,
          costCents: 1,
          stopReason: "stop",
          model: "test",
        }),
      });

      expect(draft.claims.map((claim) => claim.section).sort()).toEqual(
        memberSignalSections().sort(),
      );
      for (const claim of draft.claims) {
        expect(claim.sourceId).toBeTruthy();
        expect(claim.sourceLabel).toBeTruthy();
        expect(claim.evidenceSnippet).toBeTruthy();
        expect(claim.confidence).toMatch(/high|medium|low/);
        expect(claim.visibility).toBe("on-request");
        expect(claim.approvalState).toBe("suggested");
      }
      expect(draft.claims.find((claim) => claim.section === "knownFor")?.claimText).toBe(
        "Builds operating rhythm for B2B founders.",
      );
      expect(draft.claims.some((claim) => claim.sourceLabel === "inferred by Ditto")).toBe(true);
    });
  }, 20_000);

  it("records review events and only projects approved public claims", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "member-signal-review-user",
        email: "review@example.com",
      });
      const research = await researchMemberSignal({
        db,
        rootDir,
        userId: "member-signal-review-user",
        stepRunId: "network-lane-step:research",
        webSearchFn: async () => null,
        sources: [{ type: "pasted_text", value: "I fix RevOps handoffs for B2B founders.", label: "Bio" }],
      });
      const draft = await draftMemberSignal({
        db,
        userId: "member-signal-review-user",
        researchBundle: research,
        stepRunId: "network-lane-step:draft",
      });
      const knownFor = draft.claims.find((claim) => claim.section === "knownFor")!;
      const openTo = draft.claims.find((claim) => claim.section === "openTo")!;

      await updateMemberSignalClaim({
        db,
        userId: "member-signal-review-user",
        claimId: knownFor.id,
        action: "edit",
        claimText: "Turns messy RevOps handoffs into clean operating rhythm.",
        visibility: "public",
        stepRunId: "network-lane-step:edit",
      });
      await updateMemberSignalClaim({
        db,
        userId: "member-signal-review-user",
        claimId: openTo.id,
        action: "approve",
        visibility: "on-request",
        stepRunId: "network-lane-step:approve-on-request",
      });

      const publicClaims = await loadApprovedPublicMemberSignalClaims({
        db,
        userId: "member-signal-review-user",
      });
      expect(publicClaims).toHaveLength(1);
      expect(JSON.stringify(publicClaims)).not.toContain("on-request");

      const publicCard = applyApprovedPublicClaimsToCard(baseCard(), publicClaims);
      expect(publicCard.oneLineRole).toContain("RevOps");
      expect(publicCard.narrativeMd).toContain("Bio");
      expect(publicCard.narrativeMd).not.toContain("preferred intro");

      const events = await db
        .select()
        .from(networkSchema.networkSignalReviewEvents)
        .where(eq(networkSchema.networkSignalReviewEvents.userId, "member-signal-review-user"));
      expect(events.some((event) => event.eventType === "claim_edited")).toBe(true);
      expect(events.some((event) => event.eventType === "claim_approved")).toBe(true);
    });
  }, 20_000);
});
