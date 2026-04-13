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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, sessionId, context, returningEmail, funnelMetadata, visitorName, turnstileToken } = body as {
      message?: string;
      sessionId?: string | null;
      context?: string;
      returningEmail?: string;
      funnelMetadata?: Record<string, unknown>;
      visitorName?: string;
      turnstileToken?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "A message is required." },
        { status: 400 },
      );
    }

    if (message.trim().length > 2000) {
      return NextResponse.json(
        { error: "Message too long. Keep it under 2000 characters." },
        { status: 400 },
      );
    }

    const validContexts = ["front-door", "referred"];
    const chatContext = validContexts.includes(context ?? "")
      ? (context as "front-door" | "referred")
      : "front-door";

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";

    // Turnstile bot verification
    const { verifyTurnstileToken } = await import("../../../../../../../../src/engine/turnstile");
    const turnstile = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstile.ok) {
      return NextResponse.json(
        { error: "Bot verification failed. Please refresh and try again." },
        { status: 403 },
      );
    }

    // Load env vars from root .env (override: false ensures platform vars take precedence)
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch { /* env vars may be set via platform */ }

    const [{ handleChatTurnStreaming, checkIpRateLimit, hashIp }, llm] = await Promise.all([
      import("../../../../../../../../src/engine/network-chat"),
      import("../../../../../../../../src/engine/llm"),
    ]);

    if (!llm.isMockLlmMode()) {
      try { llm.initLlm(); } catch { /* already initialized */ }
    }

    // Rate limit: return HTTP 429 so infrastructure can enforce
    const ipAllowed = await checkIpRateLimit(hashIp(ip));
    if (!ipAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
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
        for await (const event of handleChatTurnStreaming(
          sessionId ?? null,
          message.trim(),
          chatContext,
          ip,
          returningEmail ?? null,
          funnelMetadata,
          visitorName?.trim() || undefined,
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
