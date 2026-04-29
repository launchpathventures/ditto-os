/**
 * Ditto — Test Utilities
 *
 * Shared helpers for integration tests.
 * Creates fresh SQLite databases per test — no mocks.
 *
 * Provenance: Real DB, not mocks (QA research + Phase 3 retro).
 */

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./db/schema";
import { PROJECT_ROOT } from "./paths.js";
import fs from "fs";
import path from "path";
import os from "os";

export type TestDb = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_FOLDER = path.join(PROJECT_ROOT, "drizzle");

/**
 * Create a fresh test database with all tables.
 * Uses a temp file (not in-memory) because some queries rely on
 * features that behave differently in-memory.
 * Returns { db, cleanup } — call cleanup() in afterEach.
 */
export function createTestDb(): { db: TestDb; dbPath: string; cleanup: () => void } {
  const dbPath = path.join(os.tmpdir(), `ditto-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const sqlite = new Database(dbPath, { timeout: 10_000 });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Apply all migrations — single source of truth, no more raw SQL to keep in sync
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

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
 * Step definition for tests — includes Brief 121 primitives + parallel groups.
 */
interface TestStepDef {
  id: string;
  name: string;
  executor: string;
  commands?: string[];
  description?: string;
  instructions?: string;
  input_fields?: Array<{ name: string; type: string; label?: string; description?: string; required?: boolean; options?: string[]; default?: string }>;
  timeout?: string;
  depends_on?: string[];
  config?: Record<string, unknown>;
  tools?: string[];
  trustOverride?: string;
  sendingIdentity?: string;
  wait_for?: { event: "reply" | "approval"; timeout?: string };
  gate?: { engagement: "replied" | "silent" | "any"; since_step?: string; fallback?: "skip" | "defer" };
  email_thread?: string;
  schedule?: { delay: string; after: "trigger" | string };
}

interface TestParallelGroup {
  parallel_group: string;
  depends_on?: string[];
  steps: TestStepDef[];
}

export function makeTestProcessDefinition(overrides: Partial<{
  name: string;
  id: string;
  steps: Array<TestStepDef | TestParallelGroup>;
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
