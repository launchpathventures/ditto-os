/**
 * Ditto — Rules Executor
 *
 * Deterministic rule evaluation for process steps that need condition-checking
 * without LLM or external calls. Returns structured outputs that drive
 * route_to decisions in the heartbeat.
 *
 * Built-in rule checks:
 * - prior_interaction: person has prior interactions with user (Brief 124 AC12)
 * - voice_model_ready: user has >= 5 voice model samples (Brief 124 AC13)
 * - always_pass: no-op pass-through (for testing and placeholder gates)
 *
 * Provenance: Original — deterministic quality gate pattern, ADR-027.
 */

import type { StepDefinition } from "./process-loader";
import type { StepExecutionResult } from "./step-executor";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { getVoiceModelReadiness } from "./people";

interface RuleCheck {
  check: string;
  description?: string;
}

interface RuleResult {
  check: string;
  passed: boolean;
  reason: string;
}

/**
 * Evaluate all rules defined in step.config.rules.
 * Returns outputs with `result: "eligible" | "not_eligible"` (or custom values)
 * and detailed `checks` array for auditability.
 */
export async function evaluateRules(
  step: StepDefinition,
  runInputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const rules = (step.config?.rules as RuleCheck[] | undefined) ?? [];
  const logs: string[] = [];
  const results: RuleResult[] = [];

  for (const rule of rules) {
    const result = await evaluateSingleRule(rule, runInputs);
    results.push(result);
    logs.push(`Rule "${rule.check}": ${result.passed ? "PASS" : "FAIL"} — ${result.reason}`);
  }

  const allPassed = results.every((r) => r.passed);
  const passValue = (step.config?.passValue as string) ?? "eligible";
  const failValue = (step.config?.failValue as string) ?? "not_eligible";

  return {
    outputs: {
      result: allPassed ? passValue : failValue,
      checks: results,
      allPassed,
    },
    logs,
  };
}

async function evaluateSingleRule(
  rule: RuleCheck,
  runInputs: Record<string, unknown>,
): Promise<RuleResult> {
  switch (rule.check) {
    case "prior_interaction":
      return evaluatePriorInteraction(runInputs);

    case "voice_model_ready":
      return evaluateVoiceModelReady(runInputs);

    case "always_pass":
      return { check: "always_pass", passed: true, reason: "No-op pass-through" };

    default:
      return { check: rule.check, passed: false, reason: `Unknown rule check: ${rule.check}` };
  }
}

/**
 * Brief 124 AC12: Ghost mode only for existing relationships.
 * Person must have at least one prior interaction with the user.
 */
async function evaluatePriorInteraction(
  runInputs: Record<string, unknown>,
): Promise<RuleResult> {
  const personId = runInputs.personId as string | undefined;
  if (!personId) {
    return { check: "prior_interaction", passed: false, reason: "No personId in run inputs" };
  }

  const [interaction] = await db
    .select({ id: schema.interactions.id })
    .from(schema.interactions)
    .where(eq(schema.interactions.personId, personId))
    .limit(1);

  if (interaction) {
    return { check: "prior_interaction", passed: true, reason: "Person has prior interactions" };
  }

  return {
    check: "prior_interaction",
    passed: false,
    reason: "No prior interactions found — ghost mode requires existing relationship",
  };
}

/**
 * Brief 124 AC5/AC13: Voice model must have >= 5 samples.
 */
async function evaluateVoiceModelReady(
  runInputs: Record<string, unknown>,
): Promise<RuleResult> {
  const userId = runInputs.userId as string | undefined;
  if (!userId) {
    return { check: "voice_model_ready", passed: false, reason: "No userId in run inputs" };
  }

  const readiness = await getVoiceModelReadiness(userId);

  if (readiness.ready) {
    return {
      check: "voice_model_ready",
      passed: true,
      reason: `Voice model ready (${readiness.sampleCount} samples)`,
    };
  }

  return {
    check: "voice_model_ready",
    passed: false,
    reason: `Voice model not ready (${readiness.sampleCount}/5 samples)`,
  };
}
