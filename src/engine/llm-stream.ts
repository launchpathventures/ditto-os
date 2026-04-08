/**
 * Ditto — LLM Streaming Adapter
 *
 * Routes streaming requests to the appropriate provider or CLI adapter.
 * API providers (Anthropic, OpenAI, Google) stream via the LlmProvider
 * interface in llm.ts — shared clients, shared format translation, one
 * source of truth. CLI adapters (claude-cli, codex-cli) spawn subprocesses.
 *
 * Provenance: Brief 039, Vercel AI SDK streamText pattern.
 */

import { spawn } from "child_process";
import {
  isMockLlmMode,
  getActiveProvider,
  type LlmCompletionRequest,
  type LlmContentBlock,
  type LlmTextBlock,
  type LlmToolUseBlock,
  type StreamEvent,
} from "./llm";
import { mockCreateStreamingCompletion } from "./llm-mock";

// Re-export StreamEvent so existing consumers don't need to update imports
export type { StreamEvent } from "./llm";

// ============================================================
// Claude CLI streaming (subscription-based)
// ============================================================

/**
 * Stream via `claude -p --output-format stream-json`.
 * Uses the user's Claude CLI subscription — no API key needed.
 * Parses NDJSON stream events from stdout.
 *
 * Provenance: Claude Code CLI, Brief 039 extension.
 */
async function* streamClaudeCli(request: LlmCompletionRequest): AsyncGenerator<StreamEvent> {
  const model = request.model || process.env.LLM_MODEL || "claude-sonnet-4-6";

  // Build the prompt: system context + messages
  const promptParts: string[] = [];
  promptParts.push(request.system);
  for (const msg of request.messages) {
    const prefix = msg.role === "user" ? "Human" : "Assistant";
    if (typeof msg.content === "string") {
      promptParts.push(`${prefix}: ${msg.content}`);
    } else {
      // Extract text from content blocks
      const blocks = msg.content as (LlmContentBlock | { type: "tool_result"; tool_use_id: string; content: string })[];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => (b as LlmTextBlock).text)
        .join("");
      if (text) promptParts.push(`${prefix}: ${text}`);
    }
  }

  const prompt = promptParts.join("\n\n");

  const args = [
    "-p",
    "--verbose",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--model", model,
    "--no-session-persistence",
    "--dangerously-skip-permissions",
    prompt,
  ];

  // Note: tool_use via CLI is limited. For MVP, the Self's tools execute
  // in the self-stream.ts layer after getting the text response.
  // Full tool_use streaming via CLI is a future enhancement.

  yield* spawnCliStream("claude", args);
}

// ============================================================
// Codex CLI streaming (OpenAI subscription-based)
// ============================================================

/**
 * Stream via `codex exec --json`.
 * Uses the user's OpenAI/Codex subscription — no API key needed.
 * Parses JSONL events from stdout.
 *
 * Provenance: OpenAI Codex CLI, Brief 039 extension.
 */
async function* streamCodexCli(request: LlmCompletionRequest): AsyncGenerator<StreamEvent> {
  const model = request.model || process.env.LLM_MODEL || "gpt-5.3-codex";

  // Build prompt
  const promptParts: string[] = [];
  promptParts.push(request.system);
  for (const msg of request.messages) {
    if (typeof msg.content === "string") {
      promptParts.push(msg.content);
    } else {
      const blocks = msg.content as (LlmContentBlock | { type: "tool_result"; tool_use_id: string; content: string })[];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => (b as LlmTextBlock).text)
        .join("");
      if (text) promptParts.push(text);
    }
  }

  const prompt = promptParts.join("\n\n");

  const args = [
    "exec",
    "--json",
    "-c", `model="${model}"`,
    "--full-stdout",
    prompt,
  ];

  yield* spawnCliStream("codex", args);
}

// ============================================================
// CLI tool input summary extraction
// ============================================================

