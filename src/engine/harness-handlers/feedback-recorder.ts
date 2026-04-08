/**
 * Feedback Recorder Handler
 *
 * Records every harness decision to the harnessDecisions table and activities table.
 * Always runs — even when short-circuited (failed steps need recording too).
 *
 * Also provides the feedback-to-memory bridge: when human feedback (edit/reject)
 * is recorded, creates a correction memory for future agent invocations.
 *
 * Provenance: Activity logging from Paperclip server/src/services/activity-log.ts
 * Harness decision recording is Original — no source captures harness-level decisions.
 * Feedback-to-memory bridge is Original — no source extracts corrections from feedback.
 */

import { db, schema } from "../../db";
import { eq, and } from "drizzle-orm";
import type { HarnessHandler, HarnessContext } from "../harness";
import { classifyEdit } from "../trust-diff";
import { evaluateTrust } from "../trust-evaluator";
import { startSystemAgentRun } from "../heartbeat";
import { checkSignificanceThreshold } from "../system-agents/knowledge-extractor";

export const feedbackRecorderHandler: HarnessHandler = {
  name: "feedback-recorder",
  alwaysRun: true,

  canHandle(_context: HarnessContext): boolean {
    // Always runs — records decisions for all steps, including failures
    return true;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    // Record harness decision (including routing decision if present)
    const reviewDetails = { ...context.reviewDetails };
    if (context.routingDecision) {
      reviewDetails.routing = context.routingDecision;
    }

    await db.insert(schema.harnessDecisions).values({
      processRunId: context.processRun.id,
      stepRunId: context.stepRunId,
      trustTier: context.trustTier,
      trustAction: context.stepError ? "pause" : context.trustAction,
      reviewPattern: context.reviewPattern,
      reviewResult: context.stepError ? "skip" : context.reviewResult,
      reviewDetails,
      reviewCostCents: context.reviewCostCents,
      memoriesInjected: context.memoriesInjected,
      samplingHash: context.samplingHash,
    });

    // Record activity with harness metadata
    await db.insert(schema.activities).values({
      action: "harness.decision",
      actorType: "system",
      entityType: "step_run",
      entityId: context.stepRunId,
      metadata: {
        processRunId: context.processRun.id,
        stepId: context.stepDefinition.id,
        stepName: context.stepDefinition.name,
        trustTier: context.trustTier,
        trustAction: context.stepError ? "pause" : context.trustAction,
        reviewResult: context.stepError ? "skip" : context.reviewResult,
        memoriesInjected: context.memoriesInjected,
        hadError: context.stepError !== null,
        errorMessage: context.stepError?.message,
      },
    });

    // AC-8: Log integration calls with service, protocol, success/failure
    if (context.stepDefinition.executor === "integration") {
      const service = context.stepDefinition.config?.service as string | undefined;
      const protocol = context.stepResult?.outputs?.protocol as string | undefined;
      const hasError = context.stepError !== null || context.stepResult?.outputs?.error !== undefined;

      await db.insert(schema.activities).values({
        action: "integration.call",
        actorType: "system",
        entityType: "step_run",
        entityId: context.stepRunId,
        metadata: {
          processRunId: context.processRun.id,
          service: service || "unknown",
          protocol: protocol || "unknown",
          success: !hasError,
          stepId: context.stepDefinition.id,
        },
      });
    }

    return context;
  },
};

/**
 * Trigger trust evaluation via the system agent process.
 * Falls back to direct evaluateTrust() if the system agent process doesn't exist
 * (before first sync) or if the process being evaluated IS the trust-evaluation
 * process itself (infinite loop guard).
 */
async function triggerTrustEvaluation(processId: string): Promise<void> {
  // Infinite loop guard: don't trigger system agent for the trust-evaluation process itself
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.id, processId))
    .limit(1);

  const isSystemProcess = proc && (proc.definition as Record<string, unknown>)?.system === true;
  if (isSystemProcess) {
    // Direct evaluation for system processes — avoids recursive loop
    await evaluateTrust(processId);
    return;
  }

  // Try system agent; fall back to direct call if process doesn't exist yet
  const result = await startSystemAgentRun(
    "trust-evaluation",
    { processId },
    "system:feedback-recorder",
  );

  if (!result) {
    // Graceful degradation: system agent process not synced yet
    await evaluateTrust(processId);
  }
}

/**
 * Feedback-to-memory bridge.
 *
 * Called when human feedback of type 'edit' or 'reject' is recorded.
 * Creates a correction memory (or increments reinforcementCount if duplicate).
 * No LLM extraction — direct insert. Phase 3 adds Mem0-style reconciliation.
 *
 * @param processId - The process this feedback belongs to
 * @param feedbackId - The feedback record ID (sourceId for provenance)
 * @param content - The memory content (human comment or diff summary)
 */
