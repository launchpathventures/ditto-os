/**
 * Ditto — LLM Provider Abstraction
 *
 * Multi-provider LLM interface. Supports Anthropic, OpenAI, and Ollama.
 * User configures provider and model at deployment time via environment
 * variables. No hardcoded default provider or model.
 *
 * All LLM call sites go through `createCompletion()` instead of
 * instantiating SDK clients directly. Tool format translation happens
 * internally — callers always use Ditto-native types.
 *
 * Provenance: Vercel AI SDK pattern (unified interface), Insight-060, Brief 032.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI, type GenerateContentResult, type Content, type Part, type FunctionDeclaration } from "@google/generative-ai";
import { mockCreateCompletion } from "./llm-mock";

// ============================================================
// Ditto-native LLM types (no SDK types leak beyond this file)
// ============================================================

export interface LlmTextBlock {
  type: "text";
  text: string;
}

export interface LlmToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmThinkingBlock;

export interface LlmToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export type LlmMessageContent = string | LlmContentBlock[] | LlmToolResultBlock[];

export interface LlmMessage {
  role: "user" | "assistant";
  content: LlmMessageContent;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmCompletionRequest {
  model?: string;
  purpose?: import("./model-routing").ModelPurpose;
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
  /** Hints for Anthropic prompt caching — byte offsets into system prompt where cache breakpoints should be placed */
  cacheBreakpoints?: number[];
}

// ============================================================
// Thinking budget by purpose (token efficiency — Insight-170)
// ============================================================

const THINKING_BUDGET_BY_PURPOSE: Record<string, number> = {
  conversation: 2048,
  writing: 4096,
  analysis: 4096,
  classification: 0,  // disable thinking for classification
  extraction: 1024,
};

const DEFAULT_THINKING_BUDGET = 4096;

export interface LlmCompletionResponse {
  content: LlmContentBlock[];
  tokensUsed: number;
  costCents: number;
  stopReason: string | null;
  model: string; // Actual model that produced this response (Vercel AI SDK ai.response.model pattern)
}

// ============================================================
// Stream event types (shared by all providers + CLI adapters)
// ============================================================

export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-use-start"; toolName: string; toolCallId: string }
  | { type: "tool-use-end"; toolCallId: string; summary?: string }
  | { type: "content-complete"; content: LlmContentBlock[]; costCents: number; tokensUsed: number };

// ============================================================
// Provider interface
// ============================================================

export interface LlmProvider {
  name: string;
  createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  createStreamingCompletion(request: LlmCompletionRequest): AsyncGenerator<StreamEvent>;
  validateConfig(): void;
}

// ============================================================
// Pricing
// ============================================================

const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  // Anthropic
  "claude-sonnet-4-6": { inputPerM: 3, outputPerM: 15 },
  "claude-opus-4-6": { inputPerM: 15, outputPerM: 75 },
  "claude-haiku-4-5-20251001": { inputPerM: 0.8, outputPerM: 4 },
  // OpenAI
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "o3-mini": { inputPerM: 1.1, outputPerM: 4.4 },
  // Google
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10 },
  "gemini-2.5-flash": { inputPerM: 0.15, outputPerM: 0.6 },
};

export function calculateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // Ollama and unknown models: $0
    return 0;
  }
  // Cost in cents = tokens * dollarsPerMillion / 1_000_000 * 100 = tokens * dollarsPerMillion / 10_000
  return Math.ceil(
    (inputTokens * pricing.inputPerM + outputTokens * pricing.outputPerM) / 10000
  );
}

// ============================================================
// Tool format translation
// ============================================================

/** Convert Ditto tool definitions to OpenAI format */
function toOpenAITools(tools: LlmToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

/** Convert Ditto tool definitions to Anthropic format */
function toAnthropicTools(tools: LlmToolDefinition[]): Anthropic.Messages.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Messages.Tool.InputSchema,
  }));
}

