/**
 * @ditto/core — Step Output Reader
 *
 * Brief 228 §AC #3 — Insight-217 absorption.
 *
 * The harness pipeline does NOT auto-merge previous step outputs into the next
 * step's `inputs`. Each handler in a multi-step pipeline must query
 * `step_runs.outputs` itself, keyed by `processRunId`. Brief 226's analyser
 * pipeline was the second pipeline that needed this; Brief 228's retrofit is
 * the third — at which point Insight-217 names this helper as worth
 * extracting from local-to-onboarding into shared core.
 *
 * Returns a map keyed by `stepId` so callers can index by name
 * (`prior['clone-and-scan']`, `prior['surface-plan']`, etc.). Last-write-wins
 * for retried steps (the heartbeat re-inserts on retry).
 *
 * Provenance: Extracted verbatim from `src/engine/onboarding/handlers.ts:144`
 *   (Brief 226). Behaviour preserved; the analyser handlers consume this
 *   shared module after extraction.
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { stepRuns } from "../db/schema.js";

// Minimal DB shape — accepts any drizzle-better-sqlite3 db whose schema
// includes the stepRuns table. The consumer passes its own `db`.
type AnyDb = BetterSQLite3Database<Record<string, unknown>>;

/**
 * Aggregate prior step outputs by `stepId` from the `step_runs` table.
 * The harness pipeline does NOT auto-merge outputs into next-step inputs;
 * downstream handlers query this themselves.
 *
 * @param processRunId — the run whose step outputs should be loaded.
 * @param db — drizzle-better-sqlite3 instance. Required because core does
 *   NOT hold a database singleton (per CLAUDE.md "DB injection" rule).
 * @returns map keyed by `stepId` → that step's `outputs` JSON object.
 *   Steps with null outputs are omitted from the map.
 */
export async function readPriorStepOutputs(
  processRunId: string,
  db: AnyDb,
): Promise<Record<string, Record<string, unknown>>> {
  const rows = await db
    .select({
      stepId: stepRuns.stepId,
      status: stepRuns.status,
      outputs: stepRuns.outputs,
    })
    .from(stepRuns)
    .where(eq(stepRuns.processRunId, processRunId));
  const byStep: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (!row.outputs) continue;
    // Last-write-wins for retried steps (the heartbeat re-inserts on retry).
    byStep[row.stepId] = row.outputs as Record<string, unknown>;
  }
  return byStep;
}
