/**
 * Ditto — The Pulse (Brief 098a)
 *
 * Alex's internal clock — the continuous operation loop that makes Alex
 * an autonomous advisor rather than a one-shot task executor.
 *
 * On each tick:
 * 1. Scan for due delayed runs → start them
 * 2. Scan completed process runs for unprocessed chains → execute chain definitions
 * 3. Run status composition cycle → send updates when thresholds met (Brief 098b)
 *
 * The pulse is idempotent (DB-backed state, not in-memory) and crash-safe.
 * Registered as a cron job in the scheduler.
 *
 * Layer classification: L2 (Agent/Heartbeat) — the pulse is infrastructure
 * that drives process execution, not a process itself.
 *
 * Provenance: OpenClaw heartbeat pattern (Insight-141), adapted from
 * LLM-driven to code-driven for cost efficiency.
 */

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { db, schema } from "../db";
import type { TrustTier } from "../db/schema";
import { eq, and, lte } from "drizzle-orm";
import { startProcessRun, fullHeartbeat } from "./heartbeat";
import { processChains } from "./chain-executor";
import { runStatusComposition } from "./status-composer";
import { runRelationshipPulse } from "./relationship-pulse";
import { checkAndRunSmokeTests } from "./smoke-test-runner";

const PULSE_INTERVAL_MS = parseInt(
  process.env.PULSE_INTERVAL_MS || "300000",
  10,
); // Default: 5 minutes

let pulseTask: ScheduledTask | null = null;
let pulseRunning = false;

/**
 * Execute a single pulse tick.
 * Safe to call multiple times — uses DB state for idempotency.
 */
export async function pulseTick(): Promise<{
  delayedRunsStarted: number;
  chainsProcessed: number;
  statusSent: number;
  relationshipOutreach: number;
}> {
  if (pulseRunning) {
    console.log("[pulse] Tick skipped — previous tick still running");
    return { delayedRunsStarted: 0, chainsProcessed: 0, statusSent: 0, relationshipOutreach: 0 };
  }

  pulseRunning = true;
  let delayedRunsStarted = 0;
  let chainsProcessed = 0;
  let statusSent = 0;
  let relationshipOutreach = 0;

  try {
    // 1. Scan for due delayed runs
    delayedRunsStarted = await processDueDelayedRuns();

    // 2. Scan completed runs for unprocessed chains
    chainsProcessed = await processUnprocessedChains();

    // 3. Status composition cycle (Brief 098b AC10)
    // Check if any user is due for a status update based on activity and last contact
    const statusResult = await runStatusComposition();
    statusSent = statusResult.sent;

    // 4. Relationship pulse (Brief 099b)
    // Proactive outreach: Alex decides whether to reach out to each user.
    // Skips users who already received status this tick (no double-notify).
    const relationshipResult = await runRelationshipPulse(statusResult);
    relationshipOutreach = relationshipResult.outreachSent;

    // 5. Daily journey smoke tests (Brief 112)
    // Non-blocking: checkAndRunSmokeTests triggers async if 24h since last run
    await checkAndRunSmokeTests().catch((err) =>
      console.error("[pulse] Smoke test check error:", err),
    );

    if (delayedRunsStarted > 0 || chainsProcessed > 0 || statusSent > 0 || relationshipOutreach > 0) {
      console.log(
        `[pulse] Tick complete: ${delayedRunsStarted} delayed run(s) started, ${chainsProcessed} chain(s) processed, ${statusSent} status update(s) sent, ${relationshipOutreach} relationship outreach(es) sent`,
      );
    }
  } catch (error) {
    console.error("[pulse] Tick error:", error);
  } finally {
    pulseRunning = false;
  }

  return { delayedRunsStarted, chainsProcessed, statusSent, relationshipOutreach };
}

/**
 * Find and execute delayed runs whose executeAt has passed.
 * Marks each as "executed" before starting to prevent duplicate execution.
 */
async function processDueDelayedRuns(): Promise<number> {
  const now = new Date();

  const dueRuns = await db
    .select()
    .from(schema.delayedRuns)
    .where(
      and(
        eq(schema.delayedRuns.status, "pending"),
        lte(schema.delayedRuns.executeAt, now),
      ),
    );

  if (dueRuns.length === 0) return 0;

  console.log(`[pulse] Scanning delayed runs... found ${dueRuns.length} due`);

  let started = 0;
  for (const delayedRun of dueRuns) {
    try {
      // Mark as executed FIRST to prevent duplicate execution (idempotency)
      await db
        .update(schema.delayedRuns)
        .set({ status: "executed" })
        .where(
          and(
            eq(schema.delayedRuns.id, delayedRun.id),
            eq(schema.delayedRuns.status, "pending"),
          ),
        );

      // Start the process run, inheriting parent trust tier (AC9)
      const runId = await startProcessRun(
        delayedRun.processSlug,
        delayedRun.inputs as Record<string, unknown>,
        "chain",
        delayedRun.parentTrustTier
          ? { parentTrustTier: delayedRun.parentTrustTier as TrustTier }
          : undefined,
      );

      console.log(
        `[pulse] Started delayed run: ${delayedRun.processSlug} → run ${runId.slice(0, 8)}`,
      );

      // Fire and forget heartbeat — don't block the pulse on process execution
      fullHeartbeat(runId).catch((err) => {
        console.error(
          `[pulse] Heartbeat error for delayed run ${runId.slice(0, 8)}:`,
          err,
        );
      });

      started++;
    } catch (error) {
      console.error(
        `[pulse] Failed to start delayed run ${delayedRun.id.slice(0, 8)}:`,
        error,
      );
      // Revert status on failure so it gets retried next tick
      await db
        .update(schema.delayedRuns)
        .set({ status: "pending" })
        .where(eq(schema.delayedRuns.id, delayedRun.id));
    }
  }

  return started;
}

/**
 * Find completed process runs that haven't had their chains processed.
 */
async function processUnprocessedChains(): Promise<number> {
  const unprocessedRuns = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.status, "approved"),
        eq(schema.processRuns.chainsProcessed, false),
      ),
    );

  if (unprocessedRuns.length === 0) return 0;

  console.log(
    `[pulse] Scanning completed chains... found ${unprocessedRuns.length} unprocessed`,
  );

  let processed = 0;
  for (const run of unprocessedRuns) {
    try {
      await processChains(run.id);
      processed++;
    } catch (error) {
      console.error(
        `[pulse] Chain processing error for run ${run.id.slice(0, 8)}:`,
        error,
      );
    }
  }

  return processed;
}

/**
 * Convert PULSE_INTERVAL_MS to a cron expression.
 * Minimum granularity: 1 minute.
 */
function intervalToCron(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `0 */${hours} * * *`;
  }
  return `*/${minutes} * * * *`;
}

/**
 * Register the pulse as a recurring cron job.
 * Call this during server startup.
 */
export function startPulse(): void {
  if (pulseTask) {
    pulseTask.destroy();
  }

  const cronExpr = intervalToCron(PULSE_INTERVAL_MS);
  pulseTask = cron.schedule(cronExpr, async () => {
    await pulseTick();
  });

  console.log(
    `[pulse] Registered pulse at ${Math.round(PULSE_INTERVAL_MS / 60000)}-minute interval (${cronExpr})`,
  );
}

/**
 * Stop the pulse cron job.
 */
export function stopPulse(): void {
  if (pulseTask) {
    pulseTask.destroy();
    pulseTask = null;
    console.log("[pulse] Stopped");
  }
}

/**
 * Check if pulse is currently registered.
 */
export function isPulseRunning(): boolean {
  return pulseTask !== null;
}
