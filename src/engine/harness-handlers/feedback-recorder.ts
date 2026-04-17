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
import { eq, and, like, sql } from "drizzle-orm";
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
      memoriesDropped: context.memoriesDropped,
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
    const metadata = (existing.metadata as Record<string, unknown>) ?? {};

    // Locked memories (promoted via "Teach this") keep their confidence — only increment count
    const isLocked = metadata.locked === true;

    await db
      .update(schema.memories)
      .set({
        reinforcementCount: existing.reinforcementCount + 1,
        lastReinforcedAt: new Date(),
        // Confidence grows with reinforcement: 0.3 → 0.5 → 0.7 → 0.8 → 0.9 (capped)
        // Locked memories retain their promoted confidence (0.95)
        ...(isLocked ? {} : {
          confidence: Math.min(
            0.9,
            0.3 + (existing.reinforcementCount) * 0.15
          ),
        }),
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

/**
 * Guidance-to-memory bridge for escalation resolution (Brief 162, MP-7.2).
 *
 * Called when a user provides guidance to resolve an escalation (e.g., after
 * a step fails and the user explains how to handle it). Creates a process-scoped
 * memory tagged with the failure pattern so the same escalation can be
 * auto-resolved on future occurrences.
 *
 * @param processId - The process the escalation belongs to
 * @param guidance - The user's guidance text
 * @param failurePattern - Classified failure pattern (e.g., "external_error:api_timeout")
 * @param stepName - The step that triggered the escalation
 * @param originalError - The original error that caused the escalation
 */
export async function createGuidanceMemory(
  processId: string,
  guidance: string,
  failurePattern: string,
  stepName: string,
  originalError?: string,
): Promise<void> {
  if (!guidance || guidance.trim().length === 0) return;

  const trimmedGuidance = guidance.trim();
  const patternTag = `escalation:${failurePattern}`;

  // Check for existing guidance memory with same pattern — reinforce instead of duplicating
  // Uses json_extract for DB-level filtering (L1 review: avoids in-memory scan at scale)
  const existing = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "guidance"),
        eq(schema.memories.active, true),
        sql`json_extract(${schema.memories.metadata}, '$.failurePattern') = ${failurePattern}`,
      ),
    );

  const matchingMemory = existing[0] ?? null;

  if (matchingMemory) {
    // Reinforce existing guidance — update content if different, increment count
    const metadata = (matchingMemory.metadata as Record<string, unknown>) ?? {};
    await db
      .update(schema.memories)
      .set({
        content: trimmedGuidance, // Update to latest guidance
        reinforcementCount: matchingMemory.reinforcementCount + 1,
        lastReinforcedAt: new Date(),
        confidence: Math.min(0.95, 0.5 + matchingMemory.reinforcementCount * 0.15),
        metadata: { ...metadata, lastStepName: stepName },
        updatedAt: new Date(),
      })
      .where(eq(schema.memories.id, matchingMemory.id));

    await db.insert(schema.activities).values({
      action: "guidance.reinforced",
      actorType: "user",
      entityType: "memory",
      entityId: matchingMemory.id,
      metadata: { processId, failurePattern, stepName },
    });
  } else {
    // Create new guidance memory tagged with failure pattern
    const [memory] = await db
      .insert(schema.memories)
      .values({
        scopeType: "process",
        scopeId: processId,
        type: "guidance",
        content: trimmedGuidance,
        source: "escalation_resolution",
        confidence: 0.5, // Higher initial confidence than corrections — explicit human guidance
        metadata: {
          failurePattern,
          patternTag,
          stepName,
          originalError: originalError?.slice(0, 500),
          createdFrom: "escalation_guidance",
        },
      })
      .returning();

    await db.insert(schema.activities).values({
      action: "guidance.created",
      actorType: "user",
      entityType: "memory",
      entityId: memory.id,
      metadata: { processId, failurePattern, stepName },
    });
  }
}

/**
 * Retrieve stored guidance for a failure pattern (Brief 162, MP-7.2).
 *
 * Looks up process-scoped guidance memories tagged with the given failure pattern.
 * Returns the most confident guidance if found, null otherwise.
 */
