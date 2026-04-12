/**
 * Ditto — Training Data Extraction
 *
 * Extracts labeled training examples from step_runs + feedback data.
 * The trust system generates ground truth as a byproduct of normal operation:
 * every approve/edit/reject is a labeled training example.
 *
 * Provenance: Insight-175 (trust system as training data flywheel), Brief 135/136.
 */

import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "../db/schema";
import type {
  TrainingExample,
  TrainingDataExport,
  TrainingDataOptions,
} from "@ditto/core";

// ============================================================
// Training Data Extraction
// ============================================================

/**
 * Raw row shape from the extraction query.
 * step_runs → process_outputs → feedback join.
 */
interface StepRunRow {
  step_run_id: string;
  process_slug: string;
  step_id: string;
  step_run_status: string;
  inputs: string | null;
  outputs: string | null;
  model: string | null;
  tokens_used: number | null;
  cost_cents: number | null;
  step_run_created_at: number;
  feedback_type: string | null;
  output_content: string | null;
  diff: string | null;
}

/**
 * Extract training data for a specific (process, step) pair.
 *
 * Queries step_runs joined with process_outputs and feedback to produce
 * labeled training examples. For edited outputs, the corrected output
 * (original + diff applied) is the training target.
 *
 * @param db - Database instance
 * @param processSlug - Process slug to extract data for
 * @param stepId - Step ID within the process
 * @param options - Mandatory scrubber and export options
 * @returns Training data export with examples and stats
 */
export function extractTrainingData(
  db: BetterSQLite3Database<typeof schemaTypes>,
  processSlug: string,
  stepId: string,
  options: TrainingDataOptions,
): TrainingDataExport {
  const { scrubber, purpose = "classification" } = options;

  // Query step runs with their feedback status.
  // Uses a subquery to pick the most recent feedback per step_run,
  // preventing duplicate rows when multiple process_outputs or feedback entries exist.
  const rows = db.all<StepRunRow>(sql`
    SELECT
      sr.id AS step_run_id,
      p.slug AS process_slug,
      sr.step_id,
      sr.status AS step_run_status,
      sr.inputs,
      sr.outputs,
      sr.model,
      sr.tokens_used,
      sr.cost_cents,
      sr.created_at AS step_run_created_at,
      latest_fb.feedback_type,
      latest_fb.output_content,
      latest_fb.diff
    FROM step_runs sr
    JOIN process_runs pr ON sr.process_run_id = pr.id
    JOIN processes p ON pr.process_id = p.id
    LEFT JOIN (
      SELECT
        po.step_run_id,
        f.type AS feedback_type,
        po.content AS output_content,
        f.diff,
        ROW_NUMBER() OVER (PARTITION BY po.step_run_id ORDER BY f.created_at DESC) AS rn
      FROM process_outputs po
      JOIN feedback f ON f.output_id = po.id
    ) latest_fb ON latest_fb.step_run_id = sr.id AND latest_fb.rn = 1
    WHERE p.slug = ${processSlug}
      AND sr.step_id = ${stepId}
      AND sr.status IN ('approved', 'rejected')
      AND sr.model IS NOT NULL
    ORDER BY sr.created_at ASC
  `);

  const examples: TrainingExample[] = [];
  let approvedCount = 0;
  let editedCount = 0;
  let rejectedCount = 0;

  for (const row of rows) {
    const isApproved = row.step_run_status === "approved";
    const isRejected = row.step_run_status === "rejected";
    const isEdited = row.feedback_type === "edit";

    // Track stats
    if (isRejected) {
      rejectedCount++;
      continue; // Rejected outputs excluded from training examples
    }

    if (!isApproved) continue;

    // Parse inputs/outputs
    const inputData = parseJson(row.inputs);
    const outputData = parseJson(row.outputs);

    // Build the input string from step inputs
    const input = scrubber(stringifyForTraining(inputData));
    const output = scrubber(stringifyForTraining(outputData));

    if (!input || !output) continue; // Skip empty examples

    const label: "approved" | "edited" = isEdited ? "edited" : "approved";

    if (isEdited) {
      editedCount++;
    } else {
      approvedCount++;
    }

    // For edited outputs, reconstruct the corrected output.
    // Strategy: use process_outputs.content (the reviewed output) if available,
    // then fall back to applying diff "to" values over the original step_run outputs.
    let correctedOutput: string | undefined;
    if (isEdited) {
      const outputContent = parseJson(row.output_content);
      if (outputContent) {
        // process_outputs.content is the final reviewed content
        correctedOutput = scrubber(stringifyForTraining(outputContent));
      } else if (row.diff) {
        // Fall back: apply diff "to" values over the original outputs
        const diffData = parseJson(row.diff);
        if (diffData && outputData) {
          const corrected = { ...outputData };
          for (const [key, change] of Object.entries(diffData)) {
            if (change && typeof change === "object" && "to" in (change as Record<string, unknown>)) {
              corrected[key] = (change as Record<string, unknown>).to;
            }
          }
          correctedOutput = scrubber(stringifyForTraining(corrected));
        }
      }
    }

    // systemPrompt is left empty — step_runs don't store system prompts.
    // Callers provide system prompts separately via toOpenAiFineTuningJsonl().
    const example: TrainingExample = {
      id: row.step_run_id,
      processSlug: row.process_slug,
      stepId: row.step_id,
      purpose,
      systemPrompt: "",
      input,
      output,
      label,
      sourceModel: row.model ?? "unknown",
      createdAt: new Date(row.step_run_created_at),
    };

    if (correctedOutput) {
      example.correctedOutput = correctedOutput;
    }

    examples.push(example);
  }

  return {
    processSlug,
    stepId,
    purpose,
    examples,
    format: "jsonl",
    totalExamples: examples.length,
    approvedCount,
    editedCount,
    rejectedCount,
  };
}

// ============================================================
// JSONL Export
// ============================================================

/**
 * Convert a TrainingDataExport to OpenAI fine-tuning JSONL format.
 *
 * Each line is: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
 *
 * For edited examples, the assistant message uses the correctedOutput (the training target).
 */
export function toOpenAiFineTuningJsonl(
  exportData: TrainingDataExport,
  systemPrompt?: string,
): string {
  const lines: string[] = [];

  for (const example of exportData.examples) {
    const messages: Array<{ role: string; content: string }> = [];

    // System prompt (if provided and not excluded)
    const sysPrompt = systemPrompt ?? example.systemPrompt;
    if (sysPrompt) {
      messages.push({ role: "system", content: sysPrompt });
    }

    // User message (the input)
    messages.push({ role: "user", content: example.input });

    // Assistant message (the training target)
    // For edited examples, use the corrected output
    const trainingTarget = example.label === "edited" && example.correctedOutput
      ? example.correctedOutput
      : example.output;
    messages.push({ role: "assistant", content: trainingTarget });

    lines.push(JSON.stringify({ messages }));
  }

  return lines.join("\n");
}

// ============================================================
// Helpers
// ============================================================

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function stringifyForTraining(data: Record<string, unknown> | null): string {
  if (!data) return "";
  // If the data has a single string value, return it directly
  const values = Object.values(data);
  if (values.length === 1 && typeof values[0] === "string") {
    return values[0];
  }
  // Otherwise, stringify the whole object
  return JSON.stringify(data);
}
