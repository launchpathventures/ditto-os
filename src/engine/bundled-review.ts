/**
 * Bundled Review — Checkpoint-Based Review Collection
 *
 * Accumulates review-pending outputs across sub-goals and presents
 * them as a single review checkpoint at natural phase boundaries.
 * Individual feedback (approve/edit/reject) is recorded per sub-goal
 * output within the bundle, not per bundle.
 *
 * Provenance: Sprint review (Agile) — review at iteration boundaries,
 * not per-task. Brief 103.
 */

import { db, schema } from "../db";
import { eq, inArray } from "drizzle-orm";

// ============================================================
// Types
// ============================================================

export interface SubGoalOutput {
  /** Sub-goal work item ID */
  subGoalId: string;
  /** Sub-goal title */
  title: string;
  /** Sub-goal routing (find/build) */
  routing: "find" | "build";
  /** The output from the sub-goal's process run */
  outputs: Record<string, unknown>;
  /** Process run ID */
  processRunId?: string;
  /** Status of this sub-goal */
  status: "completed" | "waiting_review";
}

export interface BundledReview {
  /** Unique review bundle ID */
  bundleId: string;
  /** Parent goal work item ID */
  goalId: string;
  /** Phase boundary description */
  phaseBoundary: string;
  /** Sub-goal outputs included in this review */
  items: SubGoalOutput[];
  /** When this bundle was created */
  createdAt: Date;
}

export interface BundledReviewFeedback {
  /** Sub-goal ID this feedback applies to */
  subGoalId: string;
  /** Feedback action */
  action: "approve" | "edit" | "reject";
  /** Optional comment */
  comment?: string;
  /** Optional diff for edits */
  diff?: string;
}

// ============================================================
// Collection
// ============================================================

/** In-memory collection of pending review items per goal */
const pendingReviews = new Map<string, SubGoalOutput[]>();

/**
 * Add a sub-goal output to the pending review collection for a goal.
 */
export function collectForBundledReview(
  goalId: string,
  output: SubGoalOutput,
): void {
  const existing = pendingReviews.get(goalId) || [];
  // Avoid duplicates
  const alreadyCollected = existing.some((o) => o.subGoalId === output.subGoalId);
  if (!alreadyCollected) {
    existing.push(output);
    pendingReviews.set(goalId, existing);
  }
}

/**
 * Check if a phase boundary has been reached for a goal.
 *
 * Phase boundaries (AC13):
 * - All "find" sub-goals in a dependency tier complete
 * - All "build" sub-goals complete
 * - Mixed: all sub-goals at the current dependency level complete
 */
export function isReviewBoundary(
  goalId: string,
  completedSubGoalIds: Set<string>,
  allSubGoals: Array<{
    id: string;
    routing: "find" | "build";
    dependsOn: string[];
  }>,
): { ready: boolean; phaseBoundary: string } {
  const pending = pendingReviews.get(goalId) || [];
  if (pending.length === 0) {
    return { ready: false, phaseBoundary: "" };
  }

  // Group sub-goals by dependency tier
  const tiers = groupByDependencyTier(allSubGoals);

  for (const tier of tiers) {
    // Check if all find sub-goals in this tier are complete
    const findGoals = tier.filter((sg) => sg.routing === "find");
    const allFindComplete = findGoals.length > 0 &&
      findGoals.every((sg) => completedSubGoalIds.has(sg.id));

    if (allFindComplete && findGoals.length > 0) {
      const hasPendingFinds = pending.some(
        (p) => findGoals.some((fg) => fg.id === p.subGoalId),
      );
      if (hasPendingFinds) {
        return {
          ready: true,
          phaseBoundary: `Research phase complete — ${findGoals.length} find sub-goals ready for review`,
        };
      }
    }

    // Check if all build sub-goals in this tier are complete
    const buildGoals = tier.filter((sg) => sg.routing === "build");
    const allBuildComplete = buildGoals.length > 0 &&
      buildGoals.every((sg) => completedSubGoalIds.has(sg.id));

    if (allBuildComplete && buildGoals.length > 0) {
      const hasPendingBuilds = pending.some(
        (p) => buildGoals.some((bg) => bg.id === p.subGoalId),
      );
      if (hasPendingBuilds) {
        return {
          ready: true,
          phaseBoundary: `Build phase complete — ${buildGoals.length} build sub-goals ready for review`,
        };
      }
    }

    // Check if ALL sub-goals in this tier are complete
    const allTierComplete = tier.every((sg) => completedSubGoalIds.has(sg.id));
    if (allTierComplete && tier.length > 0) {
      const hasPendingInTier = pending.some(
        (p) => tier.some((sg) => sg.id === p.subGoalId),
      );
      if (hasPendingInTier) {
        return {
          ready: true,
          phaseBoundary: `Tier complete — ${tier.length} sub-goals ready for review`,
        };
      }
    }
  }

  return { ready: false, phaseBoundary: "" };
}

