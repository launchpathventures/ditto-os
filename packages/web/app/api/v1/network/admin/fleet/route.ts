/**
 * GET /api/v1/network/admin/fleet — Fleet status (admin-only).
 *
 * Returns all managed workspaces with status, version, serviceId, URL, and health.
 *
 * Provenance: Brief 090, Brief 100 (Railway migration), ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { getFleetStatus } = await import(
      "../../../../../../../../src/engine/workspace-provisioner"
    );

    const fleet = await getFleetStatus();

    return NextResponse.json({
      workspaces: fleet,
      total: fleet.length,
    });
  } catch (error) {
    console.error("[/api/v1/network/admin/fleet] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fleet status." },
      { status: 500 },
    );
  }
}
