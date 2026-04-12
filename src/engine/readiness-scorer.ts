/**
 * Ditto — SLM Readiness Scorer
 *
 * Scores each (process, step) pair for SLM fine-tuning readiness.
 * Uses 5 signals: volume, consistency, purpose fit, cost impact,
 * structural simplicity.
 *
 * Provenance: Insight-175 (trust system as training data flywheel), Brief 135/136.
 */

import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaTypes from "../db/schema";
import type {
  SlmReadinessScore,
  SlmReadinessThresholds,
} from "@ditto/core";
import {
  DEFAULT_READINESS_THRESHOLDS,
  SLM_SUITABLE_PURPOSES,
  type ModelPurpose,
} from "@ditto/core";

// ============================================================
// Readiness Scoring
// ============================================================

/** Raw stats from the step_runs query */
interface StepStats {
  process_slug: string;
  step_id: string;
  total_runs: number;
  approved_runs: number;
  rejected_runs: number;
  avg_cost_cents: number;
  avg_tokens_used: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  monthly_runs: number;
}

/**
 * Score a specific (process, step) pair for SLM fine-tuning readiness.
 *
 * @param db - Database instance
 * @param processSlug - Process slug
 * @param stepId - Step ID
 * @param purpose - The resolved ModelPurpose for this step
 * @param thresholds - Configurable thresholds (defaults provided)
 * @returns Readiness score with signals breakdown
 */
export function scoreSlmReadiness(
  db: BetterSQLite3Database<typeof schemaTypes>,
  processSlug: string,
  stepId: string,
  purpose?: ModelPurpose,
  thresholds: SlmReadinessThresholds = DEFAULT_READINESS_THRESHOLDS,
): SlmReadinessScore {
  // Query aggregate stats for this (process, step)
  const rows = db.all<StepStats>(sql`
    SELECT
      p.slug AS process_slug,
      sr.step_id,
      COUNT(*) AS total_runs,
      SUM(CASE WHEN sr.status = 'approved' THEN 1 ELSE 0 END) AS approved_runs,
      SUM(CASE WHEN sr.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_runs,
      AVG(sr.cost_cents) AS avg_cost_cents,
      AVG(sr.tokens_used) AS avg_tokens_used,
      AVG(CASE WHEN sr.tokens_used > 0 THEN sr.tokens_used * 0.7 ELSE 0 END) AS avg_input_tokens,
      AVG(CASE WHEN sr.tokens_used > 0 THEN sr.tokens_used * 0.3 ELSE 0 END) AS avg_output_tokens,
      COUNT(CASE WHEN sr.created_at > ${Date.now() - 30 * 24 * 60 * 60 * 1000} THEN 1 END) AS monthly_runs
    FROM step_runs sr
    JOIN process_runs pr ON sr.process_run_id = pr.id
    JOIN processes p ON pr.process_id = p.id
    WHERE p.slug = ${processSlug}
      AND sr.step_id = ${stepId}
      AND sr.status IN ('approved', 'rejected')
      AND sr.model IS NOT NULL
    GROUP BY p.slug, sr.step_id
  `);

  const resolvedPurpose = purpose ?? "analysis";

  // No data — not ready
  if (rows.length === 0) {
    return makeEmptyScore(processSlug, stepId, resolvedPurpose);
  }

  const stats = rows[0];
  const approvalRate = stats.total_runs > 0
    ? stats.approved_runs / stats.total_runs
    : 0;

  // Score each signal (0-20 each, total 0-100)
  const volumeScore = scoreVolume(stats.approved_runs, thresholds);
  const consistencyScore = scoreConsistency(approvalRate, thresholds);
  const purposeFitScore = scorePurposeFit(resolvedPurpose);
  const costImpactScore = scoreCostImpact(stats.avg_cost_cents, thresholds);
  const simplicityScore = scoreSimplicity(
    stats.avg_input_tokens,
    stats.avg_output_tokens,
    thresholds,
  );

  const totalScore = volumeScore.score + consistencyScore.score +
    purposeFitScore.score + costImpactScore.score + simplicityScore.score;

  // Estimate monthly savings (SLM cost ≈ $0.0001/call vs current)
  const estimatedSlmCostCents = 0.01; // ~$0.0001 per call
  const monthlySavings = stats.monthly_runs * Math.max(0, stats.avg_cost_cents - estimatedSlmCostCents);

  return {
    processSlug,
    stepId,
    purpose: resolvedPurpose,
    score: Math.round(totalScore),
    signals: {
      volume: {
        count: stats.approved_runs,
        threshold: thresholds.volumeReady,
        score: volumeScore.score,
      },
      consistency: {
        approvalRate,
        threshold: thresholds.consistencyReady,
        score: consistencyScore.score,
      },
      purposeFit: {
        purpose: resolvedPurpose,
        isSlmSuitable: purposeFitScore.isSlmSuitable,
        score: purposeFitScore.score,
      },
      costImpact: {
        currentAvgCostCents: stats.avg_cost_cents,
        estimatedSlmCostCents,
        score: costImpactScore.score,
      },
      structuralSimplicity: {
        avgInputTokens: Math.round(stats.avg_input_tokens),
        avgOutputTokens: Math.round(stats.avg_output_tokens),
        score: simplicityScore.score,
      },
    },
    recommendation: deriveRecommendation(totalScore, purposeFitScore.isSlmSuitable),
    estimatedMonthlySavingsCents: Math.round(monthlySavings),
  };
}

