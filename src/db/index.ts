/**
 * Agent OS — Database Connection (SQLite via better-sqlite3)
 *
 * Zero-setup: auto-creates data/ directory and DB file on first run.
 * WAL mode for performance (antfarm pattern).
 * Schema sync: runs `drizzle-kit push` to ensure DB matches code schema.
 *
 * Provenance: antfarm /src/db.ts (SQLite + WAL + auto-create)
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "agent-os.db");

// Auto-create data directory
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

// WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export { schema };

/**
 * Ensure DB schema matches the code schema.
 * Uses `drizzle-kit push` which diffs the schema and applies changes.
 * Handles both first-run (creates all tables) and schema evolution.
 *
 * AC9-10: Called before syncing process definitions.
 */
export function ensureSchema(): void {
  try {
    execFileSync(
      "npx",
      ["drizzle-kit", "push", "--force"],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe", // Capture output, don't spam console
        timeout: 30000,
      }
    );
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string };
    // If drizzle-kit push fails, surface the error
    const detail = err.stderr || err.stdout || "unknown error";
    throw new Error(`Schema sync failed: ${detail}`);
  }
}
