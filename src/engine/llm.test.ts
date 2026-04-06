/**
 * Tests for LLM Provider Abstraction (Brief 032).
 *
 * Covers: provider selection, startup validation, tool format translation,
 * cost tracking, Ditto-native types, extractText/extractToolUse.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initLlm,
  createCompletion,
  extractText,
  extractToolUse,
  getConfiguredModel,
  getProviderName,
  _setProviderForTest,
  _internals,
  type LlmContentBlock,
  type LlmToolDefinition,
  type LlmMessage,
  type LlmCompletionResponse,
} from "./llm";

// ============================================================
// Startup Validation (AC4-8)
// ============================================================

describe("initLlm", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
    _setProviderForTest(null);
  });

  it("throws when no providers are configured (Brief 096 AC3)", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    expect(() => initLlm()).toThrow("No LLM providers configured");
  });

  it("error message lists all provider options (Brief 096 AC3)", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    try {
      initLlm();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("ANTHROPIC_API_KEY");
      expect(msg).toContain("OPENAI_API_KEY");
      expect(msg).toContain("GOOGLE_AI_API_KEY");
      expect(msg).toContain("MOCK_LLM");
    }
  });

  it("works with only Anthropic key set (Brief 096 AC2)", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(() => initLlm()).not.toThrow();
  });

  it("Ollama requires LLM_MODEL (Brief 096 AC13)", () => {
    process.env.LLM_PROVIDER = "ollama";
    delete process.env.LLM_MODEL;
    expect(() => initLlm()).toThrow("LLM_MODEL not set");
  });

  it("does not throw for Ollama without API key", () => {
    process.env.LLM_PROVIDER = "ollama";
    process.env.LLM_MODEL = "llama3.3";
    // Ollama doesn't need an API key — should not throw
    expect(() => initLlm()).not.toThrow();
  });

  it("sets configured model and provider after successful init", () => {
    process.env.LLM_PROVIDER = "ollama";
    process.env.LLM_MODEL = "llama3.3";
    initLlm();
    expect(getConfiguredModel()).toBe("llama3.3");
    expect(getProviderName()).toBe("ollama");
  });
});

// ============================================================
// Tool Format Translation (AC9)
// ============================================================

describe("tool format translation", () => {
  const dittoTool: LlmToolDefinition = {
    name: "read_file",
    description: "Read a file",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
  };

  it("translates Ditto tools to OpenAI format (AC9)", () => {
    const openaiTools = _internals.toOpenAITools([dittoTool]);
    expect(openaiTools).toHaveLength(1);
    const tool = openaiTools[0];
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe("read_file");
    expect(tool.function.description).toBe("Read a file");
    expect(tool.function.parameters).toEqual(dittoTool.input_schema);
  });

  it("translates Ditto tools to Anthropic format (AC9)", () => {
    const anthropicTools = _internals.toAnthropicTools([dittoTool]);
    expect(anthropicTools).toHaveLength(1);
    expect(anthropicTools[0].name).toBe("read_file");
    expect(anthropicTools[0].description).toBe("Read a file");
    expect(anthropicTools[0].input_schema).toEqual(dittoTool.input_schema);
  });

  it("translates multiple tools", () => {
    const tools: LlmToolDefinition[] = [
      dittoTool,
      {
        name: "search_files",
        description: "Search files",
        input_schema: {
          type: "object",
          properties: { pattern: { type: "string" } },
          required: ["pattern"],
        },
      },
    ];
    expect(_internals.toOpenAITools(tools)).toHaveLength(2);
    expect(_internals.toAnthropicTools(tools)).toHaveLength(2);
  });
});

// ============================================================
// Message Format Translation
// ============================================================

describe("message format translation", () => {
  it("converts string messages to OpenAI format", () => {
    const messages: LlmMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const result = _internals.toOpenAIMessages("You are helpful", messages);
    expect(result).toHaveLength(3); // system + 2 messages
    expect(result[0]).toEqual({ role: "system", content: "You are helpful" });
    expect(result[1]).toEqual({ role: "user", content: "Hello" });
    expect(result[2]).toEqual({ role: "assistant", content: "Hi there" });
  });

  it("converts tool_result blocks to OpenAI tool messages", () => {
    const messages: LlmMessage[] = [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_123", content: "file contents" },
        ],
      },
    ];
    const result = _internals.toOpenAIMessages("sys", messages);
    // system + tool message
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      role: "tool",
      tool_call_id: "call_123",
      content: "file contents",
    });
  });

  it("converts assistant messages with tool_use to OpenAI format", () => {
    const messages: LlmMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me read that" },
          { type: "tool_use", id: "call_456", name: "read_file", input: { path: "foo.ts" } },
        ],
      },
    ];
    const result = _internals.toOpenAIMessages("sys", messages);
    expect(result).toHaveLength(2);
    const assistantMsg = result[1] as unknown as {
      role: string;
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toBe("Let me read that");
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls![0].id).toBe("call_456");
    expect(assistantMsg.tool_calls![0].function.name).toBe("read_file");
    expect(assistantMsg.tool_calls![0].function.arguments).toBe('{"path":"foo.ts"}');
  });
});

// ============================================================
// Response Content Normalization (AC10)
// ============================================================

describe("response normalization", () => {
  it("normalizes Anthropic text content to Ditto format (AC10)", () => {
    const anthropicContent = [
      { type: "text" as const, text: "Hello world" },
    ];
    const result = _internals.fromAnthropicContent(anthropicContent as never);
    expect(result).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("normalizes Anthropic tool_use content to Ditto format (AC10)", () => {
    const anthropicContent = [
      { type: "tool_use" as const, id: "tu_1", name: "read_file", input: { path: "foo.ts" } },
    ];
    const result = _internals.fromAnthropicContent(anthropicContent as never);
    expect(result).toEqual([
      { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "foo.ts" } },
    ]);
  });

  it("normalizes OpenAI choice to Ditto format (AC10)", () => {
    const choice = {
      message: {
        content: "Hello",
        tool_calls: undefined,
      },
      finish_reason: "stop",
      index: 0,
    };
    const result = _internals.fromOpenAIChoice(choice as never);
    expect(result).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("normalizes OpenAI tool_calls to Ditto format (AC10)", () => {
    const choice = {
      message: {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"path":"bar.ts"}',
            },
          },
        ],
      },
      finish_reason: "tool_calls",
      index: 0,
    };
    const result = _internals.fromOpenAIChoice(choice as never);
    expect(result).toEqual([
      { type: "tool_use", id: "call_1", name: "read_file", input: { path: "bar.ts" } },
    ]);
  });
});

// ============================================================
// Cost Tracking (AC11)
// ============================================================

describe("cost tracking", () => {
  it("calculates cost for Anthropic models (AC11)", () => {
    // claude-sonnet-4-6: input $3/M, output $15/M
    const cost = _internals.calculateCostCents("claude-sonnet-4-6", 1000, 500);
    // cents = (1000 * 3 + 500 * 15) / 10000 = 10500 / 10000 = 1.05 → ceil = 2
    expect(cost).toBe(2);
  });

  it("calculates cost for OpenAI models (AC11)", () => {
    // gpt-4o: input $2.5/M, output $10/M
    const cost = _internals.calculateCostCents("gpt-4o", 10000, 5000);
    // cents = (10000 * 2.5 + 5000 * 10) / 10000 = 75000 / 10000 = 7.5 → ceil = 8
    expect(cost).toBe(8);
  });

  it("returns $0 for unknown/Ollama models (AC11)", () => {
    expect(_internals.calculateCostCents("llama3.3", 10000, 5000)).toBe(0);
    expect(_internals.calculateCostCents("unknown-model", 10000, 5000)).toBe(0);
  });

  it("returns $0 for zero tokens", () => {
    expect(_internals.calculateCostCents("claude-sonnet-4-6", 0, 0)).toBe(0);
  });
});

// ============================================================
// extractText / extractToolUse
// ============================================================

describe("extractText", () => {
  it("extracts text from content blocks", () => {
    const blocks: LlmContentBlock[] = [
      { type: "text", text: "Hello " },
      { type: "tool_use", id: "1", name: "read_file", input: {} },
      { type: "text", text: "world" },
    ];
    expect(extractText(blocks)).toBe("Hello world");
  });

  it("returns empty string for no text blocks", () => {
    const blocks: LlmContentBlock[] = [
      { type: "tool_use", id: "1", name: "read_file", input: {} },
    ];
    expect(extractText(blocks)).toBe("");
  });
});

describe("extractToolUse", () => {
  it("extracts tool use blocks", () => {
    const blocks: LlmContentBlock[] = [
      { type: "text", text: "Let me check" },
      { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "a.ts" } },
      { type: "tool_use", id: "tu_2", name: "search_files", input: { pattern: "foo" } },
    ];
    const tools = extractToolUse(blocks);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("read_file");
    expect(tools[1].name).toBe("search_files");
  });
});

// ============================================================
// createCompletion guard
// ============================================================

describe("createCompletion", () => {
  afterEach(() => {
    _setProviderForTest(null);
  });

  it("throws if LLM not initialized", async () => {
    _setProviderForTest(null);
    await expect(
      createCompletion({ system: "test", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow("LLM not initialized");
  });

  it("delegates to active provider (AC1)", async () => {
    const mockResponse: LlmCompletionResponse = {
      content: [{ type: "text", text: "mock" }],
      tokensUsed: 10,
      costCents: 1,
      stopReason: "end_turn",
      model: "test-model",
    };
    const mockProvider = {
      name: "test",
      createCompletion: vi.fn().mockResolvedValue(mockResponse),
      validateConfig: vi.fn(),
    };
    _setProviderForTest(mockProvider, "test-model");

    const result = await createCompletion({
      system: "You are a test",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(mockProvider.createCompletion).toHaveBeenCalledOnce();
    expect(result.content).toEqual([{ type: "text", text: "mock" }]);
    expect(result.tokensUsed).toBe(10);
  });
});

// ============================================================
// getConfiguredModel / getProviderName guards
// ============================================================

describe("getConfiguredModel", () => {
  afterEach(() => {
    _setProviderForTest(null);
  });

  it("throws if not initialized", () => {
    _setProviderForTest(null);
    expect(() => getConfiguredModel()).toThrow("LLM not initialized");
  });

  it("returns model after init", () => {
    const mockProvider = { name: "test", createCompletion: vi.fn(), validateConfig: vi.fn() };
    _setProviderForTest(mockProvider, "my-model");
    expect(getConfiguredModel()).toBe("my-model");
  });
});

describe("getProviderName", () => {
  afterEach(() => {
    _setProviderForTest(null);
  });

  it("throws if not initialized", () => {
    _setProviderForTest(null);
    expect(() => getProviderName()).toThrow("LLM not initialized");
  });

  it("returns provider name after init", () => {
    const mockProvider = { name: "test-provider", createCompletion: vi.fn(), validateConfig: vi.fn() };
    _setProviderForTest(mockProvider, "my-model");
    expect(getProviderName()).toBe("test-provider");
  });
});