/** Convert Ditto messages to Anthropic message format */
function toAnthropicMessages(messages: LlmMessage[]): Anthropic.Messages.MessageParam[] {
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    // Content blocks and tool results — map to Anthropic format
    const blocks = msg.content as (LlmContentBlock | LlmToolResultBlock)[];
    return {
      role: msg.role,
      content: blocks.map((block) => {
        if (block.type === "thinking") {
          const tb = block as LlmThinkingBlock;
          return { type: "thinking" as const, thinking: tb.thinking, signature: tb.signature };
        }
        if (block.type === "text") {
          return { type: "text" as const, text: (block as LlmTextBlock).text };
        }
        if (block.type === "tool_use") {
          const tu = block as LlmToolUseBlock;
          return { type: "tool_use" as const, id: tu.id, name: tu.name, input: tu.input };
        }
        if (block.type === "tool_result") {
          const tr = block as LlmToolResultBlock;
          return { type: "tool_result" as const, tool_use_id: tr.tool_use_id, content: tr.content };
        }
        return block;
      }),
    } as Anthropic.Messages.MessageParam;
  });
}

/** Convert Anthropic response content to Ditto content blocks */
function fromAnthropicContent(content: Anthropic.Messages.ContentBlock[]): LlmContentBlock[] {
  return content.map((block) => {
    if (block.type === "thinking") {
      const tb = block as { type: "thinking"; thinking: string; signature: string };
      return { type: "thinking" as const, thinking: tb.thinking, signature: tb.signature };
    }
    if (block.type === "text") {
      return { type: "text" as const, text: block.text };
    }
    if (block.type === "tool_use") {
      return {
        type: "tool_use" as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    }
    // Unknown block type — wrap as text
    return { type: "text" as const, text: JSON.stringify(block) };
  });
}

/** Convert Ditto messages to OpenAI chat message format */
function toOpenAIMessages(
  system: string,
  messages: LlmMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
  ];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    const blocks = msg.content as (LlmContentBlock | LlmToolResultBlock)[];

    // Check if these are tool results (user message with tool_result blocks)
    if (blocks.length > 0 && blocks[0].type === "tool_result") {
      for (const block of blocks) {
        const tr = block as LlmToolResultBlock;
        result.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: tr.content,
        });
      }
      continue;
    }

    // Assistant message with content blocks (text + tool_use)
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
          function: {
            name: tu.name,
            arguments: JSON.stringify(tu.input),
          },
        })) as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
      }

      result.push(assistantMsg);
      continue;
    }

    // User message with content blocks — concatenate text
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => (b as LlmTextBlock).text)
      .join("");
    result.push({ role: "user", content: text || JSON.stringify(blocks) });
  }

  return result;
}

/** Convert OpenAI response to Ditto content blocks */
function fromOpenAIChoice(choice: OpenAI.Chat.Completions.ChatCompletion.Choice): LlmContentBlock[] {
  const blocks: LlmContentBlock[] = [];

  if (choice.message.content) {
    blocks.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.type === "function") {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }
  }

  return blocks;
}

// ============================================================
// Anthropic prompt caching (Insight-170: token efficiency)
// ============================================================

/**
 * Build Anthropic system content with cache_control breakpoints.
 * When breakpoints are provided, splits the system prompt into segments
 * with cache_control markers at each breakpoint. This allows Anthropic to
 * cache static prompt prefixes — cached tokens cost 90% less on hits.
 *
 * If no breakpoints, returns the plain string (backward compat).
 */
function buildAnthropicSystemContent(
  system: string,
  breakpoints?: number[],
): string | Anthropic.Messages.TextBlockParam[] {
  if (!breakpoints || breakpoints.length === 0) {
    return system;
  }

  // Sort breakpoints and deduplicate
  const sorted = [...new Set(breakpoints)].sort((a, b) => a - b).filter((bp) => bp > 0 && bp < system.length);

  if (sorted.length === 0) return system;

  const blocks: Anthropic.Messages.TextBlockParam[] = [];
  let start = 0;

  for (const bp of sorted) {
    const text = system.slice(start, bp);
    if (text.length > 0) {
      blocks.push({
        type: "text",
        text,
        cache_control: { type: "ephemeral" },
      });
    }
    start = bp;
  }

  // Remaining text after last breakpoint (no cache_control — it changes each turn)
  const remaining = system.slice(start);
  if (remaining.length > 0) {
    blocks.push({ type: "text", text: remaining });
  }

  return blocks;
}

