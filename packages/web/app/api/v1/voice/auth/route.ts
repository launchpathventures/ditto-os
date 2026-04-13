/**
 * POST /api/v1/voice/auth — Get ElevenLabs signed URL for voice call (Brief 142b)
 *
 * The frontend calls this before starting a voice call. We return a signed URL
 * that authenticates the browser to our ElevenLabs agent without exposing the API key.
 *
 * Also ensures the agent exists and is configured correctly.
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

    // Validate session
    const { loadSessionForVoice, evaluateVoiceConversation } = await import(
      "../../../../../../../src/engine/network-chat"
    );
    const llm = await import("../../../../../../../src/engine/llm");
    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }

    const session = await loadSessionForVoice(sessionId, voiceToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Ensure agent exists
    const { ensureAgent, getSignedUrl } = await import(
      "../../../../../../../src/engine/elevenlabs-agent"
    );

    // Run in parallel: agent setup + harness evaluation
    const [agentId, signedUrl, evaluation] = await Promise.all([
      ensureAgent(),
      ensureAgent().then(() => getSignedUrl()),
      evaluateVoiceConversation(session.sessionId),
    ]);

    console.log(`[voice/auth] agentId: ${agentId}, eval stage: ${evaluation?.stage || "none"}`);

    if (!agentId) {
      return NextResponse.json({ error: "Voice agent not configured" }, { status: 503 });
    }

    return NextResponse.json({
      ...(signedUrl ? { signedUrl } : {}),
      agentId,
      // Harness evaluation — used to set initial guidance before the call starts
      evaluation: evaluation ? {
        guidance: evaluation.guidance,
        stage: evaluation.stage,
        learned: evaluation.learned,
      } : null,
    });
  } catch (err) {
    console.error("[voice/auth] Error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
