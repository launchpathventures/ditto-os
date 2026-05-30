/**
 * Network Privacy Scrubber (Brief 282)
 *
 * Pure, central scrubber for Network public/search/share/email/admin-preview
 * surfaces. It removes private, hidden, and unapproved on-request claims and
 * nulls `NetworkProfileCardBlock.antiPersonaMd` outside owner context.
 */

import type { NetworkProfileCardBlock } from "./content-blocks";

export const NETWORK_PRIVACY_SURFACES = [
  "public-profile",
  "share",
  "search-result",
  "proposal-email",
  "intro-email",
  "watch-digest",
  "claim-invite",
  "discovery-admin-preview",
] as const;

export type NetworkPrivacySurface =
  (typeof NETWORK_PRIVACY_SURFACES)[number];

export type NetworkPrivacyViewerType =
  | "owner"
  | "approved-viewer"
  | "requester"
  | "visitor"
  | "admin"
  | "system";

export interface NetworkPrivacyViewerContext {
  viewerType: NetworkPrivacyViewerType;
  viewerId?: string | null;
  ownerId?: string | null;
  approvedClaimIds?: string[];
  allowOnRequest?: boolean;
}

export interface ScrubDecision {
  surface: NetworkPrivacySurface;
  viewerType: NetworkPrivacyViewerType;
  withheldTotal: number;
  withheldByReason: {
    private: number;
    hidden: number;
    onRequest: number;
    off: number;
    sensitiveField: number;
    antiPersona: number;
  };
  approvedOnRequest: number;
  redactedStringOccurrences: number;
}

export interface ScrubForSurfaceOptions {
  surface: NetworkPrivacySurface;
  viewerContext: NetworkPrivacyViewerContext;
}

export interface ScrubForSurfaceResult<T> {
  payload: T | null;
  scrubDecision: ScrubDecision;
}

type WithheldReason =
  | "private"
  | "hidden"
  | "onRequest"
  | "off"
  | "sensitiveField"
  | "antiPersona";

type MutableScrubDecision = ScrubDecision;

const SKIP = Symbol("network-privacy-skip");

const SURFACE_SET = new Set<string>(NETWORK_PRIVACY_SURFACES);

const CONTENT_KEYS = new Set([
  "claimText",
  "factMd",
  "text",
  "value",
  "summary",
  "snippet",
  "evidenceSnippet",
  "sourceSnippet",
  "narrativeMd",
  "rationaleMd",
  "description",
  "privateNotes",
  "antiPersonaMd",
]);

