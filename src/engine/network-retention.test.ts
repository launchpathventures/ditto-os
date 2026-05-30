/**
 * Tests for the Network Retention Engine (Brief 284).
 *
 * Validates that the ratified Brief 278 §Proposed Retention Defaults are
 * enforced end-to-end:
 *   - Raw source snippets purge at 90 days (text columns null, row label kept).
 *   - Soft-deleted subjects hard-purge at the tombstone's `purge_after`.
 *   - Audit tombstones convert to permanent neutral stubs at 2 years
 *     (deletedReason + metadata cleared; subjectIdHash + class preserved).
 *
 * The engine writes a system step run via `createNetworkLaneStepRun` per
 * call, and every material action emits an audit row.
 */

import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  computeTombstoneTimings,
  hashTombstoneSubjectId,
} from "./network-tombstones";
import { runRetentionPurge } from "./network-retention";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-retention-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "retention-test",
    rootDir,
    now: NOW,
  });
}

async function insertUser(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  status: networkSchema.NetworkUserStatus = "active",
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkUsers)
    .values({
      email: `${randomUUID().slice(0, 8)}@example.com`,
      name: "Test User",
      handle: `u-${randomUUID().slice(0, 8)}`,
      status,
      businessContext: "some business context",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkUsers.id });
  return row.id;
}

async function insertSignal(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  userId: string,
  status: networkSchema.NetworkMemberSignalStatus = "draft",
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkMemberSignals)
    .values({
      userId,
      status,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkMemberSignals.id });
  return row.id;
}

async function insertSignalSource(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  signalId: string,
  userId: string,
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkSignalSources)
    .values({
      memberSignalId: signalId,
      userId,
      sourceType: "pasted_text",
      sourceLabel: "test source",
      originalInput: "raw private text to scrub",
      evidenceSnippet: "snippet to scrub",
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: networkSchema.networkSignalSources.id });
  return row.id;
}

async function insertTombstone(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  subjectType: networkSchema.NetworkTombstoneSubjectType,
  subjectId: string,
  stepRunId: string,
  opts: {
    deletedAt?: Date;
    purgeAfter?: Date;
    permanentStubAt?: Date;
    deletedReason?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<string> {
  const timings = computeTombstoneTimings({ now: opts.deletedAt ?? NOW });
  const [row] = await db
    .insert(networkSchema.networkTombstones)
    .values({
      subjectType,
      subjectIdHash: hashTombstoneSubjectId(subjectType, subjectId),
      deletedReason: opts.deletedReason ?? "user requested",
      deletedByActorType: "user",
      deletedAt: opts.deletedAt ?? timings.deletedAt,
      purgeAfter: opts.purgeAfter ?? timings.purgeAfter,
      permanentStubAt: opts.permanentStubAt ?? timings.permanentStubAt,
      stepRunId,
      metadata: opts.metadata ?? null,
      createdAt: NOW,
    })
    .returning({ id: networkSchema.networkTombstones.id });
  return row.id;
}

describe("runRetentionPurge — stepRunId guard", () => {
  it.each([undefined, "", null, false, "web-direct-action:abc"])(
    "rejects spoofed / falsy stepRunId before sweeping (%s)",
    async (bad) => {
      await withNetworkDbTransaction(async (db) => {
        await expect(
          runRetentionPurge({
            db,
            stepRunId: bad,
            now: NOW,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);
      });
    },
    15_000,
  );
});

describe("runRetentionPurge — raw source snippet sweep", () => {
  it("nulls raw text on snippets older than the configured window, keeps the row", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db);
      const signalId = await insertSignal(db, userId);

      const old = new Date(NOW.getTime() - 100 * 86_400_000);
      const fresh = new Date(NOW.getTime() - 10 * 86_400_000);
      const oldId = await insertSignalSource(db, signalId, userId, old);
      const freshId = await insertSignalSource(db, signalId, userId, fresh);

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.rawSourceSnippetsCleared).toBe(1);
      expect(summary.errors).toEqual([]);

      const [oldRow] = await db
        .select()
        .from(networkSchema.networkSignalSources)
        .where(eq(networkSchema.networkSignalSources.id, oldId));
      expect(oldRow.originalInput).toBeNull();
      expect(oldRow.evidenceSnippet).toBeNull();
      expect(oldRow.sourceLabel).toBe("test source");

      const [freshRow] = await db
        .select()
        .from(networkSchema.networkSignalSources)
        .where(eq(networkSchema.networkSignalSources.id, freshId));
      expect(freshRow.originalInput).toBe("raw private text to scrub");
    });
  }, 20_000);
});

