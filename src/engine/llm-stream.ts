/**
 * Ditto — LLM Streaming Adapter
 *
 * Thin streaming wrapper around the existing LLM providers.
 * Yields text deltas as they arrive from the provider's streaming API,
 * then yields the complete response metadata when done.
 *
 * Does NOT modify the existing createCompletion() — this is additive.
 *
 * Provenance: Brief 039, Vercel AI SDK streamText pattern.
 */

import { spawn } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  calculateCostCents,
  type LlmCompletionRequest,
  type LlmContentBlock,
  type LlmTextBlock,
  type LlmToolUseBlock,
} from "./llm";

// ============================================================
// Stream event types
// ============================================================

export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "content-complete"; content: LlmContentBlock[]; costCents: number; tokensUsed: number };

// ============================================================
// Anthropic streaming
// ============================================================

async function* streamAnthropic(request: LlmCompletionRequest): AsyncGenerator<StreamEvent> {
  const client = new Anthropic();
  const model = request.model || process.env.LLM_MODEL!;

  // Build Anthropic messages
  const messages: Anthropic.Messages.MessageParam[] = request.messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    const blocks = msg.content as (LlmContentBlock | { type: "tool_result"; tool_use_id: string; content: string })[];
    return {
      role: msg.role,
      content: blocks.map((block) => {
        if (block.type === "text") return { type: "text" as const, text: (block as LlmTextBlock).text };
        if (block.type === "tool_use") {
          const tu = block as LlmToolUseBlock;
          return { type: "tool_use" as const, id: tu.id, name: tu.name, input: tu.input };
        }
        if (block.type === "tool_result") {
          const tr = block as { type: "tool_result"; tool_use_id: string; content: string };
          return { type: "tool_result" as const, tool_use_id: tr.tool_use_id, content: tr.content };
        }
        return block;
      }),
    } as Anthropic.Messages.MessageParam;
  });

  // Build tools
  const tools = request.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Messages.Tool.InputSchema,
  }));

  const stream = client.messages.stream({
    model,
    max_tokens: request.maxTokens || 8192,
    system: request.system,
    messages,
    ...(tools && tools.length > 0 ? { tools } : {}),
  });

  // Yield text deltas as they arrive
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text-delta", text: event.delta.text };
    }
  }

  // Yield complete response metadata
  const finalMessage = await stream.finalMessage();
  const content: LlmContentBlock[] = finalMessage.content.map((block) => {
    if (block.type === "text") return { type: "text" as const, text: block.text };
    if (block.type === "tool_use") {
      return {
        type: "tool_use" as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    return { type: "text" as const, text: JSON.stringify(block) };
  });

  const inputTokens = finalMessage.usage.input_tokens;
  const outputTokens = finalMessage.usage.output_tokens;
  const actualModel = finalMessage.model;

  yield {
    type: "content-complete",
    content,
    costCents: calculateCostCents(actualModel, inputTokens, outputTokens),
    tokensUsed: inputTokens + outputTokens,
  };
}

// ============================================================
// OpenAI streaming
// ============================================================

async function* streamOpenAI(
  request: LlmCompletionRequest,
  opts?: { baseURL?: string; apiKey?: string },
): AsyncGenerator<StreamEvent> {
  const client = new OpenAI({
    ...(opts?.baseURL ? { baseURL: opts.baseURL } : {}),
    ...(opts?.apiKey ? { apiKey: opts.apiKey } : {}),
  });
  const model = request.model || process.env.LLM_MODEL!;

  // Build messages
  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: request.system },
  ];
  for (const msg of request.messages) {
    if (typeof msg.content === "string") {
      openaiMessages.push({ role: msg.role, content: msg.content });
      continue;
    }
    const blocks = msg.content as (LlmContentBlock | { type: "tool_result"; tool_use_id: string; content: string })[];
    if (blocks.length > 0 && blocks[0].type === "tool_result") {
      for (const block of blocks) {
        const tr = block as { type: "tool_result"; tool_use_id: string; content: string };
        openaiMessages.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
      }
      continue;
    }
    if (msg.role === "assistant") {
      const textParts = blocks.filter((b) => b.type === "text") as LlmTextBlock[];
      const toolUseParts = blocks.filter((b) => b.type === "tool_use") as LlmToolUseBlock[];
      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.map((t) => t.text).join("") || null,
      };
      if (toolUseParts.length > 0) {
        assistantMsg.tool_calls = toolUseParts.map((tu) => ({
          id: tu.id,
          type: "function" as const,
          function: { name: tu.name, arguments: JSON.stringify(tu.input) },
        })) as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
      }
      openaiMessages.push(assistantMsg);
      continue;
    }
    const text = blocks.filter((b) => b.type === "text").map((b) => (b as LlmTextBlock).text).join("");
    openaiMessages.push({ role: "user", content: text || JSON.stringify(blocks) });
  }

  // Build tools
  const tools = request.tools?.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  }));

  const stream = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    max_tokens: request.maxTokens || 8192,
    stream: true,
    ...(tools && tools.length > 0 ? { tools } : {}),
  });

  let fullText = "";
  const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let actualModel = model;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    if (choice.delta?.content) {
      fullText += choice.delta.content;
      yield { type: "text-delta", text: choice.delta.content };
    }

    // Accumulate tool calls
    if (choice.delta?.tool_calls) {
      for (const tc of choice.delta.tool_calls) {
        const existing = toolCalls.get(tc.index) || { id: "", name: "", arguments: "" };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        toolCalls.set(tc.index, existing);
      }
    }

    if (chunk.usage) {
      totalInputTokens = chunk.usage.prompt_tokens || 0;
      totalOutputTokens = chunk.usage.completion_tokens || 0;
    }
    if (chunk.model) {
      actualModel = chunk.model;
    }
  }

  // Build complete content blocks
  const content: LlmContentBlock[] = [];
  if (fullText) {
    content.push({ type: "text", text: fullText });
  }
  for (const [, tc] of toolCalls) {
    content.push({
      type: "tool_use",
      id: tc.id,
      name: tc.name,
      input: JSON.parse(tc.arguments),
    });
  }

  yield {
    type: "content-complete",
    content,
    costCents: calculateCostCents(actualModel, totalInputTokens, totalOutputTokens),
    tokensUsed: totalInputTokens + totalOutputTokens,
  };
}

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

        // Claude CLI format (v2): { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
        if (parsed.type === "assistant" && parsed.message?.content) {
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
 * Uses DITTO_CONNECTION env var (set by config) to select the method,
 * falling back to LLM_PROVIDER for backwards compatibility.
 */
export async function* createStreamingCompletion(
  request: LlmCompletionRequest,
): AsyncGenerator<StreamEvent> {
  const connection = process.env.DITTO_CONNECTION;
  const provider = process.env.LLM_PROVIDER;

  // CLI subscription providers (first-class)
  if (connection === "claude-cli") {
    yield* streamClaudeCli(request);
    return;
  }
  if (connection === "codex-cli") {
    yield* streamCodexCli(request);
    return;
  }

  // API providers
  if (provider === "anthropic") {
    yield* streamAnthropic(request);
  } else if (provider === "openai") {
    yield* streamOpenAI(request);
  } else if (provider === "ollama") {
    const baseURL = process.env.OLLAMA_URL || "http://localhost:11434";
    yield* streamOpenAI(request, {
      baseURL: `${baseURL.replace(/\/$/, "")}/v1`,
      apiKey: "ollama",
    });
  } else {
    throw new Error(`No LLM connection configured. Please complete setup at http://localhost:3000`);
  }
}
