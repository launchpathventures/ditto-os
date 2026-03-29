/**
 * Ditto — Projects Composition
 *
 * "What are my bigger goals?" — Goal-level items with process associations.
 *
 * Visual reference: P19 (multi-process workspace), P27 (process flow map).
 * Provenance: Brief 047 AC9, ADR-024.
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";
import { formatTrustTier } from "./utils";

/**
 * Compose the Projects view — goal-level items with decomposition.
 */
export function composeProjects(context: CompositionContext): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { workItems, processes } = context;

  // Goals are work items of type "goal"
  const goals = workItems.filter((w) => w.type === "goal");
  // Tasks that belong to goals (have assignedProcess)
  const tasks = workItems.filter(
    (w) => w.type === "task" && w.status !== "cancelled",
  );

  if (goals.length === 0 && processes.length === 0) {
    blocks.push({
      type: "text",
      text: "No projects yet. When you share a larger goal, Ditto will break it down and track progress here.",
    });
    return blocks;
  }

  // Goals overview
  if (goals.length > 0) {
    blocks.push({ type: "text", text: "**Goals**" });

    for (const goal of goals) {
      // Find child tasks
      const childTasks = tasks.filter(
        (t) => t.assignedProcess && goal.assignedProcess === t.assignedProcess,
      );
      const completedTasks = childTasks.filter((t) => t.status === "completed");

      const fields: Array<{ label: string; value: string }> = [];
      if (childTasks.length > 0) {
        fields.push({
          label: "Progress",
          value: `${completedTasks.length}/${childTasks.length} tasks`,
        });
      }

      blocks.push({
        type: "record",
        title: goal.content,
        status: {
          label: goal.status,
          variant: goal.status === "completed" ? "positive" : "info",
        },
        fields,
      });
    }
  }

  // Process associations — which routines support which work
  if (processes.length > 0) {
    blocks.push({ type: "text", text: "**Connected routines**" });

    for (const proc of processes) {
      const procWorkItems = workItems.filter(
        (w) => w.assignedProcess === proc.id,
      );
      const activeItems = procWorkItems.filter(
        (w) => w.status !== "completed" && w.status !== "cancelled",
      );

      blocks.push({
        type: "status_card",
        entityType: "process_run",
        entityId: proc.id,
        title: proc.name,
        status:
          proc.lastRunStatus === "failed"
            ? "Needs attention"
            : activeItems.length > 0
              ? `${activeItems.length} active items`
              : "Idle",
        details: {
          "Total runs": String(proc.recentRunCount),
          "Review level": formatTrustTier(proc.trustTier),
        },
      });
    }
  }

  return blocks;
}