export async function findGuidanceForFailure(
  processId: string,
  failurePattern: string,
): Promise<{ guidance: string; confidence: number } | null> {
  // DB-level json_extract filtering (L1 review: avoids in-memory scan at scale)
  const matching = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "guidance"),
        eq(schema.memories.active, true),
        sql`json_extract(${schema.memories.metadata}, '$.failurePattern') = ${failurePattern}`,
      ),
    );

  if (matching.length === 0) return null;

  // Return highest confidence
  matching.sort((a, b) => b.confidence - a.confidence);
  return {
    guidance: matching[0].content,
    confidence: matching[0].confidence,
  };
}

/**
 * Accept a correction pattern — promotes all matching process-scoped correction
 * memories to high confidence (0.95) and locks them against future reduction.
 *
 * Idempotent: calling twice for the same pattern returns success without duplicating.
 *
 * Brief 147: "Teach this?" action — learning loop closure.
 */
export async function acceptCorrectionPattern(
  processId: string,
  pattern: string,
): Promise<{ promoted: number }> {
  // Find all process-scoped correction memories whose content relates to this pattern.
  // Correction memories created by createMemoryFromFeedback use the pattern as part of content,
  // but we also match feedback records with this correctionPattern to find their linked memories.
  const feedbackRecords = await db
    .select({ id: schema.feedback.id })
    .from(schema.feedback)
    .where(
      and(
        eq(schema.feedback.processId, processId),
        eq(schema.feedback.correctionPattern, pattern),
      ),
    );

  const feedbackIds = feedbackRecords.map((f) => f.id);

  // Find memories created from these feedback records (sourceId = feedbackId)
  // plus any process-scoped correction memories that match the pattern content
  const matchingMemories = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "correction"),
        eq(schema.memories.active, true),
      ),
    );

  // Filter to memories linked to the pattern's feedback records or content-matching
  const toPromote = matchingMemories.filter(
    (m) =>
      (m.sourceId && feedbackIds.includes(m.sourceId)) ||
      (m.content && m.content.toLowerCase().includes(pattern.replace(/_/g, " "))),
  );

  let promoted = 0;
  for (const memory of toPromote) {
    const metadata = (memory.metadata as Record<string, unknown>) ?? {};
    // Skip if already locked (idempotent)
    if (metadata.locked === true && memory.confidence === 0.95) {
      continue;
    }
    await db
      .update(schema.memories)
      .set({
        confidence: 0.95,
        metadata: { ...metadata, locked: true },
        updatedAt: new Date(),
      })
      .where(eq(schema.memories.id, memory.id));
    promoted++;
  }

  return { promoted };
}

/**
 * Promote a correction pattern to a durable quality criterion on the process.
 *
 * Appends a human-readable `[learned]` string to the process's qualityCriteria array.
 * Idempotent: won't duplicate if a `[learned]` entry with the same pattern already exists.
 *
 * Brief 147: "Teach this?" action — learning loop closure.
 */
export async function promoteToQualityCriteria(
  processId: string,
  pattern: string,
): Promise<{ criterion: string; alreadyExists: boolean }> {
  // Build human-readable description from the pattern before the transaction
  // e.g. "bathroom_labour_hours" → "bathroom labour hours"
  const humanReadable = pattern.replace(/_/g, " ");
  const patternTag = `(pattern: ${pattern})`;

  // Get the most recent correction memory content for richer description
  const [recentMemory] = await db
    .select({ content: schema.memories.content })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "process"),
        eq(schema.memories.scopeId, processId),
        eq(schema.memories.type, "correction"),
        eq(schema.memories.active, true),
        like(schema.memories.content, `%${humanReadable.replace(/%/g, "\\%")}%`),
      ),
    )
    .limit(1);

  const description = recentMemory
    ? recentMemory.content
    : `Correction pattern: ${humanReadable}`;

  const criterion = `[learned] ${description} ${patternTag}`;

  // Transaction: read definition + append criterion atomically (prevents concurrent overwrites)
  return db.transaction((tx) => {
    const [proc] = tx
      .select({ definition: schema.processes.definition })
      .from(schema.processes)
      .where(eq(schema.processes.id, processId))
      .limit(1)
      .all();

    if (!proc) {
      throw new Error(`Process not found: ${processId}`);
    }

    const definition = proc.definition as Record<string, unknown>;
    const criteria: string[] = (definition.quality_criteria as string[] | undefined) ?? [];

    // Check for existing [learned] entry with same pattern (idempotency)
    const existing = criteria.find((c) => c.includes("[learned]") && c.includes(patternTag));
    if (existing) {
      return { criterion: existing, alreadyExists: true };
    }

    // Append to quality_criteria inside the definition JSON
    tx
      .update(schema.processes)
      .set({
        definition: { ...definition, quality_criteria: [...criteria, criterion] },
      })
      .where(eq(schema.processes.id, processId))
      .run();

    return { criterion, alreadyExists: false };
  });
}

