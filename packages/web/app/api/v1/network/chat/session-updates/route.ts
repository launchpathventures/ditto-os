/**
 * GET /api/v1/network/chat/session-updates — Poll for live session state.
 * POST /api/v1/network/chat/session-updates — Add text context during voice call.
 *
 * Used by the frontend during an active voice call to show live conversation
 * updates and learned-context changes as the voice agent progresses.
 *
 * Auth: sessionId + voiceToken (same as voice endpoint).
 */

import { NextResponse } from "next/server";
import type { VoiceEvaluation } from "../../../../../../../../src/engine/network-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache latest evaluation per session — populated async, served on next poll
const voiceEvalCache = new Map<string, VoiceEvaluation>();

export async function GET(request: Request) {
  try {
    // Load env from root .env
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const voiceToken = searchParams.get("voiceToken");
    const after = searchParams.get("after"); // ISO timestamp — skip if nothing changed

    if (!sessionId || !voiceToken) {
      return NextResponse.json({ error: "Missing sessionId or voiceToken" }, { status: 400 });
    }

    const { loadSessionForVoice } = await import("../../../../../../../../src/engine/network-chat");

    const session = await loadSessionForVoice(sessionId, voiceToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Filter to only user + assistant messages (skip internal markers)
    const messages = session.messages
      .filter((m) => !m.content.startsWith("["))
      .map((m) => ({ role: m.role, text: m.content }));

    // Return current state — guidance is populated async by evaluateVoiceConversation
    // The frontend polls this and pushes guidance to the voice agent
    const { evaluateVoiceConversation } = await import(
      "../../../../../../../../src/engine/network-chat"
    );

    // Run evaluation in parallel — don't block the response
    // Store result in a module-level cache keyed by sessionId
    const evalResult = voiceEvalCache.get(sessionId) || null;

    // Kick off fresh evaluation async (result available on next poll)
    const llm = await import("../../../../../../../../src/engine/llm");
    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }
    evaluateVoiceConversation(sessionId).then((result) => {
      if (result) voiceEvalCache.set(sessionId, result);
    }).catch(() => {});

    return NextResponse.json({
      messages,
      learned: session.learned,
      messageCount: session.messageCount,
      stage: evalResult?.stage || "gathering",
      guidance: evalResult?.guidance || "",
    });
  } catch (err) {
    console.error("[session-updates] Error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST — Add text context to an active voice session.
 * The message is appended to the session so the voice agent sees it on the next turn.
 * Tagged with [TEXT_CONTEXT] so the voice agent knows it came from the text input.
 */
export async function POST(request: Request) {
  try {
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }

    const body = await request.json();
    const { sessionId, voiceToken, message } = body as {
      sessionId?: string;
      voiceToken?: string;
      message?: string;
    };

    if (!sessionId || !voiceToken || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { loadSessionForVoice, appendTextContext, extractAndMergeLearned } = await import(
      "../../../../../../../../src/engine/network-chat"
    );

    const session = await loadSessionForVoice(sessionId, voiceToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await appendTextContext(session, message);

    // Fire-and-forget: evaluate conversation in parallel via Haiku
    const { evaluateVoiceConversation } = await import(
      "../../../../../../../../src/engine/network-chat"
    );
    const llm = await import("../../../../../../../../src/engine/llm");
    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }
    evaluateVoiceConversation(session.sessionId).then((result) => {
      if (result) voiceEvalCache.set(session.sessionId, result);
    }).catch((err) => {
      console.warn("[session-updates] Evaluation failed:", (err as Error).message);
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[session-updates] POST error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
