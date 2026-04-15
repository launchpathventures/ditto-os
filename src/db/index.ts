/**
 * Ditto — Database Connection (SQLite via better-sqlite3)
 *
 * Zero-setup: auto-creates data/ directory and DB file on first run.
 * WAL mode for performance (antfarm pattern).
 * Schema sync: runs Drizzle Kit migrations on startup.
 *
 * Provenance: antfarm /src/db.ts (SQLite + WAL + auto-create)
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import * as schema from "./schema";
import { DB_PATH, DATA_DIR, PROJECT_ROOT } from "../paths.js";

// Auto-create data directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);

// WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export { schema };

/**
 * Ensure DB schema is up to date by running Drizzle Kit migrations.
 *
 * Single source of truth: migrations are generated from the Drizzle schema
 * via `pnpm db:generate`. No more hand-written SQL to keep in sync.
 *
 * For existing databases (pre-migration era), we detect whether the baseline
 * migration has already been applied by checking for the presence of tables.
 * If tables exist but no migration journal, we stamp the baseline as applied
 * so future migrations run cleanly.
 */
export function ensureSchema(): void {
  const migrationsFolder = path.join(PROJECT_ROOT, "drizzle");

  // Check if this is a pre-migration database that already has tables
  // but hasn't been through the Drizzle migration system yet
  const hasExistingTables = sqlite.prepare(
    "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='processes'"
  ).get() as { cnt: number };

  // Check if there are any migration records (not just the table existing — it may be empty)
  let hasMigrationEntries = false;
  try {
    const result = sqlite.prepare(
      "SELECT count(*) as cnt FROM __drizzle_migrations"
    ).get() as { cnt: number };
    hasMigrationEntries = result.cnt > 0;
  } catch {
    // Table doesn't exist yet — that's fine
  }

  if (hasExistingTables.cnt > 0 && !hasMigrationEntries) {
    // Existing DB from pre-migration era. Drop any empty/stale migration table
    // and stamp the baseline migration as applied.
    try { sqlite.exec("DROP TABLE IF EXISTS __drizzle_migrations"); } catch { /* ignore */ }
    // Read the migration journal to find the baseline migration hash.
    const metaPath = path.join(migrationsFolder, "meta", "_journal.json");
    if (fs.existsSync(metaPath)) {
      const journal = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      const baseline = journal.entries?.[0];
      if (baseline) {
        // Compute hash the same way drizzle-orm does: SHA-256 of the migration SQL
        const migrationSql = fs.readFileSync(
          path.join(migrationsFolder, `${baseline.tag}.sql`), "utf-8"
        );
        const hash = crypto.createHash("sha256").update(migrationSql).digest("hex");

        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL,
            created_at numeric
          )
        `);
        sqlite.prepare(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
        ).run(hash, baseline.when);

        // Apply any missing tables/columns that ensureSchema() used to add
        // but that exist in the baseline migration. Use IF NOT EXISTS to be safe.
        applyMissingSchemaObjects(sqlite);
      }
    }
  }

  migrate(db, { migrationsFolder });
}

/**
 * For databases that pre-date the migration system, apply any tables/indexes
 * that were added in later briefs but might be missing from the DB.
 * Uses IF NOT EXISTS so it's safe to run repeatedly.
 *
 * TRANSITIONAL CODE — remove once all deployed databases have run through
 * the Drizzle migration system at least once (i.e. have a row in
 * __drizzle_migrations). After that point, ensureSchema() stamps the baseline
 * and this function is never called.
 */
function applyMissingSchemaObjects(db: Database.Database): void {
  // Tables that were in the Drizzle schema but missing from old ensureSchema()
  const missingTableStatements = [
    `CREATE TABLE IF NOT EXISTS delayed_runs (
      id TEXT PRIMARY KEY NOT NULL,
      process_slug TEXT NOT NULL,
      inputs TEXT DEFAULT '{}' NOT NULL,
      execute_at INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      created_by_run_id TEXT,
      parent_trust_tier TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (created_by_run_id) REFERENCES process_runs(id)
    )`,
    `CREATE TABLE IF NOT EXISTS funnel_events (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      event TEXT NOT NULL,
      surface TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      format TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0 NOT NULL,
      source TEXT DEFAULT 'local' NOT NULL,
      last_indexed INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS document_content (
      id TEXT PRIMARY KEY NOT NULL,
      document_hash TEXT NOT NULL,
      parsed_markdown TEXT NOT NULL,
      page_count INTEGER DEFAULT 1 NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS document_content_document_hash_unique ON document_content(document_hash)`,
    `CREATE TABLE IF NOT EXISTS email_verification_codes (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      verified INTEGER DEFAULT false NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS review_pages (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      token TEXT NOT NULL,
      title TEXT NOT NULL,
      content_blocks TEXT NOT NULL,
      chat_messages TEXT,
      status TEXT DEFAULT 'active' NOT NULL,
      user_name TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed_at INTEGER,
      first_accessed_at INTEGER
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS review_pages_token_unique ON review_pages(token)`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY NOT NULL,
      goal_work_item_id TEXT NOT NULL REFERENCES work_items(id),
      user_id TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      spent_cents INTEGER DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'created' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS budgets_goal_work_item_id_unique ON budgets(goal_work_item_id)`,
    `CREATE TABLE IF NOT EXISTS budget_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      budget_id TEXT NOT NULL REFERENCES budgets(id),
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      description TEXT,
      sub_goal_id TEXT,
      stripe_payment_id TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS slm_training_exports (
      id TEXT PRIMARY KEY NOT NULL,
      process_slug TEXT NOT NULL,
      step_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      example_count INTEGER DEFAULT 0 NOT NULL,
      format TEXT DEFAULT 'jsonl' NOT NULL,
      export_path TEXT NOT NULL,
      scrubber_used TEXT DEFAULT 'none' NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS slm_deployments (
      id TEXT PRIMARY KEY NOT NULL,
      process_slug TEXT NOT NULL,
      step_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT DEFAULT 'candidate' NOT NULL,
      training_export_id TEXT REFERENCES slm_training_exports(id),
      eval_accuracy REAL,
      eval_f1 REAL,
      eval_examples INTEGER,
      production_run_count INTEGER DEFAULT 0,
      production_approval_rate REAL,
      baseline_approval_rate REAL,
      retired_reason TEXT,
      created_at INTEGER NOT NULL,
      promoted_at INTEGER,
      retired_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS interaction_events (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      properties TEXT DEFAULT '{}',
      timestamp INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS interaction_events_user_timestamp ON interaction_events(user_id, timestamp)`,
    `CREATE TABLE IF NOT EXISTS workspace_assets (
      id TEXT PRIMARY KEY NOT NULL,
      asset_type TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER,
      storage_path TEXT NOT NULL,
      source TEXT NOT NULL,
      prompt TEXT,
      process_run_id TEXT REFERENCES process_runs(id),
      content_hash TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS workspace_assets_type_idx ON workspace_assets(asset_type)`,
    `CREATE INDEX IF NOT EXISTS workspace_assets_run_idx ON workspace_assets(process_run_id)`,
  ];

  for (const stmt of missingTableStatements) {
    try {
      db.exec(stmt);
    } catch {
      // Ignore errors — table/index may already exist
    }
  }

  // Columns that were added via ALTER TABLE in the old ensureSchema()
  const alterStatements = [
    "ALTER TABLE managed_workspaces ADD COLUMN service_id TEXT",
    "ALTER TABLE managed_workspaces ADD COLUMN railway_environment_id TEXT",
    "ALTER TABLE managed_workspaces ADD COLUMN auth_secret_hash TEXT",
    "ALTER TABLE process_runs ADD COLUMN cycle_type TEXT",
    "ALTER TABLE process_runs ADD COLUMN cycle_config TEXT",
    "ALTER TABLE process_runs ADD COLUMN parent_cycle_run_id TEXT",
    "ALTER TABLE process_runs ADD COLUMN run_metadata TEXT",
    "ALTER TABLE process_runs ADD COLUMN timeout_at INTEGER",
    "ALTER TABLE process_runs ADD COLUMN chains_processed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE process_runs ADD COLUMN trust_tier_override TEXT",
    "ALTER TABLE step_runs ADD COLUMN cognitive_mode TEXT",
    "ALTER TABLE step_runs ADD COLUMN deferred_until INTEGER",
    "ALTER TABLE trust_suggestions ADD COLUMN step_category TEXT",
    "ALTER TABLE chat_sessions ADD COLUMN authenticated_email TEXT",
    "ALTER TABLE chat_sessions ADD COLUMN learned TEXT",
    "ALTER TABLE chat_sessions ADD COLUMN call_offered INTEGER DEFAULT 0",
    "ALTER TABLE chat_sessions ADD COLUMN voice_token TEXT",
    "ALTER TABLE network_users ADD COLUMN last_notified_at INTEGER",
  ];

  for (const stmt of alterStatements) {
    try {
      db.exec(stmt);
    } catch {
      // Ignore "duplicate column" — means column already exists
    }
  }

  // Backfill service_id from machine_id for existing Fly.io records
  try {
    db.exec("UPDATE managed_workspaces SET service_id = machine_id WHERE service_id IS NULL");
  } catch {
    // Ignore
  }
}
