/**
 * Runner poll cadences — Brief 217 §D10 + Brief 218 §D14.
 *
 * Per-kind millisecond cadences for the cross-runner polling cron at
 * `src/engine/runner-poll-cron.ts`. Only kinds whose adapters export a
 * meaningful live-API `status()` belong here.
 *
 * Brief 216 §Constraints "Webhook recovery via polling" — the routine
 * adapter intentionally does NOT export a polling cadence. Routines rely
 * on Brief 215's existing staleness sweeper + GitHub-fallback events
 * alone. Adding a cadence later is a non-breaking change.
 *
 * Brief 218 (GitHub Actions) extends this map with `'github-action'`.
 */

import { type RunnerKind } from "./kinds.js";

export const pollCadenceMs: Partial<Record<RunnerKind, number>> = {
  /** Brief 217 §D2 — 30-second polling cadence per parent §D11. */
  "claude-managed-agent": 30_000,
};

/** Returns the configured cadence for a kind, or null if not polled. */
export function getPollCadenceMs(kind: RunnerKind): number | null {
  const v = pollCadenceMs[kind];
  return typeof v === "number" ? v : null;
}

/** List of kinds whose adapters are walked by the poll cron. */
export function pollableKinds(): RunnerKind[] {
  return Object.keys(pollCadenceMs) as RunnerKind[];
}
