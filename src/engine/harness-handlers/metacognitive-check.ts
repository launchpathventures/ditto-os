/**
 * Metacognitive Check Handler
 *
 * Post-execution self-review: the agent's output is checked against its input
 * for unsupported assumptions, missing edge cases, scope creep, and contradictions.
 * This is the internal oversight loop (self-review), complementary to the external
 * loop (review patterns = maker-checker).
 *
 * Auto-enabled for supervised and critical trust tiers.
 * Opt-in for spot_checked and autonomous via `harness.metacognitive: true`.
 *
 * If issues found: sets context.reviewResult = 'flag' for human review.
 * Does NOT re-execute the step.
 *
 * Provenance: Insight-063 (two-loop metacognitive model), ADR-014 Phase A2
 * (orchestrator reflection concept applied per-step).
 */

import type { HarnessHandler, HarnessContext } from "../harness";
import { parseHarnessConfig } from "./harness-config";
import { createCompletion, extractText, getConfiguredModel } from "../llm";

const METACOGNITIVE_PROMPT = `You are performing a fast metacognitive self-check on an agent's output. Check for:

1. **Unsupported assumptions** — Does the output assume facts not present in the input or context?
2. **Missing edge cases** — Are there obvious scenarios the output ignores?
3. **Scope creep** — Does the output go beyond what was asked?
4. **Contradictions** — Does the output contradict the provided context or its own statements?

Respond with a JSON object:
{
  "clean": true/false,
  "issues": ["list of specific issues found"]
}

Be terse. Only flag genuine problems, not style preferences. If the output is reasonable, respond with {"clean": true, "issues": []}.`;

export const metacognitiveCheckHandler: HarnessHandler = {
  name: "metacognitive-check",

  canHandle(context: HarnessContext): boolean {
    // Skip if no step result or step errored
    if (context.stepResult === null || context.stepError !== null) {
      return false;
    }

    const { trustTier } = context;

    // Auto-enable for supervised and critical (maximum oversight tiers)
    if (trustTier === "supervised" || trustTier === "critical") {
      return true;
    }

    // Opt-in for spot_checked and autonomous via harness.metacognitive: true
    const config = parseHarnessConfig(context.stepDefinition);
    return config.metacognitive;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const output = context.stepResult?.outputs || {};
    const outputText =
      typeof output === "string"
        ? output
        : JSON.stringify(output, null, 2);

    const inputText = JSON.stringify(context.processRun.inputs, null, 2);

    const response = await createCompletion({
      model: getConfiguredModel(),
      system: METACOGNITIVE_PROMPT,
      messages: [
        {
          role: "user",
          content: `Process: ${context.processDefinition.name}\nStep: ${context.stepDefinition.name}\n\nInput:\n${inputText}\n\nOutput:\n${outputText}`,
        },
      ],
      maxTokens: 512,
    });

    const costCents = response.costCents;
    context.reviewCostCents += costCents;

    const responseText = extractText(response.content);

    // Parse verdict
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          clean?: boolean;
          issues?: string[];
        };

        if (!parsed.clean && parsed.issues && parsed.issues.length > 0) {
          // Issues found — flag for human review
          context.reviewResult = "flag";
          context.reviewDetails = {
            ...context.reviewDetails,
            metacognitive: {
              issues: parsed.issues,
              rawResponse: responseText,
            },
          };
        }
        // Clean — continue unchanged (do not modify reviewResult)
        return context;
      }
    } catch {
      // JSON parse failed — flag for safety
    }

    // Fallback: couldn't parse response, flag for human review
    context.reviewResult = "flag";
    context.reviewDetails = {
      ...context.reviewDetails,
      metacognitive: {
        issues: ["Metacognitive check response could not be parsed"],
        rawResponse: responseText,
      },
    };

    return context;
  },
};
