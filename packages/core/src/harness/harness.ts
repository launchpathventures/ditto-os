/**
 * @ditto/core — Harness Pipeline
 *
 * The harness is a chain-of-responsibility pipeline that wraps every step execution.
 * Each handler has canHandle() and execute() methods. Handlers execute in order,
 * passing context through. Any handler can short-circuit by setting context.shortCircuit.
 *
 * Provenance: Handler registry pattern from Sim Studio
 */

import type { TrustTier, TrustAction, ReviewResult } from "../db/schema.js";
import type { StepExecutionResult } from "../interfaces.js";
import type { LlmToolDefinition } from "../llm/index.js";

// ============================================================
// Process types (minimal — enough for harness context)
// ============================================================

export interface HumanInputField {
  name: string;
  type: "text" | "select" | "date" | "number" | "boolean";
  label?: string;
  description?: string;
  required?: boolean;
  options?: string[];
  default?: string;
}

export interface StepDefinition {
  id: string;
  name: string;
  executor: string;
  agent_role?: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
  depends_on?: string[];
  parallel_group?: string;
  verification?: string[];
  commands?: string[];
  config?: Record<string, unknown>;
  harness?: string | { review?: string[]; metacognitive?: boolean };
  on_failure?: string;
  handoff_to?: string;
  handoff_at_step?: string;
  instructions?: string;
  input_fields?: HumanInputField[];
  timeout?: string;
  tools?: string[];
  route_to?: Array<{ condition: string; goto: string }>;
  default_next?: string;
  retry_on_failure?: {
    max_retries: number;
    retry_condition?: string;
    feedback_inject?: boolean;
  };
}

export interface ProcessSourceConfig {
  service: string;
  action: string;
  params: Record<string, unknown>;
  intervalMs: number;
}

export interface ProcessOutputDeliveryConfig {
  service: string;
  action: string;
  params: Record<string, unknown>;
}

/**
 * Chain definition — what happens after a process completes.
 * Minimal type: trigger type, target process, raw input mappings.
 * Variable substitution ({personId} → actual value) is handled by
 * the product layer (chain-executor.ts), not core.
 *
 * Provenance: Brief 098a — chain definitions from YAML process templates
 */
export interface ChainDefinition {
  /**
   * Trigger type. Canonical values: "schedule", "delay", "event".
   * YAML may use domain-specific trigger names (e.g. "no-reply-timeout",
   * "positive-reply") — the chain executor normalizes these based on
   * the presence of delay/interval/event fields.
   */
  trigger: string;
  /** Cron-style interval for schedule triggers (e.g. "7d", "14d") */
  interval?: string;
  /** Delay before execution for delay triggers (e.g. "5d") */
  delay?: string;
  /** Event name for event triggers (e.g. "positive-reply") */
  event?: string;
  /** Target process slug to start */
  process: string;
  /** Input mappings — values may contain {variable} placeholders */
  inputs: Record<string, string>;
}

export interface ProcessDefinition {
  name: string;
  id: string;
  version: number;
  status: string;
  description: string;
  system?: boolean;
  trigger: {
    type: string;
    cron?: string;
    event?: string;
    description?: string;
    also?: { type: string; event?: string; description?: string };
  };
  inputs: Array<{
    name: string;
    type: string;
    source: string;
    required: boolean;
    description?: string;
  }>;
  steps: StepEntry[];
  outputs: Array<{
    name: string;
    type: string;
    destination: string;
    description?: string;
  }>;
  quality_criteria: string[];
  feedback: {
    metrics: Array<{
      name: string;
      description: string;
      target: string;
    }>;
    capture: string[];
  };
  trust: {
    initial_tier: string;
    upgrade_path: Array<{
      after: string;
      upgrade_to: string;
    }>;
    downgrade_triggers: string[];
  };
  source?: ProcessSourceConfig;
  output_delivery?: ProcessOutputDeliveryConfig;
  /** Chain definitions — what processes to trigger after completion (Brief 098a) */
  chain?: ChainDefinition[];
}

export interface ParallelGroupDefinition {
  parallel_group: string;
  depends_on?: string[];
  steps: StepDefinition[];
}

export type StepEntry = StepDefinition | ParallelGroupDefinition;

// ============================================================
// Routing Decision
// ============================================================

export interface RoutingDecision {
  nextStepId: string | null;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  mode: "code-based" | "llm-based" | "default";
}

// ============================================================
// Resolved Tools
// ============================================================

export interface ResolvedTools {
  /** LLM-native tool definitions for the LLM to call */
  tools: LlmToolDefinition[];
  /** Dispatch function: given tool name + input, executes and returns result text */
  executeIntegrationTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<string>;
}

// ============================================================
// Harness Context & Handler
// ============================================================

export interface HarnessContext {
  // Input — set before pipeline runs
  processRun: {
    id: string;
    processId: string;
    inputs: Record<string, unknown>;
  };
  stepDefinition: StepDefinition;
  processDefinition: ProcessDefinition;
  trustTier: TrustTier;
  stepRunId: string;

  // Accumulated by handlers
  memories: string;
  memoriesInjected: number;
  stepResult: StepExecutionResult | null;
  stepError: Error | null;
  reviewResult: ReviewResult;
  reviewPattern: string[];
  reviewDetails: Record<string, unknown>;
  reviewCostCents: number;
  trustAction: TrustAction;
  samplingHash: string | null;
  canAutoAdvance: boolean;
  resolvedTools: ResolvedTools | null;
  routingDecision: RoutingDecision | null;

  // Control flow
  shortCircuit: boolean;
}

export interface HarnessHandler {
  name: string;
  /** If true, this handler runs even when the pipeline is short-circuited */
  alwaysRun?: boolean;
  canHandle(context: HarnessContext): boolean;
  execute(context: HarnessContext): Promise<HarnessContext>;
}

// ============================================================
// Pipeline
// ============================================================

export class HarnessPipeline {
  private handlers: HarnessHandler[] = [];

  register(handler: HarnessHandler): void {
    this.handlers.push(handler);
  }

  async run(context: HarnessContext): Promise<HarnessContext> {
    for (const handler of this.handlers) {
      if (context.shortCircuit && !handler.alwaysRun) {
        continue;
      }

      if (handler.canHandle(context)) {
        context = await handler.execute(context);
      }
    }

    return context;
  }
}

/**
 * Create a fresh HarnessContext for a step execution.
 */
export function createHarnessContext(params: {
  processRun: HarnessContext["processRun"];
  stepDefinition: HarnessContext["stepDefinition"];
  processDefinition: ProcessDefinition;
  trustTier: TrustTier;
  stepRunId: string;
}): HarnessContext {
  return {
    processRun: params.processRun,
    stepDefinition: params.stepDefinition,
    processDefinition: params.processDefinition,
    trustTier: params.trustTier,
    stepRunId: params.stepRunId,

    memories: "",
    memoriesInjected: 0,
    stepResult: null,
    stepError: null,
    reviewResult: "skip",
    reviewPattern: [],
    reviewDetails: {},
    reviewCostCents: 0,
    trustAction: "pause",
    samplingHash: null,
    canAutoAdvance: true,
    resolvedTools: null,
    routingDecision: null,
    shortCircuit: false,
  };
}
