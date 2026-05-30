/**
 * Admin Network Health (Brief 286)
 *
 * Product-layer read model for the operator dashboard. The default projection is
 * bounded: structured metadata, counts, reason codes, provenance labels, and
 * health states only. Raw private text is intentionally omitted unless the
 * operator invokes `revealAdminRawText`, which writes its own audit event.
 */

import { count, desc, eq, inArray } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { writeNetworkAuditEvent } from "./network-audit";

export type HealthTone = "green" | "yellow" | "red";

export interface AdminActionItem {
  id: string;
  kind: string;
  title: string;
  detail: string;
  reasonCode: string | null;
  subjectType: string;
  subjectId: string;
  createdAt: string;
  revealable: boolean;
  decision?: {
    kind: "claim_invite_candidate";
    candidateId: string;
  } | null;
}

export interface AdminHealthCard {
  id: string;
  title: string;
  status: HealthTone;
  count: number;
  detail: string;
}

export interface AdminMetric {
  id: string;
  label: string;
  value: number | string;
  detail: string;
  displayOnly?: boolean;
}

export interface AdminAuditRow {
  id: string;
  eventClass: string;
  subjectType: string;
  subjectId: string;
  actorType: string;
  actorId: string | null;
  reasonCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  revealable: boolean;
}

export interface AdminSuppressionRow {
  id: string;
  identifierKind: string;
  scope: string;
  scopeUserId: string | null;
  reason: string;
  source: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface NetworkHealthDashboardData {
  generatedAt: string;
  actionRequired: {
    total: number;
    items: AdminActionItem[];
  };
  health: AdminHealthCard[];
  metrics: AdminMetric[];
  auditRows: AdminAuditRow[];
  suppressionRows: AdminSuppressionRow[];
  allClear: boolean;
}

export interface RevealAdminRawTextInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  auditEventId: string;
  field?: string | null;
  reason: string;
  actorId: string;
  now?: Date;
}

export interface RevealedAdminRawText {
  auditEventId: string;
  sourceEventId: string;
  field: string;
  rawText: string;
  revealedBy: string;
  revealedAt: string;
  annotation: "Revealed — this view is audited";
}

export interface DryRunWatchReplayInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  watchId: string;
  reason: string;
  actorId: string;
  now?: Date;
}

export interface DryRunWatchReplayResult {
  auditEventId: string;
  watchId: string;
  label: "DRY RUN — no contact occurred";
  banner: "DRY RUN — no contact";
  assertions: {
    emailsSent: 0;
    notificationsSent: 0;
    userVisibleWrites: 0;
  };
  candidatesResolved: number;
  completedAt: string;
}

const RAW_FIELD_CANDIDATES = [
  "sealedRawText",
  "privateRawText",
  "rawText",
  "claimText",
  "emailText",
];

const BLOCKED_METADATA_KEYS = new Set([
  "antiPersonaMd",
  "antiPersonaText",
  "antiPersona",
  "anti_persona",
  "blockRuleText",
  "rawText",
  "privateRawText",
  "sealedRawText",
  "claimText",
  "emailBody",
  "emailText",
  "memberPrivateText",
  "hiddenClaim",
  "onRequestClaim",
]);

function isBlockedMetadataKey(key: string): boolean {
  return BLOCKED_METADATA_KEYS.has(key) || isAntiPersonaField(key);
}

function nonEmpty(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`network_admin_health requires ${label}`);
  return clean;
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function safeMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isBlockedMetadataKey(key)) {
      output[key] = "[sealed]";
      continue;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      output[key] = safeMetadata(raw);
    } else if (Array.isArray(raw)) {
      output[key] = raw.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? safeMetadata(item)
          : item,
      );
    } else {
      output[key] = raw;
    }
  }
  return output;
}

function hasRevealableRawText(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  if (metadataHasAntiPersonaMarker(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return RAW_FIELD_CANDIDATES.some(
    (field) => typeof record[field] === "string" && !isAntiPersonaField(field),
  );
}

function isAntiPersonaField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/[^a-z]/g, "");
  return normalized.includes("antipersona") || normalized.includes("blockrule");
}

function metadataHasAntiPersonaMarker(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (isAntiPersonaField(key)) return true;
    if (metadataHasAntiPersonaMarker(value)) return true;
  }
  return false;
}

