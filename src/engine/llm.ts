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

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock;

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
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  maxTokens?: number;
}

export interface LlmCompletionResponse {
  content: LlmContentBlock[];
  tokensUsed: number;
  costCents: number;
  stopReason: string | null;
  model: string; // Actual model that produced this response (Vercel AI SDK ai.response.model pattern)
}

// ============================================================
// Provider interface
// ============================================================

interface LlmProvider {
  name: string;
  createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
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

    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens || 8192,
      system: request.system,
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
// Provider registry + initialization
// ============================================================

const providers: Record<string, () => LlmProvider> = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  ollama: () => new OllamaProvider(),
};

let activeProvider: LlmProvider | null = null;
let configuredModel: string | null = null;

/**
 * Initialize the LLM provider. Must be called during app startup.
 * Throws with a clear setup message if not configured.
 */
export function initLlm(): void {
  const providerName = process.env.LLM_PROVIDER;
  const model = process.env.LLM_MODEL;

  if (!providerName) {
    throw new Error(
      "LLM_PROVIDER not set. Configure your LLM provider:\n" +
      "  LLM_PROVIDER=anthropic LLM_MODEL=claude-sonnet-4-6 ANTHROPIC_API_KEY=sk-...\n" +
      "  LLM_PROVIDER=openai LLM_MODEL=gpt-4o OPENAI_API_KEY=sk-...\n" +
      "  LLM_PROVIDER=ollama LLM_MODEL=llama3.3 OLLAMA_URL=http://localhost:11434",
    );
  }

  if (!model) {
    throw new Error(
      "LLM_MODEL not set. Specify which model to use (e.g., claude-sonnet-4-6, gpt-4o, llama3.3)",
    );
  }

  const factory = providers[providerName];
  if (!factory) {
    throw new Error(
      `Unknown LLM_PROVIDER: ${providerName}. Supported: ${Object.keys(providers).join(", ")}`,
    );
  }

  activeProvider = factory();
  activeProvider.validateConfig();
  configuredModel = model;
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

// ============================================================
// Public API
// ============================================================

/**
 * Create an LLM completion. All Ditto code that needs LLM inference
 * calls this function instead of instantiating SDK clients directly.
 */
export async function createCompletion(
  request: LlmCompletionRequest,
): Promise<LlmCompletionResponse> {
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
// Test helpers (not for production use)
// ============================================================

/**
 * Set the active provider directly. For testing only.
 * @internal
 */
export function _setProviderForTest(provider: LlmProvider | null, model?: string): void {
  activeProvider = provider;
  configuredModel = model || null;
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
