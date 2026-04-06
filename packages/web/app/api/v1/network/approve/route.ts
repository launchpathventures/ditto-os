/**
 * POST /api/v1/network/approve — Approve a draft with optional edits (protected).
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
    const { draftId, edits } = body as { draftId?: string; edits?: string };

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required." },
        { status: 400 },
      );
    }

    // For MVP: record the approval. Full draft pipeline integration is a follow-up.
    // The edits field carries the diff of what the user changed (ADR-025 section 5c).
    return NextResponse.json({
      success: true,
      draftId,
      userId: auth.userId,
      hasEdits: !!edits,
    });
  } catch (error) {
    console.error("[/api/v1/network/approve] Error:", error);
    return NextResponse.json(
      { error: "Failed to approve draft." },
      { status: 500 },
    );
  }
}
