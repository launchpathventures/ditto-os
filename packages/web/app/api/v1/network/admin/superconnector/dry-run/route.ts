/**
 * POST /api/v1/network/admin/superconnector/dry-run (Brief 286)
 *
 * Operator-invoked Background Watch replay that contacts no one and writes
 * nothing user-visible. The only durable write is the audit row documenting the
 * dry run itself.
 */

import { NextResponse } from "next/server";
import {
  isAdminDryRunReason,
} from "@/lib/network-admin-reveal-reasons";
import { workspaceModeAdminNotFound } from "@/lib/network-admin-superconnector";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import {
  checkRateLimit,
} from "../../../../../../../../../src/engine/network-abuse-controls";
import { runDryRunWatchReplay } from "../../../../../../../../../src/engine/network-admin-health";

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

    const watchId = stringOrNull(body.watchId, 200);
    const reason = stringOrNull(body.reason, 1_000);
    if (!watchId) {
      return NextResponse.json({ error: "watch_id_required" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "reason_required" }, { status: 400 });
    }
    if (!isAdminDryRunReason(reason)) {
      return NextResponse.json(
        { error: "structured_reason_required" },
        { status: 400 },
      );
    }

    const limit = await checkRateLimit({
      limitName: "admin-dry-run-replay",
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
      route: "admin-superconnector-dry-run-replay",
      actorId: auth.userId,
    });
    const result = await runDryRunWatchReplay({
      stepRunId,
      watchId,
      reason,
      actorId: auth.userId,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/dry-run POST] Error:",
      error,
    );
    return NextResponse.json(
      { error: "superconnector_dry_run_failed" },
      { status: 500 },
    );
  }
}