// ============================================================
// Anthropic Provider
// ============================================================

class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  validateConfig(): void {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. Required when LLM_PROVIDER=anthropic.\n" +
        "Get your key at https://console.anthropic.com/",
      );
    }
  }

  async createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model || configuredModel!;

    // Build system content with cache_control breakpoints for token efficiency (Insight-170)
    const systemContent = buildAnthropicSystemContent(request.system, request.cacheBreakpoints);

    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens || 8192,
      system: systemContent,
      messages: toAnthropicMessages(request.messages),
      ...(request.tools ? { tools: toAnthropicTools(request.tools) } : {}),
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const actualModel = response.model;
    return {
      content: fromAnthropicContent(response.content),
      tokensUsed: inputTokens + outputTokens,
      costCents: calculateCostCents(actualModel, inputTokens, outputTokens),
      stopReason: response.stop_reason,
      model: actualModel,
    };
  }

  async *createStreamingCompletion(request: LlmCompletionRequest): AsyncGenerator<StreamEvent> {
    const model = request.model || configuredModel!;
    const messages = toAnthropicMessages(request.messages);
    const tools = request.tools ? toAnthropicTools(request.tools) : undefined;

    // Enable extended thinking for models that support it
    const supportsThinking = /claude-(3-5|3\.5|4|sonnet-4|opus-4|haiku-4)/.test(model);

    // Adaptive thinking budget based on purpose (Insight-170: token efficiency)
    const thinkingBudget = supportsThinking
      ? (request.purpose && THINKING_BUDGET_BY_PURPOSE[request.purpose] !== undefined
          ? THINKING_BUDGET_BY_PURPOSE[request.purpose]
          : DEFAULT_THINKING_BUDGET)
      : 0;

    // Build system content with cache_control breakpoints (Insight-170)
    const systemContent = buildAnthropicSystemContent(request.system, request.cacheBreakpoints);

    const stream = this.client.messages.stream({
      model,
      max_tokens: supportsThinking ? Math.max(8192, thinkingBudget * 2) : (request.maxTokens || 8192),
      system: systemContent,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(supportsThinking && thinkingBudget > 0 ? { thinking: { type: "enabled", budget_tokens: thinkingBudget } } : {}),
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text-delta", text: event.delta.text };
        } else if (event.delta.type === "thinking_delta") {
          yield { type: "thinking-delta", text: (event.delta as { type: string; thinking: string }).thinking };
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    const inputTokens = finalMessage.usage.input_tokens;
    const outputTokens = finalMessage.usage.output_tokens;
    const actualModel = finalMessage.model;

    yield {
      type: "content-complete",
      content: fromAnthropicContent(finalMessage.content),
      costCents: calculateCostCents(actualModel, inputTokens, outputTokens),
      tokensUsed: inputTokens + outputTokens,
    };
  }
}

// ============================================================
// OpenAI Provider
// ============================================================

class OpenAIProvider implements LlmProvider {
  name = "openai";
  protected client: OpenAI;

  constructor(opts?: { baseURL?: string; apiKey?: string }) {
    this.client = new OpenAI({
      ...(opts?.baseURL ? { baseURL: opts.baseURL } : {}),
      ...(opts?.apiKey ? { apiKey: opts.apiKey } : {}),
    });
  }

  validateConfig(): void {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY not set. Required when LLM_PROVIDER=openai.\n" +
        "Get your key at https://platform.openai.com/api-keys",
      );
    }
  }

  async createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model || configuredModel!;

    const openaiMessages = toOpenAIMessages(request.system, request.messages);

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: openaiMessages,
      max_tokens: request.maxTokens || 8192,
    };

    if (request.tools && request.tools.length > 0) {
      params.tools = toOpenAITools(request.tools);
    }

    const response = await this.client.chat.completions.create(params);

    const choice = response.choices[0];
    if (!choice) {
      return {
        content: [{ type: "text", text: "" }],
        tokensUsed: 0,
        costCents: 0,
        stopReason: "error",
        model: response.model || model,
      };
    }

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    // Map OpenAI stop reasons to Ditto format
    let stopReason: string | null = null;
    if (choice.finish_reason === "stop") stopReason = "end_turn";
    else if (choice.finish_reason === "tool_calls") stopReason = "tool_use";
    else if (choice.finish_reason === "length") stopReason = "max_tokens";
    else stopReason = choice.finish_reason;

    const actualModel = response.model || model;
    return {
      content: fromOpenAIChoice(choice),
      tokensUsed: inputTokens + outputTokens,
      costCents: calculateCostCents(actualModel, inputTokens, outputTokens),
      stopReason,
      model: actualModel,
    };
  }

  async *createStreamingCompletion(request: LlmCompletionRequest): AsyncGenerator<StreamEvent> {
    const model = request.model || configuredModel!;
    const openaiMessages = toOpenAIMessages(request.system, request.messages);
    const tools = request.tools && request.tools.length > 0
      ? toOpenAITools(request.tools)
      : undefined;

    const stream = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      max_tokens: request.maxTokens || 8192,
      stream: true,
      ...(tools ? { tools } : {}),
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
}

