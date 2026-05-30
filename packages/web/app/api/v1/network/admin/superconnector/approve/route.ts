/**
 * POST /api/v1/network/admin/superconnector/approve (Brief 284)
 *
 * Approve a claim-invite candidate for outbound send. The candidate row
 * itself lives in Brief 279; this scaffold writes the canonical audit
 * event so the decision is recorded the moment 279 lands.
 *
 * Body: { candidateId: string, reason: string, notes?: string, sendNow?: boolean }
 *
 * Constraints:
 *   - Admin Bearer token required.
 *   - Caller `stepRunId` (incl. falsy) → HTTP 400 (Insight-232/211).
 *   - Structured `reason` is required.
 *   - Server mints the wrapper run; audit event uses `eventClass:
 *     "operator_approved"`, `subjectType: "claim_invite"`.
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
import { isOutboundDiscoveryPaused } from "../../../../../../../../../src/engine/network-discovery-runtime";
import {
  approveInvitationCandidate,
  composeClaimInvite,
  sendClaimInvite,
} from "../../../../../../../../../src/engine/claim-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
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

    if (body.sendNow === true && await isOutboundDiscoveryPaused()) {
      return NextResponse.json(
        { error: "outbound_discovery_paused" },
        { status: 409 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "admin-superconnector-approve",
      actorId: auth.userId,
    });

    const approved = await approveInvitationCandidate({
      stepRunId,
      actorId: auth.userId,
      candidateId,
      reason,
      notes,
    });

    let sendResult: Awaited<ReturnType<typeof sendClaimInvite>> | null = null;
    if (body.sendNow === true) {
      await composeClaimInvite({ stepRunId, candidateId, actorId: auth.userId });
      sendResult = await sendClaimInvite({ stepRunId, candidateId, actorId: auth.userId });
    }

    return NextResponse.json({
      ok: true,
      auditEventId: approved.auditEventId,
      approvedAt: approved.approvedAt,
      sent: Boolean(sendResult),
      sendResult,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/approve POST] Error:",
      error,
    );
    return NextResponse.json(
      { error: "superconnector_approve_failed" },
      { status: 500 },
    );
  }
}
