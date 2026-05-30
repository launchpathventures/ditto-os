/**
 * POST /api/v1/network/admin/superconnector/suppress (Brief 284)
 *
 * Suppress a claim-invite candidate. Writes the canonical
 * `operator_suppressed` audit event against the candidate id, and — when
 * the operator also provides an identifier (email/domain) — pushes that
 * identifier into the network suppression list via Brief 283's
 * `recordNetworkSuppression`. The candidate row itself lives in Brief 279;
 * this scaffold owns the suppression hook.
 *
 * Body: {
 *   candidateId: string,
 *   reason: string,
 *   suppressionIdentifier?: { identifier: string, identifierKind: NetworkSuppressionIdentifierKind, scope?: NetworkSuppressionScope, scopeUserId?: string },
 *   notes?: string,
 * }
 *
 * Constraints:
 *   - Admin Bearer token required.
 *   - Caller `stepRunId` (incl. falsy) → HTTP 400 (Insight-232/211).
 *   - Structured `reason` is required.
 *   - Server mints the wrapper run.
 *   - `recordNetworkSuppression` is reused — never duplicate the hash/normalize
 *     logic locally.
 */

import { NextResponse } from "next/server";
import { isAdminDecisionReason } from "@/lib/network-admin-reveal-reasons";
import { workspaceModeAdminNotFound } from "@/lib/network-admin-superconnector";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import {
  recordNetworkSuppression,
  type NetworkSuppressionIdentifierKind,
  type NetworkSuppressionScope,
} from "../../../../../../../../../src/engine/network-suppression";
import { suppressInvitationCandidate } from "../../../../../../../../../src/engine/claim-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDENTIFIER_KINDS = new Set<NetworkSuppressionIdentifierKind>([
  "email",
  "domain",
  "person-ref",
  "source",
  "segment",
]);
const SCOPES = new Set<NetworkSuppressionScope>(["global", "per-user"]);

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

interface ParsedSuppression {
  identifier: string;
  identifierKind: NetworkSuppressionIdentifierKind;
  scope: NetworkSuppressionScope;
  scopeUserId: string | null;
}

function parseSuppression(raw: unknown): ParsedSuppression | { error: string } | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "suppression_invalid" };
  }
  const obj = raw as Record<string, unknown>;
  const identifier = stringOrNull(obj.identifier, 320);
  if (!identifier) return { error: "suppression_identifier_required" };
  const identifierKindRaw = stringOrNull(obj.identifierKind, 40);
  if (!identifierKindRaw || !IDENTIFIER_KINDS.has(identifierKindRaw as NetworkSuppressionIdentifierKind)) {
    return { error: "suppression_identifier_kind_invalid" };
  }
  const scopeRaw = stringOrNull(obj.scope, 40) ?? "global";
  if (!SCOPES.has(scopeRaw as NetworkSuppressionScope)) {
    return { error: "suppression_scope_invalid" };
  }
  const scope = scopeRaw as NetworkSuppressionScope;
  const scopeUserId =
    scope === "per-user" ? stringOrNull(obj.scopeUserId, 200) : null;
  if (scope === "per-user" && !scopeUserId) {
    return { error: "suppression_scope_user_id_required" };
  }
  return {
    identifier,
    identifierKind: identifierKindRaw as NetworkSuppressionIdentifierKind,
    scope,
    scopeUserId,
  };
}

export async function POST(request: Request) {
  const workspaceBlocked = workspaceModeAdminNotFound();
  if (workspaceBlocked) return workspaceBlocked;

  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json(
        { error: "step_run_bypass_rejected" },
        { status: 400 },
      );
    }

    const candidateId = stringOrNull(body.candidateId, 200);
    if (!candidateId) {
      return NextResponse.json(
        { error: "candidate_id_required" },
        { status: 400 },
      );
    }
    const reason = stringOrNull(body.reason, 1_000);
    if (!reason) {
      return NextResponse.json(
        { error: "reason_required" },
        { status: 400 },
      );
    }
    if (!isAdminDecisionReason(reason)) {
      return NextResponse.json(
        { error: "structured_reason_required" },
        { status: 400 },
      );
    }
    const notes = stringOrNull(body.notes, 2_000);

    const suppression = parseSuppression(body.suppressionIdentifier);
    if (suppression && "error" in suppression) {
      return NextResponse.json({ error: suppression.error }, { status: 400 });
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "admin-superconnector-suppress",
      actorId: auth.userId,
    });

    let suppressionResult: { id: string; created: boolean } | null = null;
    if (suppression) {
      const result = await recordNetworkSuppression({
        stepRunId,
        identifier: suppression.identifier,
        identifierKind: suppression.identifierKind,
        scope: suppression.scope,
        scopeUserId: suppression.scopeUserId,
        reason: "operator-suppressed",
        source: `admin-superconnector:${auth.userId}`,
        actorId: auth.userId,
      });
      suppressionResult = { id: result.row.id, created: result.created };
    }

    const suppressed = await suppressInvitationCandidate({
      stepRunId,
      actorId: auth.userId,
      candidateId,
      reason,
      notes,
    });

    return NextResponse.json({
      ok: true,
      auditEventId: suppressed.auditEventId,
      suppressedAt: suppressed.suppressedAt,
      suppression: suppressionResult,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/suppress POST] Error:",
      error,
    );
    return NextResponse.json(
      { error: "superconnector_suppress_failed" },
      { status: 500 },
    );
  }
}
