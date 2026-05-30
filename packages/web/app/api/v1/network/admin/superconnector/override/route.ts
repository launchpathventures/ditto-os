/**
 * POST /api/v1/network/admin/superconnector/override (Brief 286)
 *
 * Generic audited admin override hook for closeout surfaces that need a
 * structured "continue despite warning" decision. It does not perform the
 * downstream action itself; it records the operator decision under the existing
 * admin auth + reason + wrapper-run contract.
 */

import { NextResponse } from "next/server";
import { isAdminOverrideReason } from "@/lib/network-admin-reveal-reasons";
import { workspaceModeAdminNotFound } from "@/lib/network-admin-superconnector";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import { writeNetworkAuditEvent } from "../../../../../../../../../src/engine/network-audit";

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
    const subjectType = stringOrNull(body.subjectType, 120);
    const subjectId = stringOrNull(body.subjectId, 200);
    const reason = stringOrNull(body.reason, 1_000);
    if (!subjectType) {
      return NextResponse.json({ error: "subject_type_required" }, { status: 400 });
    }
    if (!subjectId) {
      return NextResponse.json({ error: "subject_id_required" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "reason_required" }, { status: 400 });
    }
    if (!isAdminOverrideReason(reason)) {
      return NextResponse.json(
        { error: "structured_reason_required" },
        { status: 400 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "admin-superconnector-override",
      actorId: auth.userId,
    });
    const row = await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "admin_override",
      subjectType,
      subjectId,
      actorType: "admin",
      actorId: auth.userId,
      reasonCode: reason.slice(0, 240),
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : null,
    });

    return NextResponse.json({ ok: true, auditEventId: row.id });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/override POST] Error:",
      error,
    );
    return NextResponse.json(
      { error: "superconnector_override_failed" },
      { status: 500 },
    );
  }
}
