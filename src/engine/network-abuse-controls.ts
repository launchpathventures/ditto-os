/**
 * Network Abuse Controls (Brief 286)
 *
 * Shared fixed-window rate limits with two layers:
 *   1. In-memory L1 — fast, per-instance pressure relief.
 *   2. `network_rate_counters` — Postgres-backed cross-instance counter.
 *
 * These controls are intentionally server-side only. They do not replace
 * harness step-run guards for side-effecting Network tools; they sit in front
 * of public/admin HTTP seams to prevent abuse before expensive or sensitive
 * work starts.
 */

import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { isSuppressed, type NetworkSuppressionIdentifierKind } from "./network-suppression";

export const networkRateLimitNameValues = [
  "network-search",
  "network-watch",
  "network-intro",
  "profile-chat",
  "invite-send",
  // Brief 277 / Sub-brief 290 owns registration for all three (Q9). 291/292
  // consume "share-attribution" / "outcome-share-consent" but do NOT re-edit
  // this closed enum (avoids the merge collision the closed union forces).
  "share-studio-variant",
  "share-attribution",
  "outcome-share-consent",
  "privacy-export-email-challenge",
  "privacy-delete-email-challenge",
  "admin-dry-run-replay",
  "admin-raw-reveal",
] as const;
export type NetworkRateLimitName = (typeof networkRateLimitNameValues)[number];

export type NetworkRateLimitActorKind =
  | "ip"
  | "session"
  | "user"
  | "visitor"
  | "email"
  | "subject"
  | "source"
  | "segment"
  | "route";

export interface NetworkRateLimitActor {
  kind: NetworkRateLimitActorKind;
  id: string;
}

export interface NetworkRateLimitPolicy {
  max: number;
  windowMs: number;
}

export interface NetworkRateLimitMemoryEntry {
  count: number;
  resetAtMs: number;
}

export type NetworkRateLimitMemoryStore = Map<string, NetworkRateLimitMemoryEntry>;

export interface CheckRateLimitInput {
  db?: NetworkDbLike;
  limitName: NetworkRateLimitName;
  actor: NetworkRateLimitActor;
  policy?: Partial<NetworkRateLimitPolicy>;
  cost?: number;
  now?: Date;
  memoryStore?: NetworkRateLimitMemoryStore;
  /** Defaults true. Tests can disable L1 to assert the DB layer directly. */
  useMemoryL1?: boolean;
  /** Defaults true so abuse controls fail closed. */
  failClosed?: boolean;
}

export interface NetworkRateLimitResult {
  allowed: boolean;
  limitName: NetworkRateLimitName;
  bucketKey: string;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSec: number;
  source: "memory" | "postgres";
  reason?: "limit_exceeded" | "rate_limit_store_unavailable";
}

export interface CheckEmailChallengeRateLimitInput {
  db?: NetworkDbLike;
  ip: string;
  target: string;
  limitName: Extract<
    NetworkRateLimitName,
    "privacy-export-email-challenge" | "privacy-delete-email-challenge"
  >;
  now?: Date;
  memoryStore?: NetworkRateLimitMemoryStore;
}

export interface NetworkOperationPauseInput {
  db?: NetworkDbLike;
  now?: Date;
  source?: string | null;
  segment?: string | null;
  memberId?: string | null;
  requestId?: string | null;
}

export interface NetworkOperationPauseResult {
  paused: boolean;
  reason?: string;
  identifierKind?: NetworkSuppressionIdentifierKind;
  identifier?: string;
}

