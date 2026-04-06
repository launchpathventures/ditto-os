/**
 * GET /api/v1/network/people — List user's connections and people (protected).
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
    const { listPeople } = await import(
      "../../../../../../../src/engine/people"
    );

    const people = await listPeople(auth.userId);
    return NextResponse.json({ people });
  } catch (error) {
    console.error("[/api/v1/network/people] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch people." },
      { status: 500 },
    );
  }
}
