/**
 * Ditto — Process-run state transitions (Brief 179).
 *
 * Centralises the bookkeeping around `processRuns.status` transitions so
 * every terminal transition nulls `definitionOverride` (Brief 174),
 * clears the stale-escalation ladder (Brief 178), and drops the
 * `waitingStateSince` anchor — and every waiting transition sets the
 * anchor.
 *
 * Extracting these into a helper avoids the "Brief 174 only covered three
 * high-level transitions but step-level failures also transition runs to
 * failed" class of bug that the dev-reviewer flagged.
 */

import { db, schema } from "../db";
import { eq } from "drizzle-orm";

/**
 * Mark a run as reaching a terminal status. Nulls `definitionOverride`
 * (Brief 174) so stale adaptations don't leak into resumed runs, nulls
 * `waitingStateSince` (Brief 179), and resets the stale-escalation
 * ladder (Brief 178 P1).
 *
 * Extra fields from the caller are merged in — used for fields like
 * `completedAt` or `updatedAt`.
 */
export async function markRunTerminal(
  runId: string,
  status: "approved" | "failed" | "cancelled" | "rejected",
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(schema.processRuns)
    .set({
      status,
      definitionOverride: null,
      waitingStateSince: null,
      staleEscalationTier: 0,
      staleEscalationLastActionAt: null,
      ...extra,
    })
    .where(eq(schema.processRuns.id, runId));
}

/**
 * Mark a run as entering a waiting state. Sets `waitingStateSince` so
 * the stale-escalation sweep can measure time-in-state, not time since
 * run creation (Brief 179 P0).
 *
 * Callers passing their own `waitingStateSince` override the default;
 * most will want the default (now).
 */
export async function markRunWaiting(
  runId: string,
  status: "waiting_human" | "waiting_review",
  extra: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(schema.processRuns)
    .set({
      status,
      waitingStateSince: new Date(),
      ...extra,
    })
    .where(eq(schema.processRuns.id, runId));
}
