/**
 * Ditto — Network DB Connection (Postgres via postgres-js)
 *
 * Connects the Network Service tier to Supabase Postgres per ADR-048.
 * Workspace tier stays SQLite via `src/db/index.ts`. The two are intentionally
 * separated at the connection layer — cross-tier joins are forbidden
 * (ADR-036 §3); combine in application code.
 *
 * Boot path: `ensureNetworkSchema()` is invoked from
 * `packages/web/instrumentation.ts` alongside the workspace `ensureSchema()`.
 *
 * Slow-query telemetry: queries exceeding `SLOW_QUERY_THRESHOLD_MS` (default
 * 100ms) log at WARN. Sufficient to detect ADR-048 §(d) trigger #1
 * (sustained latency regression) within the first 30 days post-deploy. Replace
 * with proper p95 telemetry if scale grows (see Brief 263 Follow-up).
 *
 * Connection-failure semantics: if `SUPABASE_DB_URL` is missing or unreachable
 * at boot, `ensureNetworkSchema()` logs a clean error and re-raises the
 * underlying connection error to the caller (`instrumentation.ts`). The boot
 * path treats it as non-fatal so the process keeps running; API routes that
 * touch `networkDb` surface a structured 503 (Brief 263 AC #6) instead of
 * crashing.
 */

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "path";
import * as networkSchema from "@ditto/core/db/network";
import { PROJECT_ROOT } from "../paths.js";

const SLOW_QUERY_THRESHOLD_MS = Number(
  process.env.NETWORK_DB_SLOW_QUERY_MS ?? 100,
);

/**
 * Resolve the connection URL. Falls back to `SUPABASE_DB_URL_TEST` when
 * `NODE_ENV=test` so vitest workers route at the test database without
 * requiring every test setup to override the env var explicitly.
 */
function resolveConnectionUrl(): string {
  const isTest =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (isTest && process.env.SUPABASE_DB_URL_TEST) {
    return process.env.SUPABASE_DB_URL_TEST;
  }
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "[network-db] SUPABASE_DB_URL is not set. The network tier requires " +
        "a Postgres connection (Supabase). See .env.example for derivation " +
        "from the Supabase project dashboard. ADR-048 documents the migration " +
        "rationale.",
    );
  }
  return url;
}

/**
 * postgres-js client. Lazy-instantiated via getter so importing this module
 * does not crash when SUPABASE_DB_URL is missing (e.g., during unit tests
 * that mock at the module-import level).
 */
let _client: ReturnType<typeof postgres> | null = null;
let _db: PostgresJsDatabase<typeof networkSchema> | null = null;

function getClient(): ReturnType<typeof postgres> {
  if (_client) return _client;
  const url = resolveConnectionUrl();
  _client = postgres(url, {
    // postgres-js debug callback fires for every query. Use it to time
    // queries and log slow ones. The signature is (connection, query, params, types).
    debug: (_connection, query, _params, _types) => {
      // postgres-js's debug fires AT prepare-time, not after execution, so we
      // cannot use it directly for duration. Instead the timing wrapper below
      // uses the `prepare`/`execute` lifecycle via a custom proxy below.
      // Keep the debug hook present (no-op) so a switch to a future debug API
      // that includes duration is straightforward.
      void query;
    },
  });
  return _client;
}

/**
 * Wrap the postgres-js client so every Drizzle-issued query is timed and
 * a WARN is logged when duration exceeds `SLOW_QUERY_THRESHOLD_MS`.
 *
 * Drizzle's postgres-js session uses three method calls on the client:
 *
 *   client.unsafe(query, params)             // single query
 *   client.unsafe(query, params).values()    // single query, values mode
 *   client.begin(async (tx) => { ... })      // transaction
 *
 * The wrapper is a Proxy with a `get` trap that intercepts those three
 * methods. Each wrapper captures `start` before the call and attaches a
 * passive `.then(...)` to the returned thenable to measure resolution.
 *
 * Idempotency: `Query.then()` (postgres-js src/query.js) sets `executed=true`
 * on the first call and short-circuits afterwards, so attaching a passive
 * `.then()` for timing is safe — it does not re-execute the query.
 *
 * `.values()` returns the same Query (mutating `isRaw='values'`); attaching
 * `.then()` to the result of `unsafe()` therefore covers the values-mode
 * path as well.
 */
function logSlowQuery(durationMs: number, queryText: string): void {
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    const truncated =
      typeof queryText === "string"
        ? queryText.slice(0, 120)
        : "<unknown>";
    console.warn(
      `[network-db] slow query (${durationMs}ms > ${SLOW_QUERY_THRESHOLD_MS}ms): ${truncated}`,
    );
  }
}

