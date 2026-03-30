/**
 * System Agent Registry
 *
 * Maps system agent names to their handler functions.
 * The step executor looks up handlers here when processing
 * script steps with a `systemAgent` config.
 *
 * Provenance: Handler registry pattern from Sim Studio apps/sim/executor/handlers/registry.ts
 */

import type { StepExecutionResult } from "../step-executor";
import { executeTrustEvaluator } from "./trust-evaluator";
import { executeIntakeClassifier } from "./intake-classifier";
import { executeRouter } from "./router";
import { executeOrchestrator } from "./orchestrator";
import {
  executeContextAnalyzer,
  executeSolutionExtractor,
  executeRelatedFinder,
  executeKnowledgeAssembler,
} from "./knowledge-extractor";

export type SystemAgentHandler = (
  inputs: Record<string, unknown>,
) => Promise<StepExecutionResult>;

/** Registry of system agent handlers by name */
const registry = new Map<string, SystemAgentHandler>([
  ["trust-evaluator", executeTrustEvaluator],
  ["intake-classifier", executeIntakeClassifier],
  ["router", executeRouter],
  ["orchestrator", executeOrchestrator],
  ["knowledge-context-analyzer", executeContextAnalyzer],
  ["knowledge-solution-extractor", executeSolutionExtractor],
  ["knowledge-related-finder", executeRelatedFinder],
  ["knowledge-assembler", executeKnowledgeAssembler],
]);

/**
 * Resolve a system agent handler by name.
 * Throws if the system agent is not registered.
 */
export function resolveSystemAgent(name: string): SystemAgentHandler {
  const handler = registry.get(name);
  if (!handler) {
    throw new Error(`Unknown system agent: ${name}. Registered: ${[...registry.keys()].join(", ")}`);
  }
  return handler;
}
