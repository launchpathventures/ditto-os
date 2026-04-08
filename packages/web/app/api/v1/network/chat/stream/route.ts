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
    const { message, sessionId, context, returningEmail, funnelMetadata } = body as {
      message?: string;
      sessionId?: string | null;
      context?: string;
      returningEmail?: string;
      funnelMetadata?: Record<string, unknown>;
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

    // Load env vars from root .env
    if (!process.env.ANTHROPIC_API_KEY && !process.env.MOCK_LLM) {
      try {
        const { config } = await import("dotenv");
        const path = await import("path");
        config({ path: path.resolve(process.cwd(), "../../.env") });
      } catch { /* env vars may be set via platform */ }
    }

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

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          for await (const event of handleChatTurnStreaming(
            sessionId ?? null,
            message.trim(),
            chatContext,
            ip,
            returningEmail ?? null,
            funnelMetadata,
          )) {
            send(event);
          }
        } catch (error) {
          console.error("[/api/v1/network/chat/stream] Stream error:", error);
          send({
            type: "error",
            message: "Something went wrong. Please try again.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
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
