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

export const feedbackRecorderHandler: HarnessHandler = {
  name: "feedback-recorder",

  canHandle(_context: HarnessContext): boolean {
    // Always runs — records decisions for all steps, including failures
    return true;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    // Record harness decision
    await db.insert(schema.harnessDecisions).values({
      processRunId: context.processRun.id,
      stepRunId: context.stepRunId,
      trustTier: context.trustTier,
      trustAction: context.stepError ? "pause" : context.trustAction,
      reviewPattern: context.reviewPattern,
      reviewResult: context.stepError ? "skip" : context.reviewResult,
      reviewDetails: context.reviewDetails,
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

    return context;
  },
};

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
      comment: params.comment ?? null,
    })
    .returning();

  // Create correction memory from the edit
  const diffSummary = `Edit (${editSeverity}): ${diff.stats.wordsRemoved} words removed, ${diff.stats.wordsAdded} words added`;
  await createMemoryFromFeedback(params.processId, fb.id, diffSummary);

  // AC-15: Evaluate trust after feedback (recomputes state + checks triggers/eligibility)
  await evaluateTrust(params.processId);
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

  // AC-15: Evaluate trust after feedback
  await evaluateTrust(params.processId);
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

  // AC-15: Evaluate trust after feedback
  await evaluateTrust(params.processId);
}
