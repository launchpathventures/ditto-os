/**
 * @ditto/core — Learning Module Types
 *
 * Type contracts for SLM training data extraction and readiness scoring.
 * These are engine-generic interfaces — any harness consumer can implement
 * against their own schema.
 *
 * Provenance: Insight-175 (trust system as training data flywheel), Brief 135/136.
 */

import type { ModelPurpose } from "../llm/index.js";

// ============================================================
// Training Data Types
// ============================================================

/** A single labeled training example from a step run */
export interface TrainingExample {
  /** Unique ID for deduplication */
  id: string;
  /** The process and step this example came from */
  processSlug: string;
  stepId: string;
  /** The purpose class (classification, extraction, etc.) */
  purpose: ModelPurpose;
  /** System prompt used for this step (excluded when excludeSystemPrompts is true) */
  systemPrompt: string;
  /** Input to the step (the user/context message) */
  input: string;
  /** Output from the step (the approved response) */
  output: string;
  /** Whether this was directly approved or edited-then-approved */
  label: "approved" | "edited";
  /** If edited, the final (corrected) output — this is the training target */
  correctedOutput?: string;
  /** Model that produced the original output */
  sourceModel: string;
  /** Timestamp */
  createdAt: Date;
}

/** A complete training data export for a (process, step) pair */
export interface TrainingDataExport {
  processSlug: string;
  stepId: string;
  purpose: ModelPurpose;
  examples: TrainingExample[];
  /** Format: instruction-tuning JSONL compatible with OpenAI fine-tuning API */
  format: "jsonl";
  /** Stats */
  totalExamples: number;
  approvedCount: number;
  editedCount: number;
  rejectedCount: number;
}

/** Options for training data extraction */
export interface TrainingDataOptions {
  /** Mandatory scrubber function — callers must make a conscious choice */
  scrubber: (text: string) => string;
  /** The resolved ModelPurpose for this step (from model-purpose-resolver). Defaults to "classification". */
  purpose?: ModelPurpose;
}

// ============================================================
// Readiness Scoring Types
// ============================================================

/** Individual signal scores for SLM readiness */
export interface SlmReadinessSignals {
  volume: { count: number; threshold: number; score: number };
  consistency: { approvalRate: number; threshold: number; score: number };
  purposeFit: { purpose: ModelPurpose; isSlmSuitable: boolean; score: number };
  costImpact: { currentAvgCostCents: number; estimatedSlmCostCents: number; score: number };
  structuralSimplicity: { avgInputTokens: number; avgOutputTokens: number; score: number };
}

/** SLM readiness score for a (process, step) pair */
export interface SlmReadinessScore {
  processSlug: string;
  stepId: string;
  purpose: ModelPurpose;
  /** Readiness score 0-100 */
  score: number;
  /** Individual signal scores */
  signals: SlmReadinessSignals;
  /** Human-readable recommendation */
  recommendation: "not_ready" | "approaching" | "ready" | "strong_candidate";
  /** Estimated monthly cost savings if SLM deployed */
  estimatedMonthlySavingsCents: number;
}

/** Configurable thresholds for readiness scoring */
export interface SlmReadinessThresholds {
  /** Minimum approved examples for "ready" (default: 1000) */
  volumeReady: number;
  /** Minimum approved examples for "strong_candidate" (default: 5000) */
  volumeStrong: number;
  /** Minimum approval rate for "ready" (default: 0.90) */
  consistencyReady: number;
  /** Minimum approval rate for "strong_candidate" (default: 0.95) */
  consistencyStrong: number;
  /** Minimum avg cost per call in cents for cost signal to score (default: 0.5) */
  costMinCents: number;
  /** Higher cost threshold for stronger signal (default: 1.0) */
  costHighCents: number;
  /** Max avg input tokens for simplicity signal (default: 2000) */
  maxInputTokens: number;
  /** Max avg output tokens for simplicity signal (default: 500) */
  maxOutputTokens: number;
}

/** Default readiness thresholds */
export const DEFAULT_READINESS_THRESHOLDS: SlmReadinessThresholds = {
  volumeReady: 1000,
  volumeStrong: 5000,
  consistencyReady: 0.90,
  consistencyStrong: 0.95,
  costMinCents: 0.5,
  costHighCents: 1.0,
  maxInputTokens: 2000,
  maxOutputTokens: 500,
};

/** Purposes that are suitable for SLM fine-tuning */
export const SLM_SUITABLE_PURPOSES: readonly ModelPurpose[] = [
  "classification",
  "extraction",
] as const;
