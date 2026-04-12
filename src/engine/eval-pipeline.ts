/**
 * Ditto — SLM Evaluation Pipeline
 *
 * Evaluates a candidate SLM against held-out approved examples
 * before it can be promoted to production. The LlmProvider is
 * injected — this module never imports provider implementations.
 *
 * Provenance: EleutherAI lm-evaluation-harness (pattern), Brief 135/137.
 */

import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "../db/schema";
import type { LlmProvider, LlmCompletionResponse } from "./llm";
import { extractTrainingData } from "./training-data";
import type { TrainingExample } from "@ditto/core";
import { createHash } from "crypto";

// ============================================================
// Types
// ============================================================

export interface EvalResult {
  deploymentId: string;
  totalExamples: number;
  evalExamples: number;
  /** Exact match accuracy (for classification) */
  accuracy: number;
  /** Field match rate: for classification, same as accuracy; for extraction, all-fields-must-match rate */
  fieldMatchRate: number;
  /** Whether the eval passes the promotion threshold */
  passes: boolean;
  /** Per-example results for audit */
  details: EvalExampleResult[];
}

interface EvalExampleResult {
  exampleId: string;
  expected: string;
  actual: string;
  match: boolean;
}

/** Minimum accuracy for promotion */
const PROMOTION_THRESHOLD = 0.95;

// ============================================================
// Holdout Strategy
// ============================================================

/**
 * Deterministic holdout: examples with id hash mod 5 === 0 form
 * the eval set (20%, reproducible, no overlap with training).
 */
export function isEvalHoldout(exampleId: string): boolean {
  const hash = createHash("sha256").update(exampleId).digest();
  return hash[0] % 5 === 0;
}

/**
 * Split examples into training and eval sets using deterministic holdout.
 */
export function splitTrainingEval(examples: TrainingExample[]): {
  training: TrainingExample[];
  eval: TrainingExample[];
} {
  const training: TrainingExample[] = [];
  const evalSet: TrainingExample[] = [];

  for (const ex of examples) {
    if (isEvalHoldout(ex.id)) {
      evalSet.push(ex);
    } else {
      training.push(ex);
    }
  }

  return { training, eval: evalSet };
}

// ============================================================
// Evaluation
// ============================================================

/**
 * Evaluate an SLM candidate against held-out approved examples.
 *
 * @param db - Database instance
 * @param deploymentId - The slm_deployments row ID
 * @param provider - The SLM provider to evaluate (injected, not imported)
 * @param systemPrompt - System prompt to use for the eval runs
 * @returns Eval results with accuracy and per-example details
 */
export async function evaluateSlmCandidate(
  db: BetterSQLite3Database<typeof schemaTypes>,
  deploymentId: string,
  provider: LlmProvider,
  systemPrompt?: string,
): Promise<EvalResult> {
  // Look up the deployment
  const deployments = db.all<{
    process_slug: string;
    step_id: string;
    model: string;
  }>(sql`
    SELECT process_slug, step_id, model
    FROM slm_deployments
    WHERE id = ${deploymentId}
  `);

  if (deployments.length === 0) {
    throw new Error(`SLM deployment ${deploymentId} not found`);
  }

  const deployment = deployments[0];

  // Extract all training data for this (process, step)
  const exportData = extractTrainingData(
    db,
    deployment.process_slug,
    deployment.step_id,
    { scrubber: (t) => t },
  );

  // Split into training and eval sets
  const { eval: evalExamples } = splitTrainingEval(exportData.examples);

  if (evalExamples.length === 0) {
    return {
      deploymentId,
      totalExamples: exportData.totalExamples,
      evalExamples: 0,
      accuracy: 0,
      fieldMatchRate: 0,
      passes: false,
      details: [],
    };
  }

  // Run each eval example through the SLM
  const details: EvalExampleResult[] = [];
  let matches = 0;

  for (const example of evalExamples) {
    const expected = example.label === "edited" && example.correctedOutput
      ? example.correctedOutput
      : example.output;

    let actual = "";
    try {
      const response: LlmCompletionResponse = await provider.createCompletion({
        model: deployment.model,
        system: systemPrompt || "",
        messages: [{ role: "user", content: example.input }],
        maxTokens: 1024,
      });

      actual = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } catch {
      actual = "[error]";
    }

    // Compare: exact match for classification, field-level for extraction
    const match = compareOutputs(expected, actual, exportData.purpose);

    if (match) matches++;

    details.push({
      exampleId: example.id,
      expected,
      actual,
      match,
    });
  }

  const accuracy = evalExamples.length > 0 ? matches / evalExamples.length : 0;

  // Field match rate equals accuracy for v1 (all fields must match).
  // A true F1 with precision/recall per field is a follow-up enhancement.
  const fieldMatchRate = accuracy;

  // Update the deployment record with eval results
  db.run(sql`
    UPDATE slm_deployments
    SET eval_accuracy = ${accuracy},
        eval_f1 = ${fieldMatchRate},
        eval_examples = ${evalExamples.length}
    WHERE id = ${deploymentId}
  `);

  return {
    deploymentId,
    totalExamples: exportData.totalExamples,
    evalExamples: evalExamples.length,
    accuracy,
    fieldMatchRate,
    passes: accuracy >= PROMOTION_THRESHOLD,
    details,
  };
}

// ============================================================
// Output Comparison
// ============================================================

/**
 * Compare expected and actual outputs.
 *
 * Classification: exact label match (trimmed, case-insensitive).
 * Extraction: attempts JSON field-level comparison, falls back to exact match.
 */
function compareOutputs(expected: string, actual: string, purpose: string): boolean {
  const normExpected = expected.trim().toLowerCase();
  const normActual = actual.trim().toLowerCase();

  if (purpose === "classification") {
    return normExpected === normActual;
  }

  if (purpose === "extraction") {
    // Try JSON field-level comparison
    try {
      const expectedObj = JSON.parse(expected);
      const actualObj = JSON.parse(actual);

      if (typeof expectedObj === "object" && typeof actualObj === "object") {
        const expectedKeys = Object.keys(expectedObj);
        if (expectedKeys.length === 0) return normExpected === normActual;

        let matchedFields = 0;
        for (const key of expectedKeys) {
          if (String(actualObj[key]).trim().toLowerCase() === String(expectedObj[key]).trim().toLowerCase()) {
            matchedFields++;
          }
        }
        // All fields must match for a pass
        return matchedFields === expectedKeys.length;
      }
    } catch {
      // Not JSON — fall through to exact match
    }
  }

  return normExpected === normActual;
}
