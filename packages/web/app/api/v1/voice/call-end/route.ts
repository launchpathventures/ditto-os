/**
 * POST /api/v1/voice/call-end — Handle end of a voice call (Brief 142b)
 *
 * Called by the frontend when the ElevenLabs conversation disconnects.
 * Records a funnel event. Interaction recording is deferred to avoid
 * FOREIGN KEY issues when the person doesn't exist in the DB yet.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Load env from root .env
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }

    const body = await request.json();
    const { sessionId, voiceToken } = body as {
      sessionId?: string;
      voiceToken?: string;
    };

    if (!sessionId || !voiceToken) {
      return NextResponse.json({ error: "Missing sessionId or voiceToken" }, { status: 400 });
    }

    const { loadSessionForVoice, recordFunnelEvent } = await import(
      "../../../../../../../src/engine/network-chat"
    );

    const session = await loadSessionForVoice(sessionId, voiceToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Record call_completed funnel event
    await recordFunnelEvent(sessionId, "call_completed", session.context, {
      channel: "voice",
      provider: "elevenlabs",
    });

    console.log(`[voice/call-end] Call ended for session ${sessionId.slice(0, 8)}...`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[voice/call-end] Error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
