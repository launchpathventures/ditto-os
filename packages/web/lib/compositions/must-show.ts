/**
 * Ditto — Must-Show Block Extraction
 *
 * Critical alerts and trust gate reviews that MUST appear at the top
 * of any composition, regardless of intent. Composition-immune.
 *
 * ADR-024 Constraint 5: Must-show blocks cannot be suppressed by composition.
 * Provenance: original (ADR-024 Constraint 5).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";

/**
 * Extract must-show blocks from context.
 * These are prepended to ANY composition — they cannot be suppressed.
 *
 * Must-show criteria:
 * - AlertBlock with severity "error" or "critical"
 * - ReviewCardBlock at trust gate (pending review items)
 */
export function getMustShowBlocks(context: CompositionContext): ContentBlock[] {
  const mustShow: ContentBlock[] = [];

  // Critical/error alerts from feed exceptions
  const exceptions = context.feedItems.filter(
    (item) => item.itemType === "exception",
  );

  for (const exc of exceptions) {
    if (exc.itemType === "exception") {
      mustShow.push({
        type: "alert",
        severity: "error",
        title: exc.data.processName,
        content: exc.data.explanation || exc.data.errorMessage,
        actions: [
          { id: `investigate-${exc.id}`, label: "Investigate" },
          { id: `pause-${exc.id}`, label: "Pause process", style: "danger" },
        ],
      });
    }
  }

  // Trust gate reviews — items that are waiting for human judgment
  const reviews = context.pendingReviews;
  // Only surface as must-show if they have action priority (trust gate paused)
  const urgentReviews = reviews.filter(
    (r) => r.priority === "action",
  );

  for (const review of urgentReviews) {
    if (review.itemType === "review") {
      mustShow.push({
        type: "review_card",
        processRunId: review.data.processRunId,
        stepName: review.data.stepName,
        outputText: review.data.outputText,
        confidence: review.data.confidence,
        actions: [
          { id: `approve-${review.data.processRunId}`, label: "Approve", style: "primary" },
          { id: `edit-${review.data.processRunId}`, label: "Edit" },
          { id: `reject-${review.data.processRunId}`, label: "Reject", style: "danger" },
        ],
      });
    }
  }

  return mustShow;
}