/**
 * Log a "teach" action to the activities table.
 * Records who taught what pattern on which process.
 *
 * Brief 147: AC-8 — teach action logs to activities.
 */
export async function logTeachAction(
  processId: string,
  pattern: string,
  criterion: string,
): Promise<void> {
  await db.insert(schema.activities).values({
    action: "learning.teach",
    actorType: "user",
    actorId: "workspace",
    entityType: "process",
    entityId: processId,
    metadata: {
      pattern,
      criterion,
    },
  });
}

/**
 * Dismiss an insight pattern so it doesn't resurface in the feed.
 * Uses the existing suggestionDismissals table (30-day cooldown).
 *
 * Brief 147: persistent "No" dismissal.
 */
export async function dismissInsightPattern(
  processId: string,
  pattern: string,
): Promise<void> {
  const { recordDismissal } = await import("../suggestion-dismissals");
  // userId "workspace" for single-workspace architecture
  await recordDismissal("workspace", "insight_pattern", `${processId}:${pattern}`);
}

// ============================================================
// Correction Rate Tracking (Brief 159, MP-4.3)
// ============================================================

export interface PatternCorrectionRate {
  pattern: string;
  /** Total feedback records for this process (edits + approvals) */
  totalReviews: number;
  /** Feedback records with this correction pattern */
  corrections: number;
  /** corrections / totalReviews */
  rate: number;
  /** Rate before learning was applied (before "Teach this?" acceptance) */
  rateBefore: number | null;
  /** Rate after learning was applied */
  rateAfter: number | null;
  /** Whether a [learned] quality criterion exists for this pattern */
  hasLearned: boolean;
  /** When the pattern was taught (if applicable) */
  learnedAt: Date | null;
}

export interface ProcessCorrectionRates {
  processId: string;
  processName: string;
  /** Overall correction rate for the process */
  overallRate: number;
  /** Per-pattern breakdown */
  patterns: PatternCorrectionRate[];
  /** Patterns with significant improvement (rate dropped >50% after learning) */
  significantImprovements: PatternCorrectionRate[];
}

/**
 * Compute correction rates per process and per pattern.
 *
 * Queries all feedback records for the process, groups by correctionPattern,
 * and computes rates. For patterns that have been "taught" (via acceptCorrectionPattern),
 * computes before/after rates using the teach action timestamp as the dividing line.
 *
 * Brief 159, MP-4.3: Correction rate tracking.
 */
