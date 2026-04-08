/**
 * @ditto/core — Process Models Schema (Brief 104)
 *
 * Re-exports process model types and table from the core schema.
 * The table definition lives in schema.ts (following the single-file pattern).
 * This file provides a convenient import path and houses the validation report types.
 */

export {
  processModels,
  processModelStatusValues,
  processModelComplexityValues,
  processModelSourceValues,
  type ProcessModelStatus,
  type ProcessModelComplexity,
  type ProcessModelSource,
} from "./schema.js";

// ============================================================
// Validation report types (used by process-validator + library-manager)
// ============================================================

export interface ValidationCheckResult {
  /** Check name: edge-case | compliance | efficiency | duplicate */
  check: string;
  /** What was tested */
  input: string;
  /** What was expected */
  expected: string;
  /** What actually happened */
  actual: string;
  /** Whether the check passed */
  pass: boolean;
  /** Optional details */
  details?: string;
}

export interface ValidationReport {
  /** Overall pass/fail */
  passed: boolean;
  /** Timestamp of validation */
  validatedAt: string;
  /** Individual check results */
  checks: ValidationCheckResult[];
  /** Summary recommendation */
  recommendation: string;
  /** Duplicate match info (if any) */
  duplicateMatch?: {
    slug: string;
    similarity: number;
    mergeRecommended: boolean;
  };
}
