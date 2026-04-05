/**
 * CLI Command: schedule
 * Manage cron-based schedule triggers for processes.
 *
 * ditto schedule list                    — show all schedules
 * ditto schedule enable <process-slug>   — enable a schedule
 * ditto schedule disable <process-slug>  — disable a schedule
 * ditto schedule trigger <process-slug>  — manually trigger a scheduled run
 *
 * Provenance: Brief 076
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { triggerManually } from "../../engine/scheduler";

export const scheduleListCommand = defineCommand({
  meta: {
    name: "list",
    description: "Show all schedules with process name, cron, enabled, lastRunAt, nextRunAt",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const allSchedules = await db
      .select({
        id: schema.schedules.id,
        processId: schema.schedules.processId,
        cronExpression: schema.schedules.cronExpression,
        enabled: schema.schedules.enabled,
        lastRunAt: schema.schedules.lastRunAt,
        nextRunAt: schema.schedules.nextRunAt,
        createdAt: schema.schedules.createdAt,
      })
      .from(schema.schedules);

    // Enrich with process names
    const enriched = [];
    for (const sched of allSchedules) {
      const [proc] = await db
        .select({ name: schema.processes.name, slug: schema.processes.slug })
        .from(schema.processes)
        .where(eq(schema.processes.id, sched.processId))
        .limit(1);

      enriched.push({
        ...sched,
        processName: proc?.name ?? "unknown",
        processSlug: proc?.slug ?? "unknown",
      });
    }

    if (enriched.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      console.log("No schedules configured.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(enriched, null, 2));
      return;
    }

    console.log(`SCHEDULES (${enriched.length})\n`);
    for (const s of enriched) {
      const enabledStr = s.enabled ? "enabled" : "disabled";
      const lastRun = s.lastRunAt
        ? s.lastRunAt.toISOString().slice(0, 19).replace("T", " ")
        : "never";
      const nextRun = s.nextRunAt
        ? s.nextRunAt.toISOString().slice(0, 19).replace("T", " ")
        : "—";
      console.log(
        `  ${s.processSlug.padEnd(30)} ${s.cronExpression.padEnd(20)} ${enabledStr.padEnd(10)} last: ${lastRun}  next: ${nextRun}`,
      );
    }
  },
});

export const scheduleEnableCommand = defineCommand({
  meta: {
    name: "enable",
    description: "Enable a schedule for a process",
  },
  args: {
    process: {
      type: "positional",
      description: "Process slug to enable schedule for",
      required: true,
    },
  },
  async run({ args }) {
    if (!args.process) {
      console.error("Usage: ditto schedule enable <process-slug>");
      process.exit(1);
    }

    const [proc] = await db
      .select({ id: schema.processes.id })
      .from(schema.processes)
      .where(eq(schema.processes.slug, args.process))
      .limit(1);

    if (!proc) {
      console.error(`Process not found: ${args.process}`);
      process.exit(1);
    }

    const [sched] = await db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id))
      .limit(1);

    if (!sched) {
      console.error(`No schedule found for process: ${args.process}`);
      process.exit(1);
    }

    await db
      .update(schema.schedules)
      .set({ enabled: true })
      .where(eq(schema.schedules.id, sched.id));

    console.log(`Schedule enabled for ${args.process} (${sched.cronExpression})`);
  },
});

export const scheduleDisableCommand = defineCommand({
  meta: {
    name: "disable",
    description: "Disable a schedule for a process",
  },
  args: {
    process: {
      type: "positional",
      description: "Process slug to disable schedule for",
      required: true,
    },
  },
  async run({ args }) {
    if (!args.process) {
      console.error("Usage: ditto schedule disable <process-slug>");
      process.exit(1);
    }

    const [proc] = await db
      .select({ id: schema.processes.id })
      .from(schema.processes)
      .where(eq(schema.processes.slug, args.process))
      .limit(1);

    if (!proc) {
      console.error(`Process not found: ${args.process}`);
      process.exit(1);
    }

    const [sched] = await db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id))
      .limit(1);

    if (!sched) {
      console.error(`No schedule found for process: ${args.process}`);
      process.exit(1);
    }

    await db
      .update(schema.schedules)
      .set({ enabled: false })
      .where(eq(schema.schedules.id, sched.id));

    console.log(`Schedule disabled for ${args.process}`);
  },
});

export const scheduleTriggerCommand = defineCommand({
  meta: {
    name: "trigger",
    description: "Manually trigger a scheduled process run",
  },
  args: {
    process: {
      type: "positional",
      description: "Process slug to trigger",
      required: true,
    },
  },
  async run({ args }) {
    if (!args.process) {
      console.error("Usage: ditto schedule trigger <process-slug>");
      process.exit(1);
    }

    try {
      const runId = await triggerManually(args.process);
      if (runId) {
        console.log(`Triggered schedule run: ${runId}`);
      } else {
        console.log(`Skipped: active run exists for ${args.process}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
});

export const scheduleCommand = defineCommand({
  meta: {
    name: "schedule",
    description: "Manage cron-based schedule triggers",
  },
  subCommands: {
    list: scheduleListCommand,
    enable: scheduleEnableCommand,
    disable: scheduleDisableCommand,
    trigger: scheduleTriggerCommand,
  },
});
