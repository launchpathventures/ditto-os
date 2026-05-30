/**
 * POST /api/v1/network/admin/superconnector/reveal (Brief 286)
 *
 * The single sanctioned scrubber bypass for the admin dashboard. Requires
 * admin auth + structured reason + server-minted wrapper run, writes a reveal
 * audit row, then returns raw private text annotated for inline rendering.
 * Anti-persona text is never revealable through this route.
 */

import { NextResponse } from "next/server";
import { isAdminRevealReason } from "@/lib/network-admin-reveal-reasons";
import { workspaceModeAdminNotFound } from "@/lib/network-admin-superconnector";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import { checkRateLimit } from "../../../../../../../../../src/engine/network-abuse-controls";
import { revealAdminRawText } from "../../../../../../../../../src/engine/network-admin-health";

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

    const auditEventId = stringOrNull(body.auditEventId, 200);
    const reason = stringOrNull(body.reason, 1_000);
    const field = stringOrNull(body.field, 120);
    if (!auditEventId) {
      return NextResponse.json(
        { error: "audit_event_id_required" },
        { status: 400 },
      );
    }
    if (!reason) {
      return NextResponse.json({ error: "reason_required" }, { status: 400 });
    }
    if (!isAdminRevealReason(reason)) {
      return NextResponse.json(
        { error: "structured_reason_required" },
        { status: 400 },
      );
    }

    const limit = await checkRateLimit({
      limitName: "admin-raw-reveal",
      actor: { kind: "user", id: auth.userId },
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: limit.retryAfterSec },
        {
          status: 429,
          headers: { "retry-after": String(limit.retryAfterSec) },
        },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "admin-superconnector-raw-reveal",
      actorId: auth.userId,
    });
    const revealed = await revealAdminRawText({
      stepRunId,
      auditEventId,
      field,
      reason,
      actorId: auth.userId,
    });

    return NextResponse.json({ ok: true, revealed });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    const message = error instanceof Error ? error.message : String(error);
    if (
      /anti_persona_text_has_no_admin_reveal_surface|sealed_text_not_found|audit_event_not_found/.test(
        message,
      )
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error(
      "[/api/v1/network/admin/superconnector/reveal POST] Error:",
      error,
    );
    return NextResponse.json(
      { error: "superconnector_reveal_failed" },
      { status: 500 },
    );
  }
}
