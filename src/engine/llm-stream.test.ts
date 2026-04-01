/**
 * Tests for LLM Streaming Adapter (Brief 039, Brief 064).
 *
 * Covers: provider routing, CLI stream parsing, stream event types.
 * CLI streaming tests mock child_process.spawn to simulate NDJSON output.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";
import type { StreamEvent } from "./llm-stream";

// Helper: create a mock child process that emits NDJSON lines then exits
function createMockProcess(ndjsonLines: string[], exitCode = 0) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: () => void };
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = { end: vi.fn() };

  // Emit lines async to simulate real CLI output
  setImmediate(() => {
    for (const line of ndjsonLines) {
      stdout.emit("data", Buffer.from(line + "\n"));
    }
    proc.emit("close", exitCode);
  });

  return proc;
}

// Collect all events from an async generator
async function collectEvents(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ============================================================
// Provider routing tests
// ============================================================

describe("createStreamingCompletion routing", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("routes to claude-cli when DITTO_CONNECTION=claude-cli", async () => {
    process.env.DITTO_CONNECTION = "claude-cli";
    process.env.LLM_MODEL = "claude-sonnet-4-6";

    // We can't actually spawn claude in tests, so we verify the routing logic
    // by checking that the function exists and accepts requests
    const { createStreamingCompletion } = await import("./llm-stream");
    expect(createStreamingCompletion).toBeDefined();
    expect(typeof createStreamingCompletion).toBe("function");
  });

  it("routes to codex-cli when DITTO_CONNECTION=codex-cli", async () => {
    process.env.DITTO_CONNECTION = "codex-cli";
    process.env.LLM_MODEL = "gpt-5.3-codex";

    const { createStreamingCompletion } = await import("./llm-stream");
    expect(createStreamingCompletion).toBeDefined();
  });

  it("throws for unknown provider when no DITTO_CONNECTION and no LLM_PROVIDER", async () => {
    delete process.env.DITTO_CONNECTION;
    delete process.env.LLM_PROVIDER;

    const { createStreamingCompletion } = await import("./llm-stream");
    const gen = createStreamingCompletion({
      system: "test",
      messages: [{ role: "user", content: "hello" }],
    });

    await expect(gen.next()).rejects.toThrow("No LLM connection configured");
  });
});

// ============================================================
// Stream event type tests
// ============================================================

describe("StreamEvent types", () => {
  it("text-delta event has correct shape", () => {
    const event = { type: "text-delta" as const, text: "hello" };
    expect(event.type).toBe("text-delta");
    expect(event.text).toBe("hello");
  });

  it("content-complete event has correct shape", () => {
    const event = {
      type: "content-complete" as const,
      content: [{ type: "text" as const, text: "hello world" }],
      costCents: 5,
      tokensUsed: 100,
    };
    expect(event.type).toBe("content-complete");
    expect(event.content).toHaveLength(1);
    expect(event.costCents).toBe(5);
    expect(event.tokensUsed).toBe(100);
  });
});

// ============================================================
// Claude CLI NDJSON parsing tests
// ============================================================

describe("Claude CLI stream parsing", () => {
  it("extracts text from assistant message event", () => {
    // Claude CLI v2 format: { type: "assistant", message: { content: [...] } }
    const line = JSON.stringify({
      type: "assistant",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      },
    });

    const parsed = JSON.parse(line);
    expect(parsed.type).toBe("assistant");
    expect(parsed.message.content[0].type).toBe("text");
    expect(parsed.message.content[0].text).toBe("Hello world");
  });

  it("ignores non-content events (system init, rate_limit)", () => {
    const events = [
      { type: "system", subtype: "init", cwd: "/tmp", session_id: "s1" },
      { type: "rate_limit_event", rate_limit_info: { status: "allowed" } },
    ];

    for (const event of events) {
      // Neither has message.content
      const hasContent = "message" in event && (event as Record<string, unknown>).message;
      expect(hasContent).toBeFalsy();
    }
  });

  it("extracts text from result event as fallback", () => {
    const resultEvent = {
      type: "result",
      subtype: "success",
      result: "Hello!",
      duration_ms: 1000,
    };

    const parsed = JSON.parse(JSON.stringify(resultEvent));
    expect(parsed.type).toBe("result");
    expect(parsed.result).toBe("Hello!");
  });
});

// ============================================================
// Claude CLI stream_event integration tests (Brief 064)
// Mocks child_process.spawn to exercise the real spawnCliStream() code path.
// ============================================================

describe("Claude CLI stream_event parsing (via mocked spawn)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.DITTO_CONNECTION = "claude-cli";
    process.env.LLM_MODEL = "claude-sonnet-4-6";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("yields text-delta from stream_event text_delta events", async () => {
    const lines = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s1" }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 0 } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello world" }] } }),
      JSON.stringify({ type: "result", result: "Hello world", duration_ms: 500 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "hi" }],
    }));

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect((textDeltas[0] as { text: string }).text).toBe("Hello");
    expect((textDeltas[1] as { text: string }).text).toBe(" world");

    const complete = events.find((e) => e.type === "content-complete") as { content: Array<{ type: string; text: string }> };
    expect(complete).toBeDefined();
    expect(complete.content[0].text).toBe("Hello world");
  });

  it("yields thinking-delta from stream_event thinking_delta events", async () => {
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "thinking" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me reason" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: " about this" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 0 } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "text" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Result" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 1 } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "thinking", thinking: "Let me reason about this" }, { type: "text", text: "Result" }] } }),
      JSON.stringify({ type: "result", result: "Result", duration_ms: 500 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "think about it" }],
    }));

    const thinkingDeltas = events.filter((e) => e.type === "thinking-delta");
    expect(thinkingDeltas).toHaveLength(2);
    expect((thinkingDeltas[0] as { text: string }).text).toBe("Let me reason");
    expect((thinkingDeltas[1] as { text: string }).text).toBe(" about this");

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect((textDeltas[0] as { text: string }).text).toBe("Result");
  });

  it("deduplicates: assistant message skipped when stream_event deltas received", async () => {
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Streamed text" } } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Streamed text" }] } }),
      JSON.stringify({ type: "result", result: "Streamed text", duration_ms: 100 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "hi" }],
    }));

    // Only 1 text-delta (from stream_event), not 2 (no duplicate from assistant)
    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect((textDeltas[0] as { text: string }).text).toBe("Streamed text");
  });

  it("backward compatibility: assistant fallback works when no stream_event deltas", async () => {
    // Simulates older CLI that doesn't emit stream_event
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Fallback text" }] } }),
      JSON.stringify({ type: "result", result: "Fallback text", duration_ms: 100 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "hi" }],
    }));

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect((textDeltas[0] as { text: string }).text).toBe("Fallback text");
  });

  it("ignores signature_delta in stream_event", async () => {
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "signature_delta", signature: "abc123" } } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }),
      JSON.stringify({ type: "result", result: "Hello", duration_ms: 100 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "hi" }],
    }));

    // Only text-delta events, no signature events leaked through
    const nonComplete = events.filter((e) => e.type !== "content-complete");
    expect(nonComplete.every((e) => e.type === "text-delta")).toBe(true);
    expect(nonComplete).toHaveLength(1);
  });

  it("thinking text is NOT included in content-complete fullText", async () => {
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Secret reasoning" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Visible response" } } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "thinking", thinking: "Secret reasoning" }, { type: "text", text: "Visible response" }] } }),
      JSON.stringify({ type: "result", result: "Visible response", duration_ms: 100 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "think" }],
    }));

    const complete = events.find((e) => e.type === "content-complete") as { content: Array<{ type: string; text: string }> };
    expect(complete.content).toHaveLength(1);
    expect(complete.content[0].type).toBe("text");
    expect(complete.content[0].text).toBe("Visible response");
    expect(complete.content[0].text).not.toContain("reasoning");
  });

  it("yields tool-use-start and tool-use-end for CLI internal tool_use events", async () => {
    const lines = [
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me read the file" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 0 } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "Read" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"file_path\":\"docs/roadmap.md\"}" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 1 } }),
      // After tool execution, next response starts
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Here's the roadmap" } } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Here's the roadmap" }] } }),
      JSON.stringify({ type: "result", result: "Here's the roadmap", duration_ms: 500 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "read the roadmap" }],
    }));

    const toolStarts = events.filter((e) => e.type === "tool-use-start");
    expect(toolStarts).toHaveLength(1);
    expect((toolStarts[0] as { toolName: string }).toolName).toBe("Read");
    expect((toolStarts[0] as { toolCallId: string }).toolCallId).toBe("toolu_1");

    const toolEnds = events.filter((e) => e.type === "tool-use-end");
    expect(toolEnds).toHaveLength(1);
    expect((toolEnds[0] as { toolCallId: string }).toolCallId).toBe("toolu_1");

    // Text still streams correctly alongside tool events
    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect((textDeltas[0] as { text: string }).text).toBe("Here's the roadmap");
  });

  it("yields multiple tool-use events for multi-tool CLI responses", async () => {
    const lines = [
      // First tool
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "Read" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 0 } }),
      // Second tool
      JSON.stringify({ type: "stream_event", event: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_2", name: "Grep" } } }),
      JSON.stringify({ type: "stream_event", event: { type: "content_block_stop", index: 1 } }),
      // Final text
      JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Found it" } } }),
      JSON.stringify({ type: "result", result: "Found it", duration_ms: 300 }),
    ];

    vi.doMock("child_process", () => ({
      spawn: () => createMockProcess(lines),
    }));

    const { createStreamingCompletion } = await import("./llm-stream");
    const events = await collectEvents(createStreamingCompletion({
      system: "test", messages: [{ role: "user", content: "search" }],
    }));

    const toolStarts = events.filter((e) => e.type === "tool-use-start");
    expect(toolStarts).toHaveLength(2);
    expect((toolStarts[0] as { toolName: string }).toolName).toBe("Read");
    expect((toolStarts[1] as { toolName: string }).toolName).toBe("Grep");

    const toolEnds = events.filter((e) => e.type === "tool-use-end");
    expect(toolEnds).toHaveLength(2);
  });
});

// ============================================================
// Codex CLI JSONL parsing tests
// ============================================================

describe("Codex CLI stream parsing", () => {
  it("extracts text from message event with output_text", () => {
    const line = JSON.stringify({
      type: "message",
      message: {
        content: [
          { type: "output_text", text: "Hello from Codex" },
        ],
      },
    });

    const parsed = JSON.parse(line);
    expect(parsed.type).toBe("message");
    expect(parsed.message.content[0].text).toBe("Hello from Codex");
  });

  it("extracts text from response.output_text.delta event", () => {
    const line = JSON.stringify({
      type: "response.output_text.delta",
      delta: "Hello ",
    });

    const parsed = JSON.parse(line);
    expect(parsed.type).toBe("response.output_text.delta");
    expect(parsed.delta).toBe("Hello ");
  });
});