export async function createMemoryFromFeedback(
  processId: string,
  feedbackId: string,
  content: string
): Promise<void> {
  if (!content || content.trim().length === 0) {
    return; // No content to create memory from
  }

  const trimmedContent = content.trim();

  // Check for exact duplicate — increment reinforcement instead of creating new
  const [existing] = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.content, trimmedContent),
        eq(schema.memories.active, true)
      )
    )
    .limit(1);

  if (existing) {
    // Reinforce existing memory
    await db
      .update(schema.memories)
      .set({
        reinforcementCount: existing.reinforcementCount + 1,
        lastReinforcedAt: new Date(),
        // Confidence grows with reinforcement: 0.3 → 0.5 → 0.7 → 0.8 → 0.9 (capped)
        confidence: Math.min(
          0.9,
          0.3 + (existing.reinforcementCount) * 0.15
        ),
        updatedAt: new Date(),
      })
      .where(eq(schema.memories.id, existing.id));

    await db.insert(schema.activities).values({
      action: "memory.reinforced",
      actorType: "system",
      entityType: "memory",
      entityId: existing.id,
      metadata: {
        processId,
        feedbackId,
        reinforcementCount: existing.reinforcementCount + 1,
      },
    });
  } else {
    // Create new memory
    const [memory] = await db
      .insert(schema.memories)
      .values({
        scopeType: "process",
        scopeId: processId,
        type: "correction",
        content: trimmedContent,
        source: "feedback",
        sourceId: feedbackId,
        confidence: 0.3, // Single observation
      })
      .returning();

    await db.insert(schema.activities).values({
      action: "memory.created",
      actorType: "system",
      entityType: "memory",
      entityId: memory.id,
      metadata: {
        processId,
        feedbackId,
        source: "feedback",
      },
    });
  }
}

/**
 * Record edit feedback with structured diff computation.
 *
 * AC-5: Computes structured diff, stores in feedback.diff with jsdiff format,
 *       computes and stores editSeverity + editRatio.
 * AC-13: Recomputes and caches trust state after recording.
 */
/**
 * Extract a correction pattern from a structured diff.
 * Identifies the first significant changed segment as the pattern name.
 * This is a simple heuristic — not ML pattern recognition.
 */
export function extractCorrectionPattern(
  diff: { changes: Array<{ added?: boolean; removed?: boolean; value: string }> },
): string | null {
  // Find the first removed segment (the thing being corrected)
  for (const change of diff.changes) {
    if (change.removed) {
      // Use the first few words as the pattern identifier
      const words = change.value.trim().split(/\s+/).slice(0, 5);
      if (words.length > 0 && words[0].length > 0) {
        return words.join("_").toLowerCase().replace(/[^a-z0-9_]/g, "");
      }
    }
  }
  return null;
}

export async function recordEditFeedback(params: {
  outputId: string;
  processId: string;
  originalText: string;
  editedText: string;
  comment?: string;
}): Promise<void> {
  const { diff, editRatio, editSeverity } = classifyEdit(
    params.originalText,
    params.editedText,
  );

  // AC-11: Extract correction pattern from the diff
  const correctionPattern = extractCorrectionPattern(diff);

  const [fb] = await db
    .insert(schema.feedback)
    .values({
      outputId: params.outputId,
      processId: params.processId,
      type: "edit",
      diff: {
        changes: diff.changes,
        stats: diff.stats,
      } as unknown as Record<string, unknown>,
      editSeverity,
      editRatio,
      correctionPattern,
      comment: params.comment ?? null,
    })
    .returning();

  // Create correction memory from the edit
  const diffSummary = `Edit (${editSeverity}): ${diff.stats.wordsRemoved} words removed, ${diff.stats.wordsAdded} words added`;
  await createMemoryFromFeedback(params.processId, fb.id, diffSummary);

  // AC-15: Evaluate trust after feedback via system agent (014a)
  await triggerTrustEvaluation(params.processId);

  // Brief 060: Trigger knowledge extraction if significance threshold met
  await triggerKnowledgeExtraction({
    processId: params.processId,
    feedbackId: fb.id,
    feedbackType: "edit",
    editSeverity,
    originalOutput: params.originalText,
    editedOutput: params.editedText,
    diff: JSON.stringify({ changes: diff.changes, stats: diff.stats }),
    comment: params.comment,
  });
}

/**
 * Check if a correction pattern has been seen 3+ times for a process.
 * Returns the pattern string and count if threshold is met, null otherwise.
 *
 * AC-11: Pattern notification fires after 3+ identical correctionPattern values.
 */
export async function checkCorrectionPattern(
  processId: string,
): Promise<{ pattern: string; count: number } | null> {
  // Get all feedback with correction patterns for this process
  const feedbackRecords = await db
    .select()
    .from(schema.feedback)
    .where(
      and(
        eq(schema.feedback.processId, processId),
        eq(schema.feedback.type, "edit"),
      ),
    );

  // Count patterns
  const patternCounts = new Map<string, number>();
  for (const fb of feedbackRecords) {
    if (fb.correctionPattern) {
      const count = (patternCounts.get(fb.correctionPattern) || 0) + 1;
      patternCounts.set(fb.correctionPattern, count);
    }
  }

  // Find the most recent pattern that meets the threshold
  for (const fb of feedbackRecords) {
    if (fb.correctionPattern) {
      const count = patternCounts.get(fb.correctionPattern) || 0;
      if (count >= 3) {
        return { pattern: fb.correctionPattern, count };
      }
    }
  }

  return null;
}