/** Strip the project root prefix from absolute file paths. */
function stripProjectRoot(filePath: string): string {
  // Match common patterns: /Users/.../missoula/..., /home/.../missoula/...
  const match = filePath.match(/\/(?:Users|home)\/[^/]+\/.*?\/missoula\/(.+)/);
  if (match) return match[1];
  // Fallback: if path starts with /, take last 3 segments
  if (filePath.startsWith("/")) {
    const parts = filePath.split("/").filter(Boolean);
    return parts.length > 3 ? parts.slice(-3).join("/") : parts.join("/");
  }
  return filePath;
}

/** Extract a human-readable summary from a CLI tool's JSON input. */
function extractToolSummary(toolName: string, inputJson: string): string | undefined {
  try {
    const input = JSON.parse(inputJson) as Record<string, unknown>;
    switch (toolName) {
      case "Read": return typeof input.file_path === "string" ? stripProjectRoot(input.file_path) : undefined;
      case "Edit": return typeof input.file_path === "string" ? stripProjectRoot(input.file_path) : undefined;
      case "Write": return typeof input.file_path === "string" ? stripProjectRoot(input.file_path) : undefined;
      case "MultiEdit": return typeof input.file_path === "string" ? stripProjectRoot(input.file_path) : undefined;
      case "Grep": {
        const pattern = input.pattern as string | undefined;
        const path = typeof input.path === "string" ? stripProjectRoot(input.path) : undefined;
        if (!pattern) return undefined;
        return path ? `'${pattern}' in ${path}` : `'${pattern}'`;
      }
      case "Glob": return input.pattern as string | undefined;
      case "Bash": return input.command as string | undefined;
      case "WebSearch": return input.query as string | undefined;
      case "WebFetch": return input.url as string | undefined;
      case "Agent": {
        const desc = (input.description ?? input.prompt) as string | undefined;
        return desc && desc.length > 50 ? desc.slice(0, 47) + "..." : desc;
      }
      default: return undefined;
    }
  } catch {
    return undefined;
  }
}

// ============================================================
// Shared CLI subprocess streaming
// ============================================================

/**
 * Spawn a CLI tool and parse its NDJSON/JSONL output into StreamEvents.
 * Handles both Claude CLI (stream_event wrapper) and Codex CLI (direct events).
 */
