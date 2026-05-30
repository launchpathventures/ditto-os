/**
 * Tests for the privacy export bundle assembler (Brief 284, R-Q6).
 *
 * Validates:
 *   - Member-signal export returns the signal, its sources, and its claims.
 *   - Public-profile export aggregates the owner's rows across all related tables.
 *   - Tombstoned subjects produce an empty bundle with `skippedTombstoned > 0`.
 *   - `snapshotAt` excludes rows created after the horizon (snapshot semantics).
 *   - Discovery Profile export returns its source, claim, candidate, event,
 *     and claim-token rows.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import { recordPrivacyDeletion } from "./network-tombstones";
import { assembleExportBundle } from "./network-export-bundle";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-export-bundle-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "export-bundle-test",
    rootDir,
    now: NOW,
  });
}

async function insertOwner(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
): Promise<{ userId: string }> {
  const [user] = await db
    .insert(networkSchema.networkUsers)
    .values({
      email: `owner-${randomUUID().slice(0, 8)}@example.com`,
      name: "Owner",
      handle: `o-${randomUUID().slice(0, 8)}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkUsers.id });
  return { userId: user.id };
}

async function insertSignalForUser(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  userId: string,
  createdAt = NOW,
): Promise<string> {
  const [signal] = await db
    .insert(networkSchema.networkMemberSignals)
    .values({
      userId,
      status: "draft",
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: networkSchema.networkMemberSignals.id });
  return signal.id;
}

describe("assembleExportBundle — member-signal", () => {
  it("returns the signal row when the subject is not tombstoned", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { userId } = await insertOwner(db);
      const signalId = await insertSignalForUser(db, userId);
      const bundle = await assembleExportBundle({
        db,
        subjectType: "member-signal",
        subjectId: signalId,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });
      expect(bundle.skippedTombstoned).toBe(0);
      expect(bundle.sections.network_member_signals.rows).toHaveLength(1);
      expect((bundle.sections.network_member_signals.rows[0] as { id: string }).id).toBe(
        signalId,
      );
    });
  }, 20_000);

  it("skips tombstoned signals and produces an empty bundle", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { userId } = await insertOwner(db);
      const signalId = await insertSignalForUser(db, userId);
      await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: signalId,
          deletedByActorType: "user",
          now: NOW,
        },
        async () => {
          // soft-delete callback intentionally a no-op for this test
        },
      );
      const bundle = await assembleExportBundle({
        db,
        subjectType: "member-signal",
        subjectId: signalId,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });
      expect(bundle.skippedTombstoned).toBe(1);
      expect(bundle.sections.network_member_signals).toBeUndefined();
    });
  }, 20_000);

  it("excludes the signal row when its createdAt is after the snapshot horizon", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { userId } = await insertOwner(db);
      const lateId = await insertSignalForUser(
        db,
        userId,
        new Date(NOW.getTime() + 5 * 60_000),
      );
      const bundle = await assembleExportBundle({
        db,
        subjectType: "member-signal",
        subjectId: lateId,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });
      expect(bundle.sections.network_member_signals.rows).toHaveLength(0);
    });
  }, 20_000);
});

describe("assembleExportBundle — public-profile", () => {
  it("returns the user row plus all owned tables", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { userId } = await insertOwner(db);
      await insertSignalForUser(db, userId);
      const bundle = await assembleExportBundle({
        db,
        subjectType: "public-profile",
        subjectId: userId,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });
      expect(bundle.sections.network_users.rows).toHaveLength(1);
      expect(
        (bundle.sections.network_users.rows[0] as { id: string }).id,
      ).toBe(userId);
      expect(bundle.sections.network_member_signals).toBeDefined();
      expect(bundle.sections.network_signal_sources).toBeDefined();
      expect(bundle.sections.network_signal_claims).toBeDefined();
      expect(bundle.sections.network_job_requests).toBeDefined();
      expect(bundle.sections.network_possible_connections).toBeDefined();
      expect(bundle.sections.introductions_requested).toBeDefined();
      expect(bundle.sections.introductions_received).toBeDefined();
      expect(bundle.sections.network_forwarded_notes).toBeDefined();
      expect(bundle.sections.network_user_kb_documents).toBeDefined();
    });
  }, 20_000);

  it("skips a tombstoned child member-signal and increments skippedTombstoned", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { userId } = await insertOwner(db);
      const deadId = await insertSignalForUser(db, userId);
      await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: deadId,
          deletedByActorType: "user",
          now: NOW,
        },
        async () => {
          // no-op
        },
      );
      const bundle = await assembleExportBundle({
        db,
        subjectType: "public-profile",
        subjectId: userId,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });
      const ids = (
        bundle.sections.network_member_signals.rows as Array<{ id: string }>
      ).map((row) => row.id);
      expect(ids).not.toContain(deadId);
      expect(bundle.skippedTombstoned).toBeGreaterThanOrEqual(1);
    });
  }, 20_000);
});

describe("assembleExportBundle — discovery-profile", () => {
  it("includes a claimless pointer source associated directly through source metadata", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const [profile] = await db
        .insert(networkSchema.networkDiscoveredProfiles)
        .values({
          displayName: "LinkedIn profile pointer 1",
          headline: "LinkedIn URL pointer",
          canonicalUrl: "https://www.linkedin.com/in/example",
          sourceClass: "linkedin-pointer",
          sourceSummary: "LinkedIn URL stored as a policy-constrained pointer.",
          status: "internal",
          expiresAt: new Date(NOW.getTime() + 180 * 86_400_000),
          stepRunId,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();
      await db.insert(networkSchema.networkDiscoverySources).values({
        sourceClass: "linkedin-pointer",
        sourceLabel: "LinkedIn pointer",
        sourceUrl: "https://www.linkedin.com/in/example",
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

      const bundle = await assembleExportBundle({
        db,
        subjectType: "discovery-profile",
        subjectId: profile.id,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });

      expect(bundle.sections.network_discovery_claims.rows).toHaveLength(0);
      expect(bundle.sections.network_discovery_sources.rows).toHaveLength(1);
      expect(bundle.sections.network_discovery_sources.rows[0]).toMatchObject({
        sourceClass: "linkedin-pointer",
        sourceUrl: "https://www.linkedin.com/in/example",
      });
    });
  }, 20_000);

  it("returns the internal Discovery Profile and its invite rows", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
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
          headline: "Marketplace operator",
          canonicalUrl: "https://rina.example.com",
          contactEmail: "rina@example.com",
          contactPathKind: "email",
          sourceClass: "public-website",
          sourceSummary: "Public website source.",
          status: "internal",
          expiresAt: new Date(NOW.getTime() + 180 * 86_400_000),
          stepRunId,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();
      await db.insert(networkSchema.networkDiscoveryClaims).values({
        discoveryProfileId: profile.id,
        sourceId: source.id,
        claimText: "Marketplace operator",
        evidenceSnippet: "Rina writes about marketplace operations.",
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
          superconnectorFit: 90,
          activeOpportunityFit: 90,
          activeRequestFit: 90,
          sourceConfidence: 90,
          inviteRisk: 90,
          networkHealth: 90,
          totalScore: 90,
          scores: {},
          riskFlags: [],
          suppressionReasons: [],
          inviteReason: "Source-backed fit.",
          stepRunId,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();
      await db.insert(networkSchema.networkInvitationEvents).values({
        candidateId: candidate.id,
        discoveryProfileId: profile.id,
        eventType: "queued",
        actorType: "system",
        channel: "email",
        reasonCode: "score_passed",
        stepRunId,
        createdAt: NOW,
      });
      await db.insert(networkSchema.networkClaimTokens).values({
        tokenHash: "hashed-token",
        discoveryProfileId: profile.id,
        candidateId: candidate.id,
        status: "active",
        expiresAt: new Date(NOW.getTime() + 30 * 86_400_000),
        stepRunId,
        createdAt: NOW,
      });

      const bundle = await assembleExportBundle({
        db,
        subjectType: "discovery-profile",
        subjectId: profile.id,
        snapshotAt: new Date(NOW.getTime() + 60_000),
      });

      expect(bundle.sections.network_discovered_profiles.rows).toHaveLength(1);
      expect(bundle.sections.network_discovery_sources.rows).toHaveLength(1);
      expect(bundle.sections.network_discovery_claims.rows).toHaveLength(1);
      expect(bundle.sections.network_invitation_candidates.rows).toHaveLength(1);
      expect(bundle.sections.network_invitation_events.rows).toHaveLength(1);
      expect(bundle.sections.network_claim_tokens.rows).toHaveLength(1);
    });
  }, 20_000);
});
