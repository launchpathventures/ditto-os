/**
 * Ditto — Review Actions
 *
 * Shared approve/edit/reject logic extracted from CLI commands.
 * Pure engine functions: perform DB operations + feedback recording,
 * return typed results, never call process.exit() or interact with TTY.
 *
 * Used by both CLI commands (approve.ts, reject.ts) and the Telegram bot (dev-bot.ts).
 *
 * Provenance: Extracted from src/cli/commands/approve.ts and reject.ts (Brief 027).
 * Step-level granularity: updates only the specific step_run that is waiting_review,
 * not all step runs for the process run (review flag from Brief 027).
 */

import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { fullHeartbeat, type HeartbeatResult } from "./heartbeat";
import {
  recordEditFeedback,
  recordApprovalFeedback,
  recordRejectionFeedback,
  checkCorrectionPattern,
} from "./harness-handlers/feedback-recorder";

// ============================================================
// Types
// ============================================================

export interface ReviewActionResult {
  success: boolean;
  message: string;
  processName: string;
  /** Pattern notification after edits — null if no repeating pattern */
  correctionPattern: { pattern: string; count: number } | null;
}

export interface ApproveRunOptions {
  /** Comment to attach to the approval */
  comment?: string;
}

export interface EditRunOptions {
  /** Comment to attach to the edit */
  comment?: string;
}

// ============================================================
// Helpers
// ============================================================

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

/**
 * Find the specific step run that is waiting_review for this process run.
 * Returns null if no step is waiting.
 * Exported for use by CLI edit path which needs step-level granularity.
 */
export async function findWaitingStepRun(runId: string) {
  const [stepRun] = await db
    .select()
    .from(schema.stepRuns)
    .where(
      and(
        eq(schema.stepRuns.processRunId, runId),
        eq(schema.stepRuns.status, "waiting_review"),
      ),
    )
    .limit(1);
  return stepRun ?? null;
}

// ============================================================
// Actions
// ============================================================

/**
 * Approve a process run's waiting outputs and continue execution.
 * Records approval feedback for all outputs, marks the specific waiting step
 * as approved, resumes the run, and continues the heartbeat.
 *
 * Returns the result including heartbeat status after continuing.
 */
export async function approveRun(
  runId: string,
  options: ApproveRunOptions = {},
): Promise<{ action: ReviewActionResult; heartbeat: HeartbeatResult }> {
  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, runId))
    .limit(1);

  if (!run) {
    return {
      action: { success: false, message: "Run not found", processName: "", correctionPattern: null },
      heartbeat: { processRunId: runId, stepsExecuted: 0, status: "failed", message: "Run not found" },
    };
  }

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  const processName = proc?.name || "Process";

  const outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.processRunId, runId));

  // Record approval feedback for all outputs
  for (const output of outputs) {
    if (output.needsReview) {
      await recordApprovalFeedback({
        outputId: output.id,
        processId: run.processId,
        comment: options.comment,
      });
    }
  }

  // Mark outputs as reviewed
  await db
    .update(schema.processOutputs)
    .set({
      needsReview: false,
      reviewedAt: new Date(),
      reviewedBy: "human",
    })
    .where(eq(schema.processOutputs.processRunId, runId));

  // Mark only the specific waiting step as approved (not all step runs)
  const waitingStep = await findWaitingStepRun(runId);
  if (waitingStep) {
    await db
      .update(schema.stepRuns)
      .set({ status: "approved", completedAt: new Date() })
      .where(eq(schema.stepRuns.id, waitingStep.id));
  }

  // Resume the run
  await db
    .update(schema.processRuns)
    .set({ status: "running" })
    .where(eq(schema.processRuns.id, runId));

  // Continue heartbeat
  const heartbeat = await fullHeartbeat(runId);

  return {
    action: {
      success: true,
      message: `Approved. ${processName} continuing.`,
      processName,
      correctionPattern: null,
    },
    heartbeat,
  };
}

/**
 * Edit a process run's outputs with feedback text and continue execution.
 * Records edit feedback (the feedback text is treated as the "edited" version),
 * marks the step approved, and continues the heartbeat.
 */
