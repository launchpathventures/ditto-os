/**
 * Deliberative Perspectives Handler
 *
 * Four-stage decision-enrichment pattern (ADR-028):
 *   Stage 0: Lens Composer generates context-appropriate lenses
 *   Stage 1: Parallel perspective generation
 *   Stage 2: Anonymized peer review cross-examination (optional)
 *   Stage 3: Self synthesis (deferred — this handler produces the data)
 *
 * Composable with existing review patterns (Insight-002).
 * Internal machinery — user sees Alex, not a committee (Insight-159).
 * Perspectives are cognitive functions, not personas (Insight-165).
 *
 * Provenance:
 * - Karpathy llm-council: parallel generation → peer review → synthesis
 * - AutoGen: sparse communication topology
 * - Self-MoA 2025: same model, different prompts
 * - ICLR 2025: conditional invocation critical for cost/quality
 */

import type { HarnessHandler, HarnessContext } from "../harness";
import { createCompletion, extractText } from "../llm";
import { resolveModel } from "../model-routing";
import { composeLenses, type GeneratedLens } from "./lens-composer";
import { runPeerReview } from "./peer-review";

// ============================================================
// Types
// ============================================================

export interface PerspectiveSignal {
  type: "opportunity" | "risk" | "simplification" | "precedent" | "feasibility" | "user-impact" | "quality" | "compliance";
  summary: string;
  severity: "critical" | "significant" | "minor";
  evidence?: string;
}

export interface PerspectiveResult {
  lensId: string;
  cognitiveFunction: string;
  assessment: string;
  signals: PerspectiveSignal[];
  confidence: "high" | "medium" | "low";
  costCents: number;
  /** Populated by peer review — what changed and why */
  peerReviewChanges?: string;
  /** The system prompt used for this lens (needed by peer review) */
  systemPrompt?: string;
}

export interface PerspectivesConfig {
  enabled: boolean;
  trigger: "always" | "low-confidence" | "high-stakes" | "novel-input";
  peerReview: boolean;
  maxLenses: number;
  modelTier: string;
  composerHints: string[];
  maxCostCents: number;
}

// ============================================================
// Config parsing
// ============================================================

