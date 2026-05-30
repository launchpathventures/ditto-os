/**
 * Ditto Web — Front Door Chat Streaming Route
 *
 * POST /api/v1/network/chat/stream — SSE streaming endpoint for the front door.
 * Same input as /api/v1/network/chat, but streams text deltas via Server-Sent Events
 * for a real-time typing feel.
 *
 * Events:
 *   data: {"type":"session","sessionId":"..."}
 *   data: {"type":"text-delta","text":"..."}
 *   data: {"type":"metadata","requestEmail":false,"done":false,"suggestions":[],...}
 *   data: {"type":"done"}
 *
 * Provenance: Brief 093, llm-stream.ts pattern.
 */

import { NextResponse } from "next/server";
import { checkRateLimit } from "../../../../../../../../src/engine/network-abuse-controls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eagerly dispatch the heavy engine imports at module load. In dev these
// otherwise compile lazily on the first POST, adding 5-10s of JIT cost to
// the visitor's first chat turn. Awaited again later — the second resolve
// hits the warm module cache instantly. In production this is a no-op
// (modules are pre-bundled).
const networkChatModulePromise = import(
  "../../../../../../../../src/engine/network-chat"
);
const llmModulePromise = import("../../../../../../../../src/engine/llm");
const turnstileModulePromise = import(
  "../../../../../../../../src/engine/turnstile"
);
const dbModulePromise = import("../../../../../../../../src/db");
// Surface unhandled rejections silently — we'll re-await below where it
// matters, and an unawaited promise is intentional here.
networkChatModulePromise.catch(() => {});
llmModulePromise.catch(() => {});
turnstileModulePromise.catch(() => {});
dbModulePromise.catch(() => {});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, sessionId, context, returningEmail, funnelMetadata, visitorName, turnstileToken, personaId, promptMode, actionPayload } = body as {
      message?: string;
      sessionId?: string | null;
      context?: string;
      returningEmail?: string;
      funnelMetadata?: Record<string, unknown>;
      visitorName?: string;
      turnstileToken?: string;
      personaId?: string;
      promptMode?: string;
      actionPayload?: Record<string, unknown>;
    };

    // Brief 152: intro mode sends an empty string (the card just wants the LLM
    // to produce a greeting — there's no user message yet). Everything else
    // requires a real message.
    const isIntroRequest = promptMode === "intro";
    if (!isIntroRequest && (!message || typeof message !== "string" || message.trim().length === 0)) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 },
      );
    }
    // Validate persona + mode (accept only known values; silently drop others).
    const validPersonaIds = new Set(["alex", "mira"]);
    const validPromptModes = new Set(["intro", "interview", "main"]);
    const safePersonaId = personaId && validPersonaIds.has(personaId) ? (personaId as "alex" | "mira") : undefined;
    const safePromptMode = promptMode && validPromptModes.has(promptMode) ? (promptMode as "intro" | "interview" | "main") : undefined;

    if (!isIntroRequest && message!.trim().length > 2000) {
      return NextResponse.json(
        { error: "Message too long. Keep it under 2000 characters." },
        { status: 400 },
      );
    }

    const validContexts = ["front-door", "referred", "expert", "client"];
    const chatContext = validContexts.includes(context ?? "")
      ? (context as "front-door" | "referred" | "expert" | "client")
      : "front-door";

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

    // Bot/abuse gates only skip when the session came from an already
    // verified front-door path. Brief 255 lane sessions are seeded without
    // Turnstile because they render a canned Q0 only; they must not become a
    // free pass into LLM turns.
    let trustedSession = false;
    if (sessionId) {
      const { db, schema } = await dbModulePromise;
      const { eq, sql, and } = await import("drizzle-orm");
      const [existing] = await db
        .select({
          sessionId: schema.chatSessions.sessionId,
          context: schema.chatSessions.context,
        })
        .from(schema.chatSessions)
        .where(
          and(
            eq(schema.chatSessions.sessionId, sessionId),
            sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
          ),
        );
      trustedSession = !!existing && existing.context !== "expert" && existing.context !== "client";
    }

    if (!trustedSession) {
      // No verified session — apply the full bot/abuse gates that the
      // verified session-creation path would have applied.
      const { verifyTurnstileToken } = await turnstileModulePromise;
      const turnstile = await verifyTurnstileToken(turnstileToken, ip);
      if (!turnstile.ok) {
        return NextResponse.json(
          { error: "Bot verification failed. Please refresh and try again." },
          { status: 403 },
        );
      }
    }

    const sharedRateLimit = await checkRateLimit({
      limitName: "profile-chat",
      actor: sessionId ? { kind: "session", id: sessionId } : { kind: "ip", id: ip },
    });
    if (!sharedRateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfterSec: sharedRateLimit.retryAfterSec,
        },
        {
          status: 429,
          headers: { "retry-after": String(sharedRateLimit.retryAfterSec) },
        },
      );
    }

    // Load env vars from root .env (override: false ensures platform vars take precedence)
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }

    const [{ handleChatTurnStreaming, checkIpRateLimit, hashIp }, llm] = await Promise.all([
      networkChatModulePromise,
      llmModulePromise,
    ]);

    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }

    // Rate limit: only check on un-trusted (no-session) calls. Authenticated
    // session callers are already gated by session creation having been
    // rate-limited on the /persona path.
    if (!trustedSession) {
      const ipAllowed = await checkIpRateLimit(hashIp(ip));
      if (!ipAllowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
      }
    }

    // Use TransformStream so each write flushes independently to the client.
    // The old ReadableStream.start() pattern batched enqueues because the
    // consumer hadn't started reading when events were pumped in.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Pump events in the background — don't await, let the response start immediately
    (async () => {
      try {
        // Brief 152: intro mode has no real user message — the LLM is just
        // generating its own greeting for the picker card. Send a synthetic
        // prompt that tells the model what to produce.
        const turnMessage = isIntroRequest
          ? "[INTRO_CARD] Produce your self-introduction for the persona-selection card."
          : message!.trim();
        for await (const event of handleChatTurnStreaming(
          sessionId ?? null,
          turnMessage,
          chatContext,
          ip,
          returningEmail ?? null,
          funnelMetadata,
          visitorName?.trim() || undefined,
          {
            personaId: safePersonaId,
            promptMode: safePromptMode,
            actionPayload,
          },
        )) {
          await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        console.error("[/api/v1/network/chat/stream] Stream error:", error);
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Something went wrong. Please try again." })}\n\n`),
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[/api/v1/network/chat/stream] Error:", error);
    return NextResponse.json(
      {
        error: "Something went wrong.",
      },
      { status: 500 },
    );
  }
}
