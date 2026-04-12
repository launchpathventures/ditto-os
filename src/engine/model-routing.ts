/**
 * Ditto — Model Routing Intelligence
 *
 * Purpose-based routing (ADR-026, Insight-157): routes LLM calls to the
 * best available provider+model based on the task's purpose class.
 * Also maintains backward-compatible hint resolution.
 *
 * Provenance:
 * - Capability-hint aliases: Vercel AI SDK customProvider (alias-to-model mapping)
 * - Actual-model tracking: Vercel AI SDK OpenTelemetry (ai.response.model)
 * - Learned routing economics: RouteLLM (85% cost reduction at 95% quality)
 * - Purpose-based routing: RouteLLM (UC Berkeley), ADR-026
 * - Process-level learned routing: Original to Ditto
 *
 * Brief 033 + Brief 096.
 */

import { getConfiguredModel, getProviderName, getLoadedProviders } from "./llm.js";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "../db/schema";
import { scoreAllSteps } from "./readiness-scorer.js";
import { getPromotedDeployment } from "./slm-deployment.js";

// ============================================================
// Purpose-based routing (ADR-026, Insight-157)
// ============================================================

/**
 * Purpose classes — model quality matches user proximity.
 * See Insight-157 for the layer-purpose mapping.
 */
export const MODEL_PURPOSES = [
  "conversation",    // L6: User-facing dialogue (Self, front door, briefings)
  "writing",         // L6: Outreach, introductions, content the user's reputation depends on
  "analysis",        // L2/L3: Research, review, metacognitive check — accuracy > voice
  "classification",  // L2: Routing, categorisation, intent detection — fast and cheap
  "extraction",      // L5: Structured data extraction from text — fast and cheap
] as const;

export type ModelPurpose = (typeof MODEL_PURPOSES)[number];

/** Provider + model preference for a given purpose */
export interface ProviderModelPreference {
  provider: string;
  model: string;
}

/**
 * Purpose → provider+model routing table.
 * Ordered by preference — first available provider wins.
 * Conversation/writing get the best models. Classification/extraction get the cheapest.
 */
export const PURPOSE_ROUTING: Record<ModelPurpose, ProviderModelPreference[]> = {
  conversation: [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro" },
  ],
  writing: [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro" },
  ],
  analysis: [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro" },
  ],
  classification: [
    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-2.5-flash" },
  ],
  extraction: [
    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-2.5-flash" },
  ],
};

/**
 * Resolve the best available provider+model for a given purpose.
 * Walks the preference list and returns the first provider that is loaded.
 * Falls back to the deployment default if no preference matches.
 */
export function resolveProviderForPurpose(purpose: ModelPurpose): { provider: string; model: string } {
  const loadedProviders = getLoadedProviders();
  const preferences = PURPOSE_ROUTING[purpose];

  for (const pref of preferences) {
    if (loadedProviders.has(pref.provider)) {
      return pref;
    }
  }

  // Fallback: use whatever provider is loaded with its default model
  const firstLoaded = Array.from(loadedProviders.keys())[0];
  if (firstLoaded) {
    return { provider: firstLoaded, model: getConfiguredModel() };
  }

  // No providers loaded — return default (will fail at createCompletion)
  return { provider: "anthropic", model: getConfiguredModel() };
}

/**
 * Resolve provider+model for a step, checking for promoted SLM deployments first.
 * Falls through to normal PURPOSE_ROUTING if no SLM override exists.
 *
 * Brief 137: per-(process, step) routing overrides for deployed SLMs.
 */
export function resolveProviderForStep(
  db: BetterSQLite3Database<typeof schemaTypes>,
  processSlug: string,
  stepId: string,
  purpose: ModelPurpose,
): { provider: string; model: string; slmDeploymentId?: string } {
  // Check for a promoted SLM deployment for this (process, step)
  const promoted = getPromotedDeployment(db, processSlug, stepId);

  if (promoted) {
    const loadedProviders = getLoadedProviders();
    if (loadedProviders.has(promoted.provider)) {
      return {
        provider: promoted.provider,
        model: promoted.model,
        slmDeploymentId: promoted.id,
      };
    }
    // Provider not loaded — fall through to normal routing
  }

  return resolveProviderForPurpose(purpose);
}

/**
 * Map old model hints to purposes for backward compatibility.
 */
const HINT_TO_PURPOSE: Record<string, ModelPurpose> = {
  fast: "classification",
  capable: "analysis",
  default: "analysis",
};

/**
 * Resolve a model hint to a purpose, then to a provider+model.
 * Backward compatible bridge for process YAML model_hint.
 */
export function resolveHintToPurpose(hint: string | undefined): ModelPurpose {
  if (!hint) return "analysis";
  return HINT_TO_PURPOSE[hint] ?? "analysis";
}

