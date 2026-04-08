/**
 * @ditto/core — Engine Interfaces
 *
 * These interfaces define the boundary between the core engine and
 * consuming applications. Consumers implement these to wire the engine
 * into their specific runtime (database, adapters, system agents, etc.).
 */

import type { CoreDatabase } from "./db/index.js";
import type { StepDefinition, ProcessDefinition } from "./harness/harness.js";

// ============================================================
// Step Adapter — how steps get executed
// ============================================================

export interface StepExecutionResult {
  outputs: Record<string, unknown>;
  tokensUsed?: number;
  costCents?: number;
  confidence?: "high" | "medium" | "low";
  logs?: string[];
  model?: string;
  toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  resultSummary: string;
  timestamp: number;
}

export interface StepAdapter {
  /** Execute a step and return the result */
  execute(
    step: StepDefinition,
    runInputs: Record<string, unknown>,
    processDefinition: ProcessDefinition,
    resolvedTools?: unknown,
  ): Promise<StepExecutionResult>;
}

// ============================================================
// System Agent — pluggable business logic
// ============================================================

export type SystemAgentHandler = (
  inputs: Record<string, unknown>,
) => Promise<StepExecutionResult>;

// ============================================================
// Memory Provider — how memories are loaded
// ============================================================

export interface MemoryProvider {
  /** Load memories for a given scope within a token budget */
  loadMemories(params: {
    scopeType: string;
    scopeId: string;
    tokenBudget?: number;
  }): Promise<Array<{ type: string; content: string; confidence: number }>>;
}

// ============================================================
// Engine Configuration
// ============================================================

export interface EngineConfig {
  /** Database instance — consumer creates and passes in */
  db: CoreDatabase;

  /** Path to cognitive framework directory (contains core.md) */
  cognitivePath?: string;

  /** Step adapters keyed by executor type (ai-agent, cli-agent, script, etc.) */
  adapters: Record<string, StepAdapter>;

  /** System agents keyed by name */
  systemAgents?: Record<string, SystemAgentHandler>;

  /** Directory containing YAML process definitions */
  processDir: string;

  /** LLM configuration */
  llm?: {
    defaultProvider?: string;
    defaultModel?: string;
  };

  /** Additional harness handlers to register (after built-in ones) */
  extraHandlers?: unknown[]; // HarnessHandler[] when fully typed

  /** Custom memory provider (overrides default DB-based assembly) */
  memoryProvider?: MemoryProvider;
}
