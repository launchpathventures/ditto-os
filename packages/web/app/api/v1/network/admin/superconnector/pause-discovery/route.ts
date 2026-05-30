/**
 * POST /api/v1/network/admin/superconnector/pause-discovery (Brief 284, R-Q12)
 *
 * Network-wide kill switch for outbound discovery. Latest event wins —
 * downstream invite/discovery pipelines must check
 * `isOutboundDiscoveryPaused()` before doing any outbound work.
 *
 * Body:
 *   { paused: boolean, reason: string }
 *
 * Constraints:
 *   - Admin Bearer token required (`authenticateAdminRequest`).
 *   - Caller `stepRunId` (incl. falsy) → HTTP 400 (Insight-232/211).
 *   - Structured `reason` is required.
 *   - Server mints the wrapper run via `createNetworkLaneStepRun`.
 *   - `setOutboundDiscoveryPaused` writes the canonical audit event.
 */

import { NextResponse } from "next/server";
import { isAdminPauseReason } from "@/lib/network-admin-reveal-reasons";
import { workspaceModeAdminNotFound } from "@/lib/network-admin-superconnector";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import {
  getOutboundDiscoveryPauseState,
  setOutboundDiscoveryPaused,
} from "../../../../../../../../../src/engine/network-discovery-runtime";

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

export async function GET(request: Request) {
  const workspaceBlocked = workspaceModeAdminNotFound();
  if (workspaceBlocked) return workspaceBlocked;

  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;
  try {
    const state = await getOutboundDiscoveryPauseState();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/pause-discovery GET] Error:",
      error,
    );
    return NextResponse.json(
      { error: "discovery_pause_state_failed" },
      { status: 500 },
    );
  }
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

    if (typeof body.paused !== "boolean") {
      return NextResponse.json(
        { error: "paused_boolean_required" },
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
    if (!isAdminPauseReason(reason)) {
      return NextResponse.json(
        { error: "structured_reason_required" },
        { status: 400 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: `admin-superconnector-pause-discovery-${body.paused ? "pause" : "resume"}`,
      actorId: auth.userId,
    });

    const state = await setOutboundDiscoveryPaused({
      stepRunId,
      paused: body.paused,
      reason,
      actorId: auth.userId,
    });

    return NextResponse.json({ ok: true, state });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/pause-discovery POST] Error:",
      error,
    );
    return NextResponse.json(
      { error: "discovery_pause_failed" },
      { status: 500 },
    );
  }
}
