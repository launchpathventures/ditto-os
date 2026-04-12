/**
 * Lens Composer — Stage 0 of Deliberative Perspectives
 *
 * Analyzes the decision context and dynamically generates 2-5 tailored
 * cognitive lenses for evaluating a step's output. The Lens Composer
 * decides "who should be in the room?" — which perspectives are relevant
 * for this specific decision.
 *
 * Uses the fast model tier for cost efficiency (~200 output tokens).
 *
 * Provenance:
 * - Dynamic composition: Original to Ditto (ADR-028 §2)
 * - Cognitive function over personality: arXiv:2602.11924
 * - Fast model for meta-tasks: Brief 033 model routing
 */

import { createCompletion, extractText } from "../llm";
import { resolveModel } from "../model-routing";

// ============================================================
// Types
// ============================================================

export interface LensComposerInput {
  /** The step output text being evaluated */
  output: string;
  processContext: {
    name: string;
    qualityCriteria: string[];
    goalAncestry: string[];
    trustTier: string;
    runCount: number;
  };
  decisionSignals: {
    confidence: "high" | "medium" | "low";
    stakes: "low" | "medium" | "high";
    domain: string;
  };
  /**
   * Pre-assembled memories string from harness context.
   * MVP simplification: ADR-028 §2 specifies userContext (cognitiveMode,
   * recentCorrections, operatingCycle) and decisionSignals.novelty, but
   * these are not yet available in HarnessContext. The memories string is
   * a pragmatic proxy — it includes failure patterns and corrections that
   * inform lens generation. Structured category access is a follow-up.
   */
  memories: string;
  /** Optional domain hints from process config */
  composerHints: string[];
  /** Max lenses to generate */
  maxLenses: number;
}

export interface GeneratedLens {
  id: string;
  cognitiveFunction: string;
  systemPrompt: string;
  evaluationQuestions: string[];
  memoryCategories?: string[];
}

export interface LensComposerResult {
  lenses: GeneratedLens[];
  costCents: number;
}

// ============================================================
// Composer prompt
// ============================================================

const COMPOSER_SYSTEM_PROMPT = `You are a Lens Composer. Your job is to analyze a decision context and generate 2-5 cognitive lenses — each representing a distinct analytical angle that would improve the quality of this decision.

Rules:
- Each lens must be defined by a cognitive FUNCTION (e.g. "risk assessment", "feasibility analysis"), NOT a personality (e.g. "cautious pessimist", "bold optimist").
- Each lens must ask 2-4 specific evaluation questions tailored to THIS decision.
- Generate fewer lenses for simpler decisions, more for complex/novel ones.
- If the context includes failure patterns or past corrections, assign relevant memoryCategories so lenses can access that knowledge.
- Do NOT generate redundant lenses. Each must evaluate from a genuinely different angle.

Valid memoryCategories: "failure_pattern", "overconfidence_pattern", "correction", "solution", "quality_drift"

Respond with a JSON object:
{
  "lenses": [
    {
      "id": "short-kebab-id",
      "cognitiveFunction": "What this lens evaluates",
      "systemPrompt": "You are evaluating this output through the lens of [function]. Your role is to...",
      "evaluationQuestions": ["Question 1?", "Question 2?"],
      "memoryCategories": ["optional-category"]
    }
  ]
}`;

// ============================================================
// Composer function
// ============================================================

export async function composeLenses(
  input: LensComposerInput,
): Promise<LensComposerResult> {
  const model = resolveModel("fast");

  const contextMessage = buildComposerContext(input);

  const response = await createCompletion({
    model,
    system: COMPOSER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: contextMessage }],
    maxTokens: 512, // ADR-028 §3: target ~200 output tokens; cap at 512 for safety
  });

  const costCents = response.costCents;
  const responseText = extractText(response.content);

  const lenses = parseLensResponse(responseText, input.maxLenses);

  return { lenses, costCents };
}

// ============================================================
// Helpers
// ============================================================

