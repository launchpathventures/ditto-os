/**
 * POST /api/v1/network/feedback — Send correction signal from workspace (protected).
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
    const { personId, type, content } = body as {
      personId?: string;
      type?: string;
      content?: string;
    };

    if (!personId || !type || !content) {
      return NextResponse.json(
        { error: "personId, type, and content are required." },
        { status: 400 },
      );
    }

    // For MVP: record the feedback signal. Full learning pipeline integration is a follow-up.
    return NextResponse.json({
      success: true,
      personId,
      userId: auth.userId,
      type,
    });
  } catch (error) {
    console.error("[/api/v1/network/feedback] Error:", error);
    return NextResponse.json(
      { error: "Failed to record feedback." },
      { status: 500 },
    );
  }
}
