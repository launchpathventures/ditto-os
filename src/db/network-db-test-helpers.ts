/**
 * Ditto — Network DB Test Helpers
 *
 * Per-test transactional rollback for tests that touch network-tier tables.
 * Two backends, picked at runtime:
 *
 *   1. **PGlite (default for local dev)** — embedded WASM Postgres. Boots in
 *      milliseconds, requires no env vars, no Docker, no remote credentials.
 *      Used when `SUPABASE_DB_URL_TEST` and `SUPABASE_DB_URL` are both unset.
 *      Schema is materialized on first use by replaying the
 *      `drizzle/network/*.sql` migration tree against an in-memory pglite DB.
 *      The brief permits "developer-local Postgres at developer discretion";
 *      pglite is the in-process choice (vs. Docker container).
 *   2. **Supabase Postgres (CI / explicit override)** — when
 *      `SUPABASE_DB_URL_TEST` is set, the helper connects to that URL via
 *      postgres-js. Use this in CI or when verifying parity against the
 *      production dialect/extension surface. Falls back to `SUPABASE_DB_URL`
 *      with a loud warning (footgun: rollbacks can interleave with manual
 *      dev writes — point this at a *separate* test database).
 *
 * Brief 263 AC #10: every test that writes to network tables must wrap its
 * body with `withNetworkDbTransaction`. Direct `networkDb.insert/update/delete`
 * outside the helper is a violation (verified by the "no helper-bypass" grep
 * in the smoke test).
 *
 * Provenance: postgres-js transaction API + drizzle-orm/pglite recipe.
 */

import postgres from "postgres";
import { drizzle as drizzlePostgresJs, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import fs from "fs";
import path from "path";
import { PROJECT_ROOT } from "../paths.js";

/**
 * Drizzle handle type for tests. `PostgresJsDatabase` and `PgliteDatabase`
 * share the relevant query-builder surface; we expose the postgres-js shape
 * because production code depends on that exact type.
 */
export type NetworkDbTransaction = PostgresJsDatabase<typeof networkSchema>;

type Backend =
  | { kind: "postgres-js"; client: ReturnType<typeof postgres>; db: PostgresJsDatabase<typeof networkSchema> }
  | { kind: "pglite"; client: PGlite; db: ReturnType<typeof drizzlePglite<typeof networkSchema>> };

let _backend: Backend | null = null;
let _backendPromise: Promise<Backend> | null = null;

const NETWORK_MIGRATIONS_DIR = path.join(PROJECT_ROOT, "drizzle", "network");

function resolvePostgresUrl(): string | null {
  const testUrl = process.env.SUPABASE_DB_URL_TEST;
  if (testUrl) return testUrl;
  const fallback = process.env.SUPABASE_DB_URL;
  if (fallback) {
    console.warn(
      "[network-db-test-helpers] SUPABASE_DB_URL_TEST not set; falling back " +
        "to SUPABASE_DB_URL. Test rollbacks can interleave with manual dev " +
        "writes — set SUPABASE_DB_URL_TEST to a separate test database.",
    );
    return fallback;
  }
  return null;
}

/**
 * Apply the `drizzle/network/*.sql` migration tree to an empty pglite instance.
 * The drizzle-orm migrator for pglite expects the standard `migrate()` API,
 * but we run statements directly so the helper has zero coupling to the
 * pglite migrator surface (which differs slightly per drizzle release).
 */
async function applyNetworkMigrations(client: PGlite): Promise<void> {
  if (!fs.existsSync(NETWORK_MIGRATIONS_DIR)) return;
  const files = fs
    .readdirSync(NETWORK_MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(NETWORK_MIGRATIONS_DIR, file), "utf-8");
    const statements = sql
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
}

async function getBackend(): Promise<Backend> {
  if (_backend) return _backend;
  if (_backendPromise) return _backendPromise;

  _backendPromise = (async (): Promise<Backend> => {
    const postgresUrl = resolvePostgresUrl();
    if (postgresUrl) {
      const client = postgres(postgresUrl, { max: 4, idle_timeout: 5 });
      const db = drizzlePostgresJs(client, { schema: networkSchema });
      const backend: Backend = { kind: "postgres-js", client, db };
      _backend = backend;
      return backend;
    }
    const client = new PGlite();
    await applyNetworkMigrations(client);
    const db = drizzlePglite(client, { schema: networkSchema });
    const backend: Backend = { kind: "pglite", client, db };
    _backend = backend;
    return backend;
  })();

  return _backendPromise;
}

/**
 * Run `testFn` inside a transaction that rolls back at the end, regardless
 * of whether the test passes or throws. Tests get a `tx` handle that is a
 * fully-typed Drizzle Postgres instance — they pass it to their unit-under-test
 * in place of `networkDb`.
 *
 * Pattern mirrors the existing workspace `createTestDb()` ergonomics: each
 * test asks for a clean slate, mutates it, asserts, and the helper guarantees
 * the slate is wiped at teardown.
 *
 * Usage:
 *   await withNetworkDbTransaction(async (tx) => {
 *     await tx.insert(networkUsers).values({ ... });
 *     const rows = await tx.select().from(networkUsers);
 *     expect(rows).toHaveLength(1);
 *   });
 */
export async function withNetworkDbTransaction<T>(
  testFn: (tx: NetworkDbTransaction) => Promise<T>,
): Promise<T> {
  const backend = await getBackend();

  const ROLLBACK_SENTINEL = Symbol("network-db-test-rollback");
  let result: T | undefined;
  let testError: unknown = ROLLBACK_SENTINEL;

  try {
    await (backend.db as PostgresJsDatabase<typeof networkSchema>).transaction(async (tx) => {
      try {
        result = await testFn(tx as unknown as NetworkDbTransaction);
      } catch (err) {
        testError = err;
      }
      throw ROLLBACK_SENTINEL;
    });
  } catch (err) {
    if (err !== ROLLBACK_SENTINEL) {
      throw err;
    }
  }

  if (testError !== ROLLBACK_SENTINEL) {
    throw testError;
  }

  return result as T;
}

/**
 * Truncate every network table after a test that opted out of the transactional
 * helper (e.g., tests that need to commit so a separate connection can read).
 * Prefer `withNetworkDbTransaction`; this is an escape hatch.
 */
export async function resetNetworkDb(): Promise<void> {
  const backend = await getBackend();
  const tableNames: string[] = [];
  for (const v of Object.values(networkSchema)) {
    const name = (v as { _?: { name?: unknown } } | null | undefined)?._?.name;
    if (typeof name === "string") tableNames.push(name);
  }
  if (tableNames.length === 0) return;
  if (backend.kind === "pglite") {
    for (const name of tableNames) {
      await backend.client.exec(`TRUNCATE TABLE "${name}" CASCADE`);
    }
  } else {
    await backend.db.execute(
      sql.raw(`TRUNCATE TABLE ${tableNames.map((n) => `"${n}"`).join(", ")} CASCADE`),
    );
  }
}

/**
 * Test-only: close the cached client. Call from a global `afterAll` to release
 * resources when the test run finishes.
 */
export async function closeNetworkDbTestClient(): Promise<void> {
  if (!_backend) return;
  if (_backend.kind === "postgres-js") {
    await _backend.client.end({ timeout: 1 });
  } else {
    await _backend.client.close();
  }
  _backend = null;
  _backendPromise = null;
}