describe("runRetentionPurge — soft-deleted subject purge", () => {
  it("hard-purges a member-signal whose tombstone purge_after has elapsed", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db);
      const signalId = await insertSignal(db, userId, "deleted");
      await insertSignalSource(db, signalId, userId, NOW);

      await insertTombstone(db, "member-signal", signalId, stepRunId, {
        deletedAt: new Date(NOW.getTime() - 31 * 86_400_000),
        purgeAfter: new Date(NOW.getTime() - 86_400_000),
        permanentStubAt: new Date(NOW.getTime() + 365 * 86_400_000),
      });

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.subjectsPurged).toBe(1);
      expect(summary.errors).toEqual([]);

      const remainingSignals = await db
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(eq(networkSchema.networkMemberSignals.id, signalId));
      expect(remainingSignals).toHaveLength(0);

      const remainingSources = await db
        .select()
        .from(networkSchema.networkSignalSources)
        .where(eq(networkSchema.networkSignalSources.memberSignalId, signalId));
      expect(remainingSources).toHaveLength(0);

      const [tombstone] = await db
        .select()
        .from(networkSchema.networkTombstones)
        .where(
          eq(
            networkSchema.networkTombstones.subjectIdHash,
            hashTombstoneSubjectId("member-signal", signalId),
          ),
        );
      expect(tombstone.purgedAt).not.toBeNull();
    });
  }, 20_000);

  it("redacts a deleted public-profile user without dropping the row", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db, "deleted");

      await insertTombstone(db, "public-profile", userId, stepRunId, {
        deletedAt: new Date(NOW.getTime() - 31 * 86_400_000),
        purgeAfter: new Date(NOW.getTime() - 86_400_000),
        permanentStubAt: new Date(NOW.getTime() + 365 * 86_400_000),
      });

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.subjectsPurged).toBe(1);

      const [user] = await db
        .select()
        .from(networkSchema.networkUsers)
        .where(eq(networkSchema.networkUsers.id, userId));
      expect(user).toBeDefined();
      expect(user.name).toBeNull();
      expect(user.businessContext).toBeNull();
      expect(user.email).toMatch(/@deleted\.invalid$/);
    });
  }, 20_000);

  it("does not touch tombstones whose purge_after is in the future", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db);
      const signalId = await insertSignal(db, userId, "deleted");

      await insertTombstone(db, "member-signal", signalId, stepRunId, {
        deletedAt: NOW,
        purgeAfter: new Date(NOW.getTime() + 7 * 86_400_000),
        permanentStubAt: new Date(NOW.getTime() + 365 * 86_400_000),
      });

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.subjectsPurged).toBe(0);
      const remaining = await db
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(eq(networkSchema.networkMemberSignals.id, signalId));
      expect(remaining).toHaveLength(1);
    });
  }, 20_000);

  it("purges Discovery Profile source rows associated through metadata", async () => {
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
          status: "deleted",
          deletedAt: new Date(NOW.getTime() - 31 * 86_400_000),
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
      await insertTombstone(db, "discovery-profile", profile.id, stepRunId, {
        deletedAt: new Date(NOW.getTime() - 31 * 86_400_000),
        purgeAfter: new Date(NOW.getTime() - 86_400_000),
        permanentStubAt: new Date(NOW.getTime() + 365 * 86_400_000),
      });

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.subjectsPurged).toBe(1);
      const remainingSources = await db
        .select()
        .from(networkSchema.networkDiscoverySources);
      expect(remainingSources).toHaveLength(0);
      const [redactedProfile] = await db
        .select()
        .from(networkSchema.networkDiscoveredProfiles)
        .where(eq(networkSchema.networkDiscoveredProfiles.id, profile.id));
      expect(redactedProfile.canonicalUrl).toBeNull();
      expect(redactedProfile.sourceSummary).toBe("Deleted by privacy request.");
    });
  }, 20_000);
});

