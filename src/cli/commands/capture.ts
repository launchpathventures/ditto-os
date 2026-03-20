/**
 * CLI Command: capture
 * Capture work items with manual classification and process assignment.
 *
 * AC-9: Interactive type/process selection via @clack/prompts.
 * AC-10: Non-interactive via --type and --process flags.
 *
 * In 4b, classification is manual. Auto-classification arrives in 4c
 * with the intake-classifier system agent.
 *
 * Provenance: Original to Agent OS — no CLI does capture → classify → route from free text.
 */

import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import { db, schema } from "../../db";
import { eq, ne } from "drizzle-orm";
import type { WorkItemType } from "../../db/schema";

const validTypes: WorkItemType[] = ["task", "question", "goal", "insight", "outcome"];

export const captureCommand = defineCommand({
  meta: {
    name: "capture",
    description: "Capture a work item",
  },
  args: {
    text: {
      type: "positional",
      description: "What to capture",
      required: true,
    },
    type: {
      type: "string",
      description: "Work item type: task, question, goal, insight, outcome",
    },
    process: {
      type: "string",
      description: "Process slug to assign to",
    },
  },
  async run({ args }) {
    if (!args.text) {
      console.error("Usage: pnpm cli capture <text>");
      process.exit(1);
    }

    let itemType: WorkItemType;
    let assignedProcessId: string | null = null;

    if (args.type && args.process) {
      // Non-interactive mode (AC-10)
      if (!validTypes.includes(args.type as WorkItemType)) {
        console.error(`Invalid type: ${args.type}. Valid: ${validTypes.join(", ")}`);
        process.exit(1);
      }
      itemType = args.type as WorkItemType;

      const [proc] = await db
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, args.process))
        .limit(1);

      if (!proc) {
        console.error(`Process not found: ${args.process}`);
        process.exit(1);
      }
      assignedProcessId = proc.id;
    } else {
      // Interactive mode (AC-9)
      clack.intro("Capture work item");
      console.log(`  "${args.text}"\n`);

      // Select type
      const typeResult = await clack.select({
        message: "What kind of work is this?",
        options: [
          { value: "task", label: "Task — something to do" },
          { value: "question", label: "Question — something to answer" },
          { value: "goal", label: "Goal — something to achieve" },
          { value: "insight", label: "Insight — something learned" },
          { value: "outcome", label: "Outcome — a time-bound goal" },
        ],
      });

      if (clack.isCancel(typeResult)) {
        clack.cancel("Cancelled.");
        process.exit(0);
      }
      itemType = typeResult as WorkItemType;

      // Select process
      const activeProcesses = await db
        .select()
        .from(schema.processes)
        .where(ne(schema.processes.status, "archived"));

      if (activeProcesses.length > 0) {
        const processResult = await clack.select({
          message: "Assign to a process?",
          options: [
            { value: "__none__", label: "None — leave unassigned" },
            ...activeProcesses.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.slug})`,
            })),
          ],
        });

        if (clack.isCancel(processResult)) {
          clack.cancel("Cancelled.");
          process.exit(0);
        }

        if (processResult !== "__none__") {
          assignedProcessId = processResult as string;
        }
      }
    }

    // Create the work item
    const [workItem] = await db
      .insert(schema.workItems)
      .values({
        type: itemType,
        status: assignedProcessId ? "routed" : "intake",
        content: args.text,
        source: "capture",
        assignedProcess: assignedProcessId,
      })
      .returning();

    const shortId = workItem.id.slice(0, 8);
    const typeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);
    console.log(`\n✓ Captured #${shortId} as ${typeLabel}${assignedProcessId ? " (routed)" : ""}`);
  },
});
