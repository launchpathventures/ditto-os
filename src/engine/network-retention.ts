/**
 * Network Retention Engine (Brief 284)
 *
 * Periodic system sweep that enforces the retention defaults the human
 * ratified at the parent Brief 278 §Proposed Retention Defaults:
 *
 *   - Raw source snippets:       90 days → null out raw text on
 *                                `network_signal_sources`; derived claims
 *                                retain provenance labels.
 *   - Soft-deleted subjects:     30 days → hard purge the owning row's PII
 *                                (driven by `network_tombstones.purge_after`).
 *   - Audit tombstones:          2 years → convert the tombstone to a
 *                                permanent neutral stub (drops reason +
 *                                metadata; keeps `subjectType`, `subjectIdHash`,
 *                                event class, timestamps).
 *
 * Discovery Profiles expire at 180d if unclaimed; claim tokens expire at 30d.
 *
 * The engine is a "system" actor: it writes step runs minted by the caller
 * (cron, admin trigger) and an audit row per material action.
 */

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import { writeNetworkAuditEvent } from "./network-audit";
import {
  convertTombstoneToPermanentStub,
  findTombstonesDueForPermanentStub,
  findTombstonesDueForPurge,
  hashTombstoneSubjectId,
  markTombstonePurged,
  type NetworkTombstoneRow,
  type NetworkTombstoneSubjectType,
} from "./network-tombstones";

export const RETENTION_RAW_SOURCE_SNIPPET_DAYS = 90;
export const RETENTION_DISCOVERY_PROFILE_DAYS = 180;
export const RETENTION_CLAIM_TOKEN_DAYS = 30;

export interface RunRetentionPurgeInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId: unknown;
  now?: Date;
  /** Override raw-source-snippet window (test ergonomics). */
  rawSourceSnippetDays?: number;
  /** Hard cap on rows touched per sweep stage; protects against runaway
   *  sweeps if the table is unexpectedly large. */
  limit?: number;
}

export interface RetentionSweepSummary {
  rawSourceSnippetsCleared: number;
  subjectsPurged: number;
  tombstonesConvertedToStub: number;
  discoveryProfilesExpired: number;
  claimTokensExpired: number;
  errors: Array<{ stage: string; subjectId?: string; message: string }>;
}

export async function runRetentionPurge(
  input: RunRetentionPurgeInput,
): Promise<RetentionSweepSummary> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "run_retention_purge",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const limit = input.limit ?? 500;

  const summary: RetentionSweepSummary = {
    rawSourceSnippetsCleared: 0,
    subjectsPurged: 0,
    tombstonesConvertedToStub: 0,
    discoveryProfilesExpired: 0,
    claimTokensExpired: 0,
    errors: [],
  };

  try {
    summary.rawSourceSnippetsCleared = await sweepRawSourceSnippets({
      db,
      rootDir: input.rootDir,
      stepRunId,
      now,
      windowDays: input.rawSourceSnippetDays ?? RETENTION_RAW_SOURCE_SNIPPET_DAYS,
      limit,
    });
  } catch (err) {
    summary.errors.push({
      stage: "raw-source-snippets",
      message: (err as Error).message,
    });
  }

  try {
    summary.discoveryProfilesExpired = await sweepExpiredDiscoveryProfiles({
      db,
      rootDir: input.rootDir,
      stepRunId,
      now,
      limit,
    });
  } catch (err) {
    summary.errors.push({
      stage: "discovery-profiles-expire",
      message: (err as Error).message,
    });
  }

  try {
    summary.claimTokensExpired = await sweepExpiredClaimTokens({
      db,
      rootDir: input.rootDir,
      stepRunId,
      now,
      limit,
    });
  } catch (err) {
    summary.errors.push({
      stage: "claim-tokens-expire",
      message: (err as Error).message,
    });
  }

  try {
    summary.subjectsPurged = await sweepSoftDeletedSubjects({
      db,
      rootDir: input.rootDir,
      stepRunId,
      now,
      limit,
      summary,
    });
  } catch (err) {
    summary.errors.push({
      stage: "soft-deleted-subjects",
      message: (err as Error).message,
    });
  }

  try {
    summary.tombstonesConvertedToStub = await sweepPermanentTombstoneStubs({
      db,
      rootDir: input.rootDir,
      stepRunId,
      now,
      limit,
      summary,
    });
  } catch (err) {
    summary.errors.push({
      stage: "permanent-tombstone-stubs",
      message: (err as Error).message,
    });
  }

  return summary;
}

