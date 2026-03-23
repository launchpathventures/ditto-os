/**
 * Ditto — Model Routing Intelligence
 *
 * Resolves model hints (fast, capable, default) to provider-specific models.
 * Generates model recommendations from accumulated step run data.
 *
 * Provenance:
 * - Capability-hint aliases: Vercel AI SDK customProvider (alias-to-model mapping)
 * - Actual-model tracking: Vercel AI SDK OpenTelemetry (ai.response.model)
 * - Learned routing economics: RouteLLM (85% cost reduction at 95% quality)
 * - Process-level learned routing: Original to Ditto
 *
 * Brief 033. Depends on Brief 032 (multi-provider llm.ts).
 */

import { getConfiguredModel, getProviderName } from "./llm.js";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "../db/schema";

// ============================================================
// Model hint resolution
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

  return recommendations;
}
