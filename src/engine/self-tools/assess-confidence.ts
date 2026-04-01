/**
 * Ditto — Self Tool: Assess Confidence
 *
 * Returns a structured confidence assessment for the current response.
 * The Self calls this as its final tool when tool activity has occurred.
 * The assessment flows as response-level metadata (not a ContentBlock).
 *
 * The tool itself is a pass-through — the structured data comes from
 * the LLM's tool_use JSON schema enforcement. The handler validates
 * and normalises the input.
 *
 * Provenance: Brief 068, Insight-127/128.
 */

import type { DelegationResult } from "../self-delegation";
import type { ConfidenceAssessment } from "../content-blocks";

interface AssessConfidenceInput {
  level: string;
  summary: string;
  checks: Array<{ label: string; detail: string; category: string }>;
  uncertainties: Array<{ label: string; detail: string; severity: string }>;
}

const VALID_LEVELS = new Set(["high", "medium", "low"]);
const VALID_SEVERITIES = new Set(["minor", "major"]);

export async function handleAssessConfidence(
  input: AssessConfidenceInput,
): Promise<DelegationResult> {
  // Validate and normalise
  const level = VALID_LEVELS.has(input.level)
    ? (input.level as ConfidenceAssessment["level"])
    : "medium";

  const checks = (input.checks ?? []).map((c) => ({
    label: String(c.label ?? ""),
    detail: String(c.detail ?? ""),
    category: String(c.category ?? "activity"),
  }));

  const uncertainties = (input.uncertainties ?? []).map((u) => ({
    label: String(u.label ?? ""),
    detail: String(u.detail ?? ""),
    severity: VALID_SEVERITIES.has(u.severity)
      ? (u.severity as "minor" | "major")
      : ("minor" as const),
  }));

  const assessment: ConfidenceAssessment = {
    level,
    summary: String(input.summary ?? ""),
    checks,
    uncertainties,
  };

  return {
    toolName: "assess_confidence",
    success: true,
    output: JSON.stringify(assessment),
    metadata: { confidenceAssessment: assessment },
  };
}
