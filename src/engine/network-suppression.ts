/**
 * Network Suppression List (Brief 283)
 *
 * Central pre-send suppression store for opt-outs, complaints, prior declines,
 * deleted profiles, blocked domains/people, and source/segment pauses. Raw
 * recipient identifiers are normalized and hashed before they reach Postgres.
 */

import { createHash } from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import { writeNetworkAuditEvent } from "./network-audit";

export type NetworkSuppressionRow =
  typeof networkSchema.networkSuppressions.$inferSelect;
export type NetworkSuppressionIdentifierKind =
  networkSchema.NetworkSuppressionIdentifierKind;
export type NetworkSuppressionReason = networkSchema.NetworkSuppressionReason;
export type NetworkSuppressionScope = networkSchema.NetworkSuppressionScope;

const IDENTIFIER_KIND_SET = new Set<string>(
  networkSchema.networkSuppressionIdentifierKindValues,
);
const REASON_SET = new Set<string>(networkSchema.networkSuppressionReasonValues);
const SCOPE_SET = new Set<string>(networkSchema.networkSuppressionScopeValues);

export interface RecordNetworkSuppressionInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  identifier: string;
  identifierKind: NetworkSuppressionIdentifierKind;
  scope?: NetworkSuppressionScope;
  scopeUserId?: string | null;
  reason: NetworkSuppressionReason;
  source: string;
  expiresAt?: Date | null;
  actorId?: string | null;
  now?: Date;
}

export interface RecordNetworkSuppressionResult {
  row: NetworkSuppressionRow;
  created: boolean;
  auditEventId?: string;
}

export interface IsSuppressedInput {
  db?: NetworkDbLike;
  identifierKind?: NetworkSuppressionIdentifierKind;
  scope?: NetworkSuppressionScope;
  scopeUserId?: string | null;
  now?: Date;
  /** Defaults true so callers fail closed when the suppression store is down. */
  failClosed?: boolean;
}

function requireKnown(set: Set<string>, value: string, label: string): void {
  if (!set.has(value)) {
    throw new Error(`network_suppression received unknown ${label}: ${value}`);
  }
}

