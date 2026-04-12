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
 * Dual triggers (Brief 118): when a process definition has trigger.also, registers
 * a second trigger (cron or event). Both triggers create runs through the same path
 * with the same overlap prevention.
 *
 * Provenance: Brief 076 (scheduler), Brief 118 (dual triggers), node-cron v4 scheduling.
 */

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { db, schema } from "../db";
import type { RunStatus, TrustTier } from "../db/schema";
import { eq, and, notInArray, isNotNull, lte } from "drizzle-orm";
import { startProcessRun, fullHeartbeat, resumeHumanStep } from "./heartbeat";
import type { ProcessDefinition } from "./process-loader";

// Active cron tasks keyed by schedule ID (or "also:<scheduleId>" for dual triggers)
const activeTasks = new Map<string, ScheduledTask>();

// Event listeners keyed by event name
const eventListeners = new Map<string, Array<{ processSlug: string; processId: string }>>();

/**
 * Start the scheduler: load all enabled schedules from DB and register cron jobs.
 * Also registers dual triggers from process definitions (trigger.also).
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
    // Look up the process slug and definition for startProcessRun + dual trigger
    const [proc] = await db
      .select({
        slug: schema.processes.slug,
        definition: schema.processes.definition,
      })
      .from(schema.processes)
      .where(eq(schema.processes.id, schedule.processId))
      .limit(1);

    if (!proc) {
      console.warn(`Schedule ${schedule.id}: process ${schedule.processId} not found, skipping`);
      continue;
    }

    // Register primary cron trigger
    registerCronTask(schedule.id, schedule.cronExpression, proc.slug, schedule.processId);

    // Register dual trigger if process definition has trigger.also (Brief 118)
    const definition = proc.definition as unknown as ProcessDefinition | null;
    if (definition?.trigger?.also) {
      const also = definition.trigger.also;
      if (also.type === "schedule" && also.cron) {
        // Second cron trigger
        registerCronTask(
          `also:${schedule.id}`,
          also.cron,
          proc.slug,
          schedule.processId,
        );
        console.log(`Schedule ${schedule.id}: dual cron trigger registered for ${proc.slug}`);
      } else if (also.type === "event" && also.event) {
        // Event trigger
        registerEventListener(also.event, proc.slug, schedule.processId);
        console.log(`Schedule ${schedule.id}: event trigger "${also.event}" registered for ${proc.slug}`);
      }
    }
  }

  // Register periodic wait_for timeout checker (Brief 121)
  // Runs every 5 minutes to check for timed-out wait_for steps
  const timeoutChecker = cron.schedule("*/5 * * * *", async () => {
    try {
      const count = await checkWaitForTimeouts();
      if (count > 0) {
        console.log(`[scheduler] Resolved ${count} wait_for timeout(s)`);
      }
    } catch (err) {
      console.error("[scheduler] wait_for timeout check error:", err);
    }
  });
  activeTasks.set("__wait_for_timeout_checker__", timeoutChecker);

  console.log(`Scheduler started: ${activeTasks.size} schedule(s) registered`);
}

/**
 * Stop all active cron tasks and event listeners cleanly.
 */
