/**
 * POST /api/v1/voice/guidance — Synchronous harness evaluation for voice guidance
 *
 * Brief 180 hardening on top of Brief 150:
 *   - Server-side dedup: same (sessionId, transcriptHash) within a 5s window
 *     returns the cached evaluation (saves duplicate LLM calls when the client
 *     no longer throttles on push).
 *   - ETag: request header `If-None-Match` returns 304 when state has not moved.
 *   - `validateAndCleanResponse` is applied inside `evaluateVoiceCore`, not
 *     duplicated here — guidance reaching the client is already clean.
 *   - Telemetry: emits voice_events rows for observability.
 *
 * Evaluation-only — does NOT persist messages (that's handled by /transcript
 * and /session-updates).
 *
 * Returns guidance synchronously with a 6s timeout fallback to rule-based guidance.
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

    // Browsers occasionally fire POSTs with an empty body (CORS preflight
     // retries, abort-and-retry races). Parse defensively so those don't
    // surface as "Unexpected end of JSON input" in the server logs.
    let body: { sessionId?: string; voiceToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Missing body" }, { status: 400 });
    }
    const { sessionId, voiceToken } = body;

    if (!sessionId || !voiceToken) {
      return NextResponse.json({ error: "Missing sessionId or voiceToken" }, { status: 400 });
    }

    const { loadSessionForVoice, evaluateVoiceConversation, buildVoiceFallbackGuidance } = await import(
      "../../../../../../../src/engine/network-chat"
    );
    const { voiceDedup, hashTranscript, buildGuidanceETag } = await import(
      "../../../../../../../src/engine/voice-dedup"
    );
    const { recordVoiceEventSafe } = await import(
      "../../../../../../../src/engine/voice-telemetry"
    );

    const session = await loadSessionForVoice(sessionId, voiceToken);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Initialize LLM if needed
    const llm = await import("../../../../../../../src/engine/llm");
    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }

    // Dedup key: hash the last 10 turns with sessionId. Same transcript → same key.
    const lastN = session.messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const transcriptHash = hashTranscript({ sessionId, lastN });

    // ETag derived from session state. Returned on the response; client sends
    // it back via `If-None-Match` so unchanged state responds 304.
    const lastTurnIndex = session.messages.length;
    const etag = buildGuidanceETag({ sessionId, learned: session.learned, lastTurnIndex });

    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      recordVoiceEventSafe(sessionId, "push_304", { etag });
      return new NextResponse(null, {
        status: 304,
        headers: { etag, "cache-control": "no-cache" },
      });
    }

    // Dedup cache fast path
    const cached = voiceDedup.get(sessionId, transcriptHash);
    if (cached) {
      recordVoiceEventSafe(sessionId, "push_deduped", { transcriptHash });
      return NextResponse.json(
        {
          guidance: cached.guidance,
          stage: cached.stage,
          learned: cached.learned,
          validateRewrote: cached.validateRewrote ?? false,
        },
        { headers: { etag: cached.etag, "cache-control": "no-cache", "x-voice-cache-hit": "1" } },
      );
    }

    // Run harness evaluation with 6s timeout (client tool has ~10s before ElevenLabs times out).
    // runOrJoin shares the in-flight promise across concurrent callers so the
    // removed-client-throttle + 2s poll + user-final + agent-turn-end fan-out
    // does not fan out to parallel LLM calls (Brief 180 AC 12-14).
    //
    // The AbortController aborts the underlying provider fetch when the
    // 6s deadline fires — otherwise the evaluation keeps running in the
    // background, burning tokens on a response nobody is waiting for.
    let evaluation: Awaited<ReturnType<typeof evaluateVoiceConversation>> = null;
    let joined = false;
    try {
      const result = await voiceDedup.runOrJoin(sessionId, transcriptHash, async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const raced = await evaluateVoiceConversation(sessionId, controller.signal);
          if (!raced) return null;
          return { ...raced, etag };
        } catch (err) {
          if (controller.signal.aborted) return null;
          throw err;
        } finally {
          clearTimeout(timer);
        }
      });
      evaluation = result.value;
      joined = result.joined;
    } catch (err) {
      console.warn("[voice/guidance] Evaluation failed:", (err as Error).message);
    }

    if (evaluation) {
      console.log(`[voice/guidance] Stage: ${evaluation.stage}, guidance: ${evaluation.guidance.slice(0, 80)}...`);
      if (joined) {
        recordVoiceEventSafe(sessionId, "push_deduped", { transcriptHash, joined: true });
      } else if (evaluation.validateRewrote) {
        recordVoiceEventSafe(sessionId, "validate_rewrote", { stage: evaluation.stage });
      }
      const respEtag = evaluation.etag ?? etag;
      return NextResponse.json(
        {
          guidance: evaluation.guidance,
          stage: evaluation.stage,
          learned: evaluation.learned,
          validateRewrote: evaluation.validateRewrote ?? false,
        },
        {
          headers: {
            etag: respEtag,
            "cache-control": "no-cache",
            ...(joined ? { "x-voice-cache-hit": "1" } : {}),
          },
        },
      );
    }

    // Fallback: rule-based guidance when LLM is too slow or fails
    const fallback = buildVoiceFallbackGuidance(session.learned);
    console.log(`[voice/guidance] Using fallback: ${fallback}`);
    return NextResponse.json(
      {
        guidance: fallback,
        stage: "gathering",
        learned: session.learned || {},
        validateRewrote: false,
      },
      { headers: { etag, "cache-control": "no-cache" } },
    );
  } catch (err) {
    console.error("[voice/guidance] Error:", (err as Error).message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
