/**
 * @ditto/core — Shared Harness Config Parser
 *
 * Parses the `harness` field from step definitions into a structured config.
 * Used by both review-pattern and metacognitive-check handlers.
 */

import type { StepDefinition } from "../harness.js";

export interface HarnessConfig {
  review: string[];
  metacognitive: boolean;
}

export function parseHarnessConfig(step: StepDefinition): HarnessConfig {
  const harness = step.harness;

  if (!harness) {
    return { review: [], metacognitive: false };
  }

  if (typeof harness === "string") {
    return { review: [harness], metacognitive: false };
  }

  if (typeof harness === "object" && harness !== null) {
    const obj = harness as Record<string, unknown>;
    return {
      review: Array.isArray(obj.review) ? (obj.review as string[]) : [],
      metacognitive: obj.metacognitive === true,
    };
  }

  return { review: [], metacognitive: false };
}
