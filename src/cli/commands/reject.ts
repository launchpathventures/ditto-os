/**
 * CLI Command: reject
 * Reject outputs with required reason.
 * AC-11: Requires reason via interactive prompt or --reason flag.
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { recordRejectionFeedback } from "../../engine/harness-handlers/feedback-recorder";
import * as p from "@clack/prompts";

export const rejectCommand = defineCommand({
  meta: {
    name: "reject",
    description: "Reject outputs with a reason",
  },
  args: {
    id: {
      type: "positional",
      description: "Run ID to reject",
      required: true,
    },
    reason: {
      type: "string",
      description: "Reason for rejection (required)",
    },
  },
  async run({ args }) {
    let reason = args.reason;

    // AC-11: Require reason — interactive prompt if TTY, error if piped
    if (!reason) {
      if (process.stdout.isTTY) {
        const input = await p.text({
          message: "Why are you rejecting this? (required)",
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return "A reason is required for rejection.";
            }
          },
        });
        if (p.isCancel(input)) {
          console.log("Cancelled.");
          return;
        }
        reason = input;
      } else {
        console.error(
          "Rejection requires a reason. Use --reason \"...\" when piping.",
        );
        process.exit(1);
      }
    }

    const [run] = await db
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, args.id))
      .limit(1);

    if (!run) {
      console.error(`Run not found: ${args.id}`);
      process.exit(1);
    }

    // Look up process name for output message
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.id, run.processId))
      .limit(1);

    const outputs = await db
      .select()
      .from(schema.processOutputs)
      .where(eq(schema.processOutputs.processRunId, args.id));

    for (const output of outputs) {
      await recordRejectionFeedback({
        outputId: output.id,
        processId: run.processId,
        comment: reason ?? undefined,
      });
    }

    // Mark outputs as reviewed
    await db
      .update(schema.processOutputs)
      .set({
        needsReview: false,
        reviewedAt: new Date(),
        reviewedBy: "human",
      })
      .where(eq(schema.processOutputs.processRunId, args.id));

    // Mark step as rejected
    await db
      .update(schema.stepRuns)
      .set({ status: "rejected", completedAt: new Date() })
      .where(eq(schema.stepRuns.processRunId, args.id));

    // Mark run as rejected
    await db
      .update(schema.processRuns)
      .set({ status: "rejected" })
      .where(eq(schema.processRuns.id, args.id));

    // Designer spec: "Rejected. Reason recorded. [Process] will retry with feedback."
    const processName = proc?.name || "Process";
    console.log(
      `\u2713 Rejected. Reason recorded. ${processName} will retry with feedback.`,
    );
  },
});
