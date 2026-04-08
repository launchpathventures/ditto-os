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

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
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
] as const;
export type MemoryType = (typeof memoryTypeValues)[number];

export const memorySourceValues = ["feedback", "human", "system", "conversation"] as const;
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
    .$type<Record<string, unknown>>(),
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
    .references(() => processes.id)
    .notNull(),
  service: text("service").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Process Model Library (Brief 104)
// ============================================================

export const processModelStatusValues = [
  "nominated",
  "testing",
  "standardised",
  "review",
  "published",
  "archived",
] as const;
export type ProcessModelStatus = (typeof processModelStatusValues)[number];

export const processModelComplexityValues = [
  "simple",
  "moderate",
  "complex",
] as const;
export type ProcessModelComplexity =
  (typeof processModelComplexityValues)[number];

export const processModelSourceValues = [
  "template",
  "built",
  "community",
] as const;
export type ProcessModelSource = (typeof processModelSourceValues)[number];

export const processModels = sqliteTable("process_models", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  industryTags: text("industry_tags", { mode: "json" })
    .$type<string[]>()
    .default([]),
  functionTags: text("function_tags", { mode: "json" })
    .$type<string[]>()
    .default([]),
  complexity: text("complexity")
    .notNull()
    .$type<ProcessModelComplexity>()
    .default("moderate"),
  version: integer("version").notNull().default(1),
  status: text("status")
    .notNull()
    .$type<ProcessModelStatus>()
    .default("nominated"),
  source: text("source")
    .notNull()
    .$type<ProcessModelSource>()
    .default("template"),
  processDefinition: text("process_definition", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  qualityCriteria: text("quality_criteria", { mode: "json" })
    .$type<string[]>()
    .default([]),
  validationReport: text("validation_report", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  nominatedBy: text("nominated_by"),
  approvedBy: text("approved_by"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
});