function sourceForbidsRawReveal(source: {
  eventClass: string;
  subjectType: string;
  reasonCode: string | null;
  metadata: unknown;
}): boolean {
  return (
    isAntiPersonaField(source.eventClass) ||
    isAntiPersonaField(source.subjectType) ||
    (source.reasonCode ? isAntiPersonaField(source.reasonCode) : false) ||
    metadataHasAntiPersonaMarker(source.metadata)
  );
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>,
  );
}

function reasonCount(rows: Array<{ reasonCode: string | null }>): string {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!row.reasonCode) continue;
    counts[row.reasonCode] = (counts[row.reasonCode] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, total]) => `${reason}: ${total}`)
    .join(" · ") || "No refusal codes yet";
}

function leakageFailed(rows: Array<{ reasonCode: string | null; metadata: unknown }>): number {
  return rows.filter((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    return (
      row.reasonCode === "private_leakage_failed" ||
      metadata?.privateLeakageStatus === "fail" ||
      metadata?.leakageTest === "fail"
    );
  }).length;
}

function subjectMatches(row: { subjectType: string; reasonCode: string | null }, pattern: RegExp): boolean {
  return pattern.test(row.subjectType) || (row.reasonCode ? pattern.test(row.reasonCode) : false);
}

export async function buildNetworkHealthDashboardData(
  opts: { db?: NetworkDbLike; now?: Date; auditLimit?: number } = {},
): Promise<NetworkHealthDashboardData> {
  const db = opts.db ?? networkDb;
  const now = opts.now ?? new Date();
  const auditRowsRaw = await db
    .select()
    .from(networkSchema.networkAuditEvents)
    .orderBy(desc(networkSchema.networkAuditEvents.createdAt))
    .limit(opts.auditLimit ?? 50);
  const suppressionRowsRaw = await db
    .select()
    .from(networkSchema.networkSuppressions)
    .orderBy(desc(networkSchema.networkSuppressions.createdAt))
    .limit(50);
  const candidateRowsRaw = await db
    .select()
    .from(networkSchema.networkInvitationCandidates)
    .where(inArray(networkSchema.networkInvitationCandidates.status, ["queued", "drafted"]))
    .orderBy(desc(networkSchema.networkInvitationCandidates.createdAt))
    .limit(12);
  const [candidateCountRaw] = await db
    .select({ count: count() })
    .from(networkSchema.networkInvitationCandidates)
    .where(inArray(networkSchema.networkInvitationCandidates.status, ["queued", "drafted"]));
  const candidateTotal = candidateCountRaw?.count ?? candidateRowsRaw.length;
  const discoveryProfileIds = Array.from(
    new Set(candidateRowsRaw.map((row) => row.discoveryProfileId)),
  );
  const discoveryProfilesRaw =
    discoveryProfileIds.length > 0
      ? await db
          .select({
            id: networkSchema.networkDiscoveredProfiles.id,
            displayName: networkSchema.networkDiscoveredProfiles.displayName,
            headline: networkSchema.networkDiscoveredProfiles.headline,
          })
          .from(networkSchema.networkDiscoveredProfiles)
          .where(inArray(networkSchema.networkDiscoveredProfiles.id, discoveryProfileIds))
      : [];
  const discoveryProfileById = new Map(
    discoveryProfilesRaw.map((row) => [row.id, row]),
  );

  const eventCounts = countBy(auditRowsRaw.map((row) => row.eventClass));
  const complaintCount = eventCounts.complaint ?? 0;
  const sourceBlocks = auditRowsRaw.filter(
    (row) =>
      row.reasonCode === "source_policy_block" ||
      row.eventClass === "source_policy_blocked" ||
      row.subjectType === "source_policy",
  ).length;
  const watchFailures = auditRowsRaw.filter((row) =>
    subjectMatches(row, /watch.*(fail|error)|watch_run/i),
  ).length;
  const sourceFailures = auditRowsRaw.filter((row) =>
    subjectMatches(row, /source.*(fail|error)|source_research/i),
  ).length;
  const highRisk = auditRowsRaw.filter((row) =>
    subjectMatches(row, /high.?risk|risk/i),
  ).length;
  const leakageFailures = leakageFailed(auditRowsRaw);

  const candidateActionItems = candidateRowsRaw.map<AdminActionItem>((candidate) => {
    const profile = discoveryProfileById.get(candidate.discoveryProfileId);
    const riskLabel =
      candidate.riskFlags.length > 0 ? candidate.riskFlags.join(", ") : "candidate_ready";
    return {
      id: `candidate:${candidate.id}`,
      kind: "claim_invite_candidate",
      title: "Claim invite needs review",
      detail: `${profile?.displayName ?? "Discovery profile"} - ${
        profile?.headline ?? candidate.inviteReason
      }`,
      reasonCode: riskLabel,
      subjectType: "claim_invite",
      subjectId: candidate.id,
      createdAt: candidate.createdAt.toISOString(),
      revealable: false,
      decision: {
        kind: "claim_invite_candidate",
        candidateId: candidate.id,
      },
    };
  });

  const auditActionItems = auditRowsRaw
    .filter((row) =>
      [
        "operator_suppressed",
        "complaint",
        "operator_paused_discovery",
        "source_policy_blocked",
      ].includes(row.eventClass) ||
      row.reasonCode === "source_policy_block" ||
      /high.?risk|abuse|over.?contact/i.test(row.reasonCode ?? ""),
    )
    .slice(0, 12)
    .map<AdminActionItem>((row) => ({
      id: row.id,
      kind: row.eventClass,
      title:
        row.eventClass === "complaint"
          ? "Complaint requires review"
          : row.eventClass === "operator_paused_discovery"
            ? "Discovery is paused"
            : row.reasonCode === "source_policy_block"
              ? "Source policy block"
              : "Operator decision",
      detail: `${row.subjectType} · ${row.subjectId}`,
      reasonCode: row.reasonCode,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      createdAt: row.createdAt.toISOString(),
      revealable: !sourceForbidsRawReveal(row) && hasRevealableRawText(row.metadata),
    }));
  const actionItems = [
    ...candidateActionItems,
    ...auditActionItems.slice(0, Math.max(0, 12 - candidateActionItems.length)),
  ];
  const actionTotal = candidateTotal + auditActionItems.length;

  const health: AdminHealthCard[] = [
    {
      id: "source-research",
      title: "Source research",
      status: sourceFailures > 0 || sourceBlocks > 0 ? "yellow" : "green",
      count: sourceFailures + sourceBlocks,
      detail: `${sourceFailures} failed jobs · ${sourceBlocks} policy blocks`,
    },
    {
      id: "watch-runs",
      title: "Watch runs",
      status: watchFailures > 0 ? "yellow" : "green",
      count: watchFailures,
      detail: `${watchFailures} failed watch runs`,
    },
    {
      id: "leakage-tests",
      title: "Private-leakage tests",
      status: leakageFailures > 0 ? "red" : "green",
      count: leakageFailures,
      detail:
        leakageFailures > 0
          ? `${leakageFailures} leakage test failures`
          : "No leakage failures in the latest audit window",
    },
    {
      id: "discovery-pipeline",
      title: "Discovery candidate pipeline",
      status: complaintCount > 0 ? "yellow" : "green",
      count: eventCounts.invitation_candidate_scored ?? 0,
      detail: `${eventCounts.invitation_candidate_scored ?? 0} scored candidates · ${complaintCount} complaints`,
    },
  ];

  const metrics: AdminMetric[] = [
    {
      id: "source-policy-blocks",
      label: "Source-policy blocks",
      value: sourceBlocks,
      detail: "Blocked before collection, storage, or invite use",
    },
    {
      id: "suppressions",
      label: "Active suppression rows",
      value: suppressionRowsRaw.length,
      detail: "Global and per-user suppressions, raw identifiers hashed",
    },
    {
      id: "complaints",
      label: "Complaint metrics",
      value: complaintCount,
      detail: "Complaint events in latest audit window",
    },
    {
      id: "refusal-counts",
      label: "Refusal reason codes",
      value: reasonCount(auditRowsRaw),
      detail: "Codes only; anti-persona rule text has no admin surface",
    },
    {
      id: "economic-outcomes",
      label: "Economic outcomes",
      value: eventCounts.intro_approved ?? 0,
      detail: "Display-only signal for later pricing work",
      displayOnly: true,
    },
    {
      id: "willingness-to-pay",
      label: "Willingness to pay",
      value: "display-only",
      detail: "No commercial collection controls are present in this dashboard",
      displayOnly: true,
    },
  ];

  const auditRows = auditRowsRaw.map<AdminAuditRow>((row) => ({
    id: row.id,
    eventClass: row.eventClass,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    actorType: row.actorType,
    actorId: row.actorId,
    reasonCode: row.reasonCode,
    metadata: safeMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
    revealable: !sourceForbidsRawReveal(row) && hasRevealableRawText(row.metadata),
  }));

  const suppressionRows = suppressionRowsRaw.map<AdminSuppressionRow>((row) => ({
    id: row.id,
    identifierKind: row.identifierKind,
    scope: row.scope,
    scopeUserId: row.scopeUserId,
    reason: row.reason,
    source: row.source,
    expiresAt: iso(row.expiresAt),
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    generatedAt: now.toISOString(),
    actionRequired: {
      total: actionTotal,
      items: actionItems,
    },
    health,
    metrics,
    auditRows,
    suppressionRows,
    allClear: actionItems.length === 0 && health.every((card) => card.status !== "red"),
  };
}

function rawTextFromMetadata(
  metadata: unknown,
  requestedField?: string | null,
): { field: string; rawText: string } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  const fields = requestedField ? [requestedField] : RAW_FIELD_CANDIDATES;
  for (const field of fields) {
    if (isAntiPersonaField(field)) {
      throw new Error("anti_persona_text_has_no_admin_reveal_surface");
    }
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return { field, rawText: value };
    }
  }
  return null;
}

