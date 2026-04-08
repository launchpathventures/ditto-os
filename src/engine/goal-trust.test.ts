/**
 * Tests for goal trust inheritance (Brief 103)
 *
 * Tests cover:
 * - More restrictive tier resolution (AC8)
 * - Critical tier protection (AC9)
 * - Builder/reviewer role protection (AC9)
 * - Per-sub-goal overrides
 * - Validation
 */

import { describe, it, expect } from "vitest";
import { resolveSubGoalTrust, isValidGoalTrust, type GoalTrust } from "./goal-trust";

describe("goal trust", () => {
  describe("resolveSubGoalTrust", () => {
    it("returns the MORE RESTRICTIVE of goal and process tier (AC8)", () => {
      // Goal is supervised, process is autonomous → supervised wins
      const result = resolveSubGoalTrust(
        { goalTier: "supervised" },
        "autonomous",
      );
      expect(result.effectiveTier).toBe("supervised");
    });

    it("goal tier does not change process tier when goal is less restrictive", () => {
      // Goal is autonomous, process is supervised → supervised wins
      const result = resolveSubGoalTrust(
        { goalTier: "autonomous" },
        "supervised",
      );
      expect(result.effectiveTier).toBe("supervised");
    });

    it("same tiers resolve to that tier", () => {
      const result = resolveSubGoalTrust(
        { goalTier: "spot_checked" },
        "spot_checked",
      );
      expect(result.effectiveTier).toBe("spot_checked");
    });

    it("critical process tier cannot be relaxed (AC9)", () => {
      const result = resolveSubGoalTrust(
        { goalTier: "autonomous" },
        "critical",
      );
      expect(result.effectiveTier).toBe("critical");
      expect(result.wasRelaxed).toBe(false);
      expect(result.reasoning).toContain("critical");
    });

    it("builder role is protected — cannot be relaxed (AC9)", () => {
      const result = resolveSubGoalTrust(
        { goalTier: "autonomous" },
        "supervised",
        undefined,
        "builder",
      );
      // Should still be more restrictive, and flagged as protected
      expect(result.reasoning).toContain("builder");
      expect(result.reasoning).toContain("protected");
    });

    it("reviewer role is protected — cannot be relaxed (AC9)", () => {
      const result = resolveSubGoalTrust(
        { goalTier: "autonomous" },
        "supervised",
        undefined,
        "reviewer",
      );
      expect(result.reasoning).toContain("reviewer");
      expect(result.reasoning).toContain("protected");
    });

    it("per-sub-goal override takes precedence over goal tier", () => {
      const goalTrust: GoalTrust = {
        goalTier: "autonomous",
        subGoalOverrides: {
          "sg-1": "critical",
        },
      };

      const result = resolveSubGoalTrust(goalTrust, "supervised", "sg-1");
      // Override is critical, process is supervised → critical wins
      expect(result.effectiveTier).toBe("critical");
    });

    it("falls back to goal tier when no sub-goal override exists", () => {
      const goalTrust: GoalTrust = {
        goalTier: "supervised",
        subGoalOverrides: {
          "sg-other": "critical",
        },
      };

      const result = resolveSubGoalTrust(goalTrust, "autonomous", "sg-1");
      // Goal is supervised, process is autonomous → supervised wins
      expect(result.effectiveTier).toBe("supervised");
    });

    it("tightening from autonomous to critical works", () => {
      const result = resolveSubGoalTrust(
        { goalTier: "critical" },
        "autonomous",
      );
      expect(result.effectiveTier).toBe("critical");
    });
  });

  describe("isValidGoalTrust", () => {
    it("accepts valid goal trust", () => {
      expect(isValidGoalTrust({ goalTier: "supervised" })).toBe(true);
      expect(isValidGoalTrust({
        goalTier: "autonomous",
        subGoalOverrides: { "sg-1": "critical" },
      })).toBe(true);
    });

    it("rejects invalid tier", () => {
      expect(isValidGoalTrust({ goalTier: "invalid" as any })).toBe(false);
    });

    it("rejects invalid sub-goal override tier", () => {
      expect(isValidGoalTrust({
        goalTier: "supervised",
        subGoalOverrides: { "sg-1": "bogus" as any },
      })).toBe(false);
    });
  });
});
