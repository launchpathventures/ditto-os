/**
 * @ditto/core — Trust Diff
 *
 * Structured diff computation for edit feedback.
 * Uses jsdiff (diffWords) to compute word-level diffs,
 * then classifies edit severity using WikiTrust/revscoring thresholds.
 *
 * Provenance: kpdecker/jsdiff, WikiTrust analysis, wikimedia/revscoring
 */

import { diffWords, type Change } from "diff";
import type { EditSeverity } from "../db/schema.js";

export type { Change };

export interface DiffStats {
  wordsAdded: number;
  wordsRemoved: number;
  wordsUnchanged: number;
}

export interface StructuredDiff {
  changes: Change[];
  stats: DiffStats;
}

/**
 * Compute a word-level structured diff between original and edited text.
 */
export function computeStructuredDiff(original: string, edited: string): StructuredDiff {
  const changes = diffWords(original, edited);
  let wordsAdded = 0;
  let wordsRemoved = 0;
  let wordsUnchanged = 0;

  for (const change of changes) {
    const wordCount = change.value.split(/\s+/).filter(Boolean).length;
    if (change.added) wordsAdded += wordCount;
    else if (change.removed) wordsRemoved += wordCount;
    else wordsUnchanged += wordCount;
  }

  return { changes, stats: { wordsAdded, wordsRemoved, wordsUnchanged } };
}

/**
 * Compute edit ratio: proportion of words changed relative to total.
 */
export function computeEditRatio(stats: DiffStats): number {
  const total = stats.wordsAdded + stats.wordsRemoved + stats.wordsUnchanged;
  if (total === 0) return 0;
  return (stats.wordsAdded + stats.wordsRemoved) / total;
}

/**
 * Classify edit severity based on edit ratio.
 * Thresholds from WikiTrust reputation scoring.
 */
export function classifyEditSeverity(editRatio: number): EditSeverity {
  if (editRatio < 0.1) return "formatting";
  if (editRatio <= 0.3) return "correction";
  if (editRatio <= 0.6) return "revision";
  return "rewrite";
}

/**
 * Full edit classification pipeline.
 * Combines diff computation, ratio calculation, and severity classification.
 */
export function classifyEdit(
  original: string,
  edited: string,
): {
  diff: StructuredDiff;
  editRatio: number;
  editSeverity: EditSeverity;
} {
  const diff = computeStructuredDiff(original, edited);
  const editRatio = computeEditRatio(diff.stats);
  const editSeverity = classifyEditSeverity(editRatio);
  return { diff, editRatio, editSeverity };
}