const DEFAULT_CONFIG: PerspectivesConfig = {
  enabled: false,
  trigger: "low-confidence",
  peerReview: true,
  maxLenses: 4,
  modelTier: "fast",
  composerHints: [],
  maxCostCents: 50, // ~$0.50 max per invocation
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePerspectivesConfig(
  stepDefinition: { harness?: unknown; config?: Record<string, unknown> },
  processDefinition: any,
): PerspectivesConfig {
  // Check step-level harness.perspectives first, then step config, then process-level
  const harness = stepDefinition.harness;
  let raw: Record<string, unknown> | undefined;

  if (typeof harness === "object" && harness !== null) {
    const obj = harness as Record<string, unknown>;
    if (obj.perspectives && typeof obj.perspectives === "object") {
      raw = obj.perspectives as Record<string, unknown>;
    }
  }

  // Fall back to step config.perspectives
  if (!raw && stepDefinition.config?.perspectives && typeof stepDefinition.config.perspectives === "object") {
    raw = stepDefinition.config.perspectives as Record<string, unknown>;
  }

  // Fall back to process-level config.perspectives
  const procConfig = processDefinition.config;
  if (!raw && typeof procConfig === "object" && procConfig !== null) {
    const pc = procConfig as Record<string, unknown>;
    if (pc.perspectives && typeof pc.perspectives === "object") {
      raw = pc.perspectives as Record<string, unknown>;
    }
  }

  if (!raw) return { ...DEFAULT_CONFIG };

  return {
    enabled: raw.enabled === true,
    trigger: (["always", "low-confidence", "high-stakes", "novel-input"].includes(raw.trigger as string)
      ? raw.trigger
      : DEFAULT_CONFIG.trigger) as PerspectivesConfig["trigger"],
    peerReview: raw.peer_review !== false,
    maxLenses: typeof raw.max_lenses === "number" ? raw.max_lenses : DEFAULT_CONFIG.maxLenses,
    modelTier: typeof raw.model_tier === "string" ? raw.model_tier : DEFAULT_CONFIG.modelTier,
    composerHints: Array.isArray(raw.composer_hints) ? (raw.composer_hints as string[]) : [],
    maxCostCents: typeof raw.max_cost_cents === "number" ? raw.max_cost_cents : DEFAULT_CONFIG.maxCostCents,
  };
}

// ============================================================
// Trigger evaluation
// ============================================================

function shouldTrigger(
  config: PerspectivesConfig,
  context: HarnessContext,
): boolean {
  switch (config.trigger) {
    case "always":
      return true;

    case "low-confidence": {
      const confidence = context.stepResult?.confidence;
      return confidence === "low" || confidence === "medium";
    }

    case "high-stakes": {
      // High stakes = outbound actions or external consequences
      const hasOutbound = context.stagedOutboundActions.length > 0;
      const hasSendingIdentity = context.sendingIdentity !== null;
      const isGhostOrPrincipal =
        context.sendingIdentity === "ghost" || context.sendingIdentity === "principal";
      return hasOutbound || hasSendingIdentity || isGhostOrPrincipal;
    }

    case "novel-input":
      // Deferred per brief AC3 — always triggers for now (conservative)
      return true;

    default:
      return false;
  }
}

// ============================================================
// Stage 1: Parallel perspective generation
// ============================================================

async function runLensGeneration(
  lenses: GeneratedLens[],
  outputText: string,
  context: HarnessContext,
  modelTier: string,
): Promise<{ results: PerspectiveResult[]; costCents: number }> {
  const model = resolveModel(modelTier);
  let totalCostCents = 0;

  const promises = lenses.map(async (lens) => {
    const questionsBlock = lens.evaluationQuestions.length > 0
      ? `\nEvaluation questions:\n${lens.evaluationQuestions.map((q) => `- ${q}`).join("\n")}`
      : "";

    // Inject relevant memories if memoryCategories specified
    let memoryBlock = "";
    if (lens.memoryCategories && lens.memoryCategories.length > 0 && context.memories) {
      memoryBlock = `\nRelevant accumulated knowledge:\n${context.memories.slice(0, 500)}`;
    }

    const systemPrompt = `${lens.systemPrompt}${questionsBlock}${memoryBlock}

Process: ${context.processDefinition.name}
Step: ${context.stepDefinition.name}
Quality criteria: ${(context.processDefinition.quality_criteria || []).join("; ")}

Respond with a JSON object:
{
  "assessment": "Your evaluation of this output through your lens",
  "signals": [
    { "type": "risk|opportunity|simplification|precedent|feasibility|user-impact|quality|compliance", "summary": "One sentence", "severity": "critical|significant|minor", "evidence": "optional supporting evidence" }
  ],
  "confidence": "high|medium|low"
}`;

    const response = await createCompletion({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: `Evaluate this output:\n\n${outputText.slice(0, 2000)}` }],
      maxTokens: 1024,
    });

    return { lens, response };
  });

  const settled = await Promise.allSettled(promises);
  const results: PerspectiveResult[] = [];

  for (const outcome of settled) {
    if (outcome.status === "rejected") continue;

    const { lens, response } = outcome.value;
    totalCostCents += response.costCents;
    const responseText = extractText(response.content);

    const parsed = parsePerspectiveResponse(responseText);

    results.push({
      lensId: lens.id,
      cognitiveFunction: lens.cognitiveFunction,
      assessment: parsed.assessment,
      signals: parsed.signals,
      confidence: parsed.confidence,
      costCents: response.costCents,
      systemPrompt: lens.systemPrompt,
    });
  }

  return { results, costCents: totalCostCents };
}

function parsePerspectiveResponse(
  responseText: string,
): { assessment: string; signals: PerspectiveSignal[]; confidence: "high" | "medium" | "low" } {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        assessment?: string;
        signals?: Array<{ type?: string; summary?: string; severity?: string; evidence?: string }>;
        confidence?: string;
      };

      return {
        assessment: parsed.assessment ?? responseText,
        signals: Array.isArray(parsed.signals)
          ? parsed.signals
              .filter((s) => s.type && s.summary && s.severity)
              .map((s) => ({
                type: s.type as PerspectiveSignal["type"],
                summary: s.summary!,
                severity: s.severity as "critical" | "significant" | "minor",
                evidence: s.evidence,
              }))
          : [],
        confidence: (["high", "medium", "low"].includes(parsed.confidence ?? "")
          ? parsed.confidence
          : "medium") as "high" | "medium" | "low",
      };
    }
  } catch {
    // Parse failed
  }

  return { assessment: responseText, signals: [], confidence: "medium" };
}

// ============================================================
// Handler
// ============================================================

