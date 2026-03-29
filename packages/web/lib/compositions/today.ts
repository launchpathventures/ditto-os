/**
 * Ditto — Today Composition
 *
 * "What needs me right now?" — Morning brief, pending reviews,
 * active work, risks, suggestions.
 *
 * Visual reference: P13 (daily workspace), P12 (morning mobile).
 * Provenance: Brief 047 AC6, ADR-024.
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";
import { formatTrustTier } from "./utils";

/**
 * Compose the Today view — the user's daily dashboard.
 * Full implementation matching P13 visual pattern.
 */
export function composeToday(context: CompositionContext): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { processes, workItems, feedItems, pendingReviews } = context;

  // 1. Brief narrative (TextBlock) — greeting + summary
  const hour = context.now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const activeWorkCount = workItems.filter(
    (w) => w.status !== "completed" && w.status !== "cancelled",
  ).length;
  const reviewCount = pendingReviews.length;

  const summaryParts: string[] = [];
  if (reviewCount > 0) {
    summaryParts.push(
      `${reviewCount} ${reviewCount === 1 ? "item needs" : "items need"} your review`,
    );
  }
  if (activeWorkCount > 0) {
    summaryParts.push(
      `${activeWorkCount} active ${activeWorkCount === 1 ? "item" : "items"} in progress`,
    );
  }
  if (processes.length > 0) {
    summaryParts.push(
      `${processes.length} ${processes.length === 1 ? "routine" : "routines"} running`,
    );
  }

  const summaryText =
    summaryParts.length > 0
      ? `${greeting}. ${summaryParts.join(", ")}.`
      : `${greeting}. Everything is quiet — nothing needs your attention right now.`;

  blocks.push({ type: "text", text: summaryText });

  // 2. Metrics row — key numbers at a glance (MetricBlock)
  if (reviewCount > 0 || activeWorkCount > 0 || processes.length > 0) {
    const metrics: Array<{ label: string; value: string; trend?: "up" | "down" | "flat" }> = [];

    if (reviewCount > 0) {
      metrics.push({ label: "To review", value: String(reviewCount) });
    }
    if (activeWorkCount > 0) {
      metrics.push({ label: "Active work", value: String(activeWorkCount) });
    }

    // Process health: count of processes with recent failures
    const failedProcesses = processes.filter(
      (p) => p.lastRunStatus === "failed" || p.lastRunStatus === "rejected",
    );
    if (failedProcesses.length > 0) {
      metrics.push({
        label: "Needs attention",
        value: String(failedProcesses.length),
        trend: "down",
      });
    } else if (processes.length > 0) {
      metrics.push({
        label: "Routines healthy",
        value: String(processes.length),
        trend: "up",
      });
    }

    if (metrics.length > 0) {
      blocks.push({ type: "metric", metrics });
    }
  }

  // 3. Pending reviews as ReviewCardBlocks
  // (Note: must-show blocks already capture urgent reviews,
  //  but Today also shows informational-priority reviews)
  const infoReviews = feedItems.filter(
    (item) => item.itemType === "review" && item.priority === "informational",
  );

  for (const review of infoReviews) {
    if (review.itemType === "review") {
      blocks.push({
        type: "review_card",
        processRunId: review.data.processRunId,
        stepName: review.data.stepName,
        outputText:
          review.data.outputText.length > 200
            ? review.data.outputText.slice(0, 200) + "..."
            : review.data.outputText,
        confidence: review.data.confidence,
        actions: [
          { id: `approve-${review.data.processRunId}`, label: "Approve", style: "primary" },
          { id: `edit-${review.data.processRunId}`, label: "Edit" },
          { id: `reject-${review.data.processRunId}`, label: "Reject", style: "danger" },
        ],
      });
    }
  }

  // 4. Active processes — StatusBlock summaries
  const runningProcesses = processes.filter(
    (p) => p.recentRunCount > 0 || p.lastRunStatus !== null,
  );

  if (runningProcesses.length > 0) {
    blocks.push({ type: "text", text: "**Your routines**" });

    for (const proc of runningProcesses.slice(0, 5)) {
      const statusText =
        proc.lastRunStatus === "failed" || proc.lastRunStatus === "rejected"
          ? "Needs attention"
          : proc.lastRunStatus === "completed"
            ? "Running well"
            : "In progress";

      blocks.push({
        type: "status_card",
        entityType: "process_run",
        entityId: proc.id,
        title: proc.name,
        status: statusText,
        details: {
          "Recent runs": String(proc.recentRunCount),
          "Review level": formatTrustTier(proc.trustTier),
        },
      });
    }
  }

  // 5. Shift report if available in feed
  const shiftReport = feedItems.find((item) => item.itemType === "shift-report");
  if (shiftReport && shiftReport.itemType === "shift-report" && shiftReport.data.details) {
    blocks.push({ type: "text", text: shiftReport.data.details });
  }

  // 6. Insights / pattern notifications
  const insights = feedItems.filter((item) => item.itemType === "insight");
  for (const insight of insights.slice(0, 2)) {
    if (insight.itemType === "insight") {
      blocks.push({
        type: "suggestion",
        content: `Pattern detected in ${insight.data.processName}: ${insight.data.pattern}`,
        reasoning: `Seen ${insight.data.count} times. ${insight.data.evidence}`,
        actions: [
          { id: `teach-${insight.data.processId}`, label: "Teach this" },
        ],
      });
    }
  }

  return blocks;
}

