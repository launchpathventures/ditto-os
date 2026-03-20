/**
 * Trust Evaluator — System Agent Module
 *
 * Wraps the existing evaluateTrust() function from Phase 3 for execution
 * through the harness pipeline. Same logic, now auditable and trust-earning.
 *
 * Provenance: ADR-008 (system agent category), Phase 3 trust-evaluator.ts
 */

import type { StepExecutionResult } from "../step-executor";
import { evaluateTrust } from "../trust-evaluator";

/**
 * Execute trust evaluation as a system agent step.
 * Receives processId from run inputs, calls the existing evaluateTrust() function,
 * and returns the result as step output.
 */
export async function executeTrustEvaluator(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const processId = inputs.processId as string;

  if (!processId) {
    throw new Error("Trust evaluator requires processId input");
  }

  const result = await evaluateTrust(processId);

  return {
    outputs: {
      "evaluation-result": result,
    },
    confidence: "high", // Deterministic code — always high confidence
    logs: [
      `Trust evaluation for process ${processId}: ${result.action}`,
      ...(result.details ? [`Details: ${result.details}`] : []),
    ],
  };
}
