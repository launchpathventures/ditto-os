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
 * - status → data-status custom part (transient — AC12)
 * - content-block → data-content-block custom part
 *
 * AC8: Custom data parts emitted with typed schemas (no `as never` casts)
 * AC12: data-status emitted with transient: true
 * AC13: consumeStream() ensures completion on client disconnect
 * AC14: onFinish callback for future persistence
 *
 * Provenance: AI SDK v6 createUIMessageStream, Brief 058.
 */

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  consumeStream,
  type UIMessageStreamWriter,
} from "ai";
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
    // AC14: onFinish callback — logs session metadata (placeholder for future persistence)
    onFinish({ messages: finishedMessages }) {
      console.log(`[/api/chat] Stream finished. Messages: ${finishedMessages?.length ?? 0}`);
    },
    execute: async ({ writer }: { writer: UIMessageStreamWriter }) => {
      let partSeq = 0;
      let textPartId = `text-${partSeq++}`;
      let textStarted = false;
      let reasoningPartId = `reasoning-${partSeq++}`;
      let reasoningStarted = false;

      try {
        for await (const event of selfConverseStream(userId, userText)) {
          switch (event.type) {
            case "thinking-delta": {
              // Close any open text part before reasoning
              if (textStarted) {
                writer.write({ type: "text-end", id: textPartId });
                textStarted = false;
                textPartId = `text-${partSeq++}`;
              }
              if (!reasoningStarted) {
                writer.write({ type: "reasoning-start", id: reasoningPartId });
                reasoningStarted = true;
              }
              writer.write({
                type: "reasoning-delta",
                id: reasoningPartId,
                delta: event.text,
              });
              break;
            }

            case "text-delta": {
              // Close reasoning part before text starts
              if (reasoningStarted) {
                writer.write({ type: "reasoning-end", id: reasoningPartId });
                reasoningStarted = false;
                reasoningPartId = `reasoning-${partSeq++}`;
              }
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
              // Close current text/reasoning parts if open
              if (reasoningStarted) {
                writer.write({ type: "reasoning-end", id: reasoningPartId });
                reasoningStarted = false;
                reasoningPartId = `reasoning-${partSeq++}`;
              }
              if (textStarted) {
                writer.write({ type: "text-end", id: textPartId });
                textStarted = false;
                textPartId = `text-${partSeq++}`;
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
              // AC8: Custom data part — type-safe via dataPartSchemas
              writer.write({
                type: "data-content-block",
                id: `cb-${partSeq++}`,
                data: event.block,
              });
              break;
            }

            case "credential-request": {
              // AC8: Custom data part — type-safe via dataPartSchemas
              writer.write({
                type: "data-credential-request",
                id: `cred-${partSeq++}`,
                data: {
                  service: event.service,
                  processSlug: event.processSlug,
                  fieldLabel: event.fieldLabel,
                  placeholder: event.placeholder,
                },
              });
              break;
            }

            case "status": {
              // AC12: Status updates are transient — don't persist in message history
              writer.write({
                type: "data-status",
                id: `status-${partSeq++}`,
                data: { message: event.message },
                transient: true,
              });
              break;
            }

            case "structured-data": {
              // AC8: Custom data part — type-safe via dataPartSchemas
              writer.write({
                type: "data-structured",
                id: `sd-${partSeq++}`,
                data: event.data,
              });
              break;
            }

            case "finish": {
              // Close any open parts
              if (reasoningStarted) {
                writer.write({ type: "reasoning-end", id: reasoningPartId });
                reasoningStarted = false;
              }
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

  // AC13: consumeStream ensures completion even if client disconnects
  // Tee the stream: one for the response, one for consumeStream
  const [responseStream, consumeStreamCopy] = stream.tee();

  const response = createUIMessageStreamResponse({
    stream: responseStream,
    headers: {
      "X-Accel-Buffering": "no", // Disable Nginx/proxy buffering
      "Cache-Control": "no-cache, no-transform", // Prevent compression caching
    },
  });

  consumeStream({ stream: consumeStreamCopy });

  return response;
}
