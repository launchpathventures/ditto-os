/**
 * POST /api/v1/network/plan — Submit a sales or connection plan (protected).
 *
 * Provenance: Brief 088, ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = await request.json();
    const { mode } = body as { mode?: string };

    if (mode === "selling") {
      const { handleCreateSalesPlan } = await import(
        "../../../../../../../src/engine/self-tools/network-tools"
      );
      const result = await handleCreateSalesPlan(body);
      return NextResponse.json(result);
    }

    if (mode === "connecting") {
      const { handleCreateConnectionPlan } = await import(
        "../../../../../../../src/engine/self-tools/network-tools"
      );
      const result = await handleCreateConnectionPlan(body);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid mode. Use 'selling' or 'connecting'." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[/api/v1/network/plan] Error:", error);
    return NextResponse.json(
      { error: "Failed to create plan." },
      { status: 500 },
    );
  }
}
