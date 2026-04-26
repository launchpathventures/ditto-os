/**
 * Ditto — Next.js Instrumentation Hook
 *
 * Called once on server startup via Next.js `register()` export.
 * Auto-starts the nurture scheduler and runs schema sync.
 *
 * Provenance: Brief 086 (scheduler auto-start), Brief 089 (first-boot seed), Next.js instrumentation API.
 */

export async function register() {
  // Only run on the Node.js server runtime, not during build or edge
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] Ditto server starting...");

    // Load root .env for monorepo — Next.js only reads packages/web/.env by default
    try {
      const { config } = await import("dotenv");
      const path = await import("path");
      config({ path: path.resolve(process.cwd(), "../../.env") });
    } catch {
      // dotenv may not be installed — env vars may be set via platform (Railway, Fly, etc.)
    }

    // Attach the Bridge WebSocket server to Next.js's underlying HTTP server.
    // Next.js does not expose its server reference. Two-pronged strategy:
    //   1. Hook http.Server.prototype.listen so future listen() calls attach.
    //   2. Walk process._getActiveHandles() to find any HTTP server already
    //      listening (Next dev binds before register() returns — the prototype
    //      patch arrives too late on its own). Whichever fires first wins;
    //      subsequent attaches are no-ops (attachBridgeWebSocketServer is
    //      idempotent via a module-scoped flag).
    //
    // Fragility note: process._getActiveHandles is a Node-internal API. If it
    // ever changes shape, the discovery branch breaks silently — bridge dials
    // would then time out. Spike test (src/engine/bridge-server.spike.test.ts)
    // is the canary: it boots `next dev` and asserts a real WebSocket roundtrip
    // succeeds, so a regression in the hook will fail that test.
    //
    // Pivot path if the discovery breaks: switch to a custom Next.js server
    // (packages/web/server.ts wrapping http.createServer + next.getRequestHandler)
    // — that's the supported Next.js extension surface for "I want my own
    // HTTP server with my own upgrade handling". Brief 212 AC #1 deliberately
    // avoided this so the deployment shape stays `next start` for now.
    //
    // Brief 212 AC #1 spike validates this end-to-end.
    try {
      const http = await import("http");
      const { attachBridgeWebSocketServer } = await import("../../src/engine/bridge-server");
      console.log("[instrumentation] Installing bridge WebSocket hook...");

      const originalListen = http.Server.prototype.listen;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      http.Server.prototype.listen = function (this: import("http").Server, ...args: any[]) {
        try {
          attachBridgeWebSocketServer(this);
        } catch (err) {
          console.error("[instrumentation] Bridge WebSocket attach (listen) failed:", err);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (originalListen as any).apply(this, args);
      };

      // Fallback: discover an already-listening server via active handles.
      // We poll a few times because the server may not have bound yet at this
      // exact moment in dev mode startup.
      const tryDiscover = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handles = (process as any)._getActiveHandles?.() ?? [];
        for (const h of handles) {
          if (h && h.constructor && h.constructor.name === "Server" && typeof h.on === "function") {
            try {
              attachBridgeWebSocketServer(h as import("http").Server);
            } catch (err) {
              console.error("[instrumentation] Bridge WebSocket attach (discovery) failed:", err);
            }
          }
        }
      };
      // Run a few times across early startup.
      tryDiscover();
      setTimeout(tryDiscover, 250).unref?.();
      setTimeout(tryDiscover, 1500).unref?.();
      setTimeout(tryDiscover, 5000).unref?.();
    } catch (error) {
      console.error("[instrumentation] Bridge WebSocket hook setup failed:", error);
      // Non-fatal — bridge dispatches will fail loudly at use-time
    }

    try {
      // Ensure database schema is up to date
      const { ensureSchema } = await import("../../src/db");
      ensureSchema();
      console.log("[instrumentation] Schema sync complete.");
    } catch (error) {
      console.error("[instrumentation] Schema sync failed:", error);
      // Non-fatal — server can still start, schema may already be current
    }

    // Initialize LLM provider for front-door chat and other API routes
    try {
      const { initLlm } = await import("../../src/engine/llm");
      initLlm();
      console.log("[instrumentation] LLM provider initialized.");
    } catch (error) {
      console.error("[instrumentation] LLM init failed (chat will use mock fallback):", error);
    }

    // Sync process YAML definitions to DB so scheduler can register cron jobs.
    // Without this, cycles exist on disk but never execute (Brief 151 spike).
    try {
      const { loadAllProcesses, syncProcessesToDb } = await import("../../src/engine/process-loader");
      const { PROJECT_ROOT } = await import("../../src/paths");
      const path = await import("path");
      const processDir = path.join(PROJECT_ROOT, "processes");
      const templateDir = path.join(PROJECT_ROOT, "processes", "templates");
      const cycleDir = path.join(PROJECT_ROOT, "processes", "cycles");
      const definitions = loadAllProcesses(processDir, templateDir, cycleDir);
      await syncProcessesToDb(definitions);
      console.log(`[instrumentation] Synced ${definitions.length} process definitions to DB.`);
    } catch (error) {
      console.error("[instrumentation] Process sync failed:", error);
      // Non-fatal — processes may already be synced, or scheduler will start with existing DB state
    }

    try {
      // Auto-start the nurture scheduler
      const { start } = await import("../../src/engine/scheduler");
      await start();
      console.log("[instrumentation] Scheduler started.");
    } catch (error) {
      console.error("[instrumentation] Scheduler start failed:", error);
      // Non-fatal — scheduler can be started manually via CLI
    }

    try {
      // Auto-start the pulse — Alex's continuous operation loop (Brief 098a)
      // Scans for due delayed runs, unprocessed chains, and status composition
      const { startPulse } = await import("../../src/engine/pulse");
      startPulse();
      console.log("[instrumentation] Pulse started.");
    } catch (error) {
      console.error("[instrumentation] Pulse start failed:", error);
      // Non-fatal — pulse can be started manually
    }

    // Brief 215 — register the local-mac-mini RunnerAdapter into the in-process
    // registry. Brief 212 shipped — wire its primitives into a `LocalBridge`
    // instance via `createLocalBridge()` and pass into the adapter. Brief 216
    // adds the claude-code-routine adapter alongside; sub-briefs 217-218 add
    // managed-agent + github-action when they land.
    try {
      const { registerAdapter, hasAdapter } = await import("../../src/engine/runner-registry");
      const { createLocalMacMiniAdapter } = await import("../../src/adapters/local-mac-mini");
      const { createLocalBridge } = await import("../../src/engine/local-bridge");
      const { createRoutineAdapter, primeHarnessTypeCacheFromDb } = await import(
        "../../src/adapters/claude-code-routine"
      );
      const { createManagedAgentAdapter } = await import(
        "../../src/adapters/claude-managed-agent"
      );
      if (!hasAdapter("local-mac-mini")) {
        const bridge = createLocalBridge();
        registerAdapter(createLocalMacMiniAdapter({ bridge }));
        console.log(
          "[instrumentation] Runner registry: local-mac-mini adapter registered (bridge wired to Brief 212 LocalBridge)."
        );
      }
      if (!hasAdapter("claude-code-routine")) {
        registerAdapter(createRoutineAdapter());
        await primeHarnessTypeCacheFromDb();
        console.log(
          "[instrumentation] Runner registry: claude-code-routine adapter registered (Brief 216)."
        );
      }
      if (!hasAdapter("claude-managed-agent")) {
        registerAdapter(createManagedAgentAdapter());
        console.log(
          "[instrumentation] Runner registry: claude-managed-agent adapter registered (Brief 217)."
        );
      }
      // Brief 217 — start the cross-runner poll cron (only kinds with
      // registered cadences are walked; routines stay GitHub-events-only).
      try {
        const { startRunnerPollCron } = await import(
          "../../src/engine/runner-poll-cron"
        );
        startRunnerPollCron();
        console.log("[instrumentation] Runner poll cron started (Brief 217).");
      } catch (cronErr) {
        console.error("[instrumentation] Runner poll cron start failed:", cronErr);
      }
    } catch (error) {
      console.error("[instrumentation] Runner registry init failed:", error);
      // Non-fatal — registry is in-process; missing adapter surfaces at dispatch time
    }

    // Brief 215 AC #19 — idempotent seed of agent-crm + ditto projects.
    try {
      const { seedProjectsOnBoot } = await import("../../src/engine/projects/seed-on-boot");
      const result = await seedProjectsOnBoot();
      if (result.seeded) {
        console.log(`[instrumentation] Seeded ${result.inserted} projects on first boot.`);
      }
    } catch (error) {
      console.error("[instrumentation] Project seed failed:", error);
      // Non-fatal — projects can be created via /projects/new
    }

    // Brief 215 AC #2 — post-migration audit: if any processes had a non-null
    // project_id that the FK-tightening migration NULL'd out, surface a warning.
    // The migration is idempotent (the UPDATE only fires when projects table is
    // empty during the migration step), so this only meaningfully triggers on
    // the first run after deploy.
    try {
      const { db } = await import("../../src/db");
      const { processes } = await import("../../src/db/schema");
      const { isNull, and, sql } = await import("drizzle-orm");
      // Count processes with FK-tightened-orphan markers — there isn't a perfect
      // signal post-migration, so we report processes with null project_id +
      // a non-null updatedAt diff vs createdAt as a heuristic. Cheap, advisory.
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(processes)
        .where(and(isNull(processes.projectId), sql`${processes.updatedAt} > ${processes.createdAt}`));
      const cnt = rows[0]?.count ?? 0;
      if (cnt > 0) {
        console.warn(
          `[instrumentation] Brief 215 migration: ${cnt} processes have null project_id (some may have been NULL'd by the FK-tightening migration if their old project_id had no matching project row).`
        );
      }
    } catch {
      // Non-fatal — advisory check only
    }

    // Validate workspace auth configuration
    // When WORKSPACE_OWNER_EMAIL is set, auth is enforced — companion vars must be present.
    if (process.env.WORKSPACE_OWNER_EMAIL) {
      const missing: string[] = [];
      if (!process.env.NEXT_PUBLIC_APP_URL && !process.env.NETWORK_BASE_URL) {
        missing.push("NEXT_PUBLIC_APP_URL (magic link emails need a domain)");
      }
      if (!process.env.SESSION_SECRET) {
        missing.push("SESSION_SECRET (HMAC signing falls back to guessable WORKSPACE_OWNER_EMAIL)");
      }
      if (!process.env.AGENTMAIL_API_KEY) {
        missing.push("AGENTMAIL_API_KEY (magic link emails cannot be sent)");
      }
      if (missing.length > 0) {
        console.warn(
          `[instrumentation] ⚠ Workspace auth is enabled (WORKSPACE_OWNER_EMAIL=${process.env.WORKSPACE_OWNER_EMAIL}) ` +
          `but ${missing.length} companion variable(s) are missing:\n` +
          missing.map((m) => `  - ${m}`).join("\n") +
          "\nSee .env.example for documentation.",
        );
      } else {
        console.log(`[instrumentation] Workspace auth configured for ${process.env.WORKSPACE_OWNER_EMAIL}`);
      }
    } else {
      console.log("[instrumentation] Workspace auth disabled (WORKSPACE_OWNER_EMAIL not set — local dev mode).");
    }

    // First-boot seed import (Brief 089)
    // If DITTO_NETWORK_URL is set and no self-scoped memories exist,
    // fetch and import the workspace seed from the Network Service.
    if (process.env.DITTO_NETWORK_URL) {
      try {
        const { isFirstBoot, fetchAndImportSeed } = await import(
          "../../src/engine/network-seed"
        );

        if (await isFirstBoot()) {
          console.log("[instrumentation] First boot detected — importing network seed...");
          const result = await fetchAndImportSeed();
          if (result) {
            console.log(
              `[instrumentation] Network seed imported: ${result.memoriesImported} memories, ${result.peopleImported} people, ${result.interactionsImported} interactions`,
            );
          }
        }
      } catch (error) {
        console.error("[instrumentation] Seed import failed:", error);
        // Non-fatal — workspace works standalone without seed
      }
    }
  }
}