// ============================================================
// Ollama Provider (OpenAI-compatible API)
// ============================================================

class OllamaProvider extends OpenAIProvider {
  override name = "ollama";

  constructor() {
    const baseURL = process.env.OLLAMA_URL || "http://localhost:11434";
    super({
      baseURL: `${baseURL.replace(/\/$/, "")}/v1`,
      apiKey: "ollama", // Ollama doesn't need a key but OpenAI SDK requires one
    });
  }

  override validateConfig(): void {
    // Ollama doesn't require an API key — just needs to be running
    // The URL defaults to localhost if not set
  }

  override async createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const result = await super.createCompletion(request);
    // Ollama is always free
    result.costCents = 0;
    return result;
  }
}

// ============================================================
// Google Provider (Brief 096)
// ============================================================

class GoogleProvider implements LlmProvider {
  name = "google";
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
  }

  validateConfig(): void {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error(
        "GOOGLE_AI_API_KEY not set. Required for Google provider.\n" +
        "Get your key at https://aistudio.google.com/apikey",
      );
    }
  }

  async createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model || configuredModel || "gemini-2.5-pro";
    const genModel = this.client.getGenerativeModel({
      model,
      systemInstruction: request.system,
    });

    // Convert Ditto messages to Google format
    const contents: Content[] = [];
    for (const msg of request.messages) {
      const role = msg.role === "assistant" ? "model" : "user";
      if (typeof msg.content === "string") {
        contents.push({ role, parts: [{ text: msg.content }] });
        continue;
      }
      const parts: Part[] = [];
      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ text: (block as LlmTextBlock).text });
        } else if (block.type === "tool_use") {
          const tu = block as LlmToolUseBlock;
          parts.push({ functionCall: { name: tu.name, args: tu.input as Record<string, string> } });
        } else if (block.type === "tool_result") {
          const tr = block as LlmToolResultBlock;
          // Google expects function name, not call ID. Extract name from the tool_use_id
          // which we format as "google-{name}-{timestamp}" or fall back to the raw ID.
          const fnName = tr.tool_use_id.startsWith("google-")
            ? tr.tool_use_id.replace(/^google-/, "").replace(/-\d+$/, "")
            : tr.tool_use_id;
          parts.push({ functionResponse: { name: fnName, response: { result: tr.content } } });
        }
      }
      if (parts.length > 0) contents.push({ role, parts });
    }

    // Build tools — all declarations in a single wrapper (Google SDK requirement)
    const googleTools = request.tools && request.tools.length > 0
      ? [{
          functionDeclarations: request.tools.map((t): FunctionDeclaration => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema as FunctionDeclaration["parameters"],
          })),
        }]
      : undefined;

    const result: GenerateContentResult = await genModel.generateContent({
      contents,
      ...(googleTools ? { tools: googleTools } : {}),
      generationConfig: { maxOutputTokens: request.maxTokens || 8192 },
    });

    const response = result.response;
    const contentBlocks: LlmContentBlock[] = [];
    let toolCallCounter = 0;

    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.text) {
          contentBlocks.push({ type: "text", text: part.text });
        }
        if (part.functionCall) {
          // ID format: google-{name}-{timestamp}-{counter} for uniqueness and name extraction
          contentBlocks.push({
            type: "tool_use",
            id: `google-${part.functionCall.name}-${Date.now()}-${toolCallCounter++}`,
            name: part.functionCall.name,
            input: (part.functionCall.args || {}) as Record<string, unknown>,
          });
        }
      }
    }

    const inputTokens = response.usageMetadata?.promptTokenCount || 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

    let stopReason: string | null = "end_turn";
    if (contentBlocks.some((b) => b.type === "tool_use")) {
      stopReason = "tool_use";
    }

    return {
      content: contentBlocks.length > 0 ? contentBlocks : [{ type: "text", text: "" }],
      tokensUsed: inputTokens + outputTokens,
      costCents: calculateCostCents(model, inputTokens, outputTokens),
      stopReason,
      model,
    };
  }

  async *createStreamingCompletion(request: LlmCompletionRequest): AsyncGenerator<StreamEvent> {
    // Google streaming not yet implemented — fall back to non-streaming
    // and emit the complete response as a single text-delta + content-complete.
    const result = await this.createCompletion(request);
    const text = result.content
      .filter((b): b is LlmTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text) {
      yield { type: "text-delta", text };
    }
    yield {
      type: "content-complete",
      content: result.content,
      costCents: result.costCents,
      tokensUsed: result.tokensUsed,
    };
  }
}