async function sweepExpiredDiscoveryProfiles(
  input: Omit<SweepRawSourceSnippetsInput, "windowDays">,
): Promise<number> {
  const due = await input.db
    .select({ id: networkSchema.networkDiscoveredProfiles.id })
    .from(networkSchema.networkDiscoveredProfiles)
    .where(
      and(
        eq(networkSchema.networkDiscoveredProfiles.status, "internal"),
        lte(networkSchema.networkDiscoveredProfiles.expiresAt, input.now),
      ),
    )
    .limit(input.limit);
  for (const row of due) {
    await input.db
      .update(networkSchema.networkDiscoveredProfiles)
      .set({ status: "expired", updatedAt: input.now })
      .where(eq(networkSchema.networkDiscoveredProfiles.id, row.id));
  }
  if (due.length > 0) {
    await writeNetworkAuditEvent({
      db: input.db,
      rootDir: input.rootDir,
      stepRunId: input.stepRunId,
      eventClass: "system_retention",
      subjectType: "discovery_profile",
      subjectId: `expired:${input.now.toISOString()}`,
      actorType: "system",
      actorId: null,
      reasonCode: "discovery_profile_expired",
      metadata: { expired: due.length, windowDays: RETENTION_DISCOVERY_PROFILE_DAYS },
      now: input.now,
    });
  }
  return due.length;
}

async function sweepExpiredClaimTokens(
  input: Omit<SweepRawSourceSnippetsInput, "windowDays">,
): Promise<number> {
  const due = await input.db
    .select({ id: networkSchema.networkClaimTokens.id })
    .from(networkSchema.networkClaimTokens)
    .where(
      and(
        eq(networkSchema.networkClaimTokens.status, "active"),
        lte(networkSchema.networkClaimTokens.expiresAt, input.now),
      ),
    )
    .limit(input.limit);
  for (const row of due) {
    await input.db
      .update(networkSchema.networkClaimTokens)
      .set({ status: "expired" })
      .where(eq(networkSchema.networkClaimTokens.id, row.id));
  }
  if (due.length > 0) {
    await writeNetworkAuditEvent({
      db: input.db,
      rootDir: input.rootDir,
      stepRunId: input.stepRunId,
      eventClass: "system_retention",
      subjectType: "claim_token",
      subjectId: `expired:${input.now.toISOString()}`,
      actorType: "system",
      actorId: null,
      reasonCode: "claim_token_expired",
      metadata: { expired: due.length, windowDays: RETENTION_CLAIM_TOKEN_DAYS },
      now: input.now,
    });
  }
  return due.length;
}

// =============================================================================
// Raw source snippet purge — null the raw text columns, keep the row label
// =============================================================================

interface SweepRawSourceSnippetsInput {
  db: NetworkDbLike;
  rootDir?: string;
  stepRunId: string;
  now: Date;
  windowDays: number;
  limit: number;
}

