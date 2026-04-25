/**
 * @ditto/core — Core Database Schema
 *
 * The engine-level database schema. These tables are required by every
 * consumer of @ditto/core (Ditto web app, ProcessOS, etc.).
 *
 * Application-specific tables (people, network, sessions, chat, etc.)
 * stay in the consuming application.
 *
 * Provenance: Extracted from src/db/schema.ts — Ditto monorepo
 */

import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

// ============================================================
// Type unions — reusable across all consumers
// ============================================================

export const processStatusValues = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;
export type ProcessStatus = (typeof processStatusValues)[number];

export const trustTierValues = [
  "supervised",
  "spot_checked",
  "autonomous",
  "critical",
] as const;
export type TrustTier = (typeof trustTierValues)[number];

export const runStatusValues = [
  "queued",
  "running",
  "waiting_review",
  "waiting_human",
  "paused",
  "approved",
  "rejected",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type RunStatus = (typeof runStatusValues)[number];

export const stepExecutorValues = [
  "ai-agent",
  "cli-agent",
  "script",
  "rules",
  "human",
  "handoff",
  "integration",
  "sub-process",
] as const;
export type StepExecutor = (typeof stepExecutorValues)[number];

export const feedbackTypeValues = [
  "approve",
  "edit",
  "reject",
  "escalate",
  "auto_approve",
] as const;
export type FeedbackType = (typeof feedbackTypeValues)[number];

export const editSeverityValues = [
  "formatting",
  "correction",
  "revision",
  "rewrite",
] as const;
export type EditSeverity = (typeof editSeverityValues)[number];

export const trustChangeActorValues = ["human", "system"] as const;
export type TrustChangeActor = (typeof trustChangeActorValues)[number];

export const trustSuggestionStatusValues = [
  "pending",
  "accepted",
  "rejected",
  "dismissed",
] as const;
export type TrustSuggestionStatus =
  (typeof trustSuggestionStatusValues)[number];

export const agentStatusValues = [
  "idle",
  "running",
  "error",
  "disabled",
] as const;
export type AgentStatus = (typeof agentStatusValues)[number];

export const agentCategoryValues = ["system", "domain"] as const;
export type AgentCategory = (typeof agentCategoryValues)[number];

export const improvementStatusValues = [
  "proposed",
  "approved",
  "dismissed",
  "implemented",
] as const;
export type ImprovementStatus = (typeof improvementStatusValues)[number];

export const trustActionValues = [
  "pause",
  "advance",
  "sample_pause",
  "sample_advance",
] as const;
export type TrustAction = (typeof trustActionValues)[number];

export const reviewResultValues = [
  "pass",
  "flag",
  "retry",
  "skip",
] as const;
export type ReviewResult = (typeof reviewResultValues)[number];

export const memoryScopeTypeValues = ["agent", "process", "self", "person"] as const;
export type MemoryScopeType = (typeof memoryScopeTypeValues)[number];

export const memoryTypeValues = [
  "correction",
  "preference",
  "context",
  "skill",
  "user_model",
  "solution",
  "voice_model",
  "guidance",
] as const;
export type MemoryType = (typeof memoryTypeValues)[number];

export const memorySourceValues = ["feedback", "human", "system", "conversation", "escalation_resolution"] as const;
export type MemorySource = (typeof memorySourceValues)[number];

export const workItemTypeValues = [
  "question",
  "task",
  "goal",
  "insight",
  "outcome",
] as const;
export type WorkItemType = (typeof workItemTypeValues)[number];

export const workItemStatusValues = [
  "intake",
  "routed",
  "in_progress",
  "waiting_human",
  "completed",
  "failed",
] as const;
export type WorkItemStatus = (typeof workItemStatusValues)[number];

export const workItemSourceValues = [
  "conversation",
  "capture",
  "process_spawned",
  "system_generated",
] as const;
export type WorkItemSource = (typeof workItemSourceValues)[number];

// ============================================================
// Layer 1: Process Layer
// ============================================================

export const processes = sqliteTable("processes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().$type<ProcessStatus>().default("draft"),
  definition: text("definition", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  trustTier: text("trust_tier")
    .notNull()
    .$type<TrustTier>()
    .default("supervised"),
  trustData: text("trust_data", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  source: text("source", { mode: "json" })
    .$type<{ service: string; action: string; params: Record<string, unknown>; intervalMs: number } | null>(),
  outputDelivery: text("output_delivery", { mode: "json" })
    .$type<{ service: string; action: string; params: Record<string, unknown> } | null>(),
  projectId: text("project_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const processDependencies = sqliteTable("process_dependencies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  sourceProcessId: text("source_process_id")
    .references(() => processes.id)
    .notNull(),
  targetProcessId: text("target_process_id")
    .references(() => processes.id)
    .notNull(),
  outputName: text("output_name").notNull(),
  inputName: text("input_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 2: Agent Layer
// ============================================================

export const agents = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  role: text("role").notNull(),
  description: text("description"),
  status: text("status").notNull().$type<AgentStatus>().default("idle"),
  adapterType: text("adapter_type").notNull(),
  adapterConfig: text("adapter_config", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  category: text("category").notNull().$type<AgentCategory>().default("domain"),
  systemRole: text("system_role"),
  monthlyBudgetCents: integer("monthly_budget_cents"),
  currentSpendCents: integer("current_spend_cents").notNull().default(0),
  budgetResetAt: integer("budget_reset_at", { mode: "timestamp_ms" }),
  totalRuns: integer("total_runs").notNull().default(0),
  successRate: real("success_rate"),
  ownerId: text("owner_id"),
  organisationId: text("organisation_id"),
  permissions: text("permissions", { mode: "json" }).$type<Record<string, unknown>>(),
  provenance: text("provenance"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Process Runs — execution instances
// ============================================================

export const processRuns = sqliteTable("process_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  status: text("status").notNull().$type<RunStatus>().default("queued"),
  triggeredBy: text("triggered_by").notNull(),
  inputs: text("inputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  currentStepId: text("current_step_id"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  totalTokens: integer("total_tokens").default(0),
  totalCostCents: integer("total_cost_cents").default(0),
  suspendState: text("suspend_state", { mode: "json" })
    .$type<Record<string, unknown>>(),
  orchestratorConfidence: text("orchestrator_confidence")
    .$type<"high" | "medium" | "low">(),
  definitionOverride: text("definition_override", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  definitionOverrideVersion: integer("definition_override_version")
    .notNull()
    .default(0),
  /** One-line summary of the last definition override applied (Brief 174).
   * Preserved across run completion so the activity feed can still show
   * "this run was adapted to skip step X" even after the override body is
   * cleared at terminal status. */
  definitionOverrideSummary: text("definition_override_summary"),
  // Chain processing flag (Brief 098a) — prevents duplicate chain execution
  chainsProcessed: integer("chains_processed", { mode: "boolean" })
    .notNull()
    .default(false),
  // Trust tier override for chain-spawned runs (Brief 098a AC9)
  trustTierOverride: text("trust_tier_override").$type<TrustTier>(),
  /** Operating cycle type — e.g. 'sales', 'connect', 'intel' (Brief 116) */
  cycleType: text("cycle_type"),
  /** Operating cycle configuration — JSON (Brief 116) */
  cycleConfig: text("cycle_config", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  /** Parent cycle run ID for sub-process invocations (Brief 116) */
  parentCycleRunId: text("parent_cycle_run_id"),
  /** Run-scoped metadata (Brief 121) — email thread IDs, etc. Survives suspend/resume. */
  runMetadata: text("run_metadata", { mode: "json" })
    .$type<Record<string, unknown>>(),
  /** Absolute timeout timestamp for wait_for steps (Brief 121). Indexed for scheduler queries. */
  timeoutAt: integer("timeout_at", { mode: "timestamp_ms" }),
  /** Stale-escalation ladder tier (Brief 178): 0 = none, 1 = briefing (24h),
   * 2 = user notified (48h), 3 = admin notified (72h). Reset to 0 when the
   * run transitions out of waiting_human/waiting_review. */
  staleEscalationTier: integer("stale_escalation_tier").notNull().default(0),
  /** Timestamp of the last stale-escalation action (Brief 178). Used to
   * make the hourly sweep idempotent within a tier. */
  staleEscalationLastActionAt: integer("stale_escalation_last_action_at", {
    mode: "timestamp_ms",
  }),
  /** When the run entered its current waiting state (Brief 179 — fixes
   * Brief 178 P0 which anchored escalation on `createdAt`). Populated on
   * any transition to waiting_human/waiting_review; cleared on transition
   * out. Stale classification reads this, with `createdAt` as fallback for
   * runs that predate the column. */
  waitingStateSince: integer("waiting_state_since", {
    mode: "timestamp_ms",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const stepRuns = sqliteTable("step_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processRunId: text("process_run_id")
    .references(() => processRuns.id)
    .notNull(),
  stepId: text("step_id").notNull(),
  agentId: text("agent_id").references(() => agents.id),
  status: text("status").notNull().$type<RunStatus>().default("queued"),
  executorType: text("executor_type").notNull().$type<StepExecutor>(),
  inputs: text("inputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  outputs: text("outputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  parallelGroupId: text("parallel_group_id"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  tokensUsed: integer("tokens_used").default(0),
  costCents: integer("cost_cents").default(0),
  error: text("error"),
  confidenceLevel: text("confidence_level").$type<"high" | "medium" | "low">(),
  model: text("model"),
  integrationService: text("integration_service"),
  integrationProtocol: text("integration_protocol"),
  toolCalls: text("tool_calls", { mode: "json" })
    .$type<Array<{ name: string; args: Record<string, unknown>; resultSummary: string; timestamp: number }>>(),
  /** Cognitive mode loaded for this step (Brief 114). Null when no mode resolved. */
  cognitiveMode: text("cognitive_mode"),
  /** Deferred execution timestamp — step won't execute until this time (Brief 121: schedule primitive). */
  deferredUntil: integer("deferred_until", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 3: Harness Layer — outputs and review
// ============================================================

export const processOutputs = sqliteTable("process_outputs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processRunId: text("process_run_id")
    .references(() => processRuns.id)
    .notNull(),
  stepRunId: text("step_run_id").references(() => stepRuns.id),
  name: text("name").notNull(),
  type: text("type").notNull(),
  content: text("content", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  contentUrl: text("content_url"),
  needsReview: integer("needs_review", { mode: "boolean" })
    .notNull()
    .default(true),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewedBy: text("reviewed_by"),
  confidenceScore: real("confidence_score"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 5: Learning Layer — feedback
// ============================================================

export const feedback = sqliteTable("feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  outputId: text("output_id")
    .references(() => processOutputs.id)
    .notNull(),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  type: text("type").notNull().$type<FeedbackType>(),
  diff: text("diff", { mode: "json" }).$type<Record<string, unknown>>(),
  comment: text("comment"),
  editSeverity: text("edit_severity").$type<EditSeverity>(),
  editRatio: real("edit_ratio"),
  correctionPattern: text("correction_pattern"),
  patternConfidence: real("pattern_confidence"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Memory
// ============================================================

export const memories = sqliteTable("memories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  scopeType: text("scope_type").notNull().$type<MemoryScopeType>(),
  scopeId: text("scope_id").notNull(),
  type: text("type").notNull().$type<MemoryType>(),
  content: text("content").notNull(),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  source: text("source").notNull().$type<MemorySource>(),
  sourceId: text("source_id"),
  reinforcementCount: integer("reinforcement_count").notNull().default(1),
  lastReinforcedAt: integer("last_reinforced_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  confidence: real("confidence").notNull().default(0.3),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  shared: integer("shared", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Improvements
// ============================================================

export const improvements = sqliteTable("improvements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  status: text("status")
    .notNull()
    .$type<ImprovementStatus>()
    .default("proposed"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  estimatedImpact: text("estimated_impact"),
  estimatedEffort: text("estimated_effort"),
  risk: text("risk"),
  confidence: real("confidence"),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  decidedBy: text("decided_by"),
  decisionComment: text("decision_comment"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Harness Decisions
// ============================================================

export const harnessDecisions = sqliteTable("harness_decisions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processRunId: text("process_run_id")
    .references(() => processRuns.id)
    .notNull(),
  stepRunId: text("step_run_id")
    .references(() => stepRuns.id)
    .notNull(),
  trustTier: text("trust_tier").notNull().$type<TrustTier>(),
  trustAction: text("trust_action").notNull().$type<TrustAction>(),
  reviewPattern: text("review_pattern", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  reviewResult: text("review_result").notNull().$type<ReviewResult>().default("skip"),
  reviewDetails: text("review_details", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  reviewCostCents: integer("review_cost_cents").notNull().default(0),
  memoriesInjected: integer("memories_injected").notNull().default(0),
  /** How many memories were eligible but dropped due to token budget (Brief 175). */
  memoriesDropped: integer("memories_dropped").notNull().default(0),
  samplingHash: text("sampling_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Trust Changes
// ============================================================

export const trustChanges = sqliteTable("trust_changes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  fromTier: text("from_tier").notNull().$type<TrustTier>(),
  toTier: text("to_tier").notNull().$type<TrustTier>(),
  reason: text("reason").notNull(),
  actor: text("actor").notNull().$type<TrustChangeActor>(),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Trust Suggestions
// ============================================================

export const trustSuggestions = sqliteTable("trust_suggestions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  currentTier: text("current_tier").notNull().$type<TrustTier>(),
  suggestedTier: text("suggested_tier").notNull().$type<TrustTier>(),
  evidence: text("evidence", { mode: "json" })
    .notNull()
    .$type<Array<{ name: string; threshold: string; actual: string; passed: boolean }>>(),
  status: text("status")
    .notNull()
    .$type<TrustSuggestionStatus>()
    .default("pending"),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  decidedBy: text("decided_by"),
  decisionComment: text("decision_comment"),
  previousSuggestionId: text("previous_suggestion_id"),
  /** Step category for step-level trust suggestions (Brief 116) */
  stepCategory: text("step_category"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Work Items
// ============================================================

export const workItems = sqliteTable("work_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  type: text("type").notNull().$type<WorkItemType>().default("task"),
  status: text("status")
    .notNull()
    .$type<WorkItemStatus>()
    .default("intake"),
  content: text("content").notNull(),
  source: text("source").notNull().$type<WorkItemSource>().default("capture"),
  goalAncestry: text("goal_ancestry", { mode: "json" })
    .$type<string[]>()
    .default([]),
  assignedProcess: text("assigned_process").references(() => processes.id),
  spawnedFrom: text("spawned_from"),
  spawnedItems: text("spawned_items", { mode: "json" })
    .$type<string[]>()
    .default([]),
  decomposition: text("decomposition", { mode: "json" })
    .$type<Array<{ taskId: string; stepId: string; dependsOn: string[]; status: string }>>(),
  executionIds: text("execution_ids", { mode: "json" })
    .$type<string[]>()
    .default([]),
  context: text("context", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

// ============================================================
// Activities — audit log
// ============================================================

export const activities = sqliteTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  action: text("action").notNull(),
  description: text("description"),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Schedules — cron-based process triggers
// ============================================================

export const schedules = sqliteTable("schedules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  cronExpression: text("cron_expression").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Credentials — encrypted service credentials
// ============================================================

export const credentials = sqliteTable("credentials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id),
  /** User ID for user-scoped credentials (Brief 152 — Google Workspace OAuth, etc.) */
  userId: text("user_id"),
  service: text("service").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
}, (table) => [
  unique("credentials_process_service_unique").on(table.processId, table.service),
  unique("credentials_user_service_unique").on(table.userId, table.service),
]);

// ============================================================
// Outbound Actions — outbound action tracking (Brief 116)
// ============================================================

export const outboundActions = sqliteTable("outbound_actions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processRunId: text("process_run_id")
    .references(() => processRuns.id)
    .notNull(),
  stepRunId: text("step_run_id")
    .references(() => stepRuns.id)
    .notNull(),
  channel: text("channel").notNull(),
  sendingIdentity: text("sending_identity").notNull(),
  recipientId: text("recipient_id"),
  contentSummary: text("content_summary"),
  blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
  blockReason: text("block_reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Delayed Runs — deferred process execution (Brief 098a)
// ============================================================

export const delayedRunStatusValues = ["pending", "executed", "cancelled"] as const;
export type DelayedRunStatus = (typeof delayedRunStatusValues)[number];

export const delayedRuns = sqliteTable("delayed_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processSlug: text("process_slug").notNull(),
  inputs: text("inputs", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),
  executeAt: integer("execute_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().$type<DelayedRunStatus>().default("pending"),
  createdByRunId: text("created_by_run_id")
    .references(() => processRuns.id),
  parentTrustTier: text("parent_trust_tier").$type<TrustTier>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Workspace Views — adaptive composition registration (Brief 154)
// ============================================================

export const workspaceViews = sqliteTable("workspace_views", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id").notNull(),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  icon: text("icon"),
  description: text("description"),
  /** Composition schema JSON — opaque to core, interpreted by web package */
  schema: text("schema", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  /** Process that registered this view (nullable) */
  sourceProcessId: text("source_process_id")
    .references(() => processes.id),
  /** Sidebar ordering position */
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  uniqueSlugPerWorkspace: unique().on(table.workspaceId, table.slug),
}));

// ============================================================
// Process Versions — version history for process definitions (Brief 164, MP-9.2)
// ============================================================

export const processVersions = sqliteTable("process_versions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  /** The version number this snapshot represents */
  version: integer("version").notNull(),
  /** Full process definition at this version */
  definition: text("definition", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  /** Human-readable summary of what changed */
  changeSummary: text("change_summary"),
  /** Who/what triggered the edit */
  editedBy: text("edited_by").default("self"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  uniqueVersionPerProcess: unique().on(table.processId, table.version),
}));

// ============================================================
// Local Bridge — paired devices + job queue (Brief 212)
// ============================================================

export const bridgeDeviceStatusValues = ["active", "revoked", "rotated"] as const;
export type BridgeDeviceStatus = (typeof bridgeDeviceStatusValues)[number];

export const bridgeJobStateColumnValues = [
  "queued",
  "dispatched",
  "running",
  "succeeded",
  "failed",
  "orphaned",
  "cancelled",
  "revoked",
] as const;
export type BridgeJobStateColumn = (typeof bridgeJobStateColumnValues)[number];

export const bridgeJobKindColumnValues = ["exec", "tmux.send"] as const;
export type BridgeJobKindColumn = (typeof bridgeJobKindColumnValues)[number];

export const bridgeJobRoutedAsValues = ["primary", "fallback", "queued_for_primary"] as const;
export type BridgeJobRoutedAs = (typeof bridgeJobRoutedAsValues)[number];

export const bridgeDevices = sqliteTable("bridge_devices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id").notNull(),
  deviceName: text("device_name").notNull(),
  /** bcrypt hash of the issued JWT — never store the JWT itself. */
  jwtTokenHash: text("jwt_token_hash").notNull(),
  /** Wire protocol version this device negotiated at pairing time. */
  protocolVersion: text("protocol_version").notNull().default("1.0.0"),
  pairedAt: integer("paired_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastDialAt: integer("last_dial_at", { mode: "timestamp_ms" }),
  lastIp: text("last_ip"),
  status: text("status").notNull().$type<BridgeDeviceStatus>().default("active"),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  revokedReason: text("revoked_reason"),
}, (table) => ({
  byWorkspace: index("bridge_devices_workspace_idx").on(table.workspaceId),
  byStatus: index("bridge_devices_status_idx").on(table.workspaceId, table.status),
}));

export const bridgePairingCodes = sqliteTable("bridge_pairing_codes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id").notNull(),
  /** bcrypt hash of the 6-char base32 code; raw code never stored. */
  codeHash: text("code_hash").notNull(),
  /** Optional device-name hint chosen at code-generation time. */
  deviceNameHint: text("device_name_hint"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  /** Set on consumption — points at the device row produced. */
  consumedDeviceId: text("consumed_device_id").references(() => bridgeDevices.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  byWorkspace: index("bridge_pairing_codes_workspace_idx").on(table.workspaceId),
}));

export const bridgeJobs = sqliteTable("bridge_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  /** The device this job is targeted at (after fallback resolution). */
  deviceId: text("device_id")
    .references(() => bridgeDevices.id)
    .notNull(),
  /** Originally-requested primary device — only differs from deviceId when fallback routing kicked in. */
  requestedDeviceId: text("requested_device_id").references(() => bridgeDevices.id),
  routedAs: text("routed_as").notNull().$type<BridgeJobRoutedAs>().default("primary"),
  processRunId: text("process_run_id")
    .references(() => processRuns.id)
    .notNull(),
  stepRunId: text("step_run_id")
    .references(() => stepRuns.id)
    .notNull(),
  kind: text("kind").notNull().$type<BridgeJobKindColumn>(),
  /** Discriminated by `kind` per packages/core/src/bridge/types.ts. */
  payload: text("payload", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  state: text("state").notNull().$type<BridgeJobStateColumn>().default("queued"),
  queuedAt: integer("queued_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  dispatchedAt: integer("dispatched_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  /** Updated every 60s from daemon pong frames; staleness sweeper checks this. */
  lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp_ms" }),
  exitCode: integer("exit_code"),
  stdoutBytes: integer("stdout_bytes").notNull().default(0),
  stderrBytes: integer("stderr_bytes").notNull().default(0),
  truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
  terminationSignal: text("termination_signal"),
  /** Error frame from the daemon (e.g., "tmux session 'X' does not exist"). */
  errorMessage: text("error_message"),
}, (table) => ({
  byDeviceState: index("bridge_jobs_device_state_idx").on(table.deviceId, table.state),
  byStepRun: index("bridge_jobs_step_run_idx").on(table.stepRunId),
  byHeartbeat: index("bridge_jobs_heartbeat_idx").on(table.state, table.lastHeartbeatAt),
}));
