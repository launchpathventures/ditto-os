/**
 * Ditto — Work Composition
 *
 * "What am I actively working on?" — Active work items with progress.
 *
 * Visual reference: P25 (tasks — Jordan, progress bars, filter tabs).
 * Provenance: Brief 047 AC8, ADR-024.
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";
import { formatRelativeTime } from "./utils";

/**
 * Compose the Work view — active work items with progress.
 */
export function composeWork(context: CompositionContext): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { workItems, processes } = context;

  const active = workItems.filter(
    (w) => w.status !== "completed" && w.status !== "cancelled",
  );
  const completed = workItems.filter((w) => w.status === "completed");

  if (active.length === 0 && completed.length === 0) {
    blocks.push({
      type: "text",
      text: "No work items yet. Capture something to get started — just type in the chat below.",
    });
    return blocks;
  }

  // Summary metrics
  blocks.push({
    type: "metric",
    metrics: [
      { label: "Active", value: String(active.length) },
      { label: "Completed", value: String(completed.length) },
      { label: "Total", value: String(workItems.length) },
    ],
  });

  // Active work items as records with progress
  if (active.length > 0) {
    blocks.push({ type: "text", text: "**In progress**" });

    for (const item of active) {
      const proc = item.assignedProcess
        ? processes.find((p) => p.id === item.assignedProcess)
        : undefined;

      const fields: Array<{ label: string; value: string }> = [];
      if (proc) {
        fields.push({ label: "Routine", value: proc.name });
      }
      fields.push({ label: "Status", value: item.status });

      blocks.push({
        type: "record",
        title:
          item.content.length > 80
            ? item.content.slice(0, 80) + "..."
            : item.content,
        status: {
          label: item.status,
          variant: item.status === "in_progress" ? "info" : "neutral",
        },
        fields,
      });
    }
  }

  // Recently completed (last 5)
  if (completed.length > 0) {
    blocks.push({ type: "text", text: "**Recently completed**" });

    for (const item of completed.slice(0, 5)) {
      blocks.push({
        type: "record",
        title:
          item.content.length > 80
            ? item.content.slice(0, 80) + "..."
            : item.content,
        status: { label: "Done", variant: "positive" },
        fields: [
          { label: "Completed", value: formatRelativeTime(item.createdAt) },
        ],
      });
    }
  }

  return blocks;
}

