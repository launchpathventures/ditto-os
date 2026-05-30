/**
 * Network Tombstones (Brief 284)
 *
 * Shared helpers around the `network_tombstones` table — the hybrid soft-delete
 * marker that lets the public profile route return HTTP 410 (R-Q11), prevents
 * resurrection of deleted subjects (Insight-234 #4), and drives the retention
 * engine's purge + permanent-stub conversion.
 *
 * The table stores a salted sha256 of the subject id (no plaintext PII) so the
 * row itself is durable beyond purge without leaking the deleted identity.
 */

import { createHash } from "crypto";
import { and, eq, isNull, lte } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import { writeNetworkAuditEvent } from "./network-audit";
import {
  recordNetworkSuppression,
  type NetworkSuppressionIdentifierKind,
} from "./network-suppression";

export type NetworkTombstoneRow =
  typeof networkSchema.networkTombstones.$inferSelect;
export type NetworkTombstoneSubjectType =
  networkSchema.NetworkTombstoneSubjectType;
export type NetworkTombstoneDeletedByActorType =
  networkSchema.NetworkTombstoneDeletedByActorType;

const SUBJECT_TYPE_SET = new Set<string>(
  networkSchema.networkTombstoneSubjectTypeValues,
);
const ACTOR_TYPE_SET = new Set<string>(
  networkSchema.networkTombstoneDeletedByActorTypeValues,
);

/** Per-subject-type salts. Treated as constants, not secrets — the hash is for
 *  uniqueness and de-correlation, not confidentiality. */
const SUBJECT_TYPE_SALTS: Record<NetworkTombstoneSubjectType, string> = {
  "member-signal": "tombstone:v1:member-signal",
  "discovery-profile": "tombstone:v1:discovery-profile",
  request: "tombstone:v1:request",
  "public-profile": "tombstone:v1:public-profile",
};

export function hashTombstoneSubjectId(
  subjectType: NetworkTombstoneSubjectType,
  subjectId: string,
): string {
  if (!SUBJECT_TYPE_SET.has(subjectType)) {
    throw new Error(`hashTombstoneSubjectId: unknown subjectType ${subjectType}`);
  }
  const trimmed = subjectId.trim();
  if (!trimmed) throw new Error("hashTombstoneSubjectId requires subjectId");
  return createHash("sha256")
    .update(`${SUBJECT_TYPE_SALTS[subjectType]}:${trimmed}`)
    .digest("hex");
}

function activeWhere(subjectType: NetworkTombstoneSubjectType, subjectIdHash: string) {
  return and(
    eq(networkSchema.networkTombstones.subjectType, subjectType),
    eq(networkSchema.networkTombstones.subjectIdHash, subjectIdHash),
  );
}

export async function findActiveTombstone(
  subjectType: NetworkTombstoneSubjectType,
  subjectId: string,
  opts: { db?: NetworkDbLike } = {},
): Promise<NetworkTombstoneRow | null> {
  const db = opts.db ?? networkDb;
  const subjectIdHash = hashTombstoneSubjectId(subjectType, subjectId);
  const [row] = await db
    .select()
    .from(networkSchema.networkTombstones)
    .where(activeWhere(subjectType, subjectIdHash))
    .limit(1);
  return row ?? null;
}

export async function isSubjectTombstoned(
  subjectType: NetworkTombstoneSubjectType,
  subjectId: string,
  opts: { db?: NetworkDbLike } = {},
): Promise<boolean> {
  const row = await findActiveTombstone(subjectType, subjectId, opts);
  return row !== null;
}

// =============================================================================
// Retention defaults — ratified from parent Brief 278 §Proposed Retention Defaults
// =============================================================================
//
//   Raw source snippets:           90 days
//   Discovery Profiles unclaimed:  refresh 30d, expire 180d (Brief 279 wires)
//   Claim tokens:                  30 days (Brief 279 wires)
//   Invite events:                 1 year (Brief 279 wires)
//   Audit tombstones:              2 years → permanent neutral stub
//   Soft-deleted subject data:     30 days recoverable, then hard-purge
//   Post-delete URL:               permanent HTTP 410 + neutral tombstone page
// =============================================================================