describe("runRetentionPurge — permanent tombstone stub conversion", () => {
  it("converts tombstones older than permanent_stub_at into neutral stubs", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);

      const tombstoneId = await insertTombstone(
        db,
        "member-signal",
        "signal-abc",
        stepRunId,
        {
          deletedAt: new Date(NOW.getTime() - 365 * 3 * 86_400_000),
          purgeAfter: new Date(NOW.getTime() - 365 * 3 * 86_400_000),
          permanentStubAt: new Date(NOW.getTime() - 86_400_000),
          deletedReason: "user request with sensitive notes",
          metadata: { rawSnippet: "should be cleared" },
        },
      );
      // Pre-mark the row as already purged so we test only stub conversion
      await db
        .update(networkSchema.networkTombstones)
        .set({ purgedAt: new Date(NOW.getTime() - 86_400_000) })
        .where(eq(networkSchema.networkTombstones.id, tombstoneId));

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.tombstonesConvertedToStub).toBe(1);

      const [row] = await db
        .select()
        .from(networkSchema.networkTombstones)
        .where(eq(networkSchema.networkTombstones.id, tombstoneId));
      expect(row.deletedReason).toBeNull();
      expect(row.metadata).toBeNull();
      expect(row.stubbedAt).not.toBeNull();
      expect(row.subjectIdHash).toBe(
        hashTombstoneSubjectId("member-signal", "signal-abc"),
      );
    });
  }, 20_000);

  it("leaves tombstones whose permanent_stub_at is in the future untouched", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);

      const tombstoneId = await insertTombstone(
        db,
        "request",
        "req-fresh",
        stepRunId,
        {
          deletedAt: NOW,
          purgeAfter: new Date(NOW.getTime() + 86_400_000),
          permanentStubAt: new Date(NOW.getTime() + 365 * 2 * 86_400_000),
          deletedReason: "still in retention window",
          metadata: { keep: "until permanent_stub_at" },
        },
      );

      const summary = await runRetentionPurge({
        db,
        rootDir,
        stepRunId,
        now: NOW,
      });

      expect(summary.tombstonesConvertedToStub).toBe(0);
      const [row] = await db
        .select()
        .from(networkSchema.networkTombstones)
        .where(eq(networkSchema.networkTombstones.id, tombstoneId));
      expect(row.deletedReason).toBe("still in retention window");
      expect(row.metadata).toEqual({ keep: "until permanent_stub_at" });
      expect(row.stubbedAt).toBeNull();
    });
  }, 20_000);
});

describe("runRetentionPurge — audit row coverage", () => {
  it("writes a system-actor audit row for each sweep stage that did work", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db);
      const signalId = await insertSignal(db, userId);
      await insertSignalSource(
        db,
        signalId,
        userId,
        new Date(NOW.getTime() - 100 * 86_400_000),
      );

      await runRetentionPurge({ db, rootDir, stepRunId, now: NOW });

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(
          and(
            eq(networkSchema.networkAuditEvents.stepRunId, stepRunId),
            eq(networkSchema.networkAuditEvents.actorType, "system"),
          ),
        );
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      expect(auditRows[0].reasonCode).toBe("raw_source_snippet_retention");
    });
  }, 20_000);
});