export async function stop(): Promise<void> {
  await Promise.all([...activeTasks.values()].map((task) => task.destroy()));
  activeTasks.clear();
  eventListeners.clear();
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
 * Fire an event trigger. All processes registered for this event get triggered,
 * subject to overlap prevention. Returns run IDs of triggered processes.
 *
 * Brief 118: event triggers are the second half of dual triggers. A cycle can
 * have a daily cron AND an event trigger — both create runs through the same path.
 */
export async function fireEvent(
  eventName: string,
  inputs: Record<string, unknown> = {},
  options?: { parentTrustTier?: TrustTier },
): Promise<string[]> {
  const listeners = eventListeners.get(eventName);
  if (!listeners || listeners.length === 0) return [];

  const runIds: string[] = [];

  for (const listener of listeners) {
    // Idempotency: skip if active run exists (no overlapping runs)
    const hasActiveRun = await checkActiveRun(listener.processId);
    if (hasActiveRun) {
      console.log(`Event "${eventName}": skipped ${listener.processSlug} — active run exists`);
      continue;
    }

    try {
      // Brief 126 AC20: Pass parentTrustTier so chain-spawned processes
      // inherit the more restrictive tier (098a AC9).
      const runId = await startProcessRun(
        listener.processSlug,
        inputs,
        `event:${eventName}`,
        options?.parentTrustTier ? { parentTrustTier: options.parentTrustTier } : undefined,
      );
      fullHeartbeat(runId).catch((err) => {
        console.error(`Event "${eventName}" heartbeat error for run ${runId}:`, err);
      });
      runIds.push(runId);
    } catch (err) {
      console.error(`Event "${eventName}": error triggering ${listener.processSlug}:`, err);
    }
  }

  return runIds;
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
  // For dual triggers ("also:<realId>"), extract the real schedule ID for DB updates
  const dbScheduleId = scheduleId.startsWith("also:") ? scheduleId.slice(5) : scheduleId;

  const task = cron.schedule(cronExpression, async () => {
    try {
      // Overlap prevention
      const hasActiveRun = await checkActiveRun(processId);
      if (hasActiveRun) {
        console.log(`Schedule ${scheduleId}: skipped — active run exists for ${processSlug}`);
        return;
      }

      // Update lastRunAt (uses real schedule ID for dual triggers)
      await db
        .update(schema.schedules)
        .set({ lastRunAt: new Date() })
        .where(eq(schema.schedules.id, dbScheduleId));

      console.log(`Schedule ${scheduleId}: triggering ${processSlug}`);
      const runId = await startProcessRun(processSlug, {}, "schedule");
      await fullHeartbeat(runId);
      console.log(`Schedule ${scheduleId}: run ${runId} completed`);
    } catch (err) {
      console.error(`Schedule ${scheduleId}: error running ${processSlug}:`, err);
    }
  });

  // Update nextRunAt (uses real schedule ID for dual triggers)
  const nextRun = task.getNextRun();
  if (nextRun) {
    db.update(schema.schedules)
      .set({ nextRunAt: nextRun })
      .where(eq(schema.schedules.id, dbScheduleId))
      .then(() => {})
      .catch(() => {});
  }

  activeTasks.set(scheduleId, task);
}

/**
 * Register an event listener for a process.
 * When fireEvent() is called with the event name, this process gets triggered.
 */
function registerEventListener(
  eventName: string,
  processSlug: string,
  processId: string,
): void {
  const listeners = eventListeners.get(eventName) || [];
  listeners.push({ processSlug, processId });
  eventListeners.set(eventName, listeners);
}

/**
 * Check for wait_for steps past their timeout and resume them with { timedOut: true }.
 * Called periodically by the scheduler to prevent indefinite suspension (Brief 121 AC7).
 *
 * Uses the indexed timeoutAt column on processRuns — no JSON parsing needed.
 */
export async function checkWaitForTimeouts(): Promise<number> {
  const now = new Date();

  // Indexed query: only fetch runs where timeoutAt has passed
  const timedOutRuns = await db
    .select({
      id: schema.processRuns.id,
      suspendState: schema.processRuns.suspendState,
    })
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.status, "waiting_human"),
        isNotNull(schema.processRuns.timeoutAt),
        lte(schema.processRuns.timeoutAt, now),
      ),
    );

  let timedOutCount = 0;

  for (const run of timedOutRuns) {
    const suspendState = run.suspendState as Record<string, unknown> | null;
    const payload = (suspendState?.suspendPayload as Record<string, unknown>) || {};

    console.log(`[scheduler] wait_for timeout: run ${run.id.slice(0, 8)}, step ${payload.stepId || "unknown"}`);

    try {
      await resumeHumanStep(run.id, { timedOut: true });

      // Record timeout as activity (Brief 121 AC16)
      await db.insert(schema.activities).values({
        action: "step.wait_for.timeout",
        actorType: "system",
        entityType: "process_run",
        entityId: run.id,
        metadata: {
          stepId: payload.stepId,
          stepName: payload.stepName,
          timedOut: true,
        },
      });

      timedOutCount++;
    } catch (err) {
      console.error(`[scheduler] wait_for timeout resume failed for run ${run.id.slice(0, 8)}:`, err);
    }
  }

  return timedOutCount;
}

/**
 * Get count of active scheduled tasks (for status display).
 */
export function getActiveTaskCount(): number {
  return activeTasks.size;
}

/**
 * Get count of registered event listeners (for status display).
 */
export function getEventListenerCount(): number {
  return [...eventListeners.values()].reduce((sum, listeners) => sum + listeners.length, 0);
}
