/**
 * Ditto Web — Engine Import Layer
 *
 * Thin import layer for engine functions used by the web app.
 * All engine calls are server-side only (via Server Actions / Route Handlers).
 * This file MUST only be imported in server components or API routes.
 *
 * IMPORTANT: Engine modules open SQLite at import time. Use dynamic import()
 * in route handlers to avoid build-time DB conflicts. This module re-exports
 * types statically but provides async loaders for runtime values.
 */

// Types only (no runtime side effects)
export type { SelfContext, SelfConverseResult, SelfConverseCallbacks } from "../../../src/engine/self";
export type { SelfStreamEvent } from "../../../src/engine/self-stream";
export type { HarnessEvent } from "../../../src/engine/events";

/**
 * Lazy-load engine modules to avoid build-time SQLite initialization.
 * Call this at the start of route handlers, not at module scope.
 *
 * For API key connections (anthropic/openai), initLlm() is called to
 * set up the provider. For CLI subscription connections, initLlm() is
 * skipped — the streaming adapter spawns CLI tools directly.
 */
export async function getEngine() {
  const [selfStream, events, llm, feedAssembler, reviewActions] = await Promise.all([
    import("../../../src/engine/self-stream"),
    import("../../../src/engine/events"),
    import("../../../src/engine/llm"),
    import("../../../src/engine/feed-assembler"),
    import("../../../src/engine/review-actions"),
  ]);

  // Initialize LLM provider for API connections.
  // CLI connections (claude-cli, codex-cli) skip this — they spawn subprocesses.
  const connection = process.env.DITTO_CONNECTION;
  if (connection !== "claude-cli" && connection !== "codex-cli") {
    try {
      llm.initLlm();
    } catch {
      // initLlm may have already been called, or env vars not set yet.
      // The streaming adapter handles provider selection independently.
    }
  }

  return {
    selfConverseStream: selfStream.selfConverseStream,
    harnessEvents: events.harnessEvents,
    initLlm: llm.initLlm,
    assembleFeed: feedAssembler.assembleFeed,
    approveRun: reviewActions.approveRun,
    editRun: reviewActions.editRun,
    rejectRun: reviewActions.rejectRun,
  };
}
