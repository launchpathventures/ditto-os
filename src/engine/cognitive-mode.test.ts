/**
 * Ditto — Cognitive Mode Extension Tests (Brief 114)
 *
 * Tests for mode extension loading, mode resolution, and persona guards.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getCognitiveModeExtension,
  clearCognitiveCoreCache,
  getCognitiveCoreCompact,
} from "./cognitive-core";
import { resolveModeFromProcess } from "./cognitive-mode-resolver";

describe("cognitive-mode-extensions", () => {
  beforeEach(() => {
    clearCognitiveCoreCache();
  });

  // ============================================================
  // getCognitiveModeExtension — loading
  // ============================================================

  describe("getCognitiveModeExtension", () => {
    it("returns content for connecting mode", () => {
      const content = getCognitiveModeExtension("connecting");
      expect(content).toBeTruthy();
      expect(content).toContain("Mode: Connecting");
      expect(content).toContain("Optimization Target");
      expect(content).toContain("Mutual value");
    });

    it("returns content for nurturing mode", () => {
      const content = getCognitiveModeExtension("nurturing");
      expect(content).toBeTruthy();
      expect(content).toContain("Mode: Nurturing");
      expect(content).toContain("Relationship continuity");
    });

    it("returns content for selling mode", () => {
      const content = getCognitiveModeExtension("selling");
      expect(content).toBeTruthy();
      expect(content).toContain("Mode: Selling");
      expect(content).toContain("User's Agent");
    });

    it("returns content for chief-of-staff mode", () => {
      const content = getCognitiveModeExtension("chief-of-staff");
      expect(content).toBeTruthy();
      expect(content).toContain("Mode: Chief of Staff");
      expect(content).toContain("operational clarity");
    });

    it("returns empty string for nonexistent mode", () => {
      const content = getCognitiveModeExtension("nonexistent");
      expect(content).toBe("");
    });

    it("caches after first load", () => {
      const first = getCognitiveModeExtension("connecting");
      const second = getCognitiveModeExtension("connecting");
      expect(first).toBe(second); // same reference
    });

    it("clearCognitiveCoreCache clears mode cache", () => {
      const first = getCognitiveModeExtension("connecting");
      expect(first).toBeTruthy();
      clearCognitiveCoreCache();
      const second = getCognitiveModeExtension("connecting");
      // Content equal but not necessarily same reference after cache clear
      expect(second).toEqual(first);
    });
  });

  // ============================================================
  // resolveModeFromProcess — mode resolution
  // ============================================================

  describe("resolveModeFromProcess", () => {
    // Alex/Mira operator
    it('resolves "connecting" for alex-or-mira + connecting-introduction', () => {
      expect(resolveModeFromProcess("alex-or-mira", "connecting-introduction")).toBe("connecting");
    });

    it('resolves "connecting" for alex-or-mira + connecting-research', () => {
      expect(resolveModeFromProcess("alex-or-mira", "connecting-research")).toBe("connecting");
    });

    it('resolves "nurturing" for alex-or-mira + network-nurture', () => {
      expect(resolveModeFromProcess("alex-or-mira", "network-nurture")).toBe("nurturing");
    });

    it("returns null for alex-or-mira + unknown process", () => {
      expect(resolveModeFromProcess("alex-or-mira", "some-random-process")).toBeNull();
    });

    // Persona guard: selling mode BLOCKED for alex-or-mira
    it("returns null for alex-or-mira + selling-outreach (persona guard)", () => {
      expect(resolveModeFromProcess("alex-or-mira", "selling-outreach")).toBeNull();
    });

    // User agent operator
    it('resolves "selling" for user-agent + selling-outreach', () => {
      expect(resolveModeFromProcess("user-agent", "selling-outreach")).toBe("selling");
    });

    it('resolves "selling" for user-agent + follow-up-sequences', () => {
      expect(resolveModeFromProcess("user-agent", "follow-up-sequences")).toBe("selling");
    });

    it("returns null for user-agent + unknown process", () => {
      expect(resolveModeFromProcess("user-agent", "some-random-process")).toBeNull();
    });

    // Ditto operator
    it('resolves "chief-of-staff" for ditto + weekly-briefing', () => {
      expect(resolveModeFromProcess("ditto", "weekly-briefing")).toBe("chief-of-staff");
    });

    it('resolves "chief-of-staff" for ditto + front-door-cos-intake', () => {
      expect(resolveModeFromProcess("ditto", "front-door-cos-intake")).toBe("chief-of-staff");
    });

    it('resolves "chief-of-staff" for ditto + analytics-reporting', () => {
      expect(resolveModeFromProcess("ditto", "analytics-reporting")).toBe("chief-of-staff");
    });

    it('resolves "chief-of-staff" for ditto + pipeline-tracking', () => {
      expect(resolveModeFromProcess("ditto", "pipeline-tracking")).toBe("chief-of-staff");
    });

    it('resolves "chief-of-staff" for ditto + inbox-triage', () => {
      expect(resolveModeFromProcess("ditto", "inbox-triage")).toBe("chief-of-staff");
    });

    it('resolves "chief-of-staff" for ditto + meeting-prep', () => {
      expect(resolveModeFromProcess("ditto", "meeting-prep")).toBe("chief-of-staff");
    });

    it("returns null for ditto + unknown process", () => {
      expect(resolveModeFromProcess("ditto", "some-unknown-process")).toBeNull();
    });

    // No operator
    it("returns null when operator is undefined", () => {
      expect(resolveModeFromProcess(undefined, "some-process")).toBeNull();
    });

    it("returns null when operator is null", () => {
      expect(resolveModeFromProcess(null, "some-process")).toBeNull();
    });

    // Unknown operator
    it("returns null for unknown operator", () => {
      expect(resolveModeFromProcess("system", "library-curation")).toBeNull();
    });
  });

  // ============================================================
  // Token budget — compact core + mode extension under 1000 tokens
  // ============================================================

  describe("token budget", () => {
    const CHARS_PER_TOKEN = 4;
    const MAX_TOKENS = 1000;

    for (const mode of ["connecting", "nurturing", "selling", "chief-of-staff"]) {
      it(`compact core + ${mode} mode stays under ${MAX_TOKENS} tokens`, () => {
        const compactCore = getCognitiveCoreCompact();
        const modeExtension = getCognitiveModeExtension(mode);
        const combined = compactCore + "\n\n" + modeExtension;
        const estimatedTokens = Math.ceil(combined.length / CHARS_PER_TOKEN);
        expect(estimatedTokens).toBeLessThan(MAX_TOKENS);
      });
    }
  });

  // ============================================================
  // Content verification — mode files have required sections
  // ============================================================

  describe("mode content", () => {
    it("connecting mode has three litmus tests (Insight-166)", () => {
      const content = getCognitiveModeExtension("connecting");
      expect(content).toContain("Reverse Test");
      expect(content).toContain("Reputation Test");
      expect(content).toContain("Network Test");
    });

    it("all modes have required sections", () => {
      for (const mode of ["connecting", "nurturing", "selling", "chief-of-staff"]) {
        const content = getCognitiveModeExtension(mode);
        expect(content).toContain("Optimization Target");
        expect(content).toContain("Threshold Calibration");
        expect(content).toContain("Refusal Pattern");
        expect(content).toContain("Escalation Triggers");
        expect(content).toContain("Silence Conditions");
      }
    });
  });
});
