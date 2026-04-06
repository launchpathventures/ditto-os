/**
 * GET /api/v1/network/status — Network briefing data (protected).
 * Returns connections, pipeline, cooling connections for the authenticated user.
 *
 * Provenance: Brief 088, ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { handleNetworkStatus } = await import(
      "../../../../../../../src/engine/self-tools/network-tools"
    );

    const result = await handleNetworkStatus({ userId: auth.userId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/v1/network/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch network status." },
      { status: 500 },
    );
  }
}
