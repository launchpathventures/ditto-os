/**
 * GET /api/v1/network/admin/superconnector/health (Brief 286)
 *
 * Bounded-visibility admin health read model. Returns aggregate counts,
 * reason codes, safe audit metadata, suppression summaries, and health states.
 * Raw private text is sealed by default and only available through the audited
 * reveal route.
 */

import { NextResponse } from "next/server";
import { workspaceModeAdminNotFound } from "@/lib/network-admin-superconnector";
import { authenticateAdminRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { buildNetworkHealthDashboardData } from "../../../../../../../../../src/engine/network-admin-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspaceBlocked = workspaceModeAdminNotFound();
  if (workspaceBlocked) return workspaceBlocked;

  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const data = await buildNetworkHealthDashboardData();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error(
      "[/api/v1/network/admin/superconnector/health GET] Error:",
      error,
    );
    return NextResponse.json(
      { error: "superconnector_health_failed" },
      { status: 500 },
    );
  }
}
