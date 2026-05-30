import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { eq } from "drizzle-orm";
import {
  withNetworkDbTransaction,
  type NetworkDbTransaction,
} from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  approveInvitationCandidate,
  composeClaimInvite,
  deleteDiscoveryProfile,
  getClaimTokenSignalReviewData,
  redeemClaimToken,
  sendClaimInvite,
} from "./claim-invite";
import { setOutboundDiscoveryPaused } from "./network-discovery-runtime";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "claim-invite-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "claim-invite-test",
    rootDir,
    now: NOW,
  });
}

async function seedCandidate(
  db: NetworkDbTransaction,
  stepRunId: string,
) {
  const [source] = await db
    .insert(networkSchema.networkDiscoverySources)
    .values({
      sourceClass: "public-website",
      sourceLabel: "Rina website",
      sourceUrl: "https://rina.example.com",
      collectionMethod: "public_website_fetch_or_search_result",
      storagePolicy: "page_url_snippet_and_source_backed_claims",
      rateLimitPolicy: "network_search_policy",
      invitePolicy: "allowed_after_operator_and_compliance",
      allowedUse: { collect: true, store: true, inviteUse: true },
      policySnapshot: { sourceClass: "public-website" },
      retrievalAt: NOW,
      createdAt: NOW,
    })
    .returning();
  const [profile] = await db
    .insert(networkSchema.networkDiscoveredProfiles)
    .values({
      displayName: "Rina Patel",
      headline: "Marketplace operator and AI workflow advisor",
      canonicalUrl: "https://rina.example.com",
      contactEmail: "rina@example.com",
      contactPathKind: "email",
      sourceClass: "public-website",
      sourceSummary: "Marketplace operator with AI workflow proof.",
      status: "internal",
      expiresAt: new Date("2026-11-14T12:00:00.000Z"),
      stepRunId,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  await db.insert(networkSchema.networkDiscoveryClaims).values({
    discoveryProfileId: profile.id,
    sourceId: source.id,
    claimText: "Marketplace operator with AI workflow proof",
    evidenceSnippet: "Rina writes about marketplace AI workflow operations.",
    confidence: "high",
    sourceClass: "public-website",
    sourceLabel: "Rina website",
    sourceUrl: "https://rina.example.com",
    retrievalAt: NOW,
    createdAt: NOW,
  });
  const [candidate] = await db
    .insert(networkSchema.networkInvitationCandidates)
    .values({
      discoveryProfileId: profile.id,
      status: "queued",
      channel: "email",
      sourceClass: "public-website",
      contactEmail: "rina@example.com",
      contactPathKind: "email",
      superconnectorFit: 95,
      activeOpportunityFit: 80,
      activeRequestFit: 80,
      sourceConfidence: 100,
      inviteRisk: 90,
      networkHealth: 90,
      totalScore: 90,
      scores: {
        superconnectorFit: 95,
        activeOpportunityFit: 80,
        activeRequestFit: 80,
        sourceConfidence: 100,
        inviteRisk: 90,
        networkHealth: 90,
      },
      riskFlags: [],
      suppressionReasons: [],
      inviteReason: "Rina has source-backed marketplace AI workflow proof.",
      stepRunId,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  return { source, profile, candidate };
}

describe("claim invites", () => {
  it("compose refuses without a server-minted stepRunId before writing", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate } = await seedCandidate(db, stepRunId);

      await expect(
        composeClaimInvite({
          db,
          rootDir,
          stepRunId: "network-lane-step:spoof:00000000-0000-4000-8000-000000000000",
          candidateId: candidate.id,
        }),
      ).rejects.toThrow(/server-minted network-lane stepRunId/);

      const [after] = await db
        .select()
        .from(networkSchema.networkInvitationCandidates)
        .where(eq(networkSchema.networkInvitationCandidates.id, candidate.id));
      expect(after.proposedSubject).toBeNull();
    });
  }, 15_000);

  it("sends only after operator approval and writes a hashed claim token", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate } = await seedCandidate(db, stepRunId);

      await composeClaimInvite({ db, rootDir, stepRunId, candidateId: candidate.id, now: NOW });
      await expect(
        sendClaimInvite({
          db,
          rootDir,
          stepRunId,
          candidateId: candidate.id,
          sendFn: vi.fn(),
          now: NOW,
        }),
      ).rejects.toThrow(/operator_approval/);

      await approveInvitationCandidate({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        actorId: "admin-1",
        reason: "fit",
        now: NOW,
      });
      const sendFn = vi.fn(async () => ({ success: true, messageId: "msg-1" }));
      const sent = await sendClaimInvite({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        baseUrl: "https://ditto.example",
        sendFn,
        now: NOW,
      });

      expect(sent.claimUrl).toMatch(/^https:\/\/ditto\.example\/network\/claim\//);
      expect(sendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "rina@example.com",
          headers: expect.objectContaining({ "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
        }),
      );
      const tokens = await db.select().from(networkSchema.networkClaimTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenHash).not.toContain(sent.claimUrl.split("/").pop()!);
      const [updated] = await db
        .select()
        .from(networkSchema.networkInvitationCandidates)
        .where(eq(networkSchema.networkInvitationCandidates.id, candidate.id));
      expect(updated.status).toBe("sent");
    });
  }, 15_000);

  it("refuses to compose or send while outbound discovery is globally paused", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate } = await seedCandidate(db, stepRunId);

      await setOutboundDiscoveryPaused({
        db,
        rootDir,
        stepRunId,
        paused: true,
        reason: "operator-pause",
        actorId: "admin-1",
        now: NOW,
      });

      await expect(
        composeClaimInvite({
          db,
          rootDir,
          stepRunId,
          candidateId: candidate.id,
          now: NOW,
        }),
      ).rejects.toThrow(/outbound_discovery_paused/);

      await setOutboundDiscoveryPaused({
        db,
        rootDir,
        stepRunId,
        paused: false,
        reason: "operator-resume",
        actorId: "admin-1",
        now: new Date(NOW.getTime() + 1),
      });
      await approveInvitationCandidate({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        actorId: "admin-1",
        reason: "operator-approved",
        now: new Date(NOW.getTime() + 2),
      });
      await setOutboundDiscoveryPaused({
        db,
        rootDir,
        stepRunId,
        paused: true,
        reason: "operator-pause",
        actorId: "admin-1",
        now: new Date(NOW.getTime() + 3),
      });
      await expect(
        sendClaimInvite({
          db,
          rootDir,
          stepRunId,
          candidateId: candidate.id,
          sendFn: vi.fn(),
          now: new Date(NOW.getTime() + 4),
        }),
      ).rejects.toThrow(/outbound_discovery_paused/);
    });
  }, 15_000);

  it("does not persist an active claim token when delivery fails", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate } = await seedCandidate(db, stepRunId);
      await approveInvitationCandidate({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        actorId: "admin-1",
        reason: "fit",
        now: NOW,
      });

      await expect(
        sendClaimInvite({
          db,
          rootDir,
          stepRunId,
          candidateId: candidate.id,
          baseUrl: "https://ditto.example",
          sendFn: async () => ({ success: false, error: "mail_down" }),
          now: NOW,
        }),
      ).rejects.toThrow("mail_down");

      const tokens = await db.select().from(networkSchema.networkClaimTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].status).toBe("revoked");
      const [updated] = await db
        .select()
        .from(networkSchema.networkInvitationCandidates)
        .where(eq(networkSchema.networkInvitationCandidates.id, candidate.id));
      expect(updated.status).toBe("approved");
      const events = await db.select().from(networkSchema.networkInvitationEvents);
      expect(events.map((event) => event.reasonCode)).toEqual(
        expect.arrayContaining([
          "claim_invite_send_prepared",
          "claim_invite_send_failed",
        ]),
      );
    });
  }, 15_000);

  it("redeems a claim token into suggested on-request Member Signal claims", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate } = await seedCandidate(db, stepRunId);
      await composeClaimInvite({ db, rootDir, stepRunId, candidateId: candidate.id, now: NOW });
      await approveInvitationCandidate({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        reason: "fit",
        now: NOW,
      });
      const sent = await sendClaimInvite({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        baseUrl: "https://ditto.example",
        sendFn: async () => ({ success: true, messageId: "msg-1" }),
        now: NOW,
      });
      const token = sent.claimUrl.split("/").pop()!;

      const redeemed = await redeemClaimToken({
        db,
        rootDir,
        stepRunId,
        token,
        email: "rina@example.com",
        name: "Rina Patel",
        now: NOW,
      });

      expect(redeemed.redirectTo).toContain("/network/signal");
      expect(redeemed.redirectTo).toContain("claimToken=");
      const claims = await db.select().from(networkSchema.networkSignalClaims);
      expect(claims[0]).toMatchObject({
        userId: redeemed.userId,
        approvalState: "suggested",
        visibility: "on-request",
      });
      const [claimedProfile] = await db.select().from(networkSchema.networkDiscoveredProfiles);
      expect(claimedProfile.status).toBe("claimed");

      const reviewData = await getClaimTokenSignalReviewData({
        db,
        token,
        memberSignalId: redeemed.memberSignalId,
        now: NOW,
      });
      expect(reviewData?.claims).toHaveLength(1);
      expect(reviewData?.userId).toBe(redeemed.userId);
    });
  }, 15_000);

  it("rejects claim redemption when the provided email does not match the discovered email", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate } = await seedCandidate(db, stepRunId);
      await approveInvitationCandidate({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        reason: "fit",
        now: NOW,
      });
      const sent = await sendClaimInvite({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        baseUrl: "https://ditto.example",
        sendFn: async () => ({ success: true, messageId: "msg-1" }),
        now: NOW,
      });

      await expect(
        redeemClaimToken({
          db,
          rootDir,
          stepRunId,
          token: sent.claimUrl.split("/").pop()!,
          email: "attacker@example.com",
          name: "Attacker",
          now: NOW,
        }),
      ).rejects.toThrow("claim_email_mismatch");

      expect(await db.select().from(networkSchema.networkUsers)).toHaveLength(0);
    });
  }, 15_000);

  it("delete revokes the token and tombstones the internal Discovery Profile", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { candidate, profile } = await seedCandidate(db, stepRunId);
      await db.insert(networkSchema.networkDiscoverySources).values({
        sourceClass: "linkedin-pointer",
        sourceLabel: "LinkedIn pointer",
        sourceUrl: "https://www.linkedin.com/in/rina-patel",
        collectionMethod: "url_pointer_only",
        storagePolicy: "url_pointer_only_no_profile_content",
        rateLimitPolicy: "manual_or_api_policy_only",
        invitePolicy: "blocked_without_separate_contact_path",
        allowedUse: { collect: true, store: true, inviteUse: false },
        policySnapshot: { sourceClass: "linkedin-pointer" },
        retrievalAt: NOW,
        metadata: { discoveryProfileId: profile.id, discoveryProfileSourceRole: "primary" },
        createdAt: NOW,
      });
      await approveInvitationCandidate({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        reason: "fit",
        now: NOW,
      });
      const sent = await sendClaimInvite({
        db,
        rootDir,
        stepRunId,
        candidateId: candidate.id,
        baseUrl: "https://ditto.example",
        sendFn: async () => ({ success: true, messageId: "msg-1" }),
        now: NOW,
      });
      const token = sent.claimUrl.split("/").pop()!;

      const deleted = await deleteDiscoveryProfile({
        db,
        rootDir,
        stepRunId,
        token,
        reason: "delete",
        now: NOW,
      });

      expect(deleted.ok).toBe(true);
      const [deletedProfile] = await db.select().from(networkSchema.networkDiscoveredProfiles);
      expect(deletedProfile.status).toBe("deleted");
      const tombstones = await db.select().from(networkSchema.networkTombstones);
      expect(tombstones).toHaveLength(1);
      const sources = await db.select().from(networkSchema.networkDiscoverySources);
      expect(sources).toHaveLength(2);
      expect(sources.every((source) => source.sourceUrl === null)).toBe(true);
      expect(sources.every((source) => source.sourceLabel === "Deleted discovery source")).toBe(true);
    });
  }, 15_000);
});