export async function editRun(
  runId: string,
  feedback: string,
  options: EditRunOptions = {},
): Promise<{ action: ReviewActionResult; heartbeat: HeartbeatResult }> {
  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, runId))
    .limit(1);

  if (!run) {
    return {
      action: { success: false, message: "Run not found", processName: "", correctionPattern: null },
      heartbeat: { processRunId: runId, stepsExecuted: 0, status: "failed", message: "Run not found" },
    };
  }

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  const processName = proc?.name || "Process";

  const outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.processRunId, runId));

  // Record edit feedback — use original output text + feedback as edit
  for (const output of outputs) {
    if (output.needsReview) {
      const originalText = contentToText(output.content);
      await recordEditFeedback({
        outputId: output.id,
        processId: run.processId,
        originalText,
        editedText: `${originalText}\n\n[Human feedback]: ${feedback}`,
        comment: options.comment ?? feedback,
      });
    }
  }

  // Mark outputs as reviewed
  await db
    .update(schema.processOutputs)
    .set({
      needsReview: false,
      reviewedAt: new Date(),
      reviewedBy: "human",
    })
    .where(eq(schema.processOutputs.processRunId, runId));

  // Mark only the specific waiting step as approved (not all step runs)
  const waitingStep = await findWaitingStepRun(runId);
  if (waitingStep) {
    await db
      .update(schema.stepRuns)
      .set({ status: "approved", completedAt: new Date() })
      .where(eq(schema.stepRuns.id, waitingStep.id));
  }

  // Resume the run
  await db
    .update(schema.processRuns)
    .set({ status: "running" })
    .where(eq(schema.processRuns.id, runId));

  // Check for correction pattern
  let correctionPattern: { pattern: string; count: number } | null = null;
  if (proc) {
    correctionPattern = await checkCorrectionPattern(proc.id);
  }

  // Continue heartbeat
  const heartbeat = await fullHeartbeat(runId);

  return {
    action: {
      success: true,
      message: `Edited. Feedback recorded. ${processName} continuing.`,
      processName,
      correctionPattern,
    },
    heartbeat,
  };
}

/**
 * Reject a process run's outputs with a reason.
 * Records rejection feedback, marks step as rejected, pauses the run.
 * Does NOT continue heartbeat — the run is paused.
 */
export async function rejectRun(
  runId: string,
  reason: string,
): Promise<ReviewActionResult> {
  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.id, runId))
    .limit(1);

  if (!run) {
    return { success: false, message: "Run not found", processName: "", correctionPattern: null };
  }

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, run.processId))
    .limit(1);

  const processName = proc?.name || "Process";

  const outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.processRunId, runId));

  // Record rejection feedback for all outputs
  for (const output of outputs) {
    await recordRejectionFeedback({
      outputId: output.id,
      processId: run.processId,
      comment: reason,
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
    .where(eq(schema.processOutputs.processRunId, runId));

  // Mark only the specific waiting step as rejected (not all step runs)
  const waitingStep = await findWaitingStepRun(runId);
  if (waitingStep) {
    await db
      .update(schema.stepRuns)
      .set({ status: "rejected", completedAt: new Date() })
      .where(eq(schema.stepRuns.id, waitingStep.id));
  }

  // Mark run as rejected
  await db
    .update(schema.processRuns)
    .set({ status: "rejected" })
    .where(eq(schema.processRuns.id, runId));

  return {
    success: true,
    message: `Rejected. Reason recorded. ${processName} will retry with feedback.`,
    processName,
    correctionPattern: null,
  };
}

/**
 * Get the output text for the current waiting step of a process run.
 * Returns null if no step is waiting for review.
 */
export async function getWaitingStepOutput(runId: string): Promise<{
  stepId: string;
  stepName: string;
  outputText: string;
  confidence: string | null;
} | null> {
  const waitingStep = await findWaitingStepRun(runId);
  if (!waitingStep) return null;

  const outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(
      and(
        eq(schema.processOutputs.processRunId, runId),
        eq(schema.processOutputs.needsReview, true),
      ),
    );

  const outputText = outputs
    .map((o) => contentToText(o.content))
    .join("\n\n---\n\n");

  return {
    stepId: waitingStep.stepId,
    stepName: waitingStep.stepId, // stepId is the YAML step id (e.g., "pm-triage")
    outputText,
    confidence: waitingStep.confidenceLevel,
  };
}
