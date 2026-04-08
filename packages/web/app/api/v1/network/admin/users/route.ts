/**
 * GET /api/v1/network/admin/users — Admin user list with quality health (Brief 108 AC1).
 *
 * Returns all network users with quality health indicators.
 *
 * Provenance: Brief 108.
 */

import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { getAdminDashboardData } = await import(
      "../../../../../../../../src/engine/admin-oversight"
    );

    const users = await getAdminDashboardData();

    return NextResponse.json({ users, total: users.length });
  } catch (error) {
    console.error("[/api/v1/network/admin/users] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user list." },
      { status: 500 },
    );
  }
}