export async function revealAdminRawText(
  input: RevealAdminRawTextInput,
): Promise<RevealedAdminRawText> {
  const db = input.db ?? networkDb;
  const reason = nonEmpty(input.reason, "reason").slice(0, 240);
  const actorId = nonEmpty(input.actorId, "actorId");
  const [source] = await db
    .select()
    .from(networkSchema.networkAuditEvents)
    .where(eq(networkSchema.networkAuditEvents.id, input.auditEventId))
    .limit(1);
  if (!source) throw new Error("audit_event_not_found");
  if (sourceForbidsRawReveal(source)) {
    throw new Error("anti_persona_text_has_no_admin_reveal_surface");
  }

  const raw = rawTextFromMetadata(source.metadata, input.field);
  if (!raw) throw new Error("sealed_text_not_found");

  const audit = await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "operator_revealed_raw_text",
    subjectType: "admin_raw_reveal",
    subjectId: source.id,
    actorType: "admin",
    actorId,
    reasonCode: reason,
    metadata: {
      sourceEventClass: source.eventClass,
      sourceSubjectType: source.subjectType,
      sourceSubjectId: source.subjectId,
      field: raw.field,
    },
    now: input.now,
  });

  return {
    auditEventId: audit.id,
    sourceEventId: source.id,
    field: raw.field,
    rawText: raw.rawText,
    revealedBy: actorId,
    revealedAt: audit.createdAt.toISOString(),
    annotation: "Revealed — this view is audited",
  };
}

export async function runDryRunWatchReplay(
  input: DryRunWatchReplayInput,
): Promise<DryRunWatchReplayResult> {
  const watchId = nonEmpty(input.watchId, "watchId").slice(0, 200);
  const reason = nonEmpty(input.reason, "reason").slice(0, 240);
  const actorId = nonEmpty(input.actorId, "actorId");
  const now = input.now ?? new Date();
  const audit = await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "dry_run_replay",
    subjectType: "background_watch",
    subjectId: watchId,
    actorType: "admin",
    actorId,
    reasonCode: reason,
    metadata: {
      dryRun: true,
      zeroSideEffects: {
        emailsSent: 0,
        notificationsSent: 0,
        userVisibleWrites: 0,
      },
      label: "DRY RUN — no contact occurred",
    },
    now,
  });

  return {
    auditEventId: audit.id,
    watchId,
    label: "DRY RUN — no contact occurred",
    banner: "DRY RUN — no contact",
    assertions: {
      emailsSent: 0,
      notificationsSent: 0,
      userVisibleWrites: 0,
    },
    candidatesResolved: 0,
    completedAt: now.toISOString(),
  };
}
