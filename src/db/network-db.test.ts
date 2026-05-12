/**
 * Ditto — Network DB Connection Tests
 *
 * Brief 263 AC #6, #8, #11. Three invariants:
 *
 *   1. Export shape — `networkDb` and `ensureNetworkSchema` are present and
 *      `networkDb` exposes Drizzle DB methods.
 *   2. No-engine-import invariant — the network schema file does not import
 *      from any workspace schema file. Cross-tier joins are forbidden
 *      (ADR-036 §3); a typed FK from a network table to a workspace table
 *      would be a regression.
 *   3. Slow-query log — the timing wrapper logs at WARN when a query exceeds
 *      the configured threshold.
 *
 * Connection-failure (graceful 503) behavior is exercised at the API-route
 * level by route tests. This unit test focuses on the connection-layer
 * invariants that survive without a live Postgres.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  networkDb,
  ensureNetworkSchema,
  __resetNetworkDbForTesting,
  instrumentClient,
  isNetworkDbConnectionError,
  withNetworkDbAvailability,
} from "./network-db.js";

describe("network-db: export shape", () => {
  // postgres-js's `postgres(url)` is lazy — it does not open a socket until a
  // query is issued. Providing a syntactically valid URL is enough for the
  // proxy's lazy `getNetworkDb()` to construct a Drizzle wrapper whose method
  // shape we can introspect without any network I/O.
  const STUB_URL = "postgres://test:test@127.0.0.1:5432/test";
  let originalUrl: string | undefined;
  let originalTestUrl: string | undefined;

  beforeAll(() => {
    originalUrl = process.env.SUPABASE_DB_URL;
    originalTestUrl = process.env.SUPABASE_DB_URL_TEST;
    process.env.SUPABASE_DB_URL_TEST = STUB_URL;
    __resetNetworkDbForTesting();
  });

  afterAll(() => {
    __resetNetworkDbForTesting();
    if (originalUrl === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = originalUrl;
    if (originalTestUrl === undefined) delete process.env.SUPABASE_DB_URL_TEST;
    else process.env.SUPABASE_DB_URL_TEST = originalTestUrl;
  });

  it("exports networkDb proxy with Drizzle methods", () => {
    expect(typeof networkDb.select).toBe("function");
    expect(typeof networkDb.insert).toBe("function");
    expect(typeof networkDb.update).toBe("function");
    expect(typeof networkDb.delete).toBe("function");
    expect(typeof networkDb.transaction).toBe("function");
  });

  it("exports ensureNetworkSchema as an async function", () => {
    expect(typeof ensureNetworkSchema).toBe("function");
    // The function is async — we don't await it here (no live DB) but verify
    // its shape.
    const result = ensureNetworkSchema();
    expect(result).toBeInstanceOf(Promise);
    // Swallow any rejection — invocation without a real Postgres is expected
    // to fail; the test only asserts the export shape.
    result.catch(() => {});
  });
});

describe("network-db: no-engine-import invariant (Brief 263 AC #8)", () => {
  // Brief 263: `packages/core/src/db/network/schema.ts` must not import from
  // `src/db/schema/engine.ts`, `frontdoor.ts`, or `product.ts`. The test
  // protects against a contributor reflexively adding a typed FK to a
  // workspace-tier table.

  const networkSchemaPath = path.join(
    process.cwd(),
    "packages/core/src/db/network/schema.ts",
  );

  it("network schema file exists at expected path", () => {
    expect(fs.existsSync(networkSchemaPath)).toBe(true);
  });

  it("network schema does not import from workspace schema files", () => {
    const source = fs.readFileSync(networkSchemaPath, "utf-8");
    // Match any import that names a workspace schema module path.
    const forbiddenPatterns = [
      /from\s+["'][^"']*src\/db\/schema\/engine/,
      /from\s+["'][^"']*src\/db\/schema\/harness/,
      /from\s+["'][^"']*src\/db\/schema\/knowledge/,
      /from\s+["'][^"']*src\/db\/schema\/frontdoor/,
      /from\s+["'][^"']*src\/db\/schema\/product/,
      // The network schema also must not pull from the workspace schema barrel
      /from\s+["'][^"']*src\/db\/schema(?!\/network)/,
    ];
    for (const pat of forbiddenPatterns) {
      expect(source).not.toMatch(pat);
    }
  });

  it("interactions.processRunId is plain text (no .references())", () => {
    const source = fs.readFileSync(networkSchemaPath, "utf-8");
    // Find the processRunId declaration and confirm there's no .references()
    // attached to it — i.e., the cross-tier soft-reference rule (ADR-036 §3)
    // is honored.
    const match = source.match(
      /processRunId:\s*text\("process_run_id"\)([^\n]*)/,
    );
    expect(match).not.toBeNull();
    if (!match) return;
    const decl = match[1] ?? "";
    expect(decl).not.toContain(".references(");
  });
});

describe("network-db: workspace barrel does not re-export network (Brief 263 AC #7 hardening)", () => {
  // The workspace schema barrel `src/db/schema/index.ts` MUST NOT re-export
  // the network schema. If it does, workspace `db` accepts network tables
  // at compile time and the type-error guardrail that AC #7 promised is
  // gone. Reviewer-found bug B2 was exactly this regression — restore in
  // good faith, then guard with this test so it can't silently come back.

  const barrelPath = path.join(process.cwd(), "src/db/schema/index.ts");

  it("workspace schema barrel file exists at expected path", () => {
    expect(fs.existsSync(barrelPath)).toBe(true);
  });

  it("workspace barrel does not re-export from @ditto/core/db/network", () => {
    const source = fs.readFileSync(barrelPath, "utf-8");
    // Forbid any `export ... from "...db/network..."` form, including
    // the `export * from "@ditto/core/db/network"` re-export that B2
    // introduced and any specific named re-export.
    const forbiddenPatterns = [
      /export\s+\*\s+from\s+["']@ditto\/core\/db\/network/,
      /export\s+\{[^}]*\}\s+from\s+["']@ditto\/core\/db\/network/,
      /export\s+type\s+\{[^}]*\}\s+from\s+["']@ditto\/core\/db\/network/,
      /export\s+\*\s+from\s+["'][^"']*\/db\/network/,
    ];
    for (const pat of forbiddenPatterns) {
      expect(
        source,
        `Workspace barrel must not re-export network tables (matched ${pat}). ` +
          `See Brief 263 AC #7 + Reviewer bug B2 — re-exporting defeats the ` +
          `compile-time guardrail that prevents workspace \`db\` from being ` +
          `passed a network table. Importers that need network tables must ` +
          `import directly from "@ditto/core/db/network".`,
      ).not.toMatch(pat);
    }
  });
});

describe("network-db: slow-query telemetry (Brief 263 AC #11)", () => {
  // Exercise `instrumentClient` against a stub postgres-js-shaped client.
  // The test verifies three real properties of the wrapper:
  //
  //   1. `client.unsafe(query, params)` — Drizzle's primary call path. The
  //      wrapper must time the returned thenable and warn on slow.
  //   2. `client.unsafe(query, params).values()` — Drizzle's values-mode
  //      path. Must also be timed (postgres-js returns the same Query so
  //      the .then attached to unsafe()'s result already covers it).
  //   3. `client.begin(fn)` — Drizzle's transaction path. Total transaction
  //      duration must be timed.
  //
  // The earlier version of this test asserted on a synthetic `console.warn`
  // emitted by the test itself, which would have passed even if the Proxy
  // contained no timing logic at all. This rewrite ties the assertion to
  // the actual wrapper output.

  function makeStubClient(opts: { delayMs: number }) {
    // Minimal shape of a postgres-js client surface that Drizzle invokes.
    // Returns a thenable from `unsafe`/`begin` that resolves after delayMs.
    const calls: string[] = [];
    const stub = {
      unsafe(query: string, _params?: unknown[]) {
        calls.push(`unsafe:${query}`);
        const promise = new Promise((resolve) =>
          setTimeout(() => resolve([]), opts.delayMs),
        ) as Promise<unknown[]> & { values: () => Promise<unknown[]> };
        // postgres-js returns a Query that exposes `.values()` and returns
        // itself; reproduce that shape so the wrapper's chained-call path
        // is exercised.
        promise.values = () => promise;
        return promise;
      },
      begin(fn: (tx: unknown) => Promise<unknown>) {
        calls.push("begin");
        return new Promise((resolve, reject) =>
          setTimeout(async () => {
            try {
              resolve(await fn({}));
            } catch (e) {
              reject(e);
            }
          }, opts.delayMs),
        );
      },
      // Pass-through props the wrapper preserves.
      end: () => Promise.resolve(),
      _calls: calls,
    };
    return stub;
  }

  it("warns when client.unsafe(...) resolves above threshold", async () => {
    process.env.NETWORK_DB_SLOW_QUERY_MS = "1";
    vi.resetModules();
    const fresh = await import("./network-db.js");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const stub = makeStubClient({ delayMs: 10 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = fresh.instrumentClient(stub as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wrapped as any).unsafe("SELECT 1", []);
      // The wrapper attaches its timing .then() in parallel with the caller's
      // await; yield once more so the side-effect handler runs.
      await new Promise((r) => setImmediate(r));

      expect(warnSpy).toHaveBeenCalled();
      const msg = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(msg).toMatch(/slow query/);
      expect(msg).toMatch(/SELECT 1/);
    } finally {
      warnSpy.mockRestore();
      delete process.env.NETWORK_DB_SLOW_QUERY_MS;
    }
  });

  it("warns when client.unsafe(...).values() resolves above threshold", async () => {
    process.env.NETWORK_DB_SLOW_QUERY_MS = "1";
    vi.resetModules();
    const fresh = await import("./network-db.js");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const stub = makeStubClient({ delayMs: 10 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = fresh.instrumentClient(stub as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wrapped as any).unsafe("SELECT 2", []).values();
      await new Promise((r) => setImmediate(r));

      expect(warnSpy).toHaveBeenCalled();
      const msg = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(msg).toMatch(/slow query/);
      expect(msg).toMatch(/SELECT 2/);
    } finally {
      warnSpy.mockRestore();
      delete process.env.NETWORK_DB_SLOW_QUERY_MS;
    }
  });

  it("warns when client.begin(fn) resolves above threshold", async () => {
    process.env.NETWORK_DB_SLOW_QUERY_MS = "1";
    vi.resetModules();
    const fresh = await import("./network-db.js");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const stub = makeStubClient({ delayMs: 10 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = fresh.instrumentClient(stub as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wrapped as any).begin(async () => "ok");
      await new Promise((r) => setImmediate(r));

      expect(warnSpy).toHaveBeenCalled();
      const msg = String(warnSpy.mock.calls[0]?.[0] ?? "");
      expect(msg).toMatch(/slow query/);
      expect(msg).toMatch(/BEGIN…COMMIT/);
    } finally {
      warnSpy.mockRestore();
      delete process.env.NETWORK_DB_SLOW_QUERY_MS;
    }
  });

  it("does NOT warn when query resolves below threshold", async () => {
    process.env.NETWORK_DB_SLOW_QUERY_MS = "1000";
    vi.resetModules();
    const fresh = await import("./network-db.js");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const stub = makeStubClient({ delayMs: 1 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = fresh.instrumentClient(stub as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wrapped as any).unsafe("SELECT fast", []);
      await new Promise((r) => setImmediate(r));

      const slowQueryWarns = warnSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").includes("slow query"),
      );
      expect(slowQueryWarns).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
      delete process.env.NETWORK_DB_SLOW_QUERY_MS;
    }
  });
});

describe("network-db: connection-failure surfacing (Brief 263 AC #6)", () => {
  // The connection helper must surface a clean error to callers when
  // SUPABASE_DB_URL is missing or invalid. The downstream graceful-503
  // handling lives in the API route — exercised by route-level tests.

  it("getNetworkDb throws a structured error when SUPABASE_DB_URL is missing", async () => {
    const original = process.env.SUPABASE_DB_URL;
    const originalTest = process.env.SUPABASE_DB_URL_TEST;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;

    delete process.env.SUPABASE_DB_URL;
    delete process.env.SUPABASE_DB_URL_TEST;
    // Force non-test env-var resolution path so the missing-URL branch fires.
    process.env.NODE_ENV = "production";
    delete process.env.VITEST;

    try {
      // Re-import to bypass the module-level cache. vi.resetModules() resets
      // the module registry; the next import re-executes top-level code.
      vi.resetModules();
      const fresh = await import("./network-db.js");
      expect(() => fresh.networkDb.select()).toThrow(/SUPABASE_DB_URL/);
    } finally {
      if (original !== undefined) process.env.SUPABASE_DB_URL = original;
      if (originalTest !== undefined)
        process.env.SUPABASE_DB_URL_TEST = originalTest;
      if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
      if (originalVitest !== undefined) process.env.VITEST = originalVitest;
    }
  });
});

describe("network-db: isNetworkDbConnectionError classifier", () => {
  // The classifier is the seam routes use to decide between 500 and 503.
  // Wrong classification means either silent crashes (500 leaks to caller)
  // or false-positive 503s (which would mask real bugs as transient outages).
  // Cover the three documented shapes plus the negative case.

  it("returns true for missing SUPABASE_DB_URL error", () => {
    const err = new Error(
      "[network-db] SUPABASE_DB_URL is not set. The network tier requires …",
    );
    expect(isNetworkDbConnectionError(err)).toBe(true);
  });

  it("returns true for ECONNREFUSED-style postgres-js error", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(isNetworkDbConnectionError(err)).toBe(true);
  });

  it("returns true for Postgres SQLSTATE 08xxx connection-class error", () => {
    const err = Object.assign(new Error("connection_failure"), {
      code: "08006",
    });
    expect(isNetworkDbConnectionError(err)).toBe(true);
  });

  it("returns true for postgres-js pool-closed error", () => {
    const err = new Error("CONNECTION_ENDED");
    expect(isNetworkDbConnectionError(err)).toBe(true);
  });

  it("returns false for SQL constraint / business-logic errors", () => {
    const err = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });
    expect(isNetworkDbConnectionError(err)).toBe(false);
  });

  it("returns false for generic non-DB errors", () => {
    expect(isNetworkDbConnectionError(new Error("anything else"))).toBe(false);
    expect(isNetworkDbConnectionError(null)).toBe(false);
    expect(isNetworkDbConnectionError(undefined)).toBe(false);
    expect(isNetworkDbConnectionError("string")).toBe(false);
  });
});

describe("network-db: withNetworkDbAvailability wrapper", () => {
  // The wrapper translates classified connection errors into a 503 Response;
  // unrecognized errors must propagate so the route's existing 500 path runs.

  it("returns a 503 Response when the handler throws a connection error", async () => {
    const handler = withNetworkDbAvailability(async () => {
      throw new Error("[network-db] SUPABASE_DB_URL is not set.");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await handler();
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("network_db_unavailable");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("propagates non-connection errors so the route's own 500 path can run", async () => {
    const sentinel = new Error("business rule violated");
    const handler = withNetworkDbAvailability(async () => {
      throw sentinel;
    });
    await expect(handler()).rejects.toBe(sentinel);
  });

  it("passes through the handler's response when no error is thrown", async () => {
    const ok = new Response("ok", { status: 200 });
    const handler = withNetworkDbAvailability(async () => ok);
    const res = await handler();
    expect(res).toBe(ok);
  });
});
