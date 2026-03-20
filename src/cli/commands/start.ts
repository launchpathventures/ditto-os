/**
 * CLI Command: start
 * Start a new process run and create a corresponding work item (AC-3).
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { startProcessRun, fullHeartbeat } from "../../engine/heartbeat";

export const startCommand = defineCommand({
  meta: {
    name: "start",
    description: "Start a new process run",
  },
  args: {
    process: {
      type: "positional",
      description: "Process slug to start",
      required: true,
    },
    input: {
      type: "string",
      description: "Input key=value pairs (repeatable)",
    },
  },
  async run({ args }) {
    const processSlug = args.process;

    // Parse inputs from remaining args
    const inputs: Record<string, string> = {};
    if (args.input) {
      const parts = Array.isArray(args.input) ? args.input : [args.input];
      for (const part of parts) {
        if (part.includes("=")) {
          const [key, ...rest] = part.split("=");
          inputs[key] = rest.join("=");
        }
      }
    }

    // Look up the process for the work item
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      console.error(`Process not found: ${processSlug}`);
      process.exit(1);
    }

    console.log(`Starting process: ${processSlug}\n`);
    const runId = await startProcessRun(processSlug, inputs);

    // AC-3: Create a work item of type `task` for this run
    const contentSummary = Object.keys(inputs).length > 0
      ? `${proc.name}: ${Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(", ")}`
      : `${proc.name} run`;

    await db.insert(schema.workItems).values({
      type: "task",
      status: "in_progress",
      content: contentSummary,
      source: "system_generated",
      assignedProcess: proc.id,
      executionIds: [runId],
    });

    console.log(`\nRunning heartbeat...`);
    const result = await fullHeartbeat(runId);

    console.log(`\nResult: ${result.status}`);
    console.log(`Steps executed: ${result.stepsExecuted}`);
    console.log(`Message: ${result.message}`);
    console.log(`\nRun ID: ${runId}`);

    if (result.status === "waiting_review") {
      console.log(`\nRun 'pnpm cli review ${runId}' to see outputs.`);
      console.log(`Run 'pnpm cli approve ${runId}' to approve and continue.`);
    }
  },
});
