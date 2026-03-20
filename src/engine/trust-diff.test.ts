/**
 * Tests for trust-diff.ts
 * AC-5: Known edit pair produces correct severity classification
 * AC-6: Identical strings produce edit ratio 0
 */

import { describe, it, expect } from "vitest";
import {
  computeStructuredDiff,
  computeEditRatio,
  classifyEditSeverity,
  classifyEdit,
} from "./trust-diff";

describe("trust-diff", () => {
  describe("computeStructuredDiff", () => {
    it("computes word-level diff stats", () => {
      const diff = computeStructuredDiff(
        "The quick brown fox",
        "The slow brown fox",
      );
      expect(diff.stats.wordsRemoved).toBeGreaterThan(0);
      expect(diff.stats.wordsAdded).toBeGreaterThan(0);
      expect(diff.stats.wordsUnchanged).toBeGreaterThan(0);
    });

    it("AC-6: identical strings produce edit ratio 0", () => {
      const diff = computeStructuredDiff("hello world", "hello world");
      const ratio = computeEditRatio(diff.stats);
      expect(ratio).toBe(0);
      expect(diff.stats.wordsRemoved).toBe(0);
      expect(diff.stats.wordsAdded).toBe(0);
    });

    it("empty strings produce edit ratio 0", () => {
      const diff = computeStructuredDiff("", "");
      const ratio = computeEditRatio(diff.stats);
      expect(ratio).toBe(0);
    });
  });

  describe("classifyEditSeverity", () => {
    it("AC-5: formatting < 0.1", () => {
      expect(classifyEditSeverity(0.05)).toBe("formatting");
      expect(classifyEditSeverity(0.0)).toBe("formatting");
      expect(classifyEditSeverity(0.09)).toBe("formatting");
    });

    it("AC-5: correction 0.1-0.3", () => {
      expect(classifyEditSeverity(0.1)).toBe("correction");
      expect(classifyEditSeverity(0.2)).toBe("correction");
      expect(classifyEditSeverity(0.3)).toBe("correction");
    });

    it("AC-5: revision 0.3-0.6", () => {
      expect(classifyEditSeverity(0.31)).toBe("revision");
      expect(classifyEditSeverity(0.5)).toBe("revision");
      expect(classifyEditSeverity(0.6)).toBe("revision");
    });

    it("AC-5: rewrite > 0.6", () => {
      expect(classifyEditSeverity(0.61)).toBe("rewrite");
      expect(classifyEditSeverity(0.9)).toBe("rewrite");
      expect(classifyEditSeverity(1.0)).toBe("rewrite");
    });
  });

  describe("classifyEdit (full pipeline)", () => {
    it("small change is formatting", () => {
      // Change one word in a very long text — ratio must be < 0.1
      const original = "The quick brown fox jumps over the lazy dog in the park on a sunny day while birds sing in the trees and children play nearby on the green grass of the meadow";
      const edited = "The quick brown fox jumps over the lazy dog in the park on a warm day while birds sing in the trees and children play nearby on the green grass of the meadow";
      const result = classifyEdit(original, edited);
      expect(result.editSeverity).toBe("formatting");
      expect(result.editRatio).toBeLessThan(0.1);
    });

    it("moderate change is correction or revision", () => {
      const original = "The margin calculation uses 15% markup on all items";
      const edited = "The margin calculation uses 22% markup on labour items only";
      const result = classifyEdit(original, edited);
      expect(["correction", "revision"]).toContain(result.editSeverity);
    });

    it("complete rewrite", () => {
      const result = classifyEdit("completely different text here", "nothing in common at all");
      expect(result.editSeverity).toBe("rewrite");
      expect(result.editRatio).toBeGreaterThan(0.6);
    });
  });
});
