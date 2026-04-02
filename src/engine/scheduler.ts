/**
 * Ditto — Schedule Trigger Engine
 *
 * Cron-based scheduler for automatic process runs.
 * Queries enabled schedules from DB, registers cron jobs via node-cron,
 * each job creates a process run (triggeredBy: "schedule") and invokes heartbeat.
 *
 * Overlap prevention: before creating a run, checks if a previous run for this
 * process is still active (status not completed/failed/cancelled). If so, skips and logs.
 *
 * Provenance: Brief 076, node-cron v4 scheduling.
 */

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { db, schema } from "../db";
import type { RunStatus } from "../db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { startProcessRun, fullHeartbeat } from "./heartbeat";

// Active cron tasks keyed by schedule ID
const activeTasks = new Map<string, ScheduledTask>();

/**
 * Start the scheduler: load all enabled schedules from DB and register cron jobs.
 */
export async function start(): Promise<void> {
  // Stop any existing tasks first
  await stop();

  const enabledSchedules = await db
    .select({
      id: schema.schedules.id,
      processId: schema.schedules.processId,
      cronExpression: schema.schedules.cronExpression,
    })
    .from(schema.schedules)
    .where(eq(schema.schedules.enabled, true));

  for (const schedule of enabledSchedules) {
    // Look up the process slug for startProcessRun
    const [proc] = await db
      .select({ slug: schema.processes.slug })
      .from(schema.processes)
      .where(eq(schema.processes.id, schedule.processId))
      .limit(1);

    if (!proc) {
      console.warn(`Schedule ${schedule.id}: process ${schedule.processId} not found, skipping`);
      continue;
    }

    registerCronTask(schedule.id, schedule.cronExpression, proc.slug, schedule.processId);
  }

  console.log(`Scheduler started: ${activeTasks.size} schedule(s) registered`);
}

/**
 * Stop all active cron tasks cleanly.
 */
export async function stop(): Promise<void> {
  for (const [id, task] of activeTasks) {
    task.destroy();
  }
  activeTasks.clear();
}

/**
 * Manually trigger a scheduled run for a process (by slug), bypassing cron timing.
 * Still respects overlap prevention.
 */
export async function triggerManually(processSlug: string): Promise<string | null> {
  // Look up the process
  const [proc] = await db
    .select({ id: schema.processes.id })
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    throw new Error(`Process not found: ${processSlug}`);
  }

  // Overlap check
  const hasActiveRun = await checkActiveRun(proc.id);
  if (hasActiveRun) {
    console.log(`Schedule trigger skipped for ${processSlug}: active run exists`);
    return null;
  }

  // Update lastRunAt on the schedule (if one exists)
  await db
    .update(schema.schedules)
    .set({ lastRunAt: new Date() })
    .where(eq(schema.schedules.processId, proc.id));

  const runId = await startProcessRun(processSlug, {}, "schedule");
  // Fire and forget the heartbeat — don't block on it for manual triggers
  fullHeartbeat(runId).catch((err) => {
    console.error(`Schedule heartbeat error for run ${runId}:`, err);
  });

  return runId;
}

/**
 * Check if there's an active (non-terminal) run for a process.
 */
async function checkActiveRun(processId: string): Promise<boolean> {
  const terminalStatuses: RunStatus[] = ["approved", "rejected", "failed", "cancelled", "skipped"];
  const activeRuns = await db
    .select({ id: schema.processRuns.id })
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.processId, processId),
        notInArray(schema.processRuns.status, terminalStatuses),
      ),
    )
    .limit(1);

  return activeRuns.length > 0;
}

/**
 * Register a single cron task for a schedule.
 */
function registerCronTask(
  scheduleId: string,
  cronExpression: string,
  processSlug: string,
  processId: string,
): void {
  const task = cron.schedule(cronExpression, async () => {
    try {
      // Overlap prevention
      const hasActiveRun = await checkActiveRun(processId);
      if (hasActiveRun) {
        console.log(`Schedule ${scheduleId}: skipped — active run exists for ${processSlug}`);
        return;
      }

      // Update lastRunAt
      await db
        .update(schema.schedules)
        .set({ lastRunAt: new Date() })
        .where(eq(schema.schedules.id, scheduleId));

      console.log(`Schedule ${scheduleId}: triggering ${processSlug}`);
      const runId = await startProcessRun(processSlug, {}, "schedule");
      await fullHeartbeat(runId);
      console.log(`Schedule ${scheduleId}: run ${runId} completed`);
    } catch (err) {
      console.error(`Schedule ${scheduleId}: error running ${processSlug}:`, err);
    }
  });

  // Update nextRunAt
  const nextRun = task.getNextRun();
  if (nextRun) {
    db.update(schema.schedules)
      .set({ nextRunAt: nextRun })
      .where(eq(schema.schedules.id, scheduleId))
      .then(() => {})
      .catch(() => {});
  }

  activeTasks.set(scheduleId, task);
}

/**
 * Get count of active scheduled tasks (for status display).
 */
export function getActiveTaskCount(): number {
  return activeTasks.size;
}