const SENSITIVE_FIELD_KEYS = new Set([
  "privateNotes",
  "budgetPrivate",
  "privateValue",
  "internalNotes",
  "rawSourceText",
  "sourceRawText",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOwner(ctx: NetworkPrivacyViewerContext): boolean {
  return ctx.viewerType === "owner";
}

function normalizeVisibility(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function recordIds(record: Record<string, unknown>): string[] {
  return [
    record.id,
    record.claimId,
    record.kbFactId,
    record.factId,
    record.sourceId,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function isApprovedOnRequest(
  record: Record<string, unknown>,
  ctx: NetworkPrivacyViewerContext,
): boolean {
  if (isOwner(ctx) || ctx.allowOnRequest) return true;
  const approved = new Set(ctx.approvedClaimIds ?? []);
  return recordIds(record).some((id) => approved.has(id));
}

function withheldReasonForRecord(
  record: Record<string, unknown>,
  ctx: NetworkPrivacyViewerContext,
): WithheldReason | null {
  if (isOwner(ctx)) return null;
  const visibility = normalizeVisibility(record.visibility);
  if (visibility === "private") return "private";
  if (visibility === "hidden") return "hidden";
  if (visibility === "off") return "off";
  if (visibility === "on-request" && !isApprovedOnRequest(record, ctx)) {
    return "onRequest";
  }
  return null;
}

function collectContentStrings(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectContentStrings(item, out);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, inner] of Object.entries(value)) {
    if (typeof inner === "string" && CONTENT_KEYS.has(key) && inner.trim()) {
      out.add(inner.trim());
    } else if (Array.isArray(inner) || isRecord(inner)) {
      collectContentStrings(inner, out);
    }
  }
}

function collectSensitiveValues(
  value: unknown,
  ctx: NetworkPrivacyViewerContext,
  out: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveValues(item, ctx, out);
    return;
  }
  if (!isRecord(value)) return;

  if (withheldReasonForRecord(value, ctx)) {
    collectContentStrings(value, out);
  }

  for (const [key, inner] of Object.entries(value)) {
    if (
      !isOwner(ctx) &&
      (key === "antiPersonaMd" || SENSITIVE_FIELD_KEYS.has(key)) &&
      typeof inner === "string" &&
      inner.trim()
    ) {
      out.add(inner.trim());
    }
    collectSensitiveValues(inner, ctx, out);
  }
}

function emptyDecision(
  surface: NetworkPrivacySurface,
  ctx: NetworkPrivacyViewerContext,
): MutableScrubDecision {
  return {
    surface,
    viewerType: ctx.viewerType,
    withheldTotal: 0,
    withheldByReason: {
      private: 0,
      hidden: 0,
      onRequest: 0,
      off: 0,
      sensitiveField: 0,
      antiPersona: 0,
    },
    approvedOnRequest: 0,
    redactedStringOccurrences: 0,
  };
}

function countWithheld(decision: MutableScrubDecision, reason: WithheldReason) {
  decision.withheldTotal += 1;
  decision.withheldByReason[reason] += 1;
}

function redactKnownValues(
  text: string,
  sensitiveValues: Set<string>,
  decision: MutableScrubDecision,
): string {
  let next = text;
  for (const value of sensitiveValues) {
    if (!value || !next.toLowerCase().includes(value.toLowerCase())) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    next = next.replace(re, () => {
      decision.redactedStringOccurrences += 1;
      return "[private]";
    });
  }
  return next;
}

function walk(
  value: unknown,
  ctx: NetworkPrivacyViewerContext,
  sensitiveValues: Set<string>,
  decision: MutableScrubDecision,
): unknown | typeof SKIP {
  if (typeof value === "string") {
    return redactKnownValues(value, sensitiveValues, decision);
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const scrubbed = walk(item, ctx, sensitiveValues, decision);
      if (scrubbed !== SKIP) out.push(scrubbed);
    }
    return out;
  }
  if (!isRecord(value)) return value;

  const recordReason = withheldReasonForRecord(value, ctx);
  if (recordReason) {
    countWithheld(decision, recordReason);
    return SKIP;
  }
  if (
    !isOwner(ctx) &&
    normalizeVisibility(value.visibility) === "on-request" &&
    isApprovedOnRequest(value, ctx)
  ) {
    decision.approvedOnRequest += 1;
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key === "antiPersonaMd" && !isOwner(ctx)) {
      if (inner != null && inner !== "") {
        countWithheld(decision, "antiPersona");
      }
      out[key] = null;
      continue;
    }
    if (SENSITIVE_FIELD_KEYS.has(key) && !isOwner(ctx)) {
      if (inner != null && inner !== "") {
        countWithheld(decision, "sensitiveField");
      }
      out[key] = null;
      continue;
    }
    const scrubbed = walk(inner, ctx, sensitiveValues, decision);
    if (scrubbed !== SKIP) out[key] = scrubbed;
  }
  return out;
}

export function scrubNetworkProfileCardForNonOwner(
  card: NetworkProfileCardBlock,
): NetworkProfileCardBlock {
  return { ...card, antiPersonaMd: null };
}

export function scrubForSurface<T>(
  payload: T,
  options: ScrubForSurfaceOptions,
): ScrubForSurfaceResult<T> {
  if (!SURFACE_SET.has(options.surface)) {
    throw new Error(`Unknown Network privacy surface: ${options.surface}`);
  }

  const sensitiveValues = new Set<string>();
  collectSensitiveValues(payload, options.viewerContext, sensitiveValues);
  const scrubDecision = emptyDecision(options.surface, options.viewerContext);
  const scrubbed = walk(
    payload,
    options.viewerContext,
    sensitiveValues,
    scrubDecision,
  );

  return {
    payload: scrubbed === SKIP ? null : (scrubbed as T),
    scrubDecision,
  };
}
