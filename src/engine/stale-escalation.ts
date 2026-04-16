/**
 * Ditto — Stale Escalation Ladder (Brief 178)
 *
 * Runs in the scheduler's recurring sweep. For each process run in
 * `waiting_human` or `waiting_review`, computes the appropriate tier
 * based on how long the run has been waiting and fires the matching
 * action exactly once per tier transition.
 *
 * Ladder:
 *   tier 0 → < 24h: no action (briefing handles it)
 *   tier 1 → ≥ 24h: briefing flag only (handled by risk-detector already)
 *   tier 2 → ≥ 48h: direct `notifyUser` reminder
 *   tier 3 → ≥ 72h: admin notify (`notifyAdmin`, if deployment supports it)
 *
 * Idempotency: `staleEscalationTier` + `staleEscalationLastActionAt`
 * columns on processRuns. The sweep only fires when the computed tier
 * is higher than the stored one. When the run transitions out of
 * waiting_human/waiting_review, callers reset tier to 0.
 */

import { db, schema } from "../db";
import { and, eq, inArray } from "drizzle-orm";

export type StaleTier = 0 | 1 | 2 | 3;

/** Pure classifier: how stale is this wait, in ladder tiers? */
export function classifyStaleTier(waitingSince: Date, now: Date = new Date()): StaleTier {
  const ageMs = now.getTime() - waitingSince.getTime();
  const hours = ageMs / (1000 * 60 * 60);
  if (hours >= 72) return 3;
  if (hours >= 48) return 2;
  if (hours >= 24) return 1;
  return 0;
}

export interface StaleReminderContent {
  subject: string;
  body: string;
}

/** Pure formatter: user-friendly reminder content for tier 2. */
export function buildStaleReminder(params: {
  processName: string | null;
  currentStepId: string | null;
  waitingSince: Date;
  now?: Date;
}): StaleReminderContent {
  const days = Math.max(
    1,
    Math.floor(
      ((params.now ?? new Date()).getTime() - params.waitingSince.getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const what = params.processName ?? "a process";
  const where = params.currentStepId ? ` (step: ${params.currentStepId})` : "";
  return {
    subject: `Still waiting on you — ${what}`,
    body:
      `Just a reminder: ${what}${where} has been waiting for your input for about ${days} day${
        days === 1 ? "" : "s"
      }.\n\nIf the ask isn't relevant any more, you can dismiss or reject. ` +
      `Otherwise a quick look would unblock it.`,
  };
}

export interface StaleSweepOptions {
  /** Callback to send user-facing notification (tier 2 transition). */
  notifyUser?: (params: {
    userId: string;
    subject: string;
    body: string;
    runId: string;
  }) => Promise<void>;
  /** Callback to notify admin on tier 3 transition. Deployment may skip. */
  notifyAdmin?: (params: {
    userId: string;
    subject: string;
    body: string;
    runId: string;
    tierHistory: { tier: StaleTier; at: Date }[];
  }) => Promise<void>;
  /** Override `now` for deterministic testing. */
  now?: Date;
}

export interface StaleSweepResult {
  scannedRuns: number;
  transitions: Array<{
    runId: string;
    fromTier: StaleTier;
    toTier: StaleTier;
  }>;
}

/**
 * Sweep all waiting runs once. Safe to call repeatedly (idempotent: a run
 * whose stored tier already equals the computed tier is untouched).
 */
export async function sweepStaleEscalations(
  options: StaleSweepOptions = {},
): Promise<StaleSweepResult> {
  const now = options.now ?? new Date();
  const rows = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      status: schema.processRuns.status,
      currentStepId: schema.processRuns.currentStepId,
      createdAt: schema.processRuns.createdAt,
      staleEscalationTier: schema.processRuns.staleEscalationTier,
    })
    .from(schema.processRuns)
    .where(
      inArray(schema.processRuns.status, [
        "waiting_human",
        "waiting_review",
      ]),
    );

  const transitions: StaleSweepResult["transitions"] = [];

  // Preload process names for human-legible reminder content.
  const processIds = Array.from(new Set(rows.map((r) => r.processId)));
  const processNames = new Map<string, string>();
  if (processIds.length > 0) {
    const procRows = await db
      .select({ id: schema.processes.id, name: schema.processes.name })
      .from(schema.processes)
      .where(inArray(schema.processes.id, processIds));
    for (const row of procRows) processNames.set(row.id, row.name);
  }

  for (const run of rows) {
    const fromTier = (run.staleEscalationTier ?? 0) as StaleTier;
    const toTier = classifyStaleTier(run.createdAt, now);
    if (toTier <= fromTier) continue;

    // Fire the transition action based on the NEW tier. Tier 1 is
    // briefing-only (already handled by risk-detector); just mark.
    if (toTier >= 2 && options.notifyUser) {
      const reminder = buildStaleReminder({
        processName: processNames.get(run.processId) ?? null,
        currentStepId: run.currentStepId,
        waitingSince: run.createdAt,
        now,
      });
      try {
        await options.notifyUser({
          userId: "founder", // single-user MVP — real userId wiring TBD
          subject: reminder.subject,
          body: reminder.body,
          runId: run.id,
        });
      } catch (err) {
        console.warn(`[stale-escalation] notifyUser failed for run ${run.id}:`, err);
        // Don't update the tier — try again next sweep.
        continue;
      }
    }
    if (toTier >= 3 && options.notifyAdmin) {
      try {
        await options.notifyAdmin({
          userId: "founder",
          subject: `Admin: stale escalation for run ${run.id}`,
          body: `Run has been waiting ${((now.getTime() - run.createdAt.getTime()) / 86_400_000).toFixed(1)} days.`,
          runId: run.id,
          tierHistory: [{ tier: toTier, at: now }],
        });
      } catch (err) {
        console.warn(`[stale-escalation] notifyAdmin failed for run ${run.id}:`, err);
      }
    }

    await db
      .update(schema.processRuns)
      .set({
        staleEscalationTier: toTier,
        staleEscalationLastActionAt: now,
      })
      .where(eq(schema.processRuns.id, run.id));

    transitions.push({ runId: run.id, fromTier, toTier });
  }

  return { scannedRuns: rows.length, transitions };
}

/**
 * Reset the escalation ladder for a run. Call when the run transitions
 * out of waiting_human/waiting_review (approved, failed, cancelled, or
 * the user acts on it).
 */
export async function resetStaleEscalationLadder(runId: string): Promise<void> {
  await db
    .update(schema.processRuns)
    .set({
      staleEscalationTier: 0,
      staleEscalationLastActionAt: null,
    })
    .where(
      and(
        eq(schema.processRuns.id, runId),
        // Only reset if there's something to reset (avoid unnecessary writes).
      ),
    );
}
