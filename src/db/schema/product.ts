/**
 * Product Schema — Workspace-level Ditto features
 *
 * These are Ditto-specific product features that a workspace needs
 * but that aren't engine primitives. ProcessOS wouldn't need these.
 *
 * Deployment: lives in each Workspace DB alongside the engine tables.
 */

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";
import { workItems, processRuns } from "./engine.js";

// ============================================================
// Sessions — Conversational Self persistence (ADR-016)
// ============================================================

export const sessionSurfaceValues = ["cli", "telegram", "web", "inbound"] as const;
export type SessionSurface = (typeof sessionSurfaceValues)[number];

export const sessionStatusValues = ["active", "suspended", "closed"] as const;
export type SessionStatus = (typeof sessionStatusValues)[number];

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
    .$type<Array<{ role: string; content: string; timestamp: number; surface: string; toolNames?: string[] }>>()
    .default([]),
});

// ============================================================
// Interaction Events — UI observability signals (Brief 056)
// ============================================================

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

// ============================================================
// Budget Infrastructure (Brief 107)
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

// ============================================================
// SLM Training Data Pipeline (Brief 135/136)
// ============================================================

export const slmTrainingExportStatusValues = [
  "pending",
  "exported",
  "failed",
] as const;
export type SlmTrainingExportStatus = (typeof slmTrainingExportStatusValues)[number];

export const slmTrainingExports = sqliteTable("slm_training_exports", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processSlug: text("process_slug").notNull(),
  stepId: text("step_id").notNull(),
  purpose: text("purpose").notNull(),
  exampleCount: integer("example_count").notNull().default(0),
  format: text("format").notNull().default("jsonl"),
  exportPath: text("export_path").notNull(),
  scrubberUsed: text("scrubber_used").notNull().default("none"),
  status: text("status").notNull().$type<SlmTrainingExportStatus>().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const slmDeploymentStatusValues = [
  "candidate",
  "evaluating",
  "promoted",
  "retired",
] as const;
export type SlmDeploymentStatus = (typeof slmDeploymentStatusValues)[number];

export const slmDeployments = sqliteTable("slm_deployments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  processSlug: text("process_slug").notNull(),
  stepId: text("step_id").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  status: text("status").notNull().$type<SlmDeploymentStatus>().default("candidate"),
  trainingExportId: text("training_export_id")
    .references(() => slmTrainingExports.id),
  evalAccuracy: real("eval_accuracy"),
  evalF1: real("eval_f1"),
  evalExamples: integer("eval_examples"),
  productionRunCount: integer("production_run_count").default(0),
  productionApprovalRate: real("production_approval_rate"),
  baselineApprovalRate: real("baseline_approval_rate"),
  retiredReason: text("retired_reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  promotedAt: integer("promoted_at", { mode: "timestamp_ms" }),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }),
});

// ============================================================
// Workspace Assets — Generated images, media for social publishing
// ============================================================

export const assetTypeValues = ["image", "video", "document"] as const;
export type AssetType = (typeof assetTypeValues)[number];

export const workspaceAssets = sqliteTable("workspace_assets", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  /** What kind of asset */
  assetType: text("asset_type").notNull().$type<AssetType>(),
  /** Human-readable name (e.g., "Trust-earning thread header image") */
  name: text("name").notNull(),
  /** MIME type (image/png, video/mp4, etc.) */
  mimeType: text("mime_type").notNull(),
  /** File size in bytes */
  fileSize: integer("file_size"),
  /** Local file path relative to data/assets/ */
  storagePath: text("storage_path").notNull(),
  /** How this asset was created */
  source: text("source").notNull().$type<"generated" | "uploaded" | "screenshot">(),
  /** Generation prompt (if AI-generated) */
  prompt: text("prompt"),
  /** Process run that created this asset (if from a GTM cycle) */
  processRunId: text("process_run_id").references(() => processRuns.id),
  /** SHA-256 content hash for deduplication */
  contentHash: text("content_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  typeIdx: index("workspace_assets_type_idx").on(table.assetType),
  runIdx: index("workspace_assets_run_idx").on(table.processRunId),
}));
