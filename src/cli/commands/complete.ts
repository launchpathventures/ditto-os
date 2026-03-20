/**
 * CLI Command: complete
 * Complete a human step in a process run.
 *
 * Reads input_fields from the suspend payload and generates interactive prompts.
 * Supports --data for piped/scripted use.
 *
 * AC-5, AC-6, AC-7, AC-8: Human step completion via CLI.
 * Provenance: @clack/prompts for interactive UX, ADR-010 Section 4.
 */

import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import { db, schema } from "../../db";
import { eq, and } from "drizzle-orm";
import { resumeHumanStep } from "../../engine/heartbeat";
import type { HumanInputField } from "../../engine/process-loader";

export const completeCommand = defineCommand({
  meta: {
    name: "complete",
    description: "Complete a human step",
  },
  args: {
    id: {
      type: "positional",
      description: "Work item ID to complete",
      required: true,
    },
    data: {
      type: "string",
      description: 'JSON data for non-interactive use: --data \'{"field":"value"}\'',
    },
  },
  async run({ args }) {
    // Find the work item
    const workItems = await db
      .select()
      .from(schema.workItems)
      .where(eq(schema.workItems.status, "waiting_human"));

    // Match by full ID or prefix
    const workItem = workItems.find(
      (wi) => wi.id === args.id || wi.id.startsWith(args.id),
    );

    if (!workItem) {
      console.error(`No waiting human step found for: ${args.id}`);
      process.exit(1);
    }

    const context = workItem.context as Record<string, unknown> | null;
    if (!context || !context.processRunId) {
      console.error("Work item has no process run context");
      process.exit(1);
    }

    const processRunId = context.processRunId as string;
    const inputFields = (context.inputFields || []) as HumanInputField[];
    const instructions = (context.instructions || workItem.content) as string;

    let humanInput: Record<string, unknown>;

    if (args.data) {
      // Non-interactive: parse JSON data (AC-6)
      try {
        humanInput = JSON.parse(args.data) as Record<string, unknown>;
      } catch {
        console.error("Invalid JSON in --data flag");
        process.exit(1);
      }

      // Validate against input_fields schema if defined
      if (inputFields.length > 0) {
        const knownFields = new Set(inputFields.map((f) => f.name));
        const providedFields = new Set(Object.keys(humanInput));

        // Check required fields are present
        for (const field of inputFields) {
          if (field.required !== false && !providedFields.has(field.name)) {
            console.error(`Missing required field: ${field.name}`);
            process.exit(1);
          }
        }

        // Warn about unknown fields (don't block — allow pass-through)
        for (const key of providedFields) {
          if (!knownFields.has(key)) {
            console.warn(`Warning: unknown field "${key}" not in input_fields schema`);
          }
        }
      }
    } else if (inputFields.length === 0) {
      // No input fields — just confirm completion
      clack.intro("Complete human step");
      console.log(`  ${instructions}\n`);

      const confirm = await clack.confirm({
        message: "Mark this step as complete?",
      });

      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel("Cancelled.");
        process.exit(0);
      }

      humanInput = { completed: true };
    } else {
      // Interactive: generate prompts from input_fields (AC-5)
      clack.intro("Complete human step");
      console.log(`  ${instructions}\n`);

      humanInput = {};
      for (const field of inputFields) {
        const label = field.label || field.name;
        const isRequired = field.required !== false;

        let value: unknown;

        switch (field.type) {
          case "select": {
            const options = (field.options || []).map((opt) => ({
              value: opt,
              label: opt,
            }));
            value = await clack.select({
              message: label,
              options,
            });
            break;
          }

          case "date": {
            value = await clack.text({
              message: `${label} (YYYY-MM-DD)`,
              placeholder: "2026-01-01",
              defaultValue: field.default,
              validate: (input) => {
                if (isRequired && !input) return "Required";
                if (input && !/^\d{4}-\d{2}-\d{2}$/.test(input))
                  return "Use YYYY-MM-DD format";
                return undefined;
              },
            });
            break;
          }

          case "number": {
            const numResult = await clack.text({
              message: label,
              defaultValue: field.default,
              validate: (input) => {
                if (isRequired && !input) return "Required";
                if (input && isNaN(Number(input))) return "Must be a number";
                return undefined;
              },
            });
            value = numResult ? Number(numResult) : undefined;
            break;
          }

          case "boolean": {
            value = await clack.confirm({
              message: label,
            });
            break;
          }

          case "text":
          default: {
            value = await clack.text({
              message: label,
              placeholder: field.description,
              defaultValue: field.default,
              validate: (input) => {
                if (isRequired && !input) return "Required";
                return undefined;
              },
            });
            break;
          }
        }

        if (clack.isCancel(value)) {
          clack.cancel("Cancelled.");
          process.exit(0);
        }

        humanInput[field.name] = value;
      }
    }

    // Resume the process run with human input
    const result = await resumeHumanStep(processRunId, humanInput);

    console.log(`\n✓ Step completed. Process resuming.`);
    console.log(`Status: ${result.status}`);
    console.log(`Steps executed: ${result.stepsExecuted}`);
    console.log(`Message: ${result.message}`);
  },
});
