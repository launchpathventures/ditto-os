/**
 * Ditto Web — Chat Route Handler (AI SDK v6)
 *
 * Connects the browser's useChat hook to the Self's streaming conversation.
 * Uses AI SDK v6 UIMessageStream protocol — no hand-rolled encoding.
 *
 * SelfStreamEvents are mapped to UIMessageChunks via createUIMessageStream:
 * - text-delta → text-start/text-delta/text-end
 * - tool-call-start → tool-input-start + tool-input-available
 * - tool-call-result → tool-output-available (with ContentBlock[] as output)
 * - credential-request → data-credential-request custom part
 * - status → data-status custom part
 * - content-block → data-content-block custom part
 *
 * AC3: Uses AI SDK v6 native streaming
 * AC5: Route handler at /api/chat connects useChat to selfConverseStream()
 * AC11: Engine credentials and internals never reach the browser
 *
 * Provenance: AI SDK v6 createUIMessageStream, Brief 045.
 */

import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getEngine } from "@/lib/engine";
import { loadConfig, applyConfigToEnv } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const messages: Array<{ role: string; parts?: unknown[] }> = body.messages || [];
  const userId: string = body.userId || "default";

  // Extract last user message text from v6 parts format
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  if (!lastUserMsg) {
    return new Response("No user message", { status: 400 });
  }

  // v6 messages have parts array; extract text content
  let userText = "";
  if (lastUserMsg.parts && Array.isArray(lastUserMsg.parts)) {
    for (const part of lastUserMsg.parts) {
      const p = part as { type?: string; text?: string };
      if (p.type === "text" && typeof p.text === "string") {
        userText += p.text;
      }
    }
  }
  // Fallback: if parts didn't produce text, check for legacy content field
  if (!userText) {
    const legacy = lastUserMsg as { content?: string };
    userText = legacy.content ?? "";
  }

  if (!userText) {
    return new Response("No user message text", { status: 400 });
  }

  // Apply LLM config (skip when MOCK_LLM=true — Brief 054 e2e testing)
  const config = loadConfig();
  if (!config && process.env.MOCK_LLM !== "true") {
    return new Response("Not configured. Please complete setup.", { status: 503 });
  }
  if (config) {
    applyConfigToEnv(config);
  }

  // Lazy-load engine
  const { selfConverseStream } = await getEngine();

  // Create v6 UIMessageStream from SelfStreamEvents
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let textPartId = "text-0";
      let textStarted = false;

      try {
        for await (const event of selfConverseStream(userId, userText)) {
          switch (event.type) {
            case "text-delta": {
              if (!textStarted) {
                writer.write({ type: "text-start", id: textPartId });
                textStarted = true;
              }
              writer.write({
                type: "text-delta",
                id: textPartId,
                delta: event.text,
              });
              break;
            }

            case "tool-call-start": {
              // Close current text part if open
              if (textStarted) {
                writer.write({ type: "text-end", id: textPartId });
                textStarted = false;
                textPartId = `text-${Date.now()}`;
              }
              // Emit tool input start + available (we have args immediately)
              writer.write({
                type: "tool-input-start",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                dynamic: true,
              });
              writer.write({
                type: "tool-input-available",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: {},
                dynamic: true,
              });
              break;
            }

            case "tool-call-result": {
              // Emit tool output with content blocks + metadata as the typed output
              writer.write({
                type: "tool-output-available",
                toolCallId: event.toolCallId,
                output: {
                  result: event.result,
                  blocks: event.blocks ?? [],
                  metadata: event.metadata,
                },
                dynamic: true,
              });
              break;
            }

            case "content-block": {
              // Custom data part for content blocks
              writer.write({
                type: `data-content-block`,
                id: `cb-${Date.now()}`,
                data: event.block,
              } as never); // Type assertion needed for custom data parts
              break;
            }

            case "credential-request": {
              writer.write({
                type: `data-credential-request`,
                id: `cred-${Date.now()}`,
                data: {
                  service: event.service,
                  processSlug: event.processSlug,
                  fieldLabel: event.fieldLabel,
                  placeholder: event.placeholder,
                },
              } as never);
              break;
            }

            case "status": {
              writer.write({
                type: `data-status`,
                id: `status-${Date.now()}`,
                data: { message: event.message },
              } as never);
              break;
            }

            case "structured-data": {
              // Legacy: still emit for backward compat during migration
              writer.write({
                type: `data-structured`,
                id: `sd-${Date.now()}`,
                data: event.data,
              } as never);
              break;
            }

            case "finish": {
              // Close any open text part
              if (textStarted) {
                writer.write({ type: "text-end", id: textPartId });
                textStarted = false;
              }
              writer.write({
                type: "finish",
                finishReason: "stop",
              });
              break;
            }
          }
        }

        // Ensure text part is closed if stream ends without finish event
        if (textStarted) {
          writer.write({ type: "text-end", id: textPartId });
        }
      } catch (error) {
        console.error("[/api/chat] Stream error:", error);
        // Emit error text
        if (!textStarted) {
          writer.write({ type: "text-start", id: textPartId });
        }
        writer.write({
          type: "text-delta",
          id: textPartId,
          delta: "I ran into a problem processing your request. Please try again.",
        });
        writer.write({ type: "text-end", id: textPartId });
        writer.write({ type: "finish", finishReason: "stop" });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