async function sweepRawSourceSnippets(
  input: SweepRawSourceSnippetsInput,
): Promise<number> {
  const cutoff = new Date(input.now.getTime() - input.windowDays * 86_400_000);
  const candidates = await input.db
    .select({
      id: networkSchema.networkSignalSources.id,
      userId: networkSchema.networkSignalSources.userId,
    })
    .from(networkSchema.networkSignalSources)
    .where(lte(networkSchema.networkSignalSources.createdAt, cutoff))
    .limit(input.limit);

  if (candidates.length === 0) return 0;

  let cleared = 0;
  for (const row of candidates) {
    const updated = await input.db
      .update(networkSchema.networkSignalSources)
      .set({
        originalInput: null,
        evidenceSnippet: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(networkSchema.networkSignalSources.id, row.id),
          lte(networkSchema.networkSignalSources.createdAt, cutoff),
        ),
      )
      .returning({ id: networkSchema.networkSignalSources.id });
    if (updated.length === 1) cleared += 1;
  }

  if (cleared > 0) {
    await writeNetworkAuditEvent({
      db: input.db,
      rootDir: input.rootDir,
      stepRunId: input.stepRunId,
      eventClass: "system_retention",
      subjectType: "retention_sweep",
      subjectId: `raw-source-snippets:${input.now.toISOString()}`,
      actorType: "system",
      actorId: null,
      reasonCode: "raw_source_snippet_retention",
      metadata: {
        windowDays: input.windowDays,
        cutoff: cutoff.toISOString(),
        cleared,
      },
      now: input.now,
    });
  }

  return cleared;
}

// =============================================================================
// Soft-deleted subject purge — drive off `purge_after`, hard-purge subject PII
// =============================================================================

interface SweepSubjectsInput {
  db: NetworkDbLike;
  rootDir?: string;
  stepRunId: string;
  now: Date;
  limit: number;
  summary: RetentionSweepSummary;
}

async function sweepSoftDeletedSubjects(input: SweepSubjectsInput): Promise<number> {
  const due = await findTombstonesDueForPurge({
    db: input.db,
    now: input.now,
    limit: input.limit,
  });
  if (due.length === 0) return 0;

  // Build hash → row.id indices once per type present in `due`. Scans each
  // owning table at most ONCE per sweep, regardless of how many tombstones
  // target that type. Replaces the prior per-tombstone full-table scan
  // (Brief 284 dev-review, Pass 5).
  const typesPresent = new Set(due.map((t) => t.subjectType));
  const indices: PurgeIndices = {
    memberSignal: typesPresent.has("member-signal")
      ? await buildMemberSignalHashIndex(input.db)
      : new Map(),
    discoveryProfile: typesPresent.has("discovery-profile")
      ? await buildDiscoveryProfileHashIndex(input.db)
      : new Map(),
    request: typesPresent.has("request")
      ? await buildRequestHashIndex(input.db)
      : new Map(),
    publicProfile: typesPresent.has("public-profile")
      ? await buildPublicProfileHashIndex(input.db)
      : new Map(),
  };

  let purged = 0;
  for (const tombstone of due) {
    try {
      await purgeTombstonedSubject({
        db: input.db,
        rootDir: input.rootDir,
        stepRunId: input.stepRunId,
        now: input.now,
        tombstone,
        indices,
      });
      purged += 1;
    } catch (err) {
      input.summary.errors.push({
        stage: "soft-deleted-subjects",
        subjectId: tombstone.id,
        message: (err as Error).message,
      });
    }
  }

  return purged;
}

interface PurgeIndices {
  memberSignal: Map<string, string>;
  discoveryProfile: Map<string, string>;
  request: Map<string, string>;
  publicProfile: Map<string, string>;
}

async function buildMemberSignalHashIndex(
  db: NetworkDbLike,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: networkSchema.networkMemberSignals.id })
    .from(networkSchema.networkMemberSignals)
    .where(eq(networkSchema.networkMemberSignals.status, "deleted"));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(hashTombstoneSubjectId("member-signal", row.id), row.id);
  }
  return map;
}

async function buildRequestHashIndex(
  db: NetworkDbLike,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: networkSchema.networkJobRequests.id })
    .from(networkSchema.networkJobRequests)
    .where(eq(networkSchema.networkJobRequests.status, "deleted"));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(hashTombstoneSubjectId("request", row.id), row.id);
  }
  return map;
}

async function buildDiscoveryProfileHashIndex(
  db: NetworkDbLike,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: networkSchema.networkDiscoveredProfiles.id })
    .from(networkSchema.networkDiscoveredProfiles)
    .where(eq(networkSchema.networkDiscoveredProfiles.status, "deleted"));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(hashTombstoneSubjectId("discovery-profile", row.id), row.id);
  }
  return map;
}