// ============================================================
// Model hint resolution (backward compat — Brief 033)
// ============================================================

/** Valid model hint values for process step config */
export const VALID_HINTS = ["fast", "capable", "default"] as const;
export type ModelHint = (typeof VALID_HINTS)[number];

/**
 * Provider-specific model families.
 * Maps hint names to concrete model IDs per provider.
 * Ollama is excluded — we can't assume which models the user has pulled.
 */
const MODEL_FAMILIES: Record<string, Record<string, string>> = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    capable: "claude-opus-4-6",
  },
  openai: {
    fast: "gpt-4o-mini",
    capable: "gpt-4o",
  },
  // Ollama: no family mapping — all hints resolve to default
  // because we can't assume which models the user has pulled.
};

/**
 * Resolve a model hint to a concrete model ID.
 *
 * - `undefined` or `"default"` → deployment default (LLM_MODEL)
 * - `"fast"` → fastest/cheapest model for the configured provider
 * - `"capable"` → most capable model for the configured provider
 * - Unknown hint → deployment default (graceful fallback)
 */
export function resolveModel(hint: string | undefined): string {
  const defaultModel = getConfiguredModel();
  if (!hint || hint === "default") return defaultModel;

  const provider = getProviderName();
  return MODEL_FAMILIES[provider]?.[hint] || defaultModel;
}

// ============================================================
// Model recommendations (learning layer)
// ============================================================

export interface ModelRecommendation {
  processSlug: string;
  stepId: string;
  currentModel: string;
  suggestedModel: string;
  currentApprovalRate: number;
  suggestedApprovalRate: number | null; // null if no data for suggested model
  currentAvgCostCents: number;
  suggestedAvgCostCents: number | null;
  rationale: string;
  /** Recommendation type: model_switch for existing models, fine_tune_candidate for SLM training (Brief 136) */
  type?: "model_switch" | "fine_tune_candidate";
}

/** Minimum completed runs per (process, step, model) before we can recommend */
const MIN_RUNS_THRESHOLD = 20;

/**
 * Relative pricing tiers for hint-based cost comparison.
 * Lower = cheaper. Used only for directional comparison, not billing.
 */
const MODEL_COST_TIER: Record<string, number> = {
  // Anthropic
  "claude-haiku-4-5-20251001": 1,
  "claude-sonnet-4-6": 3,
  "claude-opus-4-6": 15,
  // OpenAI
  "gpt-4o-mini": 1,
  "gpt-4o": 5,
  "o3-mini": 2,
  // Google
  "gemini-2.5-flash": 1,
  "gemini-2.5-pro": 3,
};

/**
 * Generate model recommendations from accumulated step run data.
 *
 * Queries completed step runs grouped by (process, step, model).
 * For each group with sufficient data, compares models:
 * - If a cheaper model has comparable quality (within 5% approval rate): recommend downgrade
 * - If current model has low quality (<80%) and a better model exists: recommend upgrade
 *
 * Returns advisory recommendations — no auto-switching.
 */
