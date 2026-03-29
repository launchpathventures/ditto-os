/**
 * Ditto — Inbox Composition
 *
 * "What's arrived that I haven't triaged?" — Incoming items grouped by urgency.
 *
 * Visual reference: P24 (inbox — Lisa, urgency grouping, triage donuts).
 * Provenance: original (ADR-024, P24 prototype reference).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";
import { formatRelativeTime } from "./utils";

/**
 * Compose the Inbox view — items needing triage, grouped by urgency.
 */
export function composeInbox(context: CompositionContext): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { feedItems, pendingReviews, workItems } = context;

  // Triage stats at a glance
  const actionItems = feedItems.filter((f) => f.priority === "action");
  const infoItems = feedItems.filter((f) => f.priority === "informational");

  if (actionItems.length === 0 && infoItems.length === 0 && pendingReviews.length === 0) {
    blocks.push({
      type: "text",
      text: "Nothing needs your attention. Your inbox is clear.",
    });
    return blocks;
  }

  // Triage metrics
  blocks.push({
    type: "metric",
    metrics: [
      { label: "Needs action", value: String(actionItems.length) },
      { label: "For your info", value: String(infoItems.length) },
      { label: "Reviews pending", value: String(pendingReviews.length) },
    ],
  });

  // Urgent items first — as RecordBlocks
  if (actionItems.length > 0) {
    blocks.push({ type: "text", text: "**Needs your action**" });

    for (const item of actionItems) {
      blocks.push(feedItemToRecord(item, "error"));
    }
  }

  // Informational items
  if (infoItems.length > 0) {
    blocks.push({ type: "text", text: "**Updates**" });

    for (const item of infoItems.slice(0, 10)) {
      blocks.push(feedItemToRecord(item));
    }
  }

  // Unclaimed work items (no process assigned)
  const unrouted = workItems.filter(
    (w) =>
      !w.assignedProcess &&
      w.status !== "completed" &&
      w.status !== "cancelled",
  );

  if (unrouted.length > 0) {
    blocks.push({ type: "text", text: "**Unrouted captures**" });

    for (const item of unrouted) {
      blocks.push({
        type: "record",
        title: item.content.length > 60 ? item.content.slice(0, 60) + "..." : item.content,
        status: { label: item.type, variant: "neutral" },
        fields: [
          { label: "Captured", value: formatRelativeTime(item.createdAt) },
        ],
        actions: [
          { id: `route-${item.id}`, label: "Route" },
        ],
      });
    }
  }

  return blocks;
}

/** Convert a feed item to a RecordBlock */
function feedItemToRecord(
  item: import("@/lib/feed-types").FeedItem,
  accent?: "error" | "warning",
): ContentBlock {
  switch (item.itemType) {
    case "review":
      return {
        type: "record",
        title: `${item.data.processName} — ${item.data.stepName}`,
        subtitle: item.data.outputText.length > 100
          ? item.data.outputText.slice(0, 100) + "..."
          : item.data.outputText,
        status: {
          label: item.data.confidence ?? "pending",
          variant: item.data.confidence === "high" ? "positive" : item.data.confidence === "medium" ? "caution" : "negative",
        },
        accent: accent,
        actions: [
          { id: `approve-${item.data.processRunId}`, label: "Approve", style: "primary" },
          { id: `edit-${item.data.processRunId}`, label: "Edit" },
          { id: `reject-${item.data.processRunId}`, label: "Reject", style: "danger" },
        ],
      };

    case "exception":
      return {
        type: "record",
        title: item.data.processName,
        subtitle: item.data.explanation || item.data.errorMessage,
        status: { label: "Error", variant: "negative" },
        accent: "error",
        actions: [
          { id: `investigate-${item.id}`, label: "Investigate" },
        ],
      };

    case "work-update":
      return {
        type: "record",
        title: item.data.processName,
        subtitle: item.data.summary,
        status: { label: item.data.status, variant: "neutral" },
        fields: item.data.stepsExecuted
          ? [{ label: "Steps", value: String(item.data.stepsExecuted) }]
          : undefined,
      };

    case "insight":
      return {
        type: "record",
        title: `Pattern: ${item.data.pattern}`,
        subtitle: item.data.evidence,
        status: { label: `${item.data.count}x`, variant: "caution" },
        actions: [
          { id: `teach-${item.data.processId}`, label: "Teach this" },
        ],
      };

    case "process-output":
      return {
        type: "record",
        title: `${item.data.processName} — ${item.data.outputName}`,
        subtitle: item.data.summary,
        status: { label: item.data.outputType, variant: "positive" },
      };

    case "shift-report":
      return {
        type: "record",
        title: "Daily brief",
        subtitle: item.data.summary,
        status: { label: "Brief", variant: "neutral" },
      };

    default:
      return { type: "text", text: "Unknown item" };
  }
}