// ============================================================
// Provider registry + initialization
// ============================================================

const providerFactories: Record<string, () => LlmProvider> = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  ollama: () => new OllamaProvider(),
  google: () => new GoogleProvider(),
};

/** Active provider for backward compat (single-provider mode or primary) */
let activeProvider: LlmProvider | null = null;
let configuredModel: string | null = null;

/** All loaded providers — keyed by provider name (Brief 096: multi-provider) */
const loadedProviders = new Map<string, LlmProvider>();

/**
 * Check if mock LLM mode is active (MOCK_LLM=true).
 * Used by both llm.ts and llm-stream.ts.
 */
export function isMockLlmMode(): boolean {
  return process.env.MOCK_LLM === "true";
}

/**
 * Get all loaded providers. Used by model-routing.ts for purpose resolution.
 */
export function getLoadedProviders(): Map<string, LlmProvider> {
  return loadedProviders;
}

/**
 * Initialize LLM providers. Must be called during app startup.
 *
 * Multi-provider mode (ADR-026, Brief 096):
 * - Loads ALL providers that have API keys configured
 * - At least one provider must be configured (or MOCK_LLM=true)
 *
 * Backward compat:
 * - LLM_PROVIDER + LLM_MODEL still work (single-provider override, primary provider)
 * - LLM_PROVIDER=ollama forces single-provider mode (Ollama can't do purpose routing)
 */