function requireNonEmpty(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`network_suppression requires ${label}`);
  return clean;
}

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const host = withoutScheme.split(/[/?#]/, 1)[0] ?? withoutScheme;
  return host.replace(/^@/, "").replace(/^www\./, "");
}

export function inferSuppressionIdentifierKind(
  identifier: string,
): NetworkSuppressionIdentifierKind {
  return identifier.includes("@") ? "email" : "domain";
}

export function normalizeSuppressionIdentifier(
  identifier: string,
  kind: NetworkSuppressionIdentifierKind,
): string {
  requireKnown(IDENTIFIER_KIND_SET, kind, "identifierKind");
  const clean = requireNonEmpty(identifier, "identifier");
  switch (kind) {
    case "email":
      return extractEmail(clean);
    case "domain":
      return normalizeDomain(clean);
    case "person-ref":
    case "source":
    case "segment":
      return clean.replace(/\s+/g, " ").trim().toLowerCase();
  }
}

export function hashSuppressionIdentifier(
  identifier: string,
  kind: NetworkSuppressionIdentifierKind,
): string {
  const normalized = normalizeSuppressionIdentifier(identifier, kind);
  return createHash("sha256")
    .update(`network-suppression:v1:${kind}:${normalized}`)
    .digest("hex");
}

function emailDomain(identifier: string): string | null {
  const email = normalizeSuppressionIdentifier(identifier, "email");
  const at = email.lastIndexOf("@");
  return at === -1 ? null : email.slice(at + 1);
}

function activeWhere(
  identifierHash: string,
  scope: NetworkSuppressionScope,
  scopeUserId: string | null,
  now: Date,
) {
  const active = or(
    isNull(networkSchema.networkSuppressions.expiresAt),
    gt(networkSchema.networkSuppressions.expiresAt, now),
  );
  if (scope === "per-user") {
    const scopedUserId = scopeUserId ?? "__missing_scope_user__";
    return and(
      eq(networkSchema.networkSuppressions.identifierHash, identifierHash),
      active,
      or(
        eq(networkSchema.networkSuppressions.scope, "global"),
        and(
          eq(networkSchema.networkSuppressions.scope, "per-user"),
          eq(networkSchema.networkSuppressions.scopeUserId, scopedUserId),
        ),
      ),
    );
  }
  return and(
    eq(networkSchema.networkSuppressions.identifierHash, identifierHash),
    eq(networkSchema.networkSuppressions.scope, "global"),
    active,
  );
}

async function findActiveSuppression(
  db: NetworkDbLike,
  identifierHash: string,
  scope: NetworkSuppressionScope,
  scopeUserId: string | null,
  now: Date,
): Promise<NetworkSuppressionRow | null> {
  const [row] = await db
    .select()
    .from(networkSchema.networkSuppressions)
    .where(activeWhere(identifierHash, scope, scopeUserId, now))
    .limit(1);
  return row ?? null;
}

export async function recordNetworkSuppression(
  input: RecordNetworkSuppressionInput,
): Promise<RecordNetworkSuppressionResult> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "record_network_suppression",
    { rootDir: input.rootDir },
  );
  requireKnown(IDENTIFIER_KIND_SET, input.identifierKind, "identifierKind");
  requireKnown(REASON_SET, input.reason, "reason");
  const scope = input.scope ?? "global";
  requireKnown(SCOPE_SET, scope, "scope");
  if (scope === "per-user" && !input.scopeUserId?.trim()) {
    throw new Error("record_network_suppression requires scopeUserId for per-user scope");
  }

  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const identifierHash = hashSuppressionIdentifier(input.identifier, input.identifierKind);
  const source = requireNonEmpty(input.source, "source").slice(0, 240);
  const scopeUserId = scope === "per-user" ? input.scopeUserId!.trim() : null;

  const existing = await findActiveSuppression(db, identifierHash, scope, scopeUserId, now);
  if (existing) {
    return { row: existing, created: false };
  }

  const [row] = await db
    .insert(networkSchema.networkSuppressions)
    .values({
      identifierHash,
      identifierKind: input.identifierKind,
      scope,
      scopeUserId,
      reason: input.reason,
      source,
      expiresAt: input.expiresAt ?? null,
      stepRunId,
      createdAt: now,
    })
    .returning();

  const audit = await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: input.reason === "complaint" ? "complaint" : "operator_suppressed",
    subjectType: "network_suppression",
    subjectId: row.id,
    actorType: "system",
    actorId: input.actorId ?? null,
    reasonCode: input.reason,
    metadata: {
      identifierKind: input.identifierKind,
      scope,
      source,
      expiresAt: input.expiresAt?.toISOString() ?? null,
    },
    now,
  });

  return { row, created: true, auditEventId: audit.id };
}

export async function isSuppressed(
  identifier: string,
  input: IsSuppressedInput = {},
): Promise<boolean> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const scope = input.scope ?? "global";
  const scopeUserId = input.scopeUserId ?? null;
  const kind = input.identifierKind ?? inferSuppressionIdentifierKind(identifier);
  const failClosed = input.failClosed ?? true;

  try {
    const identifierHash = hashSuppressionIdentifier(identifier, kind);
    const direct = await findActiveSuppression(db, identifierHash, scope, scopeUserId, now);
    if (direct) return true;

    if (kind === "email") {
      const domain = emailDomain(identifier);
      if (domain) {
        const domainHash = hashSuppressionIdentifier(domain, "domain");
        const domainHit = await findActiveSuppression(db, domainHash, scope, scopeUserId, now);
        return Boolean(domainHit);
      }
    }
    return false;
  } catch (error) {
    if (failClosed) return true;
    throw error;
  }
}
