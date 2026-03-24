/**
 * Ditto Web — Chat Route Handler
 *
 * Connects the browser's useChat hook to the Self's streaming conversation.
 * Messages come in via POST, stream back via AI SDK data stream protocol.
 *
 * All engine calls happen server-side. No engine internals leak to the client.
 *
 * AC5: Route Handler at /api/chat connects useChat to selfConverseStream()
 * AC11: Engine credentials and internals never reach the browser
 */

import { getEngine } from "@/lib/engine";
import { loadConfig, applyConfigToEnv } from "@/lib/config";
import type { SelfStreamEvent } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Self delegations can take time

/**
 * AI SDK Data Stream Protocol format:
 * - Text: `0:${JSON.stringify(text)}\n`
 * - Data: `2:${JSON.stringify([data])}\n`
 * - Finish: `d:${JSON.stringify({finishReason: "stop"})}\n`
 */
function encodeTextDelta(text: string): string {
  return `0:${JSON.stringify(text)}\n`;
}

function encodeData(data: Record<string, unknown>): string {
  return `2:${JSON.stringify([data])}\n`;
}

function encodeFinish(): string {
  return `d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 } })}\n`;
}

export async function POST(req: Request) {
  const body = await req.json();
  const messages: Array<{ role: string; content: string }> = body.messages || [];
  const userId: string = body.userId || "default";

  // Get the last user message
  const lastMessage = messages.filter((m) => m.role === "user").pop();
  if (!lastMessage) {
    return new Response("No user message", { status: 400 });
  }

  // Apply LLM config from data/config.json
  const config = loadConfig();
  if (!config) {
    return new Response("Not configured. Please complete setup.", { status: 503 });
  }
  applyConfigToEnv(config);

  // Lazy-load engine to avoid build-time DB conflicts
  const { selfConverseStream } = await getEngine();

  // Create a readable stream that yields AI SDK protocol chunks
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of selfConverseStream(userId, lastMessage.content)) {
          switch (event.type) {
            case "text-delta":
              controller.enqueue(encoder.encode(encodeTextDelta(event.text)));
              break;

            case "tool-call-start":
              controller.enqueue(
                encoder.encode(
                  encodeData({
                    type: "tool-call-start",
                    toolName: event.toolName,
                    toolCallId: event.toolCallId,
                  }),
                ),
              );
              break;

            case "tool-call-result":
              controller.enqueue(
                encoder.encode(
                  encodeData({
                    type: "tool-call-result",
                    toolCallId: event.toolCallId,
                    result: event.result,
                  }),
                ),
              );
              break;

            case "structured-data":
              controller.enqueue(
                encoder.encode(
                  encodeData({ type: "structured-data", data: event.data }),
                ),
              );
              break;

            case "credential-request":
              controller.enqueue(
                encoder.encode(
                  encodeData({
                    type: "credential-request",
                    service: event.service,
                    processSlug: event.processSlug,
                    fieldLabel: event.fieldLabel,
                    placeholder: event.placeholder,
                  }),
                ),
              );
              break;

            case "status":
              controller.enqueue(
                encoder.encode(
                  encodeData({ type: "status", message: event.message }),
                ),
              );
              break;

            case "finish":
              controller.enqueue(
                encoder.encode(
                  encodeData({
                    type: "session",
                    sessionId: event.sessionId,
                    delegationsExecuted: event.delegationsExecuted,
                    consultationsExecuted: event.consultationsExecuted,
                  }),
                ),
              );
              controller.enqueue(encoder.encode(encodeFinish()));
              break;
          }
        }
      } catch (error) {
        // Log real error server-side, send generic message to client (AC11)
        console.error("[/api/chat] Stream error:", error);
        controller.enqueue(
          encoder.encode(encodeTextDelta("I ran into a problem processing your request. Please try again.")),
        );
        controller.enqueue(encoder.encode(encodeFinish()));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  });
}