const DEFAULT_POLICIES: Record<NetworkRateLimitName, NetworkRateLimitPolicy> = {
  "network-search": { max: 20, windowMs: 60 * 60 * 1000 },
  "network-watch": { max: 12, windowMs: 60 * 60 * 1000 },
  "network-intro": { max: 10, windowMs: 60 * 60 * 1000 },
  "profile-chat": { max: 30, windowMs: 60 * 60 * 1000 },
  "invite-send": { max: 30, windowMs: 60 * 60 * 1000 },
  "share-studio-variant": { max: 60, windowMs: 3_600_000 },
  "share-attribution": { max: 120, windowMs: 3_600_000 },
  "outcome-share-consent": { max: 10, windowMs: 3_600_000 },
  "privacy-export-email-challenge": { max: 5, windowMs: 60 * 60 * 1000 },
  "privacy-delete-email-challenge": { max: 5, windowMs: 60 * 60 * 1000 },
  "admin-dry-run-replay": { max: 30, windowMs: 60 * 60 * 1000 },
  "admin-raw-reveal": { max: 60, windowMs: 60 * 60 * 1000 },
};

const LIMIT_NAMES = new Set<string>(networkRateLimitNameValues);
const globalMemoryStore: NetworkRateLimitMemoryStore = new Map();

function requireLimitName(limitName: NetworkRateLimitName): void {
  if (!LIMIT_NAMES.has(limitName)) {
    throw new Error(`unknown_network_rate_limit:${limitName}`);
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`network_rate_limit requires positive ${label}`);
  }
  return Math.ceil(value);
}

function normalizeActorId(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, " ");
}

export function hashRateLimitActor(actor: NetworkRateLimitActor): string {
  const normalized = normalizeActorId(actor.id);
  if (!normalized) throw new Error("network_rate_limit requires actor id");
  return createHash("sha256")
    .update(`network-rate-limit:v1:${actor.kind}:${normalized}`)
    .digest("hex");
}

export function rateLimitBucketKey(
  limitName: NetworkRateLimitName,
  actor: NetworkRateLimitActor,
): string {
  requireLimitName(limitName);
  return `${limitName}:${actor.kind}:${hashRateLimitActor(actor)}`;
}

export function windowStartFor(now: Date, windowMs: number): Date {
  const start = Math.floor(now.getTime() / windowMs) * windowMs;
  return new Date(start);
}

function resolvePolicy(
  limitName: NetworkRateLimitName,
  override?: Partial<NetworkRateLimitPolicy>,
): NetworkRateLimitPolicy {
  requireLimitName(limitName);
  const base = DEFAULT_POLICIES[limitName];
  return {
    max: positiveInteger(override?.max ?? base.max, "max"),
    windowMs: positiveInteger(override?.windowMs ?? base.windowMs, "windowMs"),
  };
}

function retryAfterSeconds(now: Date, resetAt: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}

function checkMemoryL1({
  store,
  bucketKey,
  cost,
  max,
  now,
  resetAt,
  limitName,
}: {
  store: NetworkRateLimitMemoryStore;
  bucketKey: string;
  cost: number;
  max: number;
  now: Date;
  resetAt: Date;
  limitName: NetworkRateLimitName;
}): NetworkRateLimitResult | null {
  const key = `${bucketKey}:${resetAt.getTime()}`;
  const current = store.get(key);
  const next =
    current && current.resetAtMs > now.getTime()
      ? { count: current.count + cost, resetAtMs: current.resetAtMs }
      : { count: cost, resetAtMs: resetAt.getTime() };
  store.set(key, next);
  if (next.count <= max) return null;
  return {
    allowed: false,
    limitName,
    bucketKey,
    count: next.count,
    limit: max,
    remaining: 0,
    resetAt,
    retryAfterSec: retryAfterSeconds(now, resetAt),
    source: "memory",
    reason: "limit_exceeded",
  };
}

export function clearNetworkRateLimitMemory(): void {
  globalMemoryStore.clear();
}

