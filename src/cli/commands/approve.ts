/**
 * CLI Command: approve (and edit alias)
 * Approve outputs and continue the process.
 * AC-10: approve <id>, approve <id> --edit, edit <id> alias.
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { fullHeartbeat } from "../../engine/heartbeat";
import {
  recordEditFeedback,
  recordApprovalFeedback,
} from "../../engine/harness-handlers/feedback-recorder";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

export const approveCommand = defineCommand({
  meta: {
    name: "approve",
    description: "Approve outputs and continue the process",
  },
  args: {
    id: {
      type: "positional",
      description: "Run ID to approve",
      required: true,
    },
    edit: {
      type: "boolean",
      description: "Open $EDITOR to edit output before approving",
      default: false,
    },
    comment: {
      type: "string",
      description: "Add a comment to the approval",
    },
  },
  async run({ args }) {
    await doApprove(args.id, args.edit, args.comment);
  },
});

/**
 * AC-10: `pnpm cli edit <id>` is an alias for `pnpm cli approve <id> --edit`.
 * Implemented as citty alias within approve.ts, not a separate command file.
 */
export const editCommand = defineCommand({
  meta: {
    name: "edit",
    description: "Edit output before approving (alias for approve --edit)",
  },
  args: {
    id: {
      type: "positional",
      description: "Run ID to edit and approve",
      required: true,
    },
    comment: {
      type: "string",
      description: "Add a comment to the approval",
    },
  },
  async run({ args }) {
    await doApprove(args.id, true, args.comment);
  },
});

async function doApprove(
  runId: string,
  withEdit: boolean,
  comment?: string,
) {
  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, runId))
    .limit(1);

  if (!run) {
    console.error(`Run not found: ${runId}`);
    process.exit(1);
  }

  // Get the process for trust tier check
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  // Critical tier: require individual review per output
  if (proc && proc.trustTier === "critical") {
    const pendingOutputs = await db
      .select()
      .from(schema.processOutputs)
      .where(eq(schema.processOutputs.processRunId, runId));

    const reviewable = pendingOutputs.filter((o) => o.needsReview);
    if (reviewable.length > 1 && !withEdit) {
      console.error(
        `Critical tier: ${reviewable.length} outputs require individual review.`,
      );
      console.error(
        "Use --edit to review each output individually, or approve one at a time.",
      );
      process.exit(1);
    }
  }

  const outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.processRunId, runId));

  if (outputs.length === 0) {
    console.log("No outputs for this run.");
    return;
  }

  if (withEdit) {
    for (const output of outputs) {
      const originalText = contentToText(output.content);
      const editedText = openInEditor(originalText);

      if (editedText === originalText) {
        await recordApprovalFeedback({
          outputId: output.id,
          processId: run.processId,
          comment: comment ?? undefined,
        });
        console.log(
          `Output ${output.id.slice(0, 8)}: no changes, approved clean.`,
        );
      } else {
        await recordEditFeedback({
          outputId: output.id,
          processId: run.processId,
          originalText,
          editedText,
          comment: comment ?? undefined,
        });
        console.log(
          `Output ${output.id.slice(0, 8)}: edit recorded with diff.`,
        );
      }
    }
  } else {
    for (const output of outputs) {
      await recordApprovalFeedback({
        outputId: output.id,
        processId: run.processId,
        comment: comment ?? undefined,
      });
    }
  }

  // Mark all pending outputs as reviewed
  await db
    .update(schema.processOutputs)
    .set({
      needsReview: false,
      reviewedAt: new Date(),
      reviewedBy: "human",
    })
    .where(eq(schema.processOutputs.processRunId, runId));

  // Mark the waiting step as approved
  await db
    .update(schema.stepRuns)
    .set({ status: "approved", completedAt: new Date() })
    .where(eq(schema.stepRuns.processRunId, runId));

  // Resume the run
  await db
    .update(schema.processRuns)
    .set({ status: "running" })
    .where(eq(schema.processRuns.id, runId));

  // Designer spec: "Approved. [Process name] continuing."
  const processName = proc?.name || "Process";
  console.log(`\u2713 Approved. ${processName} continuing.\n`);

  const result = await fullHeartbeat(runId);
  console.log(`Status: ${result.status}`);
  console.log(`Steps: ${result.stepsExecuted}`);
  console.log(`Message: ${result.message}`);
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (
    content &&
    typeof content === "object" &&
    "text" in content &&
    typeof (content as Record<string, unknown>).text === "string"
  ) {
    return (content as Record<string, unknown>).text as string;
  }
  return JSON.stringify(content, null, 2);
}

function openInEditor(content: string): string {
  const tmpFile = path.join(tmpdir(), `agent-os-edit-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, content, "utf-8");

  const editor = process.env.EDITOR || "vi";
  try {
    execSync(`${editor} ${tmpFile}`, { stdio: "inherit" });
  } catch {
    console.error("Editor exited with error. Using original content.");
    fs.unlinkSync(tmpFile);
    return content;
  }

  const edited = fs.readFileSync(tmpFile, "utf-8");
  fs.unlinkSync(tmpFile);
  return edited;
}
