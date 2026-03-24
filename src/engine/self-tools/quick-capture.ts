/**
 * Ditto — Self Tool: Quick Capture
 *
 * Stores raw text as a capture work item and auto-classifies
 * via intake-classifier. Lightweight — for when the user says
 * "remember that..." or drops a quick note.
 *
 * Provenance: Existing workItems table + intake-classifier (Brief 014b).
 */

import { db, schema } from "../../db";
import { classifyWorkItem } from "../system-agents/intake-classifier";
import type { DelegationResult } from "../self-delegation";

interface QuickCaptureInput {
  text: string;
}

export async function handleQuickCapture(
  input: QuickCaptureInput,
): Promise<DelegationResult> {
  const { text } = input;

  if (!text || text.trim().length === 0) {
    return {
      toolName: "quick_capture",
      success: false,
      output: "Capture text is required.",
    };
  }

  try {
    const classification = classifyWorkItem(text);

    const [item] = await db
      .insert(schema.workItems)
      .values({
        type: classification.type,
        status: "intake",
        content: text.trim(),
        source: "capture",
      })
      .returning({ id: schema.workItems.id });

    return {
      toolName: "quick_capture",
      success: true,
      output: JSON.stringify({
        id: item.id,
        type: classification.type,
        message: "Captured and classified.",
      }),
    };
  } catch (err) {
    return {
      toolName: "quick_capture",
      success: false,
      output: `Failed to capture: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
