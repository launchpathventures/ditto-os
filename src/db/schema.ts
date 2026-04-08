/**
 * Ditto — Core Database Schema (SQLite via Drizzle)
 *
 * The data model for the six-layer architecture.
 * Process is the primitive — everything else serves processes.
 *
 * Provenance: Drizzle SQLite patterns from remuspoienar/bun-elysia-drizzle-sqlite,
 * zero-setup pattern from snarktank/antfarm /src/db.ts
 */

import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

// ============================================================
// Type unions (replacing pgEnum)
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

// ============================================================
// Layer 1: Process Layer
// ============================================================

/** Process definitions — the atomic unit of Ditto */
export const processes = sqliteTable("processes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().$type<ProcessStatus>().default("draft"),

  // The full process definition (parsed from YAML)
  definition: text("definition", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),

  // Trust configuration
  trustTier: text("trust_tier")
    .notNull()
    .$type<TrustTier>()
    .default("supervised"),
  trustData: text("trust_data", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),

  // Process I/O (Brief 036): external source and output delivery config
  // Distinct from outputs[].destination (descriptive label) — these are executable integration configs
  source: text("source", { mode: "json" })
    .$type<{ service: string; action: string; params: Record<string, unknown>; intervalMs: number } | null>(),
  outputDelivery: text("output_delivery", { mode: "json" })
    .$type<{ service: string; action: string; params: Record<string, unknown> } | null>(),

  // What project/org this belongs to
  projectId: text("project_id"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Process dependencies — the awareness layer graph */
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

/** Agent definitions — the workforce */
export const agents = sqliteTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  role: text("role").notNull(),
  description: text("description"),
  status: text("status").notNull().$type<AgentStatus>().default("idle"),

  // Adapter configuration
  adapterType: text("adapter_type").notNull(),
  adapterConfig: text("adapter_config", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>()
    .default({}),

  // Budget
  monthlyBudgetCents: integer("monthly_budget_cents"),
  currentSpendCents: integer("current_spend_cents").notNull().default(0),
  budgetResetAt: integer("budget_reset_at", { mode: "timestamp_ms" }),

  // Performance
  totalRuns: integer("total_runs").notNull().default(0),
  successRate: real("success_rate"),

  // System agent classification (ADR-008)
  category: text("category").notNull().$type<AgentCategory>().default("domain"),
  systemRole: text("system_role"),

  // Agent identity (governance readiness — Phase 1 brief requirement)
  ownerId: text("owner_id"),
  organisationId: text("organisation_id"),
  permissions: text("permissions", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
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

/** A single execution of a process */
export const processRuns = sqliteTable("process_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processId: text("process_id")
    .references(() => processes.id)
    .notNull(),
  status: text("status").notNull().$type<RunStatus>().default("queued"),

  // What triggered this run
  triggeredBy: text("triggered_by").notNull(),

  // Input data for this run
  inputs: text("inputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),

  // Current step
  currentStepId: text("current_step_id"),

  // Timing
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),

  // Cost tracking
  totalTokens: integer("total_tokens").default(0),
  totalCostCents: integer("total_cost_cents").default(0),

  // Suspend state for human steps (serialized execution path + step results)
  // Provenance: Mastra path-based suspend/resume pattern
  suspendState: text("suspend_state", { mode: "json" })
    .$type<Record<string, unknown>>(),

  // Orchestrator confidence for goal-directed scheduling (Brief 021, Insight-045)
  // Process-level analogue of ADR-011's per-output confidence
  orchestratorConfidence: text("orchestrator_confidence")
    .$type<"high" | "medium" | "low">(),

  // Runtime process adaptation (ADR-020, Brief 044)
  // Run-scoped definition override — template stays durable, run gets adapted version.
  // Optimistic locking via version counter for concurrent adaptation safety.
  definitionOverride: text("definition_override", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  definitionOverrideVersion: integer("definition_override_version")
    .notNull()
    .default(0),

  // Chain processing flag (Brief 098a) — prevents duplicate chain execution
  chainsProcessed: integer("chains_processed", { mode: "boolean" })
    .notNull()
    .default(false),

  // Trust tier override for chain-spawned runs (Brief 098a AC9)
  // When set, heartbeat uses the more restrictive of this and the process's trust tier
  trustTierOverride: text("trust_tier_override").$type<TrustTier>(),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Individual step executions within a run */
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

  // Input/output for this step
  inputs: text("inputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  outputs: text("outputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),

  // Parallel group membership
  parallelGroupId: text("parallel_group_id"),

  // Execution details
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  tokensUsed: integer("tokens_used").default(0),
  costCents: integer("cost_cents").default(0),
  error: text("error"),

  // Confidence level (ADR-011: categorical high/medium/low)
  confidenceLevel: text("confidence_level").$type<"high" | "medium" | "low">(),

  // Model tracking (Brief 033 — which model executed this step, for learning/routing)
  model: text("model"),

  // Integration tracking (Brief 024 — which service/protocol was used per step)
  integrationService: text("integration_service"),
  integrationProtocol: text("integration_protocol"),

  // Integration tool calls log (Brief 025 — name, args, result summary, timestamp per call)
  toolCalls: text("tool_calls", { mode: "json" })
    .$type<Array<{ name: string; args: Record<string, unknown>; resultSummary: string; timestamp: number }>>(),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 3: Harness Layer — outputs and review
// ============================================================

/** Outputs produced by process runs, waiting for review or delivered */
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

  // The actual output content
  content: text("content", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  contentUrl: text("content_url"),

  // Review state
  needsReview: integer("needs_review", { mode: "boolean" })
    .notNull()
    .default(true),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewedBy: text("reviewed_by"),

  // Confidence
  confidenceScore: real("confidence_score"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 5: Learning Layer — feedback
// ============================================================

/** Feedback on outputs — the learning signal */
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

  // What changed (for edits)
  diff: text("diff", { mode: "json" }).$type<Record<string, unknown>>(),
  comment: text("comment"),

  // Edit severity (Phase 3a — computed from structured diff)
  editSeverity: text("edit_severity").$type<EditSeverity>(),
  editRatio: real("edit_ratio"),

  // Correction pattern (extracted by learning engine)
  correctionPattern: text("correction_pattern"),
  patternConfidence: real("pattern_confidence"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Memory scope type values */
export const memoryScopeTypeValues = ["agent", "process", "self", "person"] as const;
export type MemoryScopeType = (typeof memoryScopeTypeValues)[number];

/** Memory type values */
export const memoryTypeValues = [
  "correction",
  "preference",
  "context",
  "skill",
  "user_model",
  "solution",
] as const;
export type MemoryType = (typeof memoryTypeValues)[number];

/** Memory source values */
export const memorySourceValues = ["feedback", "human", "system", "conversation"] as const;
export type MemorySource = (typeof memorySourceValues)[number];

/**
 * Memories — learned patterns that persist across runs.
 * Four-scope model: agent-scoped (travels with agent) + process-scoped (stays with process)
 * + self-scoped (spans all, per user) + person-scoped (knowledge about a person in the network).
 * Person-scoped isolation via join: memories.scopeId → people.id → people.userId.
 * Provenance: ADR-003, ADR-016 (self scope), Brief 079/080 (person scope), Mem0 scope filtering, memU reinforcement counting.
 */
export const memories = sqliteTable("memories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  scopeType: text("scope_type").notNull().$type<MemoryScopeType>(),
  scopeId: text("scope_id").notNull(),

  type: text("type").notNull().$type<MemoryType>(),
  content: text("content").notNull(),

  // Structured metadata for solution memories (Brief 060)
  // Contains category, tags, rootCause, prevention, failedApproaches, severity, sourceRunId, relatedMemoryIds
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

  // House-level vs user-level for person-scoped memories (ADR-025)
  // When true: institutional knowledge visible across all users ("Priya prefers email")
  // When false (default): private to the creating user
  // Only meaningful for scopeType "person"; ignored for other scopes
  shared: integer("shared", { mode: "boolean" }).notNull().default(false),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Improvement proposals from the learning layer */
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

  // Decision tracking
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  decidedBy: text("decided_by"),
  decisionComment: text("decision_comment"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 3: Harness Layer — decisions
// ============================================================

/** Trust action values for harness decisions */
export const trustActionValues = [
  "pause",
  "advance",
  "sample_pause",
  "sample_advance",
] as const;
export type TrustAction = (typeof trustActionValues)[number];

/** Review result values for harness decisions */
export const reviewResultValues = [
  "pass",
  "flag",
  "retry",
  "skip",
] as const;
export type ReviewResult = (typeof reviewResultValues)[number];

/** Harness decisions — records every pipeline decision for every step */
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

  // Trust gate
  trustTier: text("trust_tier").notNull().$type<TrustTier>(),
  trustAction: text("trust_action").notNull().$type<TrustAction>(),

  // Review pattern
  reviewPattern: text("review_pattern", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  reviewResult: text("review_result").notNull().$type<ReviewResult>().default("skip"),
  reviewDetails: text("review_details", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  reviewCostCents: integer("review_cost_cents").notNull().default(0),

  // Memory
  memoriesInjected: integer("memories_injected").notNull().default(0),

  // Sampling
  samplingHash: text("sampling_hash"),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Layer 3: Harness Layer — trust changes
// ============================================================

/**
 * Trust change log — immutable record of every tier transition.
 * Provenance: Paperclip agentConfigRevisions (append-only revision log).
 */
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
// Layer 3: Harness Layer — trust suggestions
// ============================================================

/**
 * Trust upgrade suggestions — system proposes, human decides.
 * Provenance: Paperclip approvals table pattern.
 */
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
// Work Items — universal unit of work entering Ditto (ADR-010)
// ============================================================

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

/**
 * Work items — the universal unit of work entering Ditto.
 * Every input (question, task, goal, insight, outcome) becomes a work item.
 * Provenance: ADR-010, Paperclip goal ancestry pattern.
 */
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
  source: text("source")
    .notNull()
    .$type<WorkItemSource>()
    .default("capture"),

  // Goal ancestry — what goal this serves (ADR-010)
  goalAncestry: text("goal_ancestry", { mode: "json" })
    .$type<string[]>()
    .default([]),

  // Routing — which process handles this (set by router, or manual)
  assignedProcess: text("assigned_process").references(() => processes.id),

  // Spawning — goal decomposition (ADR-010, Insight-039: conditional flow)
  spawnedFrom: text("spawned_from"),
  spawnedItems: text("spawned_items", { mode: "json" })
    .$type<string[]>()
    .default([]),

  // Goal decomposition plan (Brief 021: task list with IDs, dependencies, status)
  decomposition: text("decomposition", { mode: "json" })
    .$type<Array<{ taskId: string; stepId: string; dependsOn: string[]; status: string }>>(),

  // Execution — links to process runs that handled this item
  executionIds: text("execution_ids", { mode: "json" })
    .$type<string[]>()
    .default([]),

  // Accumulated context from conversation, corrections, related items
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
// Credential Vault — encrypted per-process credentials (Brief 035)
// ============================================================

/**
 * Encrypted credential storage — per-(processId, service) scoping.
 * Values are AES-256-GCM encrypted, IV + authTag stored alongside.
 * Never expose encryptedValue/iv/authTag outside the vault module.
 * Provenance: ADR-005 (brokered credentials), Nango managed auth, Brief 035.
 */
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
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
}, (table) => [
  unique("credentials_process_service_unique").on(table.processId, table.service),
]);

// ============================================================
// Activity Feed — audit trail
// ============================================================

/** Activity log — everything that happens */
export const activities = sqliteTable("activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),

  // What happened
  action: text("action").notNull(),
  description: text("description"),

  // Who/what did it
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),

  // What it relates to (polymorphic)
  entityType: text("entity_type"),
  entityId: text("entity_id"),

  // Additional data
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),

  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Sessions — Conversational Self persistence (ADR-016)
// ============================================================

export const sessionSurfaceValues = ["cli", "telegram", "web", "inbound"] as const;
export type SessionSurface = (typeof sessionSurfaceValues)[number];

export const sessionStatusValues = ["active", "suspended", "closed"] as const;
export type SessionStatus = (typeof sessionStatusValues)[number];

/**
 * Sessions — persistent conversation state for the Conversational Self.
 * Turns stored as JSON array (not separate rows).
 * Provenance: LangGraph checkpointing, Mastra suspend/resume, ADR-016 section 4.
 */
export const sessions = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  surface: text("surface").notNull().$type<SessionSurface>(),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  status: text("status")
    .notNull()
    .$type<SessionStatus>()
    .default("active"),
  summary: text("summary"),
  turns: text("turns", { mode: "json" })
    .notNull()
    .$type<Array<{ role: string; content: string; timestamp: number; surface: string }>>()
    .default([]),
});

// ============================================================
// Interaction Events — UI observability signals (Brief 056)
// ============================================================

/**
 * Interaction events — semantic UI signals for the learning layer.
 * Implicit signals (weaker than explicit feedback) feed meta-processes,
 * NOT trust computation. Privacy by design: entity IDs + timestamps, not content.
 * Provenance: PostHog/Segment event model (pattern), Brief 056.
 */
export const interactionEvents = sqliteTable("interaction_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  entityId: text("entity_id"),
  properties: text("properties", { mode: "json" })
    .$type<Record<string, unknown>>()
    .default({}),
  timestamp: integer("timestamp", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("interaction_events_user_timestamp").on(table.userId, table.timestamp),
]);

// ============================================================
// Briefs — lifecycle sync from files to DB (Brief 056)
// ============================================================

/**
 * Brief lifecycle state synced from markdown files to DB.
 * Meta-processes (project-orchestration) query this table, not the filesystem.
 * Soft-deleted when file removed (status → "deleted").
 * Provenance: brief-index.ts file parsing (Brief 055), Brief 056.
 */
// ============================================================
// Schedules — cron-based process triggers (Brief 076)
// ============================================================

/**
 * Schedule definitions — cron-based triggers for automatic process runs.
 * Provenance: Brief 076, node-cron for scheduling.
 */
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
// Delayed Runs — deferred process execution (Brief 098a)
// ============================================================

export const delayedRunStatusValues = ["pending", "executed", "cancelled"] as const;
export type DelayedRunStatus = (typeof delayedRunStatusValues)[number];

/** Delayed process runs — created by chain executor, executed by pulse */
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
  // Parent trust tier — chain-spawned runs inherit the more restrictive tier (AC9)
  parentTrustTier: text("parent_trust_tier").$type<TrustTier>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Network Agent — People and Interactions (Brief 079/080)
// ============================================================

/** Visibility values for people in the relationship graph */
export const personVisibilityValues = ["internal", "connection"] as const;
export type PersonVisibility = (typeof personVisibilityValues)[number];

/** Journey layer values (three-layer model, Insight-151) */
export const journeyLayerValues = ["participant", "active", "workspace"] as const;
export type JourneyLayer = (typeof journeyLayerValues)[number];

/** Person trust level — Ditto's earned reputation with this person (Insight-149) */
export const personTrustLevelValues = ["cold", "familiar", "trusted"] as const;
export type PersonTrustLevel = (typeof personTrustLevelValues)[number];

/** Persona assignment values */
export const personaValues = ["alex", "mira"] as const;
export type PersonaId = (typeof personaValues)[number];

/** Person source values */
export const personSourceValues = ["manual", "enrichment", "reply", "introduction"] as const;
export type PersonSource = (typeof personSourceValues)[number];

/**
 * People — everyone Ditto knows about in the relationship graph.
 * Two audiences: internal (Ditto's working graph, invisible to user) and
 * connection (user's visible relationships, promoted on two-way interaction).
 * Provenance: Brief 079/080, Insight-146 (cross-instance memory), Insight-149 (trust tiers on recipients).
 */
export const people = sqliteTable("people", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  organization: text("organization"),
  role: text("role"),
  source: text("source").notNull().$type<PersonSource>().default("manual"),
  journeyLayer: text("journey_layer").notNull().$type<JourneyLayer>().default("participant"),
  visibility: text("visibility").notNull().$type<PersonVisibility>().default("internal"),
  personaAssignment: text("persona_assignment").$type<PersonaId>(),
  trustLevel: text("trust_level").notNull().$type<PersonTrustLevel>().default("cold"),
  optedOut: integer("opted_out", { mode: "boolean" }).notNull().default(false),
  lastInteractionAt: integer("last_interaction_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("people_user_id").on(table.userId),
  index("people_user_visibility").on(table.userId, table.visibility),
  index("people_email").on(table.email),
]);

/** Interaction type values */
export const interactionTypeValues = [
  "outreach_sent",
  "reply_received",
  "reply_sent",
  "introduction_made",
  "introduction_received",
  "meeting_booked",
  "follow_up",
  "nurture",
  "opt_out",
] as const;
export type InteractionType = (typeof interactionTypeValues)[number];

/** Interaction channel values */
export const interactionChannelValues = ["email", "voice", "sms", "workspace"] as const;
export type InteractionChannel = (typeof interactionChannelValues)[number];

/** Interaction mode values */
export const interactionModeValues = ["selling", "connecting", "nurture"] as const;
export type InteractionMode = (typeof interactionModeValues)[number];

/** Interaction outcome values */
export const interactionOutcomeValues = ["positive", "neutral", "negative", "no_response"] as const;
export type InteractionOutcome = (typeof interactionOutcomeValues)[number];

/**
 * Interactions — every touchpoint between Ditto and a person.
 * Records outreach, replies, introductions, meetings, follow-ups, nurture.
 * Provenance: Brief 079/080, Insight-147 (recipient experience is growth engine).
 */
export const interactions = sqliteTable("interactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  personId: text("person_id")
    .references(() => people.id)
    .notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull().$type<InteractionType>(),
  channel: text("channel").notNull().$type<InteractionChannel>().default("email"),
  mode: text("mode").notNull().$type<InteractionMode>(),
  subject: text("subject"),
  summary: text("summary"),
  outcome: text("outcome").$type<InteractionOutcome>(),
  processRunId: text("process_run_id").references(() => processRuns.id),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, unknown> | null>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("interactions_person_id").on(table.personId),
  index("interactions_user_id").on(table.userId),
]);

// ============================================================
// Network Users — people working WITH Ditto (Layer 2+)
// ============================================================

/** Network user status values */
export const networkUserStatusValues = ["active", "workspace", "churned"] as const;
export type NetworkUserStatus = (typeof networkUserStatusValues)[number];

/**
 * Network users — people who are actively working with Ditto (Layer 2+).
 * Distinct from the `people` table (everyone Alex knows).
 * A network user starts when someone begins working with Alex via intake.
 * When they provision a workspace, status changes to "workspace" and
 * workspaceId links to their instance.
 *
 * The user model (what Alex knows about them) is stored as memories
 * with scopeType "self" and scopeId = networkUser.id — same memory
 * system, different deployment home (Network vs Workspace).
 *
 * Provenance: Brief 079, Insight-152 (Network Service is centralized).
 */
export const networkUsers = sqliteTable("network_users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  businessContext: text("business_context"),
  personaAssignment: text("persona_assignment").$type<PersonaId>(),
  status: text("status").notNull().$type<NetworkUserStatus>().default("active"),
  /** Links to workspace instance when provisioned (URL or instance ID) */
  workspaceId: text("workspace_id"),
  /** The person record for this user in the people graph (they're also a person Alex knows) */
  personId: text("person_id").references(() => people.id),
  /** When Alex suggested a workspace to this user. Set once, never cleared (one-time per lifecycle). Brief 099c AC4. */
  workspaceSuggestedAt: integer("workspace_suggested_at", { mode: "timestamp_ms" }),
  /** True when user has expressed desire for visibility into their work (e.g., "show me everything"). Set by Self on intent detection. Brief 099c AC1. */
  wantsVisibility: integer("wants_visibility", { mode: "boolean" }).notNull().default(false),
  /** When admin paused Alex for this user. Null = not paused. Brief 108 AC3. */
  pausedAt: integer("paused_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_users_email").on(table.email),
]);

// ============================================================
// Admin Feedback — admin-scoped guidance for Alex (Brief 108)
// ============================================================

/**
 * Admin feedback — guidance from the Ditto admin team to Alex about specific users.
 * Stored as admin-scoped memory that Alex loads in context for that user.
 * Distinct from user feedback (Layer 5 feedback table) — this is operational guidance.
 *
 * Provenance: Brief 108, Insight-160 (admin reviews on downgrade).
 */
export const adminFeedback = sqliteTable("admin_feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  feedback: text("feedback").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("admin_feedback_user_id").on(table.userId),
]);

// ============================================================
// Network Tokens — API authentication for workspace connections
// ============================================================

/**
 * Network tokens — Bearer tokens for workspace → Network API authentication.
 * Tokens are stored hashed (SHA-256) for security. Validation uses
 * timing-safe comparison. Revoked tokens have a non-null revokedAt.
 *
 * Provenance: Brief 088, ADR-025 (Network API auth).
 */
export const networkTokens = sqliteTable("network_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("network_tokens_user_id").on(table.userId),
  index("network_tokens_hash").on(table.tokenHash),
]);

// ============================================================
// Managed Workspaces — fleet registry for provisioned workspaces
// ============================================================

export const workspaceStatusValues = [
  "provisioning",
  "healthy",
  "degraded",
  "deprovisioned",
] as const;
export type WorkspaceStatus = (typeof workspaceStatusValues)[number];

export const healthStatusValues = [
  "ok",
  "liveness_failed",
  "readiness_failed",
] as const;
export type HealthStatus = (typeof healthStatusValues)[number];

/**
 * Managed workspaces — fleet registry for provisioned Railway workspaces.
 * One workspace per user. Tracks lifecycle from provisioning to deprovisioning.
 *
 * Provenance: Brief 090, Brief 100 (Railway migration), ADR-025 (centralized Network Service).
 */
export const managedWorkspaces = sqliteTable("managed_workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull().unique(),
  /** @deprecated Dead column — kept for backward compat after Railway migration (Brief 100). */
  machineId: text("machine_id").notNull(),
  volumeId: text("volume_id").notNull(),
  workspaceUrl: text("workspace_url").notNull(),
  region: text("region").notNull().default("syd"),
  imageRef: text("image_ref").notNull(),
  currentVersion: text("current_version"),
  status: text("status").notNull().$type<WorkspaceStatus>().default("provisioning"),
  lastHealthCheckAt: integer("last_health_check_at", { mode: "timestamp_ms" }),
  lastHealthStatus: text("last_health_status").$type<HealthStatus>(),
  errorLog: text("error_log"),
  tokenId: text("token_id").notNull(),
  /** Railway service ID — primary identifier after migration from Fly.io (Brief 100). */
  serviceId: text("service_id"),
  /** Railway environment ID — needed for deploys and variable upserts. */
  railwayEnvironmentId: text("railway_environment_id"),
  /** SHA-256 hash of the NETWORK_AUTH_SECRET injected during provisioning (never the raw secret). */
  authSecretHash: text("auth_secret_hash"),
  deprovisionedAt: integer("deprovisioned_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Fleet Upgrades — rolling upgrade history and per-workspace results (Brief 091)
// ============================================================

export const upgradeStatusValues = [
  "in_progress",
  "completed",
  "partial",
  "failed",
  "circuit_breaker_tripped",
  "rolled_back",
] as const;
export type UpgradeStatus = (typeof upgradeStatusValues)[number];

export const canaryResultValues = ["passed", "failed"] as const;
export type CanaryResult = (typeof canaryResultValues)[number];

export const upgradeTriggeredByValues = ["cli", "api", "ci"] as const;
export type UpgradeTriggeredBy = (typeof upgradeTriggeredByValues)[number];

/**
 * Upgrade history — audit trail for every fleet upgrade attempt.
 * Each attempt records canary result, circuit breaker state, and per-workspace outcomes.
 *
 * Provenance: Brief 091, Fly.io release history pattern, Google SRE canary deployment.
 */
export const upgradeHistory = sqliteTable("upgrade_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  imageRef: text("image_ref").notNull(),
  previousImageRef: text("previous_image_ref"),
  status: text("status").notNull().$type<UpgradeStatus>().default("in_progress"),
  totalWorkspaces: integer("total_workspaces").notNull(),
  upgradedCount: integer("upgraded_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  canaryWorkspaceId: text("canary_workspace_id"),
  canaryResult: text("canary_result").$type<CanaryResult>(),
  circuitBreakerAt: integer("circuit_breaker_at", { mode: "timestamp_ms" }),
  errorSummary: text("error_summary"),
  triggeredBy: text("triggered_by").notNull().$type<UpgradeTriggeredBy>(),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const workspaceUpgradeResultValues = [
  "upgraded",
  "failed",
  "rolled_back",
  "skipped",
] as const;
export type WorkspaceUpgradeResult = (typeof workspaceUpgradeResultValues)[number];

export const upgradeHealthCheckResultValues = [
  "ok",
  "liveness_failed",
  "readiness_failed",
  "timeout",
] as const;
export type UpgradeHealthCheckResult = (typeof upgradeHealthCheckResultValues)[number];

/**
 * Per-workspace results for each upgrade attempt.
 * Records previous image (for rollback), health check result, duration.
 *
 * Provenance: Brief 091, saga compensating actions pattern.
 */
export const upgradeWorkspaceResults = sqliteTable("upgrade_workspace_results", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  upgradeId: text("upgrade_id")
    .references(() => upgradeHistory.id)
    .notNull(),
  workspaceId: text("workspace_id")
    .references(() => managedWorkspaces.id)
    .notNull(),
  previousImageRef: text("previous_image_ref").notNull(),
  result: text("result").notNull().$type<WorkspaceUpgradeResult>(),
  healthCheckResult: text("health_check_result").$type<UpgradeHealthCheckResult>(),
  errorLog: text("error_log"),
  durationMs: integer("duration_ms"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Suggestion Dismissals — proactive guidance feedback loop
// ============================================================

/**
 * Dismissed suggestions — prevents repeating dismissed suggestions for 30 days.
 * The coverage-agent and suggest_next tool check this table before surfacing.
 * Provenance: Insight-142, cognitive/self.md proactive guidance spec.
 */
export const suggestionDismissals = sqliteTable("suggestion_dismissals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  suggestionType: text("suggestion_type").notNull(), // Coverage, Trust, Understanding, Improvement, Timing
  contentHash: text("content_hash").notNull(), // SHA-256 hash of suggestion content
  content: text("content").notNull(), // Original suggestion text (for debugging)
  dismissedAt: integer("dismissed_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull(),
}, (table) => [
  index("suggestion_dismissals_user_expires").on(table.userId, table.expiresAt),
]);

// ============================================================
// Briefs — lifecycle sync from files to DB (Brief 056)
// ============================================================

export const briefs = sqliteTable("briefs", {
  number: integer("number").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  dependsOn: text("depends_on"),
  unlocks: text("unlocks"),
  filePath: text("file_path"),
  lastModified: integer("last_modified", { mode: "timestamp_ms" }),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Front Door Chat Sessions (Brief 093)
// ============================================================

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  sessionId: text("session_id").notNull().unique(),
  messages: text("messages", { mode: "json" }).notNull().$type<Array<{ role: string; content: string }>>(),
  context: text("context").notNull(), // "front-door" | "referred"
  ipHash: text("ip_hash").notNull(),
  requestEmailFlagged: integer("request_email_flagged", { mode: "boolean" }).notNull().default(false),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
});

export const verifyAttempts = sqliteTable("verify_attempts", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ipHash: text("ip_hash").notNull(),
  email: text("email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const verificationEmails = sqliteTable("verification_emails", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  recipientEmail: text("recipient_email").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const funnelEvents = sqliteTable("funnel_events", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  sessionId: text("session_id").notNull(),
  event: text("event").notNull(),
  surface: text("surface").notNull(), // "front-door" | "verify" | "referred"
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Knowledge Base — Document tracking (Brief 079)
// ============================================================

export const documentSourceValues = ["llamaparse", "local"] as const;
export type DocumentSource = (typeof documentSourceValues)[number];

/** Tracks ingested documents for change detection and provenance */
export const documents = sqliteTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  format: text("format").notNull(), // pdf, docx, html, etc.
  contentHash: text("content_hash").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  source: text("source").notNull().$type<DocumentSource>().default("local"),
  lastIndexed: integer("last_indexed", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Review Pages (Brief 106 — Bespoke Signed Review Pages)
// ============================================================

export const reviewPageStatusValues = [
  "active",
  "completed",
  "archived",
  "expired",
] as const;
export type ReviewPageStatus = (typeof reviewPageStatusValues)[number];

/** Ephemeral signed review pages for rich content between email and workspace (Brief 106, Insight-164) */
export const reviewPages = sqliteTable("review_pages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  personId: text("person_id").notNull(),
  token: text("token").notNull().unique(),
  title: text("title").notNull(),
  contentBlocks: text("content_blocks", { mode: "json" }).notNull().$type<unknown[]>(),
  chatMessages: text("chat_messages", { mode: "json" }).$type<unknown[]>(),
  status: text("status").notNull().$type<ReviewPageStatus>().default("active"),
  userName: text("user_name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  firstAccessedAt: integer("first_accessed_at", { mode: "timestamp_ms" }),
});

/** Stores full parsed markdown for document viewer (Layer 3, Brief 079) */
export const documentContent = sqliteTable("document_content", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  documentHash: text("document_hash").notNull().unique(),
  parsedMarkdown: text("parsed_markdown").notNull(),
  pageCount: integer("page_count").notNull().default(1),
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

/** Curated process models for the Process Model Library (Brief 104) */
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

// ============================================================
// Budget Infrastructure — Per-Goal Spend Tracking (Brief 107)
// ============================================================

export const budgetStatusValues = [
  "created",
  "funded",
  "active",
  "exhausted",
  "closed",
] as const;
export type BudgetStatus = (typeof budgetStatusValues)[number];

export const budgetTransactionTypeValues = [
  "load",
  "spend",
  "refund",
] as const;
export type BudgetTransactionType = (typeof budgetTransactionTypeValues)[number];

/**
 * Budgets — per-goal spend allocation.
 * Created when user says "here's $X for this goal".
 * One budget per goal (unique goalWorkItemId).
 * All amounts in integer cents — no floating-point.
 *
 * Provenance: Brief 107, professional services engagement model.
 */
export const budgets = sqliteTable("budgets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  goalWorkItemId: text("goal_work_item_id")
    .references(() => workItems.id)
    .notNull()
    .unique(),
  userId: text("user_id").notNull(),
  totalCents: integer("total_cents").notNull(),
  spentCents: integer("spent_cents").notNull().default(0),
  status: text("status").notNull().$type<BudgetStatus>().default("created"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Budget transactions — immutable ledger of all budget movements.
 * load: funds added (Stripe payment), spend: funds used, refund: funds returned.
 * Once created, never updated or deleted (audit trail).
 *
 * Provenance: Brief 107, simplified double-entry bookkeeping pattern.
 */
export const budgetTransactions = sqliteTable("budget_transactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  budgetId: text("budget_id")
    .references(() => budgets.id)
    .notNull(),
  type: text("type").notNull().$type<BudgetTransactionType>(),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  subGoalId: text("sub_goal_id"),
  stripePaymentId: text("stripe_payment_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
