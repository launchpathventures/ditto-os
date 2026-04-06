/**
 * GET /api/v1/network/seed — Export user model for workspace provisioning (protected).
 * Returns JSON matching the seed schema (Brief 087).
 *
 * Provenance: Brief 089, ADR-025 section 6.
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const { exportSeed } = await import(
      "../../../../../../../src/engine/network-seed"
    );

    const seed = await exportSeed(auth.userId);
    return NextResponse.json(seed);
  } catch (error) {
    console.error("[/api/v1/network/seed] Error:", error);
    return NextResponse.json(
      { error: "Failed to export seed." },
      { status: 500 },
    );
  }
}
