/**
 * Shared Harness Config Parser
 *
 * Parses the `harness` field from step definitions into a structured config.
 * Used by both review-pattern and metacognitive-check handlers.
 *
 * Provenance: Extracted from review-pattern.ts (Brief 034b) to prevent
 * duplicate parsing logic.
 */

import type { StepDefinition } from "../process-loader";

export interface HarnessConfig {
  review: string[];
  metacognitive: boolean;
}

/**
 * Parse the harness field from a step definition.
 * Accepts legacy string format and structured format:
 * - Legacy: `harness: maker-checker` → { review: ['maker-checker'], metacognitive: false }
 * - Structured: `harness: { review: ['maker-checker'], metacognitive: true }` → as-is
 */
export function parseHarnessConfig(step: StepDefinition): HarnessConfig {
  const harness = step.harness;

  if (!harness) {
    return { review: [], metacognitive: false };
  }

  // Legacy string format
  if (typeof harness === "string") {
    return { review: [harness], metacognitive: false };
  }

  // Structured format
  if (typeof harness === "object" && harness !== null) {
    const obj = harness as Record<string, unknown>;
    return {
      review: Array.isArray(obj.review) ? (obj.review as string[]) : [],
      metacognitive: obj.metacognitive === true,
    };
  }

  return { review: [], metacognitive: false };
}
