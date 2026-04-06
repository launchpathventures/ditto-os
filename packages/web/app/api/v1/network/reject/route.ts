/**
 * POST /api/v1/network/reject — Reject a draft with reason (protected).
 *
 * Provenance: Brief 088, ADR-025 (feedback flow from workspace to network).
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
    const { draftId, reason } = body as { draftId?: string; reason?: string };

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required." },
        { status: 400 },
      );
    }

    if (!reason) {
      return NextResponse.json(
        { error: "reason is required." },
        { status: 400 },
      );
    }

    // For MVP: record the rejection. Full feedback pipeline integration is a follow-up.
    return NextResponse.json({
      success: true,
      draftId,
      userId: auth.userId,
      reason,
    });
  } catch (error) {
    console.error("[/api/v1/network/reject] Error:", error);
    return NextResponse.json(
      { error: "Failed to reject draft." },
      { status: 500 },
    );
  }
}