async function buildPublicProfileHashIndex(
  db: NetworkDbLike,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: networkSchema.networkUsers.id })
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.status, "deleted"));
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(hashTombstoneSubjectId("public-profile", row.id), row.id);
  }
  return map;
}

interface PurgeSubjectInput {
  db: NetworkDbLike;
  rootDir?: string;
  stepRunId: string;
  now: Date;
  tombstone: NetworkTombstoneRow;
  indices: PurgeIndices;
}

/**
 * Purge the data behind a tombstone. The subject id is not stored on the
 * tombstone in plaintext; we look it up in a pre-built hash → id Map for the
 * tombstone's `subjectType` (one scan per type per sweep, see
 * `sweepSoftDeletedSubjects`). The status flag was committed inside the same
 * transaction as the tombstone insert (`recordPrivacyDeletion`), so the
 * presence of a matching row in the index is sufficient evidence.
 */
async function purgeTombstonedSubject(input: PurgeSubjectInput): Promise<void> {
  switch (input.tombstone.subjectType) {
    case "member-signal":
      await purgeDeletedMemberSignal(input);
      break;
    case "request":
      await purgeDeletedRequest(input);
      break;
    case "public-profile":
      await redactDeletedNetworkUser(input);
      break;
    case "discovery-profile":
      await purgeDeletedDiscoveryProfile(input);
      break;
  }
  await markTombstonePurged(input.tombstone.id, {
    db: input.db,
    now: input.now,
  });
}

async function purgeDeletedDiscoveryProfile(input: PurgeSubjectInput): Promise<void> {
  const rowId = input.indices.discoveryProfile.get(input.tombstone.subjectIdHash);
  if (!rowId) return;

  const sourceRefs = await input.db
    .select({ sourceId: networkSchema.networkDiscoveryClaims.sourceId })
    .from(networkSchema.networkDiscoveryClaims)
    .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, rowId));
  const sourceIds = Array.from(new Set(sourceRefs.map((row) => row.sourceId)));
  const sourceAssociation = sql`${networkSchema.networkDiscoverySources.metadata}->>'discoveryProfileId' = ${rowId}`;
  const sourcePredicate = sourceIds.length > 0
    ? or(
        inArray(networkSchema.networkDiscoverySources.id, sourceIds),
        sourceAssociation,
      )
    : sourceAssociation;

  await input.db
    .delete(networkSchema.networkDiscoveryClaims)
    .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, rowId));
  await input.db
    .delete(networkSchema.networkClaimTokens)
    .where(eq(networkSchema.networkClaimTokens.discoveryProfileId, rowId));
  await input.db
    .delete(networkSchema.networkInvitationEvents)
    .where(eq(networkSchema.networkInvitationEvents.discoveryProfileId, rowId));
  await input.db
    .delete(networkSchema.networkInvitationCandidates)
    .where(eq(networkSchema.networkInvitationCandidates.discoveryProfileId, rowId));
  await input.db
    .delete(networkSchema.networkDiscoverySources)
    .where(sourcePredicate);
  await input.db
    .update(networkSchema.networkDiscoveredProfiles)
    .set({
      displayName: "Deleted discovery profile",
      headline: "Deleted",
      canonicalUrl: null,
      contactEmail: null,
      contactUrl: null,
      contactPathKind: null,
      sourceSummary: "Deleted by privacy request.",
      metadata: null,
      updatedAt: input.now,
    })
    .where(eq(networkSchema.networkDiscoveredProfiles.id, rowId));

  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "delete",
    subjectType: "tombstone:discovery-profile",
    subjectId: input.tombstone.id,
    actorType: "system",
    actorId: null,
    reasonCode: "retention_hard_purge",
    metadata: {
      subjectIdHash: input.tombstone.subjectIdHash,
      redacted: 1,
    },
    now: input.now,
  });
}