/**
 * Score all (process, step) pairs and return those with any readiness signal.
 */
export function scoreAllSteps(
  db: BetterSQLite3Database<typeof schemaTypes>,
  thresholds: SlmReadinessThresholds = DEFAULT_READINESS_THRESHOLDS,
): SlmReadinessScore[] {
  // Get all distinct (process_slug, step_id) pairs with completed runs
  const pairs = db.all<{ process_slug: string; step_id: string }>(sql`
    SELECT DISTINCT
      p.slug AS process_slug,
      sr.step_id
    FROM step_runs sr
    JOIN process_runs pr ON sr.process_run_id = pr.id
    JOIN processes p ON pr.process_id = p.id
    WHERE sr.status IN ('approved', 'rejected')
      AND sr.model IS NOT NULL
  `);

  return pairs
    .map((pair) => scoreSlmReadiness(db, pair.process_slug, pair.step_id, undefined, thresholds))
    .filter((score) => score.score > 0);
}

// ============================================================
// Individual Signal Scorers (each 0-20)
// ============================================================

function scoreVolume(
  approvedCount: number,
  t: SlmReadinessThresholds,
): { score: number } {
  if (approvedCount >= t.volumeStrong) return { score: 20 };
  if (approvedCount >= t.volumeReady) return { score: 15 };
  if (approvedCount >= t.volumeReady * 0.5) return { score: 8 };
  if (approvedCount >= t.volumeReady * 0.1) return { score: 3 };
  return { score: 0 };
}

function scoreConsistency(
  approvalRate: number,
  t: SlmReadinessThresholds,
): { score: number } {
  if (approvalRate >= t.consistencyStrong) return { score: 20 };
  if (approvalRate >= t.consistencyReady) return { score: 15 };
  if (approvalRate >= 0.8) return { score: 8 };
  return { score: 0 };
}

function scorePurposeFit(
  purpose: ModelPurpose,
): { score: number; isSlmSuitable: boolean } {
  const isSlmSuitable = (SLM_SUITABLE_PURPOSES as readonly string[]).includes(purpose);
  return {
    score: isSlmSuitable ? 20 : 0,
    isSlmSuitable,
  };
}

function scoreCostImpact(
  avgCostCents: number,
  t: SlmReadinessThresholds,
): { score: number } {
  if (avgCostCents >= t.costHighCents) return { score: 20 };
  if (avgCostCents >= t.costMinCents) return { score: 12 };
  if (avgCostCents > 0) return { score: 5 };
  return { score: 0 };
}

function scoreSimplicity(
  avgInputTokens: number,
  avgOutputTokens: number,
  t: SlmReadinessThresholds,
): { score: number } {
  const inputFits = avgInputTokens <= t.maxInputTokens;
  const outputFits = avgOutputTokens <= t.maxOutputTokens;

  if (inputFits && outputFits) return { score: 20 };
  if (inputFits || outputFits) return { score: 10 };
  return { score: 0 };
}

// ============================================================
// Recommendation Derivation
// ============================================================

function deriveRecommendation(
  totalScore: number,
  isSlmSuitable: boolean,
): SlmReadinessScore["recommendation"] {
  // Purpose fit is a hard gate — non-suitable purposes never recommend
  if (!isSlmSuitable) return "not_ready";

  if (totalScore >= 85) return "strong_candidate";
  if (totalScore >= 65) return "ready";
  if (totalScore >= 40) return "approaching";
  return "not_ready";
}

function makeEmptyScore(
  processSlug: string,
  stepId: string,
  purpose: ModelPurpose,
): SlmReadinessScore {
  return {
    processSlug,
    stepId,
    purpose,
    score: 0,
    signals: {
      volume: { count: 0, threshold: DEFAULT_READINESS_THRESHOLDS.volumeReady, score: 0 },
      consistency: { approvalRate: 0, threshold: DEFAULT_READINESS_THRESHOLDS.consistencyReady, score: 0 },
      purposeFit: { purpose, isSlmSuitable: (SLM_SUITABLE_PURPOSES as readonly string[]).includes(purpose), score: 0 },
      costImpact: { currentAvgCostCents: 0, estimatedSlmCostCents: 0.01, score: 0 },
      structuralSimplicity: { avgInputTokens: 0, avgOutputTokens: 0, score: 0 },
    },
    recommendation: "not_ready",
    estimatedMonthlySavingsCents: 0,
  };
}
