/**
 * Harness Schema — Workspace-tier harness primitives
 *
 * Tables that belong to the per-workspace harness substrate but are
 * Ditto-product implementations (not yet promoted into @ditto/core).
 *
 * Deployment: lives in each Workspace DB alongside the engine tables.
 * Tier: workspace (terminal SQLite per ADR-036 §1).
 *
 * Provenance: relocated from src/db/schema/network.ts via Brief 262
 * (Network/Workspace Tier Reclassification). reviewPages was placed in
 * network.ts by historical accident; it is workspace-tier per its
 * importers (src/engine/review-pages.ts, src/engine/harness-handlers/
 * runner-pause.ts) and its dependence on workspace-tier processRuns.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

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

/**
 * Tokenized review surfaces produced by the workspace harness for human
 * review of agent output (Brief 106).
 *
 * `userId` and `personId` are both soft cross-tier references: in single-DB
 * SQLite today they target the network-tier `networkUsers` and `people`
 * tables respectively; post-Brief 263 (network on Postgres) they remain
 * soft references (no SQL-level FK across dialects per ADR-036 §3).
 * Application-layer joins must explicitly fetch from each tier and combine
 * in code.
 */
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