export function instrumentClient(
  raw: ReturnType<typeof postgres>,
): ReturnType<typeof postgres> {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return function wrappedUnsafe(...args: unknown[]) {
          const start = Date.now();
          const queryText =
            typeof args[0] === "string" ? args[0] : "<non-string>";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = (target as any).unsafe(...args);
          if (result && typeof result.then === "function") {
            result.then(
              () => logSlowQuery(Date.now() - start, queryText),
              () => {
                // swallow — caller awaits the original and surfaces rejection.
              },
            );
          }
          return result;
        };
      }
      if (prop === "begin") {
        return function wrappedBegin(...args: unknown[]) {
          const start = Date.now();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = (target as any).begin(...args);
          if (result && typeof result.then === "function") {
            result.then(
              () => logSlowQuery(Date.now() - start, "BEGIN…COMMIT"),
              () => {
                // swallow — caller awaits the original and surfaces rejection.
              },
            );
          }
          return result;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Drizzle Postgres instance bound to the Supabase network database.
 * Lazily constructed on first access. All network-tier reads/writes go
 * through this — never through the workspace `db` from `./index.ts`.
 */
export function getNetworkDb(): PostgresJsDatabase<typeof networkSchema> {
  if (_db) return _db;
  const client = instrumentClient(getClient());
  _db = drizzle(client, { schema: networkSchema });
  return _db;
}

/**
 * Proxy export so consumers can `import { networkDb } from "../db/network-db"`
 * and use it like a regular Drizzle DB. Lazy resolution on first method call.
 */
export const networkDb = new Proxy({} as PostgresJsDatabase<typeof networkSchema>, {
  get(_target, prop, receiver) {
    const real = getNetworkDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Apply pending Drizzle migrations to the Supabase Postgres database.
 *
 * Called from `packages/web/instrumentation.ts` on server startup. If the
 * connection cannot be established, surfaces a clean error to the caller —
 * which logs but does not crash the process (per ADR-048 §(c) cutover plan
 * + Brief 263 AC #6 graceful-503 semantics).
 */
export async function ensureNetworkSchema(): Promise<void> {
  const migrationsFolder = path.join(PROJECT_ROOT, "drizzle", "network");
  try {
    await migrate(getNetworkDb(), { migrationsFolder });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[network-db] ensureNetworkSchema failed: ${message}. Network-tier API ` +
        "routes will return 503 until connectivity is restored. See ADR-048 " +
        "and .env.example for SUPABASE_DB_URL configuration.",
    );
    throw err;
  }
}

/**
 * Detect connection-layer failures that should surface as a 503 to API
 * callers (Brief 263 AC #6). Three shapes:
 *
 *   1. Missing `SUPABASE_DB_URL` — thrown from `resolveConnectionUrl`.
 *   2. Postgres TCP connection failures — postgres-js sets `err.code` to a
 *      Node-style errno when the socket fails to open (ECONNREFUSED, ENOTFOUND,
 *      EHOSTUNREACH, ETIMEDOUT). Some Postgres protocol-level connection
 *      errors carry SQLSTATE 08xxx (Connection Exception class).
 *   3. The pool-closed error postgres-js throws after `client.end()`.
 */
export function isNetworkDbConnectionError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    if (/SUPABASE_DB_URL/.test(err.message)) return true;
    if (/CONNECTION_(?:ENDED|DESTROYED|CLOSED)/.test(err.message)) return true;
  }
  const e = err as { code?: unknown };
  if (typeof e.code === "string") {
    if (
      e.code === "ECONNREFUSED" ||
      e.code === "ENOTFOUND" ||
      e.code === "EHOSTUNREACH" ||
      e.code === "ETIMEDOUT" ||
      // Postgres SQLSTATE 08xxx = Connection Exception class.
      e.code.startsWith("08")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Wrap a Next.js route handler so that a connection-layer failure on the
 * network DB surfaces as a structured 503. Other errors are re-thrown for
 * upstream error handling.
 */
export function withNetworkDbAvailability<
  Args extends unknown[],
  R extends Response,
>(
  handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (isNetworkDbConnectionError(err)) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[network-db] route returning 503 — network DB unavailable: ${message}`,
        );
        return Response.json(
          {
            error: "network_db_unavailable",
            message:
              "The network tier is temporarily unavailable. Please retry in a moment.",
          },
          { status: 503 },
        );
      }
      throw err;
    }
  };
}

/**
 * Test-only: reset the cached connection. Used by network-db.test.ts to
 * exercise different env-var configurations without a process restart.
 */
export function __resetNetworkDbForTesting(): void {
  if (_client) {
    void _client.end({ timeout: 1 });
  }
  _client = null;
  _db = null;
}

export { networkSchema };
