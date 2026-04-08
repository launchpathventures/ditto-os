/**
 * @ditto/core — LLM Module
 *
 * LLM types are defined here. The actual provider implementations
 * stay in the consuming application until the provider code is
 * fully decoupled (the LLM module has no DB dependency, but it
 * does have complex provider logic that's better moved as a whole).
 *
 * For now, this module exports the type contracts that all consumers share.
 */

// LLM types — the universal contract for all LLM interactions
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
  purpose?: string;
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
  model: string;
}

// Stream event types (shared by all providers + CLI adapters)
export type StreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-use-start"; toolName: string; toolCallId: string }
  | { type: "tool-use-end"; toolCallId: string; summary?: string }
  | { type: "content-complete"; content: LlmContentBlock[]; costCents: number; tokensUsed: number };

/** Provider interface — consumers can implement custom providers */
export interface LlmProvider {
  name: string;
  createCompletion(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  createStreamingCompletion(request: LlmCompletionRequest): AsyncGenerator<StreamEvent>;
  validateConfig(): void;
}

/** Model purpose classes for purpose-based routing */
export const MODEL_PURPOSES = [
  "conversation",
  "writing",
  "analysis",
  "classification",
  "extraction",
] as const;

export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

// Utility functions
export function extractText(content: LlmContentBlock[]): string {
  return content
    .filter((block): block is LlmTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function extractToolUse(content: LlmContentBlock[]): LlmToolUseBlock[] {
  return content.filter(
    (block): block is LlmToolUseBlock => block.type === "tool_use",
  );
}