export const RETENTION_SOFT_DELETE_DAYS = 30;
export const RETENTION_TOMBSTONE_PERMANENT_STUB_DAYS = 365 * 2;

export interface ComputeTombstoneTimingsInput {
  now: Date;
  softDeleteDays?: number;
  permanentStubDays?: number;
}

export interface TombstoneTimings {
  deletedAt: Date;
  purgeAfter: Date;
  permanentStubAt: Date;
}

export function computeTombstoneTimings(
  input: ComputeTombstoneTimingsInput,
): TombstoneTimings {
  const softDeleteDays = input.softDeleteDays ?? RETENTION_SOFT_DELETE_DAYS;
  const permanentStubDays =
    input.permanentStubDays ?? RETENTION_TOMBSTONE_PERMANENT_STUB_DAYS;
  const deletedAt = input.now;
  const purgeAfter = new Date(deletedAt.getTime() + softDeleteDays * 86_400_000);
  const permanentStubAt = new Date(
    deletedAt.getTime() + permanentStubDays * 86_400_000,
  );
  return { deletedAt, purgeAfter, permanentStubAt };
}

// =============================================================================
// Hybrid privacy delete (R-Q9): soft-delete flag + tombstone insert in one tx
// =============================================================================

export interface RecordPrivacyDeletionInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId: unknown;
  subjectType: NetworkTombstoneSubjectType;
  subjectId: string;
  deletedByActorType: NetworkTombstoneDeletedByActorType;
  actorId?: string | null;
  /** Optional human-readable reason. Dropped from the row when it becomes a
   *  permanent stub (after `permanentStubAt`). */
  deletedReason?: string | null;
  /** Free-form metadata. Same permanent-stub treatment as `deletedReason`. */
  metadata?: Record<string, unknown> | null;
  /** Email or domain to add to the suppression list under `deleted-profile`
   *  reason. Optional; skip when subject has no identifier the request flow
   *  could re-collide with (e.g., discovery-profile in 279). */
  suppressionIdentifier?: {
    identifier: string;
    identifierKind: NetworkSuppressionIdentifierKind;
  };
  now?: Date;
  /** Overrides the default 30-day soft-delete window. */
  softDeleteDays?: number;
  permanentStubDays?: number;
}

export interface RecordPrivacyDeletionResult {
  tombstone: NetworkTombstoneRow;
  created: boolean;
}

/**
 * Hybrid soft-delete + tombstone insert + downstream suppression in a single
 * transaction. The caller is responsible for actually flipping the owning row's
 * status (we don't know which table the subject lives in here without coupling
 * — we provide the transactional shell and the caller supplies the flip).
 */
