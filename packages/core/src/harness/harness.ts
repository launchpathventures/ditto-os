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
import type { LlmToolDefinition, ModelPurpose } from "../llm/index.js";

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
  /** Step-category trust override — relaxes trust within process tier bounds (Brief 116) */
  trustOverride?: string;
  /** Sending identity for outbound steps: 'principal', 'agent-of-user', 'ghost' (Brief 116) */
  sendingIdentity?: string;

  // ============================================================
  // Conversation-aware step primitives
  // ============================================================

  /**
   * Pause after execution until an external event (e.g. email reply).
   * The step executes (sends the email), then the process suspends
   * until the event arrives or timeout expires. If timeout expires
   * without the event, the step completes with { timedOut: true }
   * in outputs so downstream steps can route on it.
   *
   * - "reply": wait for an interaction of type reply_received for
   *   the person_id in step config
   * - "approval": wait for human approval (same as trust gate pause)
   */
  wait_for?: {
    event: "reply" | "approval";
    timeout?: string; // e.g. "24h", "3d" — defaults to "48h"
  };

  /**
   * Gate: only execute this step if an engagement condition is met.
   * Checked by the heartbeat before step execution. If the condition
   * is NOT met, the step is skipped (status: skipped).
   *
   * - "replied": person has replied to any email since since_step
   * - "silent": person has NOT replied since since_step
   * - "any": person has any interaction (open, click, reply) since since_step
   */
  gate?: {
    engagement: "replied" | "silent" | "any";
    since_step?: string; // step ID to measure engagement from
    fallback?: "skip" | "defer"; // skip = mark skipped, defer = retry next cycle
  };

  /**
   * Email thread grouping. Steps with the same email_thread value
   * share a thread (via In-Reply-To / References headers). The first
   * email in the thread creates it; subsequent emails reply to it.
   * This prevents the email firehose problem — related emails appear
   * as a single conversation in the user's inbox.
   */
  email_thread?: string;

  /**
   * Schedule: when to execute relative to a trigger or previous step.
   * Used for cadence-based sequences (nurture, follow-ups).
   * The heartbeat checks executeAt before running the step.
   */
  schedule?: {
    delay: string;  // e.g. "4h", "24h", "3d", "7d"
    after: "trigger" | string; // "trigger" = process start, or a step ID
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
  /** Process operator — who runs this process (e.g. "alex-or-mira", "user-agent", "ditto") */
  operator?: string;
  trigger: {
    type: string;
    cron?: string;
    event?: string;
    description?: string;
    also?: { type: string; cron?: string; event?: string; description?: string };
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
  /** Default sending identity for outbound steps: 'principal', 'agent-of-user', 'ghost' (Brief 116) */
  defaultIdentity?: string;
}

export interface ParallelGroupDefinition {
  parallel_group: string;
  depends_on?: string[];
  steps: StepDefinition[];
}

export type StepEntry = StepDefinition | ParallelGroupDefinition;

// ============================================================
// Staged Outbound Actions (Brief 129 — per-action quality gating)
// ============================================================

export interface StagedOutboundAction {
  /** Qualified tool name (e.g. "crm.send_email") */
  toolName: string;
  /** Tool call arguments as passed by the agent */
  args: Record<string, unknown>;
  /** Unique draft identifier for tracking */
  draftId: string;
  /** Extracted content for quality gate checking */
  content?: string;
  /** Channel for quality gate context (e.g. "email", "sms") */
  channel?: string;
  /** Recipient identifier for quality gate context */
  recipientId?: string;
  /** Set by quality gate: true = approved for dispatch, false = rejected */
  approved?: boolean;
}

// ============================================================
// Outbound types (Brief 116 — Operating Cycle infrastructure)
// ============================================================

export interface OutboundQualityRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Function that checks content against the rule. Returns violation message or null. */
  check: (content: string, context: { channel?: string; recipientId?: string }) => string | null;
}

export interface OutboundActionRecord {
  processRunId: string;
  stepRunId: string;
  channel: string;
  sendingIdentity: string;
  recipientId?: string;
  contentSummary?: string;
  blocked: boolean;
  blockReason?: string;
}

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
  /** How many durable/solution/person memories were skipped because the
   * token budget filled before they could be rendered (Brief 175).
   * Observability signal — see risk-detector `memory_pressure`. */
  memoriesDropped: number;
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

  // Model purpose resolution (Brief 128)
  /** Resolved model purpose for step execution — set by model-purpose-resolver handler */
  resolvedModelPurpose: ModelPurpose | null;

  // Operating Cycle infrastructure (Brief 116)
  /** Resolved sending identity: 'principal', 'agent-of-user', 'ghost', or null */
  sendingIdentity: string | null;
  /** Audience classification: 'broadcast' (many recipients) or 'direct' (one recipient) */
  audienceClassification: "broadcast" | "direct" | null;
  /** Loaded voice model content for ghost-mode prompt injection */
  voiceModel: string | null;
  /** Outbound action metadata — set by step execution for outbound steps (legacy single-action) */
  outboundAction: { channel: string; actionType: string; recipientId?: string; content?: string } | null;

  // Staged outbound actions (Brief 129 — per-action quality gating)
  /** Queue of outbound tool calls staged during step execution */
  stagedOutboundActions: StagedOutboundAction[];
  /** Dispatch callback for approved staged actions — injected by product layer */
  dispatchStagedAction: ((action: StagedOutboundAction) => Promise<string>) | null;
  /** Configurable house value rules — injected by product layer */
  outboundQualityRules: OutboundQualityRule[] | null;
  /** Audience classification lookup — injected by product layer */
  audienceClassificationRules: Record<string, "broadcast" | "direct"> | null;
  /** Voice model loader callback — injected by product layer */
  voiceModelLoader: ((processId: string, userId: string) => Promise<string | null>) | null;
  /** Outbound action recorder callback — injected by product layer */
  recordOutboundAction: ((action: OutboundActionRecord) => Promise<void>) | null;
  /**
   * Pre-dispatch budget guard callback — injected by product layer (Brief 172).
   * Called per approved staged action before `dispatchStagedAction` fires. If
   * the callback returns `{ blocked: true }`, the action is flagged as a
   * quality violation, recorded, and NOT dispatched — even though it passed
   * content rules. This prevents outbound actions (email sends, API calls)
   * from shipping on a goal whose budget is exhausted.
   */
  checkBudgetBeforeDispatch:
    | ((action: StagedOutboundAction) => Promise<{ blocked: boolean; reason?: string }>)
    | null;

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
    memoriesDropped: 0,
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

    // Model purpose resolution (Brief 128) — null by default
    resolvedModelPurpose: null,

    // Operating Cycle fields (Brief 116) — null by default for backward compatibility
    sendingIdentity: null,
    audienceClassification: null,
    voiceModel: null,
    outboundAction: null,
    stagedOutboundActions: [],
    dispatchStagedAction: null,
    outboundQualityRules: null,
    audienceClassificationRules: null,
    voiceModelLoader: null,
    recordOutboundAction: null,
    checkBudgetBeforeDispatch: null,

    shortCircuit: false,
  };
}
