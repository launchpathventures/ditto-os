/**
 * @ditto/core — Routing Handler
 *
 * Evaluates step output against route_to conditions to determine next step.
 * Mode 1 only (code-based string matching). LLM-based routing (Mode 2) deferred.
 *
 * Provenance:
 * - Three-mode routing: Inngest AgentKit /packages/agent-kit/src/network.ts
 * - Conditional edges: LangGraph /libs/langgraph/langgraph/pregel/main.py
 */

import type { HarnessHandler, HarnessContext, RoutingDecision } from "../harness.js";

export type { RoutingDecision };

/**
 * Evaluate a route_to condition against step output.
 * Mode 1: Simple substring matching on the stringified output.
 */
function evaluateCondition(condition: string, outputText: string): boolean {
  const normalizedOutput = outputText.toLowerCase();
  const normalizedCondition = condition.toLowerCase();

  // Match "output contains 'X'" pattern
  const containsMatch = condition.match(/(?:output\s+)?contains\s+["'](.+?)["']/i);
  if (containsMatch) {
    return normalizedOutput.includes(containsMatch[1].toLowerCase());
  }

  // Direct substring match as fallback
  return normalizedOutput.includes(normalizedCondition);
}

/**
 * Extract the text content from step outputs for condition matching.
 */
function getOutputText(outputs: Record<string, unknown>): string {
  const values = Object.values(outputs);
  return values
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
    .join("\n");
}

export const routingHandler: HarnessHandler = {
  name: "routing",

  canHandle(context: HarnessContext): boolean {
    const step = context.stepDefinition;
    return !!(step.route_to || step.default_next);
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const step = context.stepDefinition;
    const outputs = context.stepResult?.outputs || {};
    const outputText = getOutputText(outputs);

    let decision: RoutingDecision = {
      nextStepId: null,
      reasoning: "No routing conditions defined",
      confidence: "high",
      mode: "default",
    };

    // Evaluate route_to conditions in order (first match wins)
    if (step.route_to) {
      for (const route of step.route_to) {
        if (evaluateCondition(route.condition, outputText)) {
          decision = {
            nextStepId: route.goto,
            reasoning: `Condition matched: "${route.condition}" → goto ${route.goto}`,
            confidence: "high",
            mode: "code-based",
          };
          console.log(`    Routing: ${step.id} → ${route.goto} (condition: "${route.condition}")`);
          break;
        }
      }
    }

    // Fall back to default_next if no condition matched
    if (!decision.nextStepId && step.default_next) {
      decision = {
        nextStepId: step.default_next,
        reasoning: `No route_to condition matched, using default_next: ${step.default_next}`,
        confidence: "high",
        mode: "default",
      };
      console.log(`    Routing: ${step.id} → ${step.default_next} (default)`);
    }

    context.routingDecision = decision;
    return context;
  },
};
