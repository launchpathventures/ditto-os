/**
 * Review Pattern Handler
 *
 * Applies post-execution review patterns to agent output.
 * Three patterns, composable as layers (Insight-002):
 * - maker-checker: spawn reviewer agent to check output (antfarm verify_each pattern)
 * - adversarial: same as maker-checker with adversarial prompt (antfarm verifier prompting)
 * - spec-testing: LLM validates output against quality_criteria (Original)
 *
 * Layers run in order. Any retry → re-execute step. Any flag → override trust gate.
 * All pass → trust gate sampling applies normally.
 *
 * Provenance:
 * - maker-checker: antfarm src/installer/step-ops.ts lines 728-845
 * - adversarial: antfarm verifier agent (prompting strategy)
 * - spec-testing: Original — no source validates against quality criteria
 */

import type { HarnessHandler, HarnessContext } from "../harness";
import { executeStep } from "../step-executor";
import { createCompletion, extractText, getConfiguredModel } from "../llm";
import { parseHarnessConfig } from "./harness-config";

/** Default max retries for maker-checker/adversarial retry results */
const DEFAULT_MAX_RETRIES = 2;

// ============================================================
// Review layer implementations
// ============================================================

interface ReviewLayerResult {
  verdict: "pass" | "flag" | "retry";
  details: Record<string, unknown>;
  costCents: number;
  feedback?: string; // For retry — feedback to inject into re-execution
}

/**
 * Maker-checker: spawn a reviewer agent to check the output.
 */
async function runMakerChecker(
  context: HarnessContext,
  adversarial: boolean
): Promise<ReviewLayerResult> {
  const output = context.stepResult?.outputs || {};
  const outputText =
    typeof output === "string"
      ? output
      : JSON.stringify(output, null, 2);

  const verification = context.stepDefinition.verification || [];
  const qualityCriteria = context.processDefinition.quality_criteria || [];

  const roleDescription = adversarial
    ? `You are an ADVERSARIAL reviewer. Your job is to find flaws, challenge assumptions, and argue against the output. Be skeptical and thorough. Look for:
- Incorrect assumptions
- Missing edge cases
- Logical errors
- Incomplete or misleading content
- Anything that could go wrong in practice

Do not be charitable. If something could be wrong, flag it.`
    : `You are a quality reviewer. Your job is to check this output against the verification criteria and quality standards.

Be fair and thorough. Flag real issues, not style preferences.`;

  const systemPrompt = `${roleDescription}

Process: ${context.processDefinition.name}
Step: ${context.stepDefinition.name}

${verification.length > 0 ? `Verification criteria:\n${verification.map((v) => `- ${v}`).join("\n")}` : ""}

${qualityCriteria.length > 0 ? `Quality criteria:\n${qualityCriteria.map((c) => `- ${c}`).join("\n")}` : ""}

Respond with a JSON object:
{
  "verdict": "pass" | "flag" | "retry",
  "issues": ["list of issues found"],
  "feedback": "specific feedback for the producer if verdict is retry"
}

- "pass": output meets all criteria, no significant issues
- "flag": issues found that require human review
- "retry": issues found that the producer agent can likely fix — provide specific feedback`;

  const response = await createCompletion({
    model: getConfiguredModel(),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Review this output:\n\n${outputText}`,
      },
    ],
    maxTokens: 2048,
  });

  const costCents = response.costCents;

  const responseText = extractText(response.content);

  // Parse the JSON response
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        verdict: string;
        issues?: string[];
        feedback?: string;
      };
      const verdict =
        parsed.verdict === "retry"
          ? "retry"
          : parsed.verdict === "pass"
            ? "pass"
            : "flag";
      return {
        verdict,
        details: {
          type: adversarial ? "adversarial" : "maker-checker",
          issues: parsed.issues || [],
          rawResponse: responseText,
        },
        costCents,
        feedback: parsed.feedback,
      };
    }
  } catch {
    // JSON parse failed — treat as flag for safety
  }

  // Fallback: couldn't parse response, flag for human review
  return {
    verdict: "flag",
    details: {
      type: adversarial ? "adversarial" : "maker-checker",
      issues: ["Review response could not be parsed"],
      rawResponse: responseText,
    },
    costCents,
  };
}

/**
 * Spec-testing: LLM validates output against process quality_criteria.
 */
async function runSpecTesting(
  context: HarnessContext
): Promise<ReviewLayerResult> {
  const output = context.stepResult?.outputs || {};
  const outputText =
    typeof output === "string"
      ? output
      : JSON.stringify(output, null, 2);

  const qualityCriteria = context.processDefinition.quality_criteria || [];

  if (qualityCriteria.length === 0) {
    // No criteria to test against — pass
    return {
      verdict: "pass",
      details: { type: "spec-testing", skipped: true, reason: "no quality_criteria defined" },
      costCents: 0,
    };
  }

  const systemPrompt = `You are a specification tester. Evaluate the output against each quality criterion.

Process: ${context.processDefinition.name}
Step: ${context.stepDefinition.name}

Quality criteria:
${qualityCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Respond with a JSON object:
{
  "results": [
    { "criterion": "...", "pass": true/false, "reason": "..." }
  ],
  "overallPass": true/false
}`;

  const response = await createCompletion({
    model: getConfiguredModel(),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Evaluate this output:\n\n${outputText}`,
      },
    ],
    maxTokens: 2048,
  });

  const costCents = response.costCents;

  const responseText = extractText(response.content);

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        results?: Array<{ criterion: string; pass: boolean; reason: string }>;
        overallPass?: boolean;
      };
      return {
        verdict: parsed.overallPass ? "pass" : "flag",
        details: {
          type: "spec-testing",
          criteriaResults: parsed.results || [],
          rawResponse: responseText,
        },
        costCents,
      };
    }
  } catch {
    // JSON parse failed
  }

  return {
    verdict: "flag",
    details: {
      type: "spec-testing",
      issues: ["Spec-testing response could not be parsed"],
      rawResponse: responseText,
    },
    costCents,
  };
}