export function initLlm(): void {
  // Mock mode: skip all provider setup (Brief 054 — e2e testing)
  if (isMockLlmMode()) {
    configuredModel = "mock-model";
    return;
  }

  // Backward compat: explicit LLM_PROVIDER forces single-provider mode
  const explicitProvider = process.env.LLM_PROVIDER;
  const explicitModel = process.env.LLM_MODEL;

  if (explicitProvider === "ollama") {
    // Ollama: single-provider override (user-dependent models, no purpose routing)
    if (!explicitModel) {
      throw new Error("LLM_MODEL not set. Required when LLM_PROVIDER=ollama.");
    }
    const provider = providerFactories.ollama();
    provider.validateConfig();
    activeProvider = provider;
    configuredModel = explicitModel;
    loadedProviders.set("ollama", provider);
    return;
  }

  // Multi-provider: load all providers with configured API keys
  const keyToProvider: Array<{ key: string; name: string }> = [
    { key: "ANTHROPIC_API_KEY", name: "anthropic" },
    { key: "OPENAI_API_KEY", name: "openai" },
    { key: "GOOGLE_AI_API_KEY", name: "google" },
  ];

  for (const { key, name } of keyToProvider) {
    if (process.env[key]) {
      try {
        const provider = providerFactories[name]();
        provider.validateConfig();
        loadedProviders.set(name, provider);
      } catch (err) {
        console.warn(`[llm] Failed to load ${name} provider:`, (err as Error).message);
      }
    }
  }

  // Load SLM providers (Brief 137): Neurometric, etc.
  const neurometric = loadNeurometricProvider();
  if (neurometric) {
    loadedProviders.set("neurometric", neurometric);
  }

  // If explicit LLM_PROVIDER is set (not ollama), use it as primary
  if (explicitProvider && explicitProvider !== "ollama") {
    const primary = loadedProviders.get(explicitProvider);
    if (primary) {
      activeProvider = primary;
      configuredModel = explicitModel || null;
    }
  }

  // Set primary to first loaded provider if not explicitly set
  if (!activeProvider && loadedProviders.size > 0) {
    const firstName = Array.from(loadedProviders.keys())[0];
    activeProvider = loadedProviders.get(firstName)!;
  }

  // Set configured model from explicit or derive from provider
  if (!configuredModel && explicitModel) {
    configuredModel = explicitModel;
  }
  if (!configuredModel && activeProvider) {
    // Default model per provider
    const defaults: Record<string, string> = {
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-4o",
      google: "gemini-2.5-pro",
    };
    configuredModel = defaults[activeProvider.name] || "claude-sonnet-4-6";
  }

  if (loadedProviders.size === 0) {
    throw new Error(
      "No LLM providers configured. Set at least one API key:\n" +
      "  ANTHROPIC_API_KEY=sk-ant-...  (Anthropic Claude)\n" +
      "  OPENAI_API_KEY=sk-...         (OpenAI GPT)\n" +
      "  GOOGLE_AI_API_KEY=...         (Google Gemini)\n" +
      "Or set MOCK_LLM=true for development without API keys.",
    );
  }
}

/**
 * Get the configured model name.
 * Callers should use this instead of reading env vars directly.
 */
export function getConfiguredModel(): string {
  if (!configuredModel) {
    throw new Error("LLM not initialized. Call initLlm() during startup.");
  }
  return configuredModel;
}

/**
 * Get the configured provider name.
 */
export function getProviderName(): string {
  if (!activeProvider) {
    throw new Error("LLM not initialized. Call initLlm() during startup.");
  }
  return activeProvider.name;
}

/**
 * Get the active provider instance. Used by llm-stream.ts to delegate
 * streaming to the provider's createStreamingCompletion method.
 */
export function getActiveProvider(): LlmProvider {
  if (!activeProvider) {
    throw new Error("LLM not initialized. Call initLlm() during startup.");
  }
  return activeProvider;
}

/**
 * Get the provider name if initialized, or null if not yet.
 * Use this in code that needs to gracefully handle the uninitialized case
 * (e.g. embedding provider inference) rather than throwing.
 */
