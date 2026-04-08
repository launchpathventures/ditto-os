/**
 * Ditto — Cognitive Core Tests
 *
 * Tests for the universal judgment layer loader.
 * Verifies loading, caching, compact extraction, fallback,
 * and that all required sections are present in core.md.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getCognitiveCore,
  getCognitiveCoreCompact,
  clearCognitiveCoreCache,
} from "./cognitive-core";

describe("cognitive-core", () => {
  beforeEach(() => {
    clearCognitiveCoreCache();
  });

  // ============================================================
  // Loading
  // ============================================================

  describe("getCognitiveCore", () => {
    it("returns content from cognitive/core.md", () => {
      const core = getCognitiveCore();
      expect(core).toBeTruthy();
      expect(core.length).toBeGreaterThan(100);
    });

    it("caches after first load", () => {
      const first = getCognitiveCore();
      const second = getCognitiveCore();
      // Same reference — cached
      expect(first).toBe(second);
    });

    it("clearCognitiveCoreCache clears the cache", () => {
      const first = getCognitiveCore();
      clearCognitiveCoreCache();
      const second = getCognitiveCore();
      // Content should be equal but not necessarily same reference after cache clear
      expect(second).toEqual(first);
    });
  });

  // ============================================================
  // Content Verification — all required sections present
  // ============================================================

  describe("core content", () => {
    it("contains consultative protocol", () => {
      const core = getCognitiveCore();
      expect(core).toContain("Consultative Protocol");
      expect(core).toContain("Listen");
      expect(core).toContain("Assess clarity");
      expect(core).toContain("Reflect back");
    });

    it("contains house values", () => {
      const core = getCognitiveCore();
      expect(core).toContain("House Values");
      expect(core).toContain("Candour over comfort");
      expect(core).toContain("Reputation is the product");
      expect(core).toContain("Earned trust");
      expect(core).toContain("No spam, ever");
      expect(core).toContain("The human decides");
    });

    it("contains transparency & consent section", () => {
      const core = getCognitiveCore();
      expect(core).toContain("Transparency & Consent");
      expect(core).toContain("explain what you'll do");
      expect(core).toContain("informed consent");
      expect(core).toContain("invite questions");
    });

    it("contains trade-off heuristics", () => {
      const core = getCognitiveCore();
      expect(core).toContain("Trade-Off Heuristics");
      expect(core).toContain("Competence over personality");
      expect(core).toContain("Human judgment over AI confidence");
    });

    it("contains metacognitive checks", () => {
      const core = getCognitiveCore();
      expect(core).toContain("Metacognitive Checks");
      expect(core).toContain("Context sufficiency");
      expect(core).toContain("Confidence calibration");
      expect(core).toContain("Assumption detection");
    });

    it("contains escalation sensitivity", () => {
      const core = getCognitiveCore();
      expect(core).toContain("Escalation Sensitivity");
      expect(core).toContain("fairly confident");
      expect(core).toContain("out of your depth");
    });

    it("contains communication principles", () => {
      const core = getCognitiveCore();
      expect(core).toContain("Communication");
      expect(core).toContain("Competent");
      expect(core).toContain("Direct");
      expect(core).toContain("Warm");
      expect(core).toContain("Purposeful");
    });

    it("does NOT contain workspace-specific content", () => {
      const core = getCognitiveCore();
      expect(core).not.toContain("Dev Pipeline");
      expect(core).not.toContain("Planning Conversations");
      expect(core).not.toContain("Draft-First Refinement");
      expect(core).not.toContain("suggest_next");
    });
  });

  // ============================================================
  // Compact variant
  // ============================================================

  describe("getCognitiveCoreCompact", () => {
    it("returns a subset of the full core", () => {
      const full = getCognitiveCore();
      const compact = getCognitiveCoreCompact();
      expect(compact.length).toBeLessThan(full.length);
      expect(compact.length).toBeGreaterThan(50);
    });

    it("contains trade-off heuristics", () => {
      const compact = getCognitiveCoreCompact();
      expect(compact).toContain("Trade-Off Heuristics");
      expect(compact).toContain("Human judgment over AI confidence");
    });

    it("contains escalation sensitivity", () => {
      const compact = getCognitiveCoreCompact();
      expect(compact).toContain("Escalation Sensitivity");
    });

    it("does NOT contain full consultative protocol", () => {
      const compact = getCognitiveCoreCompact();
      expect(compact).not.toContain("Consultative Protocol");
    });

    it("does NOT contain house values", () => {
      const compact = getCognitiveCoreCompact();
      expect(compact).not.toContain("House Values");
    });

    it("caches after first load", () => {
      const first = getCognitiveCoreCompact();
      const second = getCognitiveCoreCompact();
      expect(first).toBe(second);
    });
  });
});
