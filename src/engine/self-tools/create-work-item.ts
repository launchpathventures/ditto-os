/**
 * Ditto — Self Tool: Create Work Item
 *
 * Creates a work item from natural language, classifies via intake-classifier,
 * and inserts into the DB. Optionally routes to a process.
 *
 * Brief 074: when type is "goal", auto-trigger orchestrator after creation.
 *
 * Provenance: Existing workItems table + intake-classifier system agent (Brief 014b).
 */

import { db, schema } from "../../db";
import { classifyWorkItem } from "../system-agents/intake-classifier";
import { matchTaskToProcess } from "../system-agents/router";
import type { DelegationResult } from "../self-delegation";
import { eq } from "drizzle-orm";

interface CreateWorkItemInput {
  content: string;
  /** Optional: if the user specified a goal this serves */
  goalContext?: string;
}

export async function handleCreateWorkItem(
  input: CreateWorkItemInput,
): Promise<DelegationResult> {
  const { content, goalContext } = input;

  if (!content || content.trim().length === 0) {
    return {
      toolName: "create_work_item",
      success: false,
      output: "Work item content is required.",
    };
  }

  try {
    // Classify the work item type
    const classification = classifyWorkItem(content);

    // Insert work item
    const [item] = await db
      .insert(schema.workItems)
      .values({
        type: classification.type,
        status: "intake",
        content: content.trim(),
        source: "capture",
        goalAncestry: goalContext ? [goalContext] : [],
      })
      .returning({ id: schema.workItems.id });

    // Brief 074: auto-trigger orchestrator for goal-type work items
    if (classification.type === "goal") {
      const routeMatch = await matchTaskToProcess(content);
      if (routeMatch.processSlug && routeMatch.confidence >= 0.6) {
        // Find the process to get its ID
        const [proc] = await db
          .select()
          .from(schema.processes)
          .where(eq(schema.processes.slug, routeMatch.processSlug))
          .limit(1);

        if (proc) {
          await db
            .update(schema.workItems)
            .set({ assignedProcess: proc.id, updatedAt: new Date() })
            .where(eq(schema.workItems.id, item.id));

          // Auto-trigger orchestrator (non-blocking)
          const { executeOrchestrator } = await import("../system-agents/orchestrator");
          setImmediate(() => {
            executeOrchestrator({
              processSlug: routeMatch.processSlug!,
              workItemId: item.id,
              content: content.trim(),
              workItemType: "goal",
            }).catch((err) => {
              console.error(`Auto-orchestrator failed for goal ${item.id}:`, err);
            });
          });
        }
      }
    }

    return {
      toolName: "create_work_item",
      success: true,
      output: JSON.stringify({
        id: item.id,
        type: classification.type,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        status: "intake",
        message: `Created ${classification.type} work item. ${classification.confidence === "low" ? "Classification confidence is low — you may want to clarify." : ""}`,
      }),
    };
  } catch (err) {
    return {
      toolName: "create_work_item",
      success: false,
      output: `Failed to create work item: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
