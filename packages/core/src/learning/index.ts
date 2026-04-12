/**
 * @ditto/core — Learning Module
 *
 * Type contracts for SLM training data extraction and readiness scoring.
 * Implementation lives in the consuming application (e.g., src/engine/).
 *
 * Brief 135/136.
 */

export type {
  TrainingExample,
  TrainingDataExport,
  TrainingDataOptions,
  SlmReadinessScore,
  SlmReadinessSignals,
  SlmReadinessThresholds,
} from "./types.js";

export {
  DEFAULT_READINESS_THRESHOLDS,
  SLM_SUITABLE_PURPOSES,
} from "./types.js";