function buildComposerContext(input: LensComposerInput): string {
  const parts: string[] = [];

  parts.push(`Process: ${input.processContext.name}`);
  parts.push(`Domain: ${input.decisionSignals.domain}`);
  parts.push(`Trust tier: ${input.processContext.trustTier}`);
  parts.push(`Run count: ${input.processContext.runCount}`);
  parts.push(`Confidence: ${input.decisionSignals.confidence}`);
  parts.push(`Stakes: ${input.decisionSignals.stakes}`);

  if (input.processContext.qualityCriteria.length > 0) {
    parts.push(`Quality criteria:\n${input.processContext.qualityCriteria.map((c) => `- ${c}`).join("\n")}`);
  }

  if (input.processContext.goalAncestry.length > 0) {
    parts.push(`Goal context: ${input.processContext.goalAncestry.join(" → ")}`);
  }

  if (input.composerHints.length > 0) {
    parts.push(`Domain hints:\n${input.composerHints.map((h) => `- ${h}`).join("\n")}`);
  }

  if (input.memories) {
    parts.push(`Accumulated knowledge (failure patterns, corrections):\n${input.memories.slice(0, 500)}`);
  }

  parts.push(`\nMax lenses: ${input.maxLenses}`);
  // Output truncated to 1500 chars for composer cost control.
  // The composer only needs enough to understand the decision domain,
  // not the full output. Lenses receive a larger slice (2000 chars).
  parts.push(`\nOutput to evaluate:\n${input.output.slice(0, 1500)}`);

  return parts.join("\n");
}

export function parseLensResponse(
  responseText: string,
  maxLenses: number,
): GeneratedLens[] {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return getDefaultLenses();

    const parsed = JSON.parse(jsonMatch[0]) as {
      lenses?: Array<{
        id?: string;
        cognitiveFunction?: string;
        systemPrompt?: string;
        evaluationQuestions?: string[];
        memoryCategories?: string[];
      }>;
    };

    if (!parsed.lenses || !Array.isArray(parsed.lenses) || parsed.lenses.length === 0) {
      return getDefaultLenses();
    }

    // Validate and cap at maxLenses
    const validated: GeneratedLens[] = [];
    for (const lens of parsed.lenses.slice(0, maxLenses)) {
      if (!lens.id || !lens.cognitiveFunction || !lens.systemPrompt) continue;
      validated.push({
        id: lens.id,
        cognitiveFunction: lens.cognitiveFunction,
        systemPrompt: lens.systemPrompt,
        evaluationQuestions: Array.isArray(lens.evaluationQuestions)
          ? lens.evaluationQuestions
          : [],
        memoryCategories: Array.isArray(lens.memoryCategories)
          ? lens.memoryCategories
          : undefined,
      });
    }

    return validated.length > 0 ? validated : getDefaultLenses();
  } catch {
    return getDefaultLenses();
  }
}

/**
 * Fallback lenses if the composer fails to generate valid output.
 * These are minimal, general-purpose lenses that work for any decision.
 */
function getDefaultLenses(): GeneratedLens[] {
  return [
    {
      id: "risk-assessor",
      cognitiveFunction: "Risk assessment and assumption challenging",
      systemPrompt:
        "You are evaluating this output through the lens of risk assessment. " +
        "Your role is to identify what could go wrong, what assumptions are unverified, " +
        "and what the worst-case scenarios are. Be specific and evidence-based.",
      evaluationQuestions: [
        "What assumptions does this output make that haven't been verified?",
        "What could go wrong if this output is acted upon?",
        "What edge cases or failure modes are not addressed?",
      ],
      memoryCategories: ["failure_pattern", "overconfidence_pattern"],
    },
    {
      id: "feasibility-assessor",
      cognitiveFunction: "Pragmatic feasibility and execution assessment",
      systemPrompt:
        "You are evaluating this output through the lens of practical feasibility. " +
        "Your role is to assess whether this can actually be executed, what the " +
        "critical path is, and what concrete first steps should be.",
      evaluationQuestions: [
        "Is this output actionable as-is, or does it require further work?",
        "What is the most likely execution bottleneck?",
        "What is the simplest way to validate this before committing?",
      ],
    },
  ];
}