export async function recordPrivacyDeletion(
  input: RecordPrivacyDeletionInput,
  applySoftDeleteFlag: (tx: NetworkDbLike) => Promise<void>,
): Promise<RecordPrivacyDeletionResult> {
  if (!SUBJECT_TYPE_SET.has(input.subjectType)) {
    throw new Error(`record_privacy_deletion received unknown subjectType: ${input.subjectType}`);
  }
  if (!ACTOR_TYPE_SET.has(input.deletedByActorType)) {
    throw new Error(`record_privacy_deletion received unknown deletedByActorType: ${input.deletedByActorType}`);
  }
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "record_privacy_deletion",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const subjectIdHash = hashTombstoneSubjectId(input.subjectType, input.subjectId);
  const timings = computeTombstoneTimings({
    now,
    softDeleteDays: input.softDeleteDays,
    permanentStubDays: input.permanentStubDays,
  });

  const existing = await findActiveTombstone(input.subjectType, input.subjectId, { db });
  if (existing) {
    return { tombstone: existing, created: false };
  }

  const transaction = db as unknown as NetworkDbLike & {
    transaction: <T>(fn: (tx: NetworkDbLike) => Promise<T>) => Promise<T>;
  };

  const result = await transaction.transaction(async (tx) => {
    await applySoftDeleteFlag(tx);
    const [row] = await tx
      .insert(networkSchema.networkTombstones)
      .values({
        subjectType: input.subjectType,
        subjectIdHash,
        deletedReason: input.deletedReason ?? null,
        deletedByActorType: input.deletedByActorType,
        deletedAt: timings.deletedAt,
        purgeAfter: timings.purgeAfter,
        permanentStubAt: timings.permanentStubAt,
        purgedAt: null,
        stubbedAt: null,
        stepRunId,
        metadata: input.metadata ?? null,
        createdAt: now,
      })
      .returning();
    return row;
  });

  await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "delete",
    subjectType: `tombstone:${input.subjectType}`,
    subjectId: result.id,
    actorType:
      input.deletedByActorType === "visitor" ? "visitor" :
      input.deletedByActorType === "admin" ? "admin" :
      input.deletedByActorType === "system" ? "system" : "user",
    actorId: input.actorId ?? null,
    reasonCode: input.deletedReason ?? null,
    metadata: {
      subjectType: input.subjectType,
      subjectIdHash,
      purgeAfter: timings.purgeAfter.toISOString(),
      permanentStubAt: timings.permanentStubAt.toISOString(),
      ...input.metadata,
    },
    now,
  });

  if (input.suppressionIdentifier) {
    await recordNetworkSuppression({
      db,
      rootDir: input.rootDir,
      stepRunId,
      identifier: input.suppressionIdentifier.identifier,
      identifierKind: input.suppressionIdentifier.identifierKind,
      scope: "global",
      reason: "deleted-profile",
      source: `tombstone:${input.subjectType}:${result.id}`,
      actorId: input.actorId ?? null,
      now,
    });
  }

  return { tombstone: result, created: true };
}

// =============================================================================
// Retention sweep — purges + permanent-stub conversion
// =============================================================================

export interface FindTombstonesDueInput {
  db?: NetworkDbLike;
  now?: Date;
  limit?: number;
}

export async function findTombstonesDueForPurge(
  input: FindTombstonesDueInput = {},
): Promise<NetworkTombstoneRow[]> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  return db
    .select()
    .from(networkSchema.networkTombstones)
    .where(
      and(
        isNull(networkSchema.networkTombstones.purgedAt),
        lte(networkSchema.networkTombstones.purgeAfter, now),
      ),
    )
    .limit(input.limit ?? 500);
}

export async function findTombstonesDueForPermanentStub(
  input: FindTombstonesDueInput = {},
): Promise<NetworkTombstoneRow[]> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  return db
    .select()
    .from(networkSchema.networkTombstones)
    .where(
      and(
        isNull(networkSchema.networkTombstones.stubbedAt),
        lte(networkSchema.networkTombstones.permanentStubAt, now),
      ),
    )
    .limit(input.limit ?? 500);
}

export async function markTombstonePurged(
  tombstoneId: string,
  opts: { db?: NetworkDbLike; now?: Date } = {},
): Promise<void> {
  const db = opts.db ?? networkDb;
  const now = opts.now ?? new Date();
  await db
    .update(networkSchema.networkTombstones)
    .set({ purgedAt: now })
    .where(eq(networkSchema.networkTombstones.id, tombstoneId));
}

export async function convertTombstoneToPermanentStub(
  tombstoneId: string,
  opts: { db?: NetworkDbLike; now?: Date } = {},
): Promise<void> {
  const db = opts.db ?? networkDb;
  const now = opts.now ?? new Date();
  await db
    .update(networkSchema.networkTombstones)
    .set({
      stubbedAt: now,
      deletedReason: null,
      metadata: null,
    })
    .where(eq(networkSchema.networkTombstones.id, tombstoneId));
}
