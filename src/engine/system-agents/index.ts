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
import { executeCoverageAgent } from "./coverage-agent";
import {
  executeOnboardingCloneAndScan,
  executeOnboardingDetectBuildSystem,
  executeOnboardingDetectTestFramework,
  executeOnboardingDetectCI,
  executeOnboardingDetectHarness,
  executeOnboardingScorePersonaFit,
  executeOnboardingMatchGoldStandard,
  executeOnboardingRecommendRunnerTier,
  executeOnboardingSurfaceReport,
  executeRetrofitGeneratePlan,
  executeRetrofitSurfacePlan,
  executeRetrofitDispatchWrite,
  executeRetrofitVerifyCommit,
} from "../onboarding/system-agent";

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
  ["coverage-agent", executeCoverageAgent],
  // Brief 225/226 — project onboarding analyser handlers
  ["project-onboarding-clone-and-scan", executeOnboardingCloneAndScan],
  ["project-onboarding-detect-build-system", executeOnboardingDetectBuildSystem],
  ["project-onboarding-detect-test-framework", executeOnboardingDetectTestFramework],
  ["project-onboarding-detect-ci", executeOnboardingDetectCI],
  ["project-onboarding-detect-existing-harness", executeOnboardingDetectHarness],
  ["project-onboarding-score-persona-fit", executeOnboardingScorePersonaFit],
  ["project-onboarding-match-gold-standard", executeOnboardingMatchGoldStandard],
  ["project-onboarding-recommend-runner-tier", executeOnboardingRecommendRunnerTier],
  ["project-onboarding-surface-report", executeOnboardingSurfaceReport],
  // Brief 228 — project retrofitter handlers (sub-brief #3a of Brief 224)
  ["project-retrofit-generate-plan", executeRetrofitGeneratePlan],
  ["project-retrofit-surface-plan", executeRetrofitSurfacePlan],
  ["project-retrofit-dispatch-write", executeRetrofitDispatchWrite],
  ["project-retrofit-verify-commit", executeRetrofitVerifyCommit],
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