/**
 * Present all pending review items as a bundled review checkpoint.
 * Clears the pending collection for this goal.
 */
export function presentBundledReview(
  goalId: string,
  phaseBoundary: string,
): BundledReview | null {
  const pending = pendingReviews.get(goalId);
  if (!pending || pending.length === 0) return null;

  const bundle: BundledReview = {
    bundleId: `review-${goalId}-${Date.now()}`,
    goalId,
    phaseBoundary,
    items: [...pending],
    createdAt: new Date(),
  };

  // Clear the pending collection
  pendingReviews.delete(goalId);

  return bundle;
}

/**
 * Record feedback for individual sub-goal outputs within a bundled review.
 * Each sub-goal gets individual feedback (approve/edit/reject) — not per-bundle.
 * (AC12)
 */
export async function recordBundledFeedback(
  bundleId: string,
  goalId: string,
  feedbackItems: BundledReviewFeedback[],
): Promise<void> {
  for (const item of feedbackItems) {
    // Find the process output for this sub-goal
    const [workItem] = await db
      .select()
      .from(schema.workItems)
      .where(eq(schema.workItems.id, item.subGoalId))
      .limit(1);

    if (!workItem) continue;

    const executionIds = (workItem.executionIds as string[]) || [];
    if (executionIds.length === 0) continue;

    // Find the process output from the most recent execution
    const processRunId = executionIds[executionIds.length - 1];
    const outputs = await db
      .select()
      .from(schema.processOutputs)
      .where(eq(schema.processOutputs.processRunId, processRunId));

    for (const output of outputs) {
      await db.insert(schema.feedback).values({
        outputId: output.id,
        processId: workItem.assignedProcess || "",
        type: item.action,
        comment: item.comment || null,
        diff: item.diff ? { raw: item.diff } : null,
      });
    }

    // Update work item status based on feedback
    if (item.action === "approve") {
      await db
        .update(schema.workItems)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.workItems.id, item.subGoalId));
    } else if (item.action === "reject") {
      await db
        .update(schema.workItems)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(schema.workItems.id, item.subGoalId));
    }
    // "edit" keeps the work item in current status for re-execution
  }

  // Log the bundled feedback
  await db.insert(schema.activities).values({
    action: "bundled_review.feedback",
    actorType: "human",
    entityType: "work_item",
    entityId: goalId,
    metadata: {
      bundleId,
      feedbackCount: feedbackItems.length,
      actions: feedbackItems.map((f) => ({ subGoalId: f.subGoalId, action: f.action })),
    },
  });
}

/**
 * Get pending review count for a goal (for UI status).
 */
export function getPendingReviewCount(goalId: string): number {
  return (pendingReviews.get(goalId) || []).length;
}

/**
 * Clear pending reviews for a goal (e.g., on cancellation).
 */
export function clearPendingReviews(goalId: string): void {
  pendingReviews.delete(goalId);
}

// ============================================================
// Dependency tier grouping
// ============================================================

/**
 * Group sub-goals into dependency tiers.
 * Tier 0: no dependencies. Tier 1: depends on tier 0. Etc.
 */
function groupByDependencyTier<T extends { id: string; dependsOn: string[] }>(
  subGoals: T[],
): T[][] {
  const tiers: T[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < subGoals.length) {
    const tier = subGoals.filter(
      (sg) =>
        !assigned.has(sg.id) &&
        sg.dependsOn.every((dep) => assigned.has(dep)),
    );

    if (tier.length === 0) {
      // Circular deps — dump remaining into last tier
      const remaining = subGoals.filter((sg) => !assigned.has(sg.id));
      tiers.push(remaining);
      break;
    }

    tiers.push(tier);
    tier.forEach((sg) => assigned.add(sg.id));
  }

  return tiers;
}