export async function computeCorrectionRates(
  processId: string,
): Promise<ProcessCorrectionRates> {
  // Get process name
  const [proc] = await db
    .select({ name: schema.processes.name, definition: schema.processes.definition })
    .from(schema.processes)
    .where(eq(schema.processes.id, processId))
    .limit(1);

  const processName = proc?.name ?? "Unknown";
  const definition = (proc?.definition as Record<string, unknown>) ?? {};
  const qualityCriteria: string[] = (definition.quality_criteria as string[] | undefined) ?? [];

  // Get all feedback for this process (both edits and approvals count toward total)
  const allFeedback = await db
    .select({
      id: schema.feedback.id,
      type: schema.feedback.type,
      correctionPattern: schema.feedback.correctionPattern,
      createdAt: schema.feedback.createdAt,
    })
    .from(schema.feedback)
    .where(eq(schema.feedback.processId, processId))
    .orderBy(schema.feedback.createdAt);

  const totalReviews = allFeedback.filter(
    (f) => f.type === "approve" || f.type === "edit" || f.type === "reject",
  ).length;
  const totalCorrections = allFeedback.filter(
    (f) => f.type === "edit" || f.type === "reject",
  ).length;
  const overallRate = totalReviews > 0 ? totalCorrections / totalReviews : 0;

  // Get teach action timestamps from activities
  const teachActions = await db
    .select({
      metadata: schema.activities.metadata,
      createdAt: schema.activities.createdAt,
    })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.action, "learning.teach"),
        eq(schema.activities.entityType, "process"),
        eq(schema.activities.entityId, processId),
      ),
    );

  // Build pattern → teach timestamp map
  const patternTeachDates = new Map<string, Date>();
  for (const ta of teachActions) {
    const meta = ta.metadata as Record<string, unknown> | null;
    const pattern = meta?.pattern as string | undefined;
    if (pattern && ta.createdAt) {
      const date = ta.createdAt instanceof Date ? ta.createdAt : new Date(Number(ta.createdAt));
      patternTeachDates.set(pattern, date);
    }
  }

  // Group feedback by correctionPattern
  const patternFeedback = new Map<string, typeof allFeedback>();
  for (const fb of allFeedback) {
    if (fb.correctionPattern) {
      const existing = patternFeedback.get(fb.correctionPattern) ?? [];
      existing.push(fb);
      patternFeedback.set(fb.correctionPattern, existing);
    }
  }

  // Compute per-pattern rates
  const patterns: PatternCorrectionRate[] = [];
  for (const [pattern, feedbackList] of patternFeedback) {
    const corrections = feedbackList.length; // All entries have this pattern = they were edits
    const rate = totalReviews > 0 ? corrections / totalReviews : 0;

    const hasLearned = qualityCriteria.some(
      (c) => c.includes("[learned]") && c.includes(`(pattern: ${pattern})`),
    );
    const learnedAt = patternTeachDates.get(pattern) ?? null;

    let rateBefore: number | null = null;
    let rateAfter: number | null = null;

    if (learnedAt) {
      // Split all feedback (not just this pattern) into before/after learning
      const feedbackBefore = allFeedback.filter((f) => {
        const date = f.createdAt instanceof Date ? f.createdAt : new Date(Number(f.createdAt));
        return date < learnedAt && (f.type === "approve" || f.type === "edit" || f.type === "reject");
      });
      const feedbackAfter = allFeedback.filter((f) => {
        const date = f.createdAt instanceof Date ? f.createdAt : new Date(Number(f.createdAt));
        return date >= learnedAt && (f.type === "approve" || f.type === "edit" || f.type === "reject");
      });

      const correctionsBefore = feedbackList.filter((f) => {
        const date = f.createdAt instanceof Date ? f.createdAt : new Date(Number(f.createdAt));
        return date < learnedAt;
      }).length;
      const correctionsAfter = feedbackList.filter((f) => {
        const date = f.createdAt instanceof Date ? f.createdAt : new Date(Number(f.createdAt));
        return date >= learnedAt;
      }).length;

      rateBefore = feedbackBefore.length > 0 ? correctionsBefore / feedbackBefore.length : null;
      rateAfter = feedbackAfter.length > 0 ? correctionsAfter / feedbackAfter.length : null;
    }

    patterns.push({
      pattern,
      totalReviews,
      corrections,
      rate,
      rateBefore,
      rateAfter,
      hasLearned,
      learnedAt,
    });
  }

  // Sort by correction count (most frequent first)
  patterns.sort((a, b) => b.corrections - a.corrections);

  // Identify significant improvements (rate dropped >50% after learning)
  const significantImprovements = patterns.filter((p) => {
    if (p.rateBefore === null || p.rateAfter === null) return false;
    if (p.rateBefore === 0) return false;
    return (p.rateBefore - p.rateAfter) / p.rateBefore > 0.5;
  });

  return {
    processId,
    processName,
    overallRate,
    patterns,
    significantImprovements,
  };
}

/**
 * Format correction rate evidence as a human-readable narrative.
 *
 * Brief 159, MP-4.4: Evidence narrative for trust upgrade suggestions and briefing.
 */
export function formatCorrectionEvidence(rates: ProcessCorrectionRates): string | null {
  if (rates.patterns.length === 0) return null;

  const parts: string[] = [];

  for (const p of rates.significantImprovements) {
    if (p.rateBefore !== null && p.rateAfter !== null) {
      const humanPattern = p.pattern.replace(/_/g, " ");
      const beforePct = Math.round(p.rateBefore * 100);
      const afterPct = Math.round(p.rateAfter * 100);
      parts.push(`${humanPattern} corrections: ${beforePct}% → ${afterPct}% after learning`);
    }
  }

  if (parts.length === 0) return null;
  return parts.join("; ");
}
