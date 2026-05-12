/**
 * Knowledge Schema — Workspace-tier knowledge-base primitives
 *
 * Tables that track per-workspace knowledge documents (ingested from disk
 * or external connectors) and their parsed-markdown content.
 *
 * Deployment: lives in each Workspace DB alongside the engine tables.
 * Tier: workspace (terminal SQLite per ADR-036 §1) — knowledge is per
 * workspace; no shared/network-tier knowledge primitive exists today.
 *
 * Provenance: relocated from src/db/schema/network.ts via Brief 262
 * (Network/Workspace Tier Reclassification). documents + documentContent
 * were placed in network.ts by historical accident; their importers
 * (src/engine/knowledge/ingest.ts, packages/web/app/api/knowledge/
 * document/route.ts) are workspace-side.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

// ============================================================
// Type unions
// ============================================================

export const documentSourceValues = ["llamaparse", "local"] as const;
export type DocumentSource = (typeof documentSourceValues)[number];

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