export function getProviderNameSafe(): string | null {
  return activeProvider?.name ?? null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Create an LLM completion. All Ditto code that needs LLM inference
 * calls this function instead of instantiating SDK clients directly.
 *
 * Purpose routing (ADR-026, Brief 096):
 * - If `purpose` is set: route to the best provider+model for that purpose
 * - If `model` is explicitly set: use that model directly (override)
 * - If neither: fall back to `analysis` purpose (reasonable default)
 * - MOCK_LLM=true bypasses all routing
 */
export async function createCompletion(
  request: LlmCompletionRequest,
): Promise<LlmCompletionResponse> {
  if (isMockLlmMode()) {
    return mockCreateCompletion(request);
  }

  // Explicit model override — backward compat, use activeProvider
  if (request.model) {
    if (!activeProvider) {
      throw new Error("LLM not initialized. Call initLlm() during startup.");
    }
    return activeProvider.createCompletion(request);
  }

  // Purpose routing — find the best provider+model
  if (request.purpose) {
    const { resolveProviderForPurpose } = await import("./model-routing.js");
    const purpose = request.purpose || "analysis";
    const { provider: providerName, model } = resolveProviderForPurpose(purpose);
    const provider = loadedProviders.get(providerName);

    if (provider) {
      return provider.createCompletion({ ...request, model });
    }
  }

  // Fallback to activeProvider (backward compat for single-provider setups)
  if (!activeProvider) {
    throw new Error("LLM not initialized. Call initLlm() during startup.");
  }
  return activeProvider.createCompletion(request);
}

/**
 * Extract text content from LLM response content blocks.
 */
export function extractText(content: LlmContentBlock[]): string {
  return content
    .filter((block): block is LlmTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Extract tool use blocks from LLM response content blocks.
 */
export function extractToolUse(content: LlmContentBlock[]): LlmToolUseBlock[] {
  return content.filter(
    (block): block is LlmToolUseBlock => block.type === "tool_use",
  );
}

// ============================================================
// SLM Provider Factory (Brief 137)
// ============================================================

/**
 * Configuration for an OpenAI-compatible SLM provider.
 * Neurometric, Groq, Together AI, and self-hosted (vLLM, llama.cpp)
 * all speak the OpenAI chat completions API.
 */
export interface SlmProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string[];
  pricing?: { inputPerM: number; outputPerM: number };
}

/**
 * Create an LlmProvider from an OpenAI-compatible SLM endpoint.
 * Reuses OpenAI message/tool translation — only baseUrl and apiKey differ.
 */
export function createSlmProvider(config: SlmProviderConfig): LlmProvider {
  const provider = new OpenAIProvider({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  // Register pricing for the SLM models
  if (config.pricing) {
    for (const model of config.models) {
      MODEL_PRICING[model] = config.pricing;
    }
  } else {
    // Flat-rate or free providers (e.g., Neurometric $2/mo unlimited)
    for (const model of config.models) {
      MODEL_PRICING[model] = { inputPerM: 0, outputPerM: 0 };
    }
  }

  // Override the name and default model
  const slmProvider: LlmProvider = {
    name: config.name,
    validateConfig: () => {
      if (!config.apiKey) {
        throw new Error(`API key not set for SLM provider "${config.name}".`);
      }
    },
    createCompletion: async (request) => {
      const result = await provider.createCompletion({
        ...request,
        model: request.model || config.defaultModel,
      });
      return { ...result, model: result.model || config.defaultModel };
    },
    createStreamingCompletion: async function* (request) {
      yield* provider.createStreamingCompletion({
        ...request,
        model: request.model || config.defaultModel,
      });
    },
  };

  return slmProvider;
}

/**
 * Load Neurometric provider from env vars if configured.
 * Called during initLlm() if NEUROMETRIC_API_KEY is set.
 */
export function loadNeurometricProvider(): LlmProvider | null {
  const apiKey = process.env.NEUROMETRIC_API_KEY;
  const baseUrl = process.env.NEUROMETRIC_BASE_URL || "https://api.neurometric.ai";
  if (!apiKey) return null;

  return createSlmProvider({
    name: "neurometric",
    baseUrl,
    apiKey,
    defaultModel: "qwen2.5-1.5b",
    models: ["qwen2.5-0.5b", "qwen2.5-1.5b", "qwen2.5-3b"],
  });
}

// ============================================================
// Test helpers (not for production use)
// ============================================================

/**
 * Set the active provider directly. For testing only.
 * @internal
 */
export function _setProviderForTest(provider: LlmProvider | null, model?: string): void {
  activeProvider = provider;
  configuredModel = model || null;
  loadedProviders.clear();
  if (provider) {
    loadedProviders.set(provider.name, provider);
  }
}

/**
 * Expose translation functions for testing.
 * @internal
 */
export const _internals = {
  toOpenAITools,
  toAnthropicTools,
  toOpenAIMessages,
  fromOpenAIChoice,
  fromAnthropicContent,
  calculateCostCents,
};
