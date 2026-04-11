/**
 * @ditto/core — Model Purpose Resolver Handler
 *
 * Inspects structural signals in the step definition to automatically
 * resolve the optimal ModelPurpose for LLM calls. Runs before step
 * execution so the adapter can pass the resolved purpose downstream.
 *
 * Resolution is pure logic — no LLM calls, no DB queries. The step
 * definition is the classifier.
 *
 * Provenance:
 * - Structural signal classification pattern from NeurometricAI
 * - Purpose-based routing: ADR-026
 * - Trust-as-cost-lever: Insight-173
 *
 * Brief 128
 */

import type { HarnessHandler, HarnessContext } from "../harness.js";
import { MODEL_PURPOSES, type ModelPurpose } from "../../llm/index.js";

/** Keywords that signal analysis-oriented work */
const ANALYSIS_KEYWORDS = ["research", "analy", "review", "evaluat", "assess", "investigat"];

/** Keywords that signal writing-oriented work */
const WRITING_KEYWORDS = ["writ", "draft", "compos", "author", "create-content", "copywrit"];

/** Keywords that signal classification-oriented work */
const CLASSIFICATION_KEYWORDS = ["classif", "route", "triage", "categoriz", "sort", "detect", "filter"];

/** Output name suffixes that suggest structured data extraction */
const STRUCTURED_OUTPUT_SUFFIXES = ["_data", "_json", "_record", "_list", "_records", "_items"];

/** Executors that don't make LLM calls */
const NON_LLM_EXECUTORS = ["script", "integration", "human"];

function isValidPurpose(value: unknown): value is ModelPurpose {
  return typeof value === "string" && (MODEL_PURPOSES as readonly string[]).includes(value);
}

function hasStructuredOutputs(outputs?: string[]): boolean {
  if (!outputs || outputs.length === 0) return false;
  return outputs.some((name) =>
    STRUCTURED_OUTPUT_SUFFIXES.some((suffix) => name.endsWith(suffix)),
  );
}

function matchesKeywords(agentRole: string, keywords: string[]): boolean {
  const normalized = agentRole.toLowerCase();
  return keywords.some((kw) => normalized.includes(kw));
}

/**
 * Resolve the optimal ModelPurpose from step definition signals.
 *
 * Exported for direct use and testing. The handler wraps this.
 */
export function resolveModelPurpose(context: HarnessContext): ModelPurpose | null {
  const step = context.stepDefinition;
  const config = step.config || {};

  // 1. EXPLICIT OVERRIDE — config.purpose takes highest priority
  if (isValidPurpose(config.purpose)) {
    return config.purpose;
  }

  // 2. NON-LLM EXECUTOR — no purpose needed
  if (NON_LLM_EXECUTORS.includes(step.executor)) {
    return null;
  }

  // 3. SENDING IDENTITY SIGNAL — user's reputation at stake
  if (step.sendingIdentity === "principal") {
    return "writing";
  }

  // 4. ROUTING SIGNAL — step with route_to is a classifier
  if (step.route_to && step.route_to.length > 0) {
    return "classification";
  }

  // 5. TOOL + STRUCTURED OUTPUT SIGNAL
  const hasTools = (step.tools && step.tools.length > 0) || context.resolvedTools !== null;
  const hasStructured = hasStructuredOutputs(step.outputs) || config.response_format !== undefined;
  if (hasTools && hasStructured) {
    return "extraction";
  }

  // 6. TRUST-TIER SIGNAL — autonomous steps without sending identity can downgrade
  if (context.trustTier === "autonomous" && !step.sendingIdentity) {
    if (step.agent_role && matchesKeywords(step.agent_role, ANALYSIS_KEYWORDS)) {
      return "classification";
    }
    return "analysis";
  }

  // 7. AGENT ROLE SIGNAL — keyword matching on agent_role
  if (step.agent_role) {
    if (matchesKeywords(step.agent_role, CLASSIFICATION_KEYWORDS)) {
      return "classification";
    }
    if (matchesKeywords(step.agent_role, WRITING_KEYWORDS)) {
      return "writing";
    }
    if (matchesKeywords(step.agent_role, ANALYSIS_KEYWORDS)) {
      return "analysis";
    }
  }

  // 8. MODEL HINT BACKWARD COMPAT
  const hint = config.model_hint;
  if (hint === "fast") return "classification";
  if (hint === "capable") return "analysis";
  if (hint === "default") return "analysis";

  // 9. DEFAULT — safe middle ground
  return "analysis";
}

export const modelPurposeResolverHandler: HarnessHandler = {
  name: "model-purpose-resolver",

  canHandle(context: HarnessContext): boolean {
    // Run for all steps — resolution may produce null for non-LLM executors,
    // which is the correct behavior (signals "no LLM purpose needed").
    // Skip only if purpose was already resolved (e.g., by a prior handler).
    return context.resolvedModelPurpose === null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    context.resolvedModelPurpose = resolveModelPurpose(context);
    return context;
  },
};