async function purgeDeletedMemberSignal(input: PurgeSubjectInput): Promise<void> {
  const rowId = input.indices.memberSignal.get(input.tombstone.subjectIdHash);
  if (!rowId) return;

  await input.db
    .delete(networkSchema.networkSignalClaims)
    .where(eq(networkSchema.networkSignalClaims.memberSignalId, rowId));
  await input.db
    .delete(networkSchema.networkSignalSources)
    .where(eq(networkSchema.networkSignalSources.memberSignalId, rowId));
  await input.db
    .delete(networkSchema.networkMemberSignals)
    .where(eq(networkSchema.networkMemberSignals.id, rowId));

  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "delete",
    subjectType: "tombstone:member-signal",
    subjectId: input.tombstone.id,
    actorType: "system",
    actorId: null,
    reasonCode: "retention_hard_purge",
    metadata: {
      subjectIdHash: input.tombstone.subjectIdHash,
      purged: 1,
    },
    now: input.now,
  });
}

async function purgeDeletedRequest(input: PurgeSubjectInput): Promise<void> {
  const rowId = input.indices.request.get(input.tombstone.subjectIdHash);
  if (!rowId) return;

  await input.db
    .delete(networkSchema.networkRequestAuditEvents)
    .where(eq(networkSchema.networkRequestAuditEvents.requestId, rowId));
  await input.db
    .delete(networkSchema.networkJobRequests)
    .where(eq(networkSchema.networkJobRequests.id, rowId));

  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "delete",
    subjectType: "tombstone:request",
    subjectId: input.tombstone.id,
    actorType: "system",
    actorId: null,
    reasonCode: "retention_hard_purge",
    metadata: {
      subjectIdHash: input.tombstone.subjectIdHash,
      purged: 1,
    },
    now: input.now,
  });
}

async function redactDeletedNetworkUser(input: PurgeSubjectInput): Promise<void> {
  // Public profile purge does not hard-delete the user row — too many FKs
  // depend on it. Instead, redact PII fields and leave the row in `deleted`
  // status. The tombstone's hash is the durable post-purge identifier and
  // the public profile route returns 410 regardless of row presence.
  const rowId = input.indices.publicProfile.get(input.tombstone.subjectIdHash);
  if (!rowId) return;

  await input.db
    .update(networkSchema.networkUsers)
    .set({
      email: `redacted+${rowId}@deleted.invalid`,
      name: null,
      handle: null,
      businessContext: null,
      personaAssignment: null,
      card: null,
      updatedAt: input.now,
    })
    .where(eq(networkSchema.networkUsers.id, rowId));

  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "delete",
    subjectType: "tombstone:public-profile",
    subjectId: input.tombstone.id,
    actorType: "system",
    actorId: null,
    reasonCode: "retention_hard_purge",
    metadata: {
      subjectIdHash: input.tombstone.subjectIdHash,
      redacted: 1,
    },
    now: input.now,
  });
}

// =============================================================================
// Permanent tombstone stub conversion (audit tombstones, 2 years)
// =============================================================================

async function sweepPermanentTombstoneStubs(
  input: SweepSubjectsInput,
): Promise<number> {
  const due = await findTombstonesDueForPermanentStub({
    db: input.db,
    now: input.now,
    limit: input.limit,
  });

  let converted = 0;
  for (const tombstone of due) {
    try {
      await convertTombstoneToPermanentStub(tombstone.id, {
        db: input.db,
        now: input.now,
      });
      await writeNetworkAuditEvent({
        db: input.db,
        rootDir: input.rootDir,
        stepRunId: input.stepRunId,
        eventClass: "system_retention",
        subjectType: "tombstone_permanent_stub",
        subjectId: tombstone.id,
        actorType: "system",
        actorId: null,
        reasonCode: "tombstone_permanent_stub",
        metadata: {
          subjectType: tombstone.subjectType,
          subjectIdHash: tombstone.subjectIdHash,
        },
        now: input.now,
      });
      converted += 1;
    } catch (err) {
      input.summary.errors.push({
        stage: "permanent-tombstone-stubs",
        subjectId: tombstone.id,
        message: (err as Error).message,
      });
    }
  }

  return converted;
}