export async function checkRateLimit(
  input: CheckRateLimitInput,
): Promise<NetworkRateLimitResult> {
  const now = input.now ?? new Date();
  const cost = positiveInteger(input.cost ?? 1, "cost");
  const policy = resolvePolicy(input.limitName, input.policy);
  const windowStart = windowStartFor(now, policy.windowMs);
  const resetAt = new Date(windowStart.getTime() + policy.windowMs);
  const bucketKey = rateLimitBucketKey(input.limitName, input.actor);
  const memoryStore = input.memoryStore ?? globalMemoryStore;

  if (input.useMemoryL1 !== false) {
    const memoryBlocked = checkMemoryL1({
      store: memoryStore,
      bucketKey,
      cost,
      max: policy.max,
      now,
      resetAt,
      limitName: input.limitName,
    });
    if (memoryBlocked) return memoryBlocked;
  }

  const db = input.db ?? networkDb;
  try {
    const table = networkSchema.networkRateCounters;
    const [row] = await db
      .insert(table)
      .values({
        bucketKey,
        windowStart,
        count: cost,
        updatedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [table.bucketKey, table.windowStart],
        set: {
          count: sql`${table.count} + ${cost}`,
          updatedAt: now,
        },
      })
      .returning({ count: table.count });

    const count = row?.count ?? cost;
    const allowed = count <= policy.max;
    return {
      allowed,
      limitName: input.limitName,
      bucketKey,
      count,
      limit: policy.max,
      remaining: Math.max(0, policy.max - count),
      resetAt,
      retryAfterSec: retryAfterSeconds(now, resetAt),
      source: "postgres",
      reason: allowed ? undefined : "limit_exceeded",
    };
  } catch (error) {
    if (input.failClosed ?? true) {
      return {
        allowed: false,
        limitName: input.limitName,
        bucketKey,
        count: policy.max + 1,
        limit: policy.max,
        remaining: 0,
        resetAt,
        retryAfterSec: retryAfterSeconds(now, resetAt),
        source: "postgres",
        reason: "rate_limit_store_unavailable",
      };
    }
    throw error;
  }
}

export async function checkRateLimits(
  inputs: CheckRateLimitInput[],
): Promise<NetworkRateLimitResult> {
  if (inputs.length === 0) {
    throw new Error("check_rate_limits requires at least one input");
  }
  let lastAllowed: NetworkRateLimitResult | null = null;
  for (const input of inputs) {
    const result = await checkRateLimit(input);
    if (!result.allowed) return result;
    lastAllowed = result;
  }
  return lastAllowed!;
}

export async function checkEmailChallengeRateLimit(
  input: CheckEmailChallengeRateLimitInput,
): Promise<NetworkRateLimitResult> {
  return checkRateLimits([
    {
      db: input.db,
      limitName: input.limitName,
      actor: { kind: "ip", id: input.ip },
      now: input.now,
      memoryStore: input.memoryStore,
    },
    {
      db: input.db,
      limitName: input.limitName,
      actor: { kind: "email", id: input.target },
      now: input.now,
      memoryStore: input.memoryStore,
    },
  ]);
}

async function pauseHit(
  db: NetworkDbLike,
  identifier: string | null | undefined,
  identifierKind: NetworkSuppressionIdentifierKind,
  now: Date,
): Promise<NetworkOperationPauseResult | null> {
  if (!identifier?.trim()) return null;
  const paused = await isSuppressed(identifier, {
    db,
    identifierKind,
    now,
  });
  return paused
    ? {
        paused: true,
        reason: `${identifierKind}_paused`,
        identifierKind,
        identifier,
      }
    : null;
}

/**
 * Shared pause check consumed by search/watch/discovery/intro call-sites.
 * Admin pauses are stored as source/segment/person-ref suppressions so every
 * surface can ask the same question before doing work.
 */
export async function isNetworkOperationPaused(
  input: NetworkOperationPauseInput = {},
): Promise<NetworkOperationPauseResult> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  for (const candidate of [
    await pauseHit(db, input.source, "source", now),
    await pauseHit(db, input.segment, "segment", now),
    await pauseHit(db, input.memberId ? `member:${input.memberId}` : null, "person-ref", now),
    await pauseHit(db, input.requestId ? `request:${input.requestId}` : null, "person-ref", now),
  ]) {
    if (candidate) return candidate;
  }
  return { paused: false };
}

export async function assertNetworkOperationNotPaused(
  input: NetworkOperationPauseInput = {},
): Promise<void> {
  const result = await isNetworkOperationPaused(input);
  if (result.paused) {
    throw new Error(
      `network_operation_paused:${result.identifierKind}:${result.identifier}`,
    );
  }
}
