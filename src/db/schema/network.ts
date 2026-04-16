/**
 * Network Schema — Centralized Ditto Network Service tables
 *
 * These tables serve the shared relationship graph, personas,
 * fleet management, and pre-workspace user journey per ADR-025.
 *
 * Deployment: lives on the centralized Ditto Network service,
 * NOT in individual workspace DBs.
 */

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";
import { processRuns } from "./engine.js";

// ============================================================
// Type unions — Network-specific
// ============================================================

export const personVisibilityValues = ["internal", "connection"] as const;
export type PersonVisibility = (typeof personVisibilityValues)[number];

export const journeyLayerValues = ["participant", "active", "workspace"] as const;
export type JourneyLayer = (typeof journeyLayerValues)[number];

export const personTrustLevelValues = ["cold", "familiar", "trusted"] as const;
export type PersonTrustLevel = (typeof personTrustLevelValues)[number];

export const personaValues = ["alex", "mira"] as const;
export type PersonaId = (typeof personaValues)[number];

export const personSourceValues = ["manual", "enrichment", "reply", "introduction"] as const;
export type PersonSource = (typeof personSourceValues)[number];

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

export const interactionChannelValues = ["email", "voice", "sms", "workspace", "social"] as const;
export type InteractionChannel = (typeof interactionChannelValues)[number];

export const interactionModeValues = ["selling", "connecting", "nurture"] as const;
export type InteractionMode = (typeof interactionModeValues)[number];

export const interactionOutcomeValues = ["positive", "neutral", "negative", "no_response", "deferred", "question", "auto_reply"] as const;
export type InteractionOutcome = (typeof interactionOutcomeValues)[number];

export const networkUserStatusValues = ["active", "workspace", "churned"] as const;
export type NetworkUserStatus = (typeof networkUserStatusValues)[number];

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

export const documentSourceValues = ["llamaparse", "local"] as const;
export type DocumentSource = (typeof documentSourceValues)[number];

// ============================================================
// People — shared relationship graph (ADR-025 §2)
// ============================================================

/**
 * People — everyone Ditto knows about in the relationship graph.
 * Two audiences: internal (Ditto's working graph) and connection (user's visible relationships).
 * Provenance: Brief 079/080, Insight-146, Insight-149.
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

/**
 * Interactions — every touchpoint between Ditto and a person.
 * Provenance: Brief 079/080, Insight-147.
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

export const networkUsers = sqliteTable("network_users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  businessContext: text("business_context"),
  personaAssignment: text("persona_assignment").$type<PersonaId>(),
  status: text("status").notNull().$type<NetworkUserStatus>().default("active"),
  workspaceId: text("workspace_id"),
  personId: text("person_id").references(() => people.id),
  workspaceSuggestedAt: integer("workspace_suggested_at", { mode: "timestamp_ms" }),
  /** AgentMail threadId of the status email containing the workspace suggestion (Brief 153) */
  suggestionThreadId: text("suggestion_thread_id"),
  /** When the user accepted the workspace suggestion (Brief 153) */
  workspaceAcceptedAt: integer("workspace_accepted_at", { mode: "timestamp_ms" }),
  wantsVisibility: integer("wants_visibility", { mode: "boolean" }).notNull().default(false),
  pausedAt: integer("paused_at", { mode: "timestamp_ms" }),
  /** When Alex last sent a notification email to this user (status, pulse, completion).
   *  Updated by notifyUser() on successful send. Used for recency gating. */
  lastNotifiedAt: integer("last_notified_at", { mode: "timestamp_ms" }),
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
// Admin Feedback — admin-scoped guidance (Brief 108)
// ============================================================

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
// Network Tokens — API authentication
// ============================================================

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
// Managed Workspaces — fleet registry (Brief 090/100)
// ============================================================

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
  serviceId: text("service_id"),
  railwayEnvironmentId: text("railway_environment_id"),
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
// Fleet Upgrades (Brief 091)
// ============================================================

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
// Review Pages (Brief 106)
// ============================================================

export const reviewPageStatusValues = [
  "active",
  "completed",
  "archived",
  "expired",
] as const;
export type ReviewPageStatus = (typeof reviewPageStatusValues)[number];

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

// ============================================================
// Knowledge Base — Document tracking (Brief 079)
// ============================================================

export const documents = sqliteTable("documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  format: text("format").notNull(),
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