async function* spawnCliStream(
  command: string,
  args: string[],
): AsyncGenerator<StreamEvent> {
  const content: LlmContentBlock[] = [];
  let fullText = "";
  let receivedStreamDeltas = false;
  let activeToolId: string | null = null;
  let activeToolName: string | null = null;
  let activeToolInput = "";

  // Use a promise + callback approach to yield from a child process
  const lines: string[] = [];
  let resolve: (() => void) | null = null;
  let done = false;
  let exitError: Error | null = null;

  const proc = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, CLAUDECODE: undefined }, // Allow nested claude
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";

  proc.stdout.on("data", (data: Buffer) => {
    buffer += data.toString();
    const parts = buffer.split("\n");
    buffer = parts.pop() || ""; // Keep incomplete last line
    for (const line of parts) {
      if (line.trim()) {
        lines.push(line.trim());
        resolve?.();
      }
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    // Log stderr but don't fail — CLI tools output progress to stderr
    const text = data.toString().trim();
    if (text && !text.includes("progress") && !text.includes("%")) {
      console.error(`[${command}] ${text}`);
    }
  });

  proc.on("close", (code) => {
    if (code !== 0 && code !== null) {
      exitError = new Error(`${command} exited with code ${code}`);
    }
    done = true;
    resolve?.();
  });

  proc.on("error", (err) => {
    exitError = err;
    done = true;
    resolve?.();
  });

  // Close stdin immediately — we pass the prompt as an argument
  proc.stdin.end();

  // Process lines as they arrive
  while (!done || lines.length > 0) {
    if (lines.length === 0 && !done) {
      await new Promise<void>((r) => { resolve = r; });
      resolve = null;
    }

    while (lines.length > 0) {
      const line = lines.shift()!;
      try {
        const parsed = JSON.parse(line);

        // Claude CLI stream_event (partial messages via --include-partial-messages)
        // Format: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } } }
        if (parsed.type === "stream_event" && parsed.event) {
          const evt = parsed.event;
          if (evt.type === "content_block_delta") {
            if (evt.delta?.type === "text_delta" && evt.delta.text) {
              fullText += evt.delta.text;
              receivedStreamDeltas = true;
              yield { type: "text-delta", text: evt.delta.text };
            } else if (evt.delta?.type === "thinking_delta" && evt.delta.thinking) {
              receivedStreamDeltas = true;
              yield { type: "thinking-delta", text: evt.delta.thinking };
            }
            // signature_delta: ignore (not useful for UI)
            if (evt.delta?.type === "input_json_delta" && evt.delta.partial_json) {
              activeToolInput += evt.delta.partial_json;
            }
          }

          // Claude Code internal tool calls — surface for activity visibility
          if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use") {
            const toolId = evt.content_block.id ?? `cli-tool-${Date.now()}`;
            const toolName = evt.content_block.name ?? "tool";
            activeToolId = toolId;
            activeToolName = toolName;
            activeToolInput = "";
            yield { type: "tool-use-start", toolName: toolName, toolCallId: toolId };
          }
          if (evt.type === "content_block_stop" && activeToolId) {
            const completedToolId = activeToolId;
            const completedToolName = activeToolName ?? "tool";
            activeToolId = null;
            activeToolName = null;
            const summary = extractToolSummary(completedToolName, activeToolInput);
            activeToolInput = "";
            yield { type: "tool-use-end", toolCallId: completedToolId, summary };
          }
        }

        // Claude CLI complete message (fallback when no partial messages / older CLI)
        // Only yield from assistant message if we didn't get streaming deltas
        if (parsed.type === "assistant" && parsed.message?.content && !receivedStreamDeltas) {
          for (const block of parsed.message.content) {
            if (block.type === "text" && block.text) {
              const text = block.text;
              fullText += text;
              yield { type: "text-delta", text };
            }
          }
        }

        // Claude CLI result: { type: "result", result: "..." }
        // Fallback — if we got no text from assistant events, use the result
        if (parsed.type === "result" && parsed.result && !fullText) {
          fullText += parsed.result;
          yield { type: "text-delta", text: parsed.result };
        }

        // Codex CLI format: direct event objects
        // Codex emits { type: "message", message: { content: [...] } } for complete messages
        // and other event types for streaming
        if (parsed.type === "message" && parsed.message?.content) {
          for (const block of parsed.message.content) {
            if (block.type === "output_text" || block.type === "text") {
              const text = block.text || "";
              if (text && !fullText.includes(text)) {
                fullText += text;
                yield { type: "text-delta", text };
              }
            }
          }
        }

        // Codex streaming delta
        if (parsed.type === "response.output_text.delta" && parsed.delta) {
          fullText += parsed.delta;
          yield { type: "text-delta", text: parsed.delta };
        }

      } catch {
        // Not valid JSON — ignore (progress output, etc.)
      }
    }
  }

  if (exitError && !fullText) {
    throw exitError;
  }

  // Build final content
  if (fullText) {
    content.push({ type: "text", text: fullText });
  }

  yield {
    type: "content-complete",
    content,
    costCents: 0, // Subscription-based, no API cost
    tokensUsed: 0,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Create a streaming LLM completion. Yields text deltas as they arrive,
 * then yields complete response metadata.
 *
 * Supports both API providers and CLI subscription providers.
 * API providers delegate to the LlmProvider interface (shared clients,
 * shared format translation). CLI adapters spawn subprocesses.
 */
export async function* createStreamingCompletion(
  request: LlmCompletionRequest,
): AsyncGenerator<StreamEvent> {
  // Mock mode: deterministic canned responses (Brief 054 — e2e testing)
  if (isMockLlmMode()) {
    yield* mockCreateStreamingCompletion(request);
    return;
  }

  const connection = process.env.DITTO_CONNECTION;

  // CLI subscription providers (first-class)
  if (connection === "claude-cli") {
    yield* streamClaudeCli(request);
    return;
  }
  if (connection === "codex-cli") {
    yield* streamCodexCli(request);
    return;
  }

  // API providers — delegate to the initialized provider
  const provider = getActiveProvider();
  yield* provider.createStreamingCompletion(request);
}