export const deliberativePerspectivesHandler: HarnessHandler = {
  name: "deliberative-perspectives",

  canHandle(context: HarnessContext): boolean {
    // Only runs if step execution succeeded
    if (context.stepResult === null || context.stepError !== null) {
      return false;
    }

    const config = parsePerspectivesConfig(
      context.stepDefinition,
      context.processDefinition as unknown as Record<string, unknown>,
    );

    if (!config.enabled) return false;

    return shouldTrigger(config, context);
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const config = parsePerspectivesConfig(
      context.stepDefinition,
      context.processDefinition as unknown as Record<string, unknown>,
    );

    const output = context.stepResult?.outputs ?? {};
    const outputText = typeof output === "string"
      ? output
      : JSON.stringify(output, null, 2);

    let totalCostCents = 0;
    let effectiveMaxLenses = config.maxLenses;
    let peerReviewEnabled = config.peerReview;

    // --------------------------------------------------------
    // Budget degradation: estimate if we can afford all stages
    // --------------------------------------------------------
    const estimatedCostPerLens = 3; // ~$0.03 per lens call (rough estimate)
    const estimatedComposerCost = 1;
    const estimatedTotalCost =
      estimatedComposerCost +
      effectiveMaxLenses * estimatedCostPerLens +
      (peerReviewEnabled ? effectiveMaxLenses * estimatedCostPerLens : 0);

    if (estimatedTotalCost > config.maxCostCents) {
      // Degrade: drop peer review first
      peerReviewEnabled = false;
      const reducedEstimate = estimatedComposerCost + effectiveMaxLenses * estimatedCostPerLens;

      if (reducedEstimate > config.maxCostCents) {
        // Degrade further: reduce lens count
        const affordableLenses = Math.floor(
          (config.maxCostCents - estimatedComposerCost) / estimatedCostPerLens,
        );

        if (affordableLenses < 2) {
          // Skip perspectives entirely — can't afford even 2 lenses
          context.reviewDetails = {
            ...context.reviewDetails,
            perspectives: { skipped: true, reason: "budget_exceeded" },
          };
          return context;
        }
        effectiveMaxLenses = affordableLenses;
      }
    }

    // --------------------------------------------------------
    // Stage 0: Lens Composition
    // --------------------------------------------------------
    const composerResult = await composeLenses({
      output: outputText,
      processContext: {
        name: context.processDefinition.name,
        qualityCriteria: context.processDefinition.quality_criteria || [],
        goalAncestry: [], // Goal ancestry not in context — leave empty
        trustTier: context.trustTier,
        runCount: 0, // Run count not in context — leave 0
      },
      decisionSignals: {
        confidence: (context.stepResult?.confidence as "high" | "medium" | "low") ?? "medium",
        stakes: context.stagedOutboundActions.length > 0 ? "high" : "medium",
        domain: context.processDefinition.description || context.processDefinition.name,
      },
      memories: context.memories,
      composerHints: config.composerHints,
      maxLenses: effectiveMaxLenses,
    });

    totalCostCents += composerResult.costCents;

    if (composerResult.lenses.length === 0) {
      context.reviewDetails = {
        ...context.reviewDetails,
        perspectives: { skipped: true, reason: "no_lenses_generated" },
      };
      context.reviewCostCents += totalCostCents;
      return context;
    }

    // --------------------------------------------------------
    // Stage 1: Parallel Perspective Generation
    // --------------------------------------------------------
    const generationResult = await runLensGeneration(
      composerResult.lenses,
      outputText,
      context,
      config.modelTier,
    );

    totalCostCents += generationResult.costCents;
    let finalPerspectives = generationResult.results;

    // --------------------------------------------------------
    // Stage 2: Peer Review (if enabled and we have 2+ perspectives)
    // --------------------------------------------------------
    if (peerReviewEnabled && finalPerspectives.length >= 2) {
      const peerReviewResult = await runPeerReview({
        output: outputText,
        processName: context.processDefinition.name,
        stepName: context.stepDefinition.name,
        perspectives: finalPerspectives,
        modelTier: config.modelTier,
      });

      totalCostCents += peerReviewResult.costCents;
      finalPerspectives = peerReviewResult.revisedPerspectives;
    }

    // --------------------------------------------------------
    // Aggregate results
    // --------------------------------------------------------

    // Check for critical signals — flag for human review
    const hasCritical = finalPerspectives.some((p) =>
      p.signals.some((s) => s.severity === "critical"),
    );

    // Guard: if previous handler already flagged, preserve the flag
    if (hasCritical) {
      context.reviewResult = "flag";
    }
    // Do NOT weaken an existing flag (same guard as review-pattern.ts)

    // Store perspective results for Self synthesis and feedback recording
    context.reviewDetails = {
      ...context.reviewDetails,
      perspectives: {
        lenses: finalPerspectives.map((p) => ({
          lensId: p.lensId,
          cognitiveFunction: p.cognitiveFunction,
          assessment: p.assessment,
          signals: p.signals,
          confidence: p.confidence,
          costCents: p.costCents,
          peerReviewChanges: p.peerReviewChanges,
        })),
        composerCostCents: composerResult.costCents,
        peerReviewEnabled,
        totalCostCents,
        hasCritical,
      },
    };

    context.reviewCostCents += totalCostCents;

    return context;
  },
};