// ============================================================
// Handler
// ============================================================

export const reviewPatternHandler: HarnessHandler = {
  name: "review-pattern",

  canHandle(context: HarnessContext): boolean {
    // Only runs if step execution succeeded
    return context.stepResult !== null && context.stepError === null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const config = parseHarnessConfig(context.stepDefinition);

    // No review patterns configured — skip (reviewResult stays 'skip')
    if (config.review.length === 0) {
      return context;
    }

    context.reviewPattern = config.review;
    let totalCostCents = 0;
    const allDetails: Record<string, unknown>[] = [];
    let overallResult: "pass" | "flag" | "retry" = "pass";
    const maxRetries =
      (context.stepDefinition.config?.max_review_retries as number) ??
      DEFAULT_MAX_RETRIES;
    let retriesUsed = 0;

    // Run review layers in order
    for (const pattern of config.review) {
      let layerResult: ReviewLayerResult;

      switch (pattern) {
        case "maker-checker":
          layerResult = await runMakerChecker(context, false);
          break;
        case "adversarial":
          layerResult = await runMakerChecker(context, true);
          break;
        case "spec-testing":
          layerResult = await runSpecTesting(context);
          break;
        default:
          // Unknown pattern — skip
          allDetails.push({ type: pattern, skipped: true, reason: "unknown pattern" });
          continue;
      }

      totalCostCents += layerResult.costCents;
      allDetails.push(layerResult.details);

      if (layerResult.verdict === "retry" && retriesUsed < maxRetries) {
        // Re-execute the step with feedback injected
        retriesUsed++;
        const retryInputs = {
          ...context.processRun.inputs,
          _reviewerFeedback: layerResult.feedback,
          _retryAttempt: retriesUsed,
        };

        try {
          const retryResult = await executeStep(
            context.stepDefinition,
            retryInputs,
            context.processDefinition,
            undefined,
            undefined,
            context.stepRunId,
            context.processRun.id,
          );
          context.stepResult = retryResult;
          totalCostCents += retryResult.costCents || 0;

          // Re-run this review layer on the new output
          let retryReview: ReviewLayerResult;
          if (pattern === "adversarial") {
            retryReview = await runMakerChecker(context, true);
          } else if (pattern === "spec-testing") {
            retryReview = await runSpecTesting(context);
          } else {
            retryReview = await runMakerChecker(context, false);
          }
          totalCostCents += retryReview.costCents;
          allDetails.push({
            ...retryReview.details,
            retryAttempt: retriesUsed,
          });

          if (retryReview.verdict === "flag" || retryReview.verdict === "retry") {
            overallResult = "flag"; // Exhausted retry or still flagged
          }
        } catch {
          overallResult = "flag"; // Retry execution failed
          allDetails.push({
            type: pattern,
            retryFailed: true,
            retryAttempt: retriesUsed,
          });
        }
      } else if (layerResult.verdict === "retry") {
        // Max retries exhausted
        overallResult = "flag";
      } else if (layerResult.verdict === "flag") {
        overallResult = "flag";
      }
      // "pass" doesn't change overallResult unless already flagged
    }

    // Guard: if metacognitive check already flagged, preserve the flag
    if (context.reviewResult === "flag" && overallResult !== "flag") {
      // Keep the prior flag — do not overwrite to 'pass'
    } else {
      context.reviewResult = overallResult;
    }

    // Merge: spread existing reviewDetails (e.g. from metacognitive check) + add review layers
    context.reviewDetails = {
      ...context.reviewDetails,
      layers: allDetails,
      retriesUsed,
    };
    context.reviewCostCents += totalCostCents;

    return context;
  },
};
