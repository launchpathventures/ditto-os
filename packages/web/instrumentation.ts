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
