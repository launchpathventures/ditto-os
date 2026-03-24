/**
 * Ditto — Self Tool: Create Work Item
 *
 * Creates a work item from natural language, classifies via intake-classifier,
 * and inserts into the DB. Optionally routes to a process.
 *
 * Provenance: Existing workItems table + intake-classifier system agent (Brief 014b).
 */

import { db, schema } from "../../db";
import { classifyWorkItem } from "../system-agents/intake-classifier";
import type { DelegationResult } from "../self-delegation";

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