export async function generateModelRecommendations(
  db: BetterSQLite3Database<typeof schemaTypes>,
): Promise<ModelRecommendation[]> {
  // Step 1: Query per-model stats grouped by (process, step, model)
  const rows = db.all<{
    process_slug: string;
    step_id: string;
    model: string;
    total_runs: number;
    approved_runs: number;
    avg_cost_cents: number;
  }>(sql`
    SELECT
      p.slug AS process_slug,
      sr.step_id,
      sr.model,
      COUNT(*) AS total_runs,
      SUM(CASE WHEN sr.status = 'approved' THEN 1 ELSE 0 END) AS approved_runs,
      AVG(sr.cost_cents) AS avg_cost_cents
    FROM step_runs sr
    JOIN process_runs pr ON sr.process_run_id = pr.id
    JOIN processes p ON pr.process_id = p.id
    WHERE sr.model IS NOT NULL
      AND sr.status IN ('approved', 'rejected')
    GROUP BY p.slug, sr.step_id, sr.model
    HAVING COUNT(*) >= ${MIN_RUNS_THRESHOLD}
  `);

  // Step 2: Determine current model per (process, step) from most recent 5 runs
  const recentRows = db.all<{
    process_slug: string;
    step_id: string;
    model: string;
  }>(sql`
    SELECT process_slug, step_id, model FROM (
      SELECT
        p.slug AS process_slug,
        sr.step_id,
        sr.model,
        ROW_NUMBER() OVER (PARTITION BY p.slug, sr.step_id ORDER BY sr.created_at DESC) AS rn
      FROM step_runs sr
      JOIN process_runs pr ON sr.process_run_id = pr.id
      JOIN processes p ON pr.process_id = p.id
      WHERE sr.model IS NOT NULL
        AND sr.status IN ('approved', 'rejected')
    ) WHERE rn <= 5
  `);

  // Count model frequency in the most recent 5 runs per (process, step)
  const recentModelCounts = new Map<string, Map<string, number>>();
  for (const row of recentRows) {
    const key = `${row.process_slug}::${row.step_id}`;
    if (!recentModelCounts.has(key)) recentModelCounts.set(key, new Map());
    const counts = recentModelCounts.get(key)!;
    counts.set(row.model, (counts.get(row.model) || 0) + 1);
  }

  // Group stats by (processSlug, stepId)
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.process_slug}::${row.step_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const recommendations: ModelRecommendation[] = [];

  for (const [key, modelRows] of groups) {
    // Need at least 2 models to compare
    if (modelRows.length < 2) continue;

    // Determine current model from most recent 5 runs (most frequent = current)
    const recentCounts = recentModelCounts.get(key);
    let currentModelName: string | null = null;
    if (recentCounts) {
      let maxCount = 0;
      for (const [model, count] of recentCounts) {
        if (count > maxCount) {
          maxCount = count;
          currentModelName = model;
        }
      }
    }

    // Fallback to most-used model if no recent data
    if (!currentModelName) {
      const sorted = [...modelRows].sort((a, b) => b.total_runs - a.total_runs);
      currentModelName = sorted[0].model;
    }

    const current = modelRows.find((r) => r.model === currentModelName)!;
    const currentApprovalRate = current.approved_runs / current.total_runs;

    const alternatives = modelRows.filter((r) => r.model !== currentModelName);
    for (const alternative of alternatives) {
      const altApprovalRate = alternative.approved_runs / alternative.total_runs;
      const currentCostTier = MODEL_COST_TIER[current.model] ?? 5;
      const altCostTier = MODEL_COST_TIER[alternative.model] ?? 5;

      // Case 1: Cheaper model with comparable quality (within 5%)
      if (altCostTier < currentCostTier && altApprovalRate >= currentApprovalRate - 0.05) {
        const savingsPercent = Math.round((1 - altCostTier / currentCostTier) * 100);
        recommendations.push({
          processSlug: current.process_slug,
          stepId: current.step_id,
          currentModel: current.model,
          suggestedModel: alternative.model,
          currentApprovalRate,
          suggestedApprovalRate: altApprovalRate,
          currentAvgCostCents: current.avg_cost_cents,
          suggestedAvgCostCents: alternative.avg_cost_cents,
          rationale: `${alternative.model} has ${Math.round(altApprovalRate * 100)}% approval rate (vs ${Math.round(currentApprovalRate * 100)}%) at ~${savingsPercent}% lower cost`,
        });
      }

      // Case 2: Current model has low quality, more capable model available
      if (currentApprovalRate < 0.8 && altCostTier > currentCostTier && altApprovalRate > currentApprovalRate + 0.1) {
        recommendations.push({
          processSlug: current.process_slug,
          stepId: current.step_id,
          currentModel: current.model,
          suggestedModel: alternative.model,
          currentApprovalRate,
          suggestedApprovalRate: altApprovalRate,
          currentAvgCostCents: current.avg_cost_cents,
          suggestedAvgCostCents: alternative.avg_cost_cents,
          rationale: `${current.model} has low approval rate (${Math.round(currentApprovalRate * 100)}%). ${alternative.model} achieves ${Math.round(altApprovalRate * 100)}% — consider upgrading for quality`,
        });
      }
    }
  }

  // ── Fine-tuning candidate detection (Brief 136) ──
  // Check for (process, step) pairs with enough approved data to warrant SLM fine-tuning.
  // This supplements model-switch recommendations with "consider training a custom SLM" signals.
  const readinessScores = scoreAllSteps(db);
  for (const score of readinessScores) {
    if (score.recommendation === "ready" || score.recommendation === "strong_candidate") {
      recommendations.push({
        processSlug: score.processSlug,
        stepId: score.stepId,
        currentModel: "current",
        suggestedModel: "fine-tuned-slm",
        currentApprovalRate: score.signals.consistency.approvalRate,
        suggestedApprovalRate: null,
        currentAvgCostCents: score.signals.costImpact.currentAvgCostCents,
        suggestedAvgCostCents: score.signals.costImpact.estimatedSlmCostCents,
        rationale: `SLM fine-tuning ${score.recommendation}: ${score.signals.volume.count} approved examples at ${Math.round(score.signals.consistency.approvalRate * 100)}% approval rate. Estimated savings: ${score.estimatedMonthlySavingsCents}¢/month`,
        type: "fine_tune_candidate",
      });
    }
  }

  return recommendations;
}