/**
 * Record rejection feedback.
 *
 * AC-6: Records rejection in feedback table with optional comment.
 * AC-13: Recomputes and caches trust state after recording.
 */
export async function recordRejectionFeedback(params: {
  outputId: string;
  processId: string;
  comment?: string;
}): Promise<void> {
  const [fb] = await db
    .insert(schema.feedback)
    .values({
      outputId: params.outputId,
      processId: params.processId,
      type: "reject",
      comment: params.comment ?? null,
    })
    .returning();

  // Create correction memory from rejection comment
  if (params.comment) {
    await createMemoryFromFeedback(
      params.processId,
      fb.id,
      `Rejection: ${params.comment}`,
    );
  }

  // AC-15: Evaluate trust after feedback via system agent (014a)
  await triggerTrustEvaluation(params.processId);

  // Brief 060: Trigger knowledge extraction if significance threshold met
  // For rejections, we get the original output from the step run output
  const originalOutput = await getOutputText(params.outputId);
  await triggerKnowledgeExtraction({
    processId: params.processId,
    feedbackId: fb.id,
    feedbackType: "reject",
    originalOutput,
    diff: JSON.stringify({ type: "rejection", comment: params.comment }),
    comment: params.comment,
  });
}

/**
 * Record clean approval feedback.
 *
 * AC-14: Same as current behavior — clean approval recorded in feedback table.
 * AC-13: Recomputes and caches trust state after recording.
 */
export async function recordApprovalFeedback(params: {
  outputId: string;
  processId: string;
  comment?: string;
}): Promise<void> {
  await db.insert(schema.feedback).values({
    outputId: params.outputId,
    processId: params.processId,
    type: "approve",
    comment: params.comment ?? null,
  });

  // AC-15: Evaluate trust after feedback via system agent (014a)
  await triggerTrustEvaluation(params.processId);
}

/**
 * Get the text content of a process output for knowledge extraction.
 */
async function getOutputText(outputId: string): Promise<string> {
  const [output] = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.id, outputId))
    .limit(1);

  if (!output) return "";

  const content = output.content as Record<string, unknown>;
  // Extract text from content — handles both string and object content
  if (typeof content === "string") return content;
  if (content.text) return String(content.text);
  if (content.response) return String(content.response);
  return JSON.stringify(content).slice(0, 5000);
}

/**
 * Brief 060: Trigger knowledge extraction via system agent process.
 * Checks significance threshold before triggering. Non-blocking — errors
 * are logged but don't fail the feedback recording.
 */
async function triggerKnowledgeExtraction(params: {
  processId: string;
  feedbackId: string;
  feedbackType: "edit" | "reject";
  editSeverity?: string;
  originalOutput?: string;
  editedOutput?: string;
  diff: string;
  comment?: string;
}): Promise<void> {
  try {
    // Get the process trust tier for scaling
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.id, params.processId))
      .limit(1);

    if (!proc) return;

    // Don't trigger extraction for system processes (avoid recursive loops)
    const definition = proc.definition as Record<string, unknown>;
    if (definition?.system === true) return;

    // Find the process run ID from the feedback's associated output
    const [fbRecord] = await db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.id, params.feedbackId))
      .limit(1);

    let processRunId: string | undefined;
    if (fbRecord?.outputId) {
      const [output] = await db
        .select()
        .from(schema.processOutputs)
        .where(eq(schema.processOutputs.id, fbRecord.outputId))
        .limit(1);
      processRunId = output?.processRunId;
    }
    if (!processRunId) {
      const [recentRun] = await db
        .select()
        .from(schema.processRuns)
        .where(eq(schema.processRuns.processId, params.processId))
        .limit(1);
      processRunId = recentRun?.id ?? "unknown";
    }

    // AC5: Detect retries — check if any step in the run had a retry decision
    let retryTriggered = false;
    if (processRunId && processRunId !== "unknown") {
      const retryDecisions = await db
        .select()
        .from(schema.harnessDecisions)
        .where(
          and(
            eq(schema.harnessDecisions.processRunId, processRunId),
            eq(schema.harnessDecisions.reviewResult, "retry"),
          ),
        )
        .limit(1);
      retryTriggered = retryDecisions.length > 0;
    }

    const shouldExtract = await checkSignificanceThreshold({
      processId: params.processId,
      feedbackType: params.feedbackType,
      editSeverity: params.editSeverity,
      trustTier: proc.trustTier,
      retryTriggered,
    });

    if (!shouldExtract) return;

    await startSystemAgentRun(
      "knowledge-extraction",
      {
        processRunId,
        processId: params.processId,
        feedbackId: params.feedbackId,
        originalOutput: params.originalOutput ?? "",
        editedOutput: params.editedOutput ?? "",
        diff: params.diff,
        comment: params.comment ?? "",
        feedbackType: params.feedbackType,
      },
      "system:feedback-recorder",
    );
  } catch (error) {
    // Non-blocking — log but don't fail feedback recording
    console.error(
      "Knowledge extraction trigger failed (non-blocking):",
      error instanceof Error ? error.message : String(error),
    );
  }
}
