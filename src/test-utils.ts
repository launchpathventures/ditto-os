/**
 * Ditto — Test Utilities
 *
 * Shared helpers for integration tests.
 * Creates fresh SQLite databases per test — no mocks.
 *
 * Provenance: Real DB, not mocks (QA research + Phase 3 retro).
 */

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./db/schema";
import fs from "fs";
import path from "path";
import os from "os";

export type TestDb = BetterSQLite3Database<typeof schema>;

/**
 * Create a fresh test database with all tables.
 * Uses a temp file (not in-memory) because some queries rely on
 * features that behave differently in-memory.
 * Returns { db, cleanup } — call cleanup() in afterEach.
 */
export function createTestDb(): { db: TestDb; dbPath: string; cleanup: () => void } {
  const dbPath = path.join(os.tmpdir(), `ditto-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Create all tables using raw SQL from the schema
  createTables(sqlite);

  return {
    db,
    dbPath,
    cleanup: () => {
      sqlite.close();
      try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
      try { fs.unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
      try { fs.unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
    },
  };
}

/**
 * Create all schema tables in a raw SQLite database.
 *
 * WARNING: This SQL must be kept in sync with src/db/schema.ts.
 * If the Drizzle schema changes (new columns, renamed fields, new tables),
 * update this function to match.
 */
function createTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS processes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      definition TEXT NOT NULL DEFAULT '{}',
      trust_tier TEXT NOT NULL DEFAULT 'supervised',
      trust_data TEXT DEFAULT '{}',
      source TEXT,
      output_delivery TEXT,
      project_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS process_dependencies (
      id TEXT PRIMARY KEY,
      source_process_id TEXT NOT NULL REFERENCES processes(id),
      target_process_id TEXT NOT NULL REFERENCES processes(id),
      output_name TEXT NOT NULL,
      input_name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      adapter_type TEXT NOT NULL,
      adapter_config TEXT NOT NULL DEFAULT '{}',
      category TEXT NOT NULL DEFAULT 'domain',
      system_role TEXT,
      monthly_budget_cents INTEGER,
      current_spend_cents INTEGER NOT NULL DEFAULT 0,
      budget_reset_at INTEGER,
      total_runs INTEGER NOT NULL DEFAULT 0,
      success_rate REAL,
      owner_id TEXT,
      organisation_id TEXT,
      permissions TEXT,
      provenance TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS process_runs (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id),
      status TEXT NOT NULL DEFAULT 'queued',
      triggered_by TEXT NOT NULL,
      inputs TEXT DEFAULT '{}',
      current_step_id TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      total_tokens INTEGER DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0,
      suspend_state TEXT,
      orchestrator_confidence TEXT,
      definition_override TEXT,
      definition_override_version INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS step_runs (
      id TEXT PRIMARY KEY,
      process_run_id TEXT NOT NULL REFERENCES process_runs(id),
      step_id TEXT NOT NULL,
      agent_id TEXT REFERENCES agents(id),
      status TEXT NOT NULL DEFAULT 'queued',
      executor_type TEXT NOT NULL,
      inputs TEXT DEFAULT '{}',
      outputs TEXT DEFAULT '{}',
      parallel_group_id TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      tokens_used INTEGER DEFAULT 0,
      cost_cents INTEGER DEFAULT 0,
      error TEXT,
      confidence_level TEXT,
      model TEXT,
      integration_service TEXT,
      integration_protocol TEXT,
      tool_calls TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS process_outputs (
      id TEXT PRIMARY KEY,
      process_run_id TEXT NOT NULL REFERENCES process_runs(id),
      step_run_id TEXT REFERENCES step_runs(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      content_url TEXT,
      needs_review INTEGER NOT NULL DEFAULT 1,
      reviewed_at INTEGER,
      reviewed_by TEXT,
      confidence_score REAL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      output_id TEXT NOT NULL REFERENCES process_outputs(id),
      process_id TEXT NOT NULL REFERENCES processes(id),
      type TEXT NOT NULL,
      diff TEXT,
      comment TEXT,
      edit_severity TEXT,
      edit_ratio REAL,
      correction_pattern TEXT,
      pattern_confidence REAL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      source TEXT NOT NULL,
      source_id TEXT,
      reinforcement_count INTEGER NOT NULL DEFAULT 1,
      last_reinforced_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      confidence REAL NOT NULL DEFAULT 0.3,
      active INTEGER NOT NULL DEFAULT 1,
      shared INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS improvements (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id),
      status TEXT NOT NULL DEFAULT 'proposed',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT NOT NULL,
      estimated_impact TEXT,
      estimated_effort TEXT,
      risk TEXT,
      confidence REAL,
      decided_at INTEGER,
      decided_by TEXT,
      decision_comment TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS harness_decisions (
      id TEXT PRIMARY KEY,
      process_run_id TEXT NOT NULL REFERENCES process_runs(id),
      step_run_id TEXT NOT NULL REFERENCES step_runs(id),
      trust_tier TEXT NOT NULL,
      trust_action TEXT NOT NULL,
      review_pattern TEXT NOT NULL DEFAULT '[]',
      review_result TEXT NOT NULL DEFAULT 'skip',
      review_details TEXT DEFAULT '{}',
      review_cost_cents INTEGER NOT NULL DEFAULT 0,
      memories_injected INTEGER NOT NULL DEFAULT 0,
      sampling_hash TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS trust_changes (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id),
      from_tier TEXT NOT NULL,
      to_tier TEXT NOT NULL,
      reason TEXT NOT NULL,
      actor TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS trust_suggestions (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id),
      current_tier TEXT NOT NULL,
      suggested_tier TEXT NOT NULL,
      evidence TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      decided_at INTEGER,
      decided_by TEXT,
      decision_comment TEXT,
      previous_suggestion_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'task',
      status TEXT NOT NULL DEFAULT 'intake',
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'capture',
      goal_ancestry TEXT DEFAULT '[]',
      assigned_process TEXT REFERENCES processes(id),
      spawned_from TEXT,
      spawned_items TEXT DEFAULT '[]',
      decomposition TEXT,
      execution_ids TEXT DEFAULT '[]',
      context TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      description TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      surface TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      last_active_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT,
      turns TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id),
      service TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(process_id, service)
    );

    CREATE TABLE IF NOT EXISTS interaction_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_id TEXT,
      properties TEXT DEFAULT '{}',
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS interaction_events_user_timestamp
      ON interaction_events(user_id, timestamp);

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      process_id TEXT NOT NULL REFERENCES processes(id),
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      organization TEXT,
      role TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      journey_layer TEXT NOT NULL DEFAULT 'participant',
      visibility TEXT NOT NULL DEFAULT 'internal',
      persona_assignment TEXT,
      trust_level TEXT NOT NULL DEFAULT 'cold',
      opted_out INTEGER NOT NULL DEFAULT 0,
      last_interaction_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS people_user_id ON people(user_id);
    CREATE INDEX IF NOT EXISTS people_user_visibility ON people(user_id, visibility);
    CREATE INDEX IF NOT EXISTS people_email ON people(email);

    CREATE TABLE IF NOT EXISTS interactions (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id),
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      mode TEXT NOT NULL,
      subject TEXT,
      summary TEXT,
      outcome TEXT,
      process_run_id TEXT REFERENCES process_runs(id),
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS interactions_person_id ON interactions(person_id);
    CREATE INDEX IF NOT EXISTS interactions_user_id ON interactions(user_id);

    CREATE TABLE IF NOT EXISTS network_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      business_context TEXT,
      persona_assignment TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      workspace_id TEXT,
      person_id TEXT REFERENCES people(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS network_users_email ON network_users(email);

    CREATE TABLE IF NOT EXISTS network_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      revoked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS network_tokens_user_id ON network_tokens(user_id);
    CREATE INDEX IF NOT EXISTS network_tokens_hash ON network_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS managed_workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      machine_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      workspace_url TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT 'syd',
      image_ref TEXT NOT NULL,
      current_version TEXT,
      status TEXT NOT NULL DEFAULT 'provisioning',
      last_health_check_at INTEGER,
      last_health_status TEXT,
      error_log TEXT,
      token_id TEXT NOT NULL,
      deprovisioned_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS suggestion_dismissals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      suggestion_type TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      content TEXT NOT NULL,
      dismissed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS suggestion_dismissals_user_expires
      ON suggestion_dismissals(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS briefs (
      number INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      depends_on TEXT,
      unlocks TEXT,
      file_path TEXT,
      last_modified INTEGER,
      synced_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS upgrade_history (
      id TEXT PRIMARY KEY,
      image_ref TEXT NOT NULL,
      previous_image_ref TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress',
      total_workspaces INTEGER NOT NULL,
      upgraded_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      canary_workspace_id TEXT,
      canary_result TEXT,
      circuit_breaker_at INTEGER,
      error_summary TEXT,
      triggered_by TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS upgrade_workspace_results (
      id TEXT PRIMARY KEY,
      upgrade_id TEXT NOT NULL REFERENCES upgrade_history(id),
      workspace_id TEXT NOT NULL REFERENCES managed_workspaces(id),
      previous_image_ref TEXT NOT NULL,
      result TEXT NOT NULL,
      health_check_result TEXT,
      error_log TEXT,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS verify_attempts (
      id TEXT PRIMARY KEY,
      ip_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS verification_emails (
      id TEXT PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      sent_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      messages TEXT NOT NULL DEFAULT '[]',
      context TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      request_email_flagged INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS funnel_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      event TEXT NOT NULL,
      surface TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
}

/**
 * Minimal process definition fixture for testing.
 */
export function makeTestProcessDefinition(overrides: Partial<{
  name: string;
  id: string;
  steps: unknown[];
}>  = {}) {
  return {
    name: overrides.name ?? "Test Process",
    id: overrides.id ?? "test-process",
    version: 1,
    status: "active",
    description: "Test process for automated tests",
    trigger: { type: "manual" },
    inputs: [],
    steps: overrides.steps ?? [
      {
        id: "step-1",
        name: "Test Step",
        executor: "script",
        commands: ["echo 'test'"],
      },
    ],
    outputs: [],
    quality_criteria: [],
    feedback: { metrics: [], capture: [] },
    trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
  };
}
