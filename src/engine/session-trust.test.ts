/**
 * Tests for Brief 053 — Session-Scoped Trust Override Store
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the events module before importing session-trust
vi.mock("./events", () => {
  const listeners: Array<(event: unknown) => void> = [];
  return {
    harnessEvents: {
      on: (listener: (event: unknown) => void) => {
        listeners.push(listener);
        return () => {
          const idx = listeners.indexOf(listener);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
      emit: (event: unknown) => {
        for (const l of listeners) l(event);
      },
    },
  };
});

const { setSessionTrust, getSessionTrustOverride, clearSessionTrust, hasSessionTrust } =
  await import("./session-trust");
const { harnessEvents } = await import("./events");

describe("session-trust", () => {
  beforeEach(() => {
    // Clear any leftover state
    clearSessionTrust("test-run-1");
    clearSessionTrust("test-run-2");
  });

  describe("setSessionTrust", () => {
    it("stores valid overrides for non-protected roles", () => {
      const { stored, errors } = setSessionTrust("test-run-1", {
        researcher: "spot_checked",
        designer: "spot_checked",
      });

      expect(Object.keys(stored)).toHaveLength(2);
      expect(stored.researcher).toBe("spot_checked");
      expect(stored.designer).toBe("spot_checked");
      expect(errors).toHaveLength(0);
    });

    it("rejects builder role override (maker-checker)", () => {
      const { stored, errors } = setSessionTrust("test-run-1", {
        builder: "spot_checked",
      });

      expect(Object.keys(stored)).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].role).toBe("builder");
      expect(errors[0].reason).toContain("maker-checker");
    });

    it("rejects reviewer role override (maker-checker)", () => {
      const { stored, errors } = setSessionTrust("test-run-1", {
        reviewer: "spot_checked",
      });

      expect(Object.keys(stored)).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].role).toBe("reviewer");
    });

    it("rejects autonomous tier (max relaxation is spot_checked)", () => {
      const { stored, errors } = setSessionTrust("test-run-1", {
        researcher: "autonomous",
      });

      expect(Object.keys(stored)).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].reason).toContain("autonomous");
    });

    it("rejects critical tier (overrides can only relax)", () => {
      const { stored, errors } = setSessionTrust("test-run-1", {
        researcher: "critical",
      });

      expect(Object.keys(stored)).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].reason).toContain("only relax");
    });

    it("handles mixed valid and invalid overrides", () => {
      const { stored, errors } = setSessionTrust("test-run-1", {
        researcher: "spot_checked",
        builder: "spot_checked",
        designer: "autonomous",
      });

      expect(Object.keys(stored)).toHaveLength(1);
      expect(stored.researcher).toBe("spot_checked");
      expect(errors).toHaveLength(2);
    });
  });

  describe("getSessionTrustOverride", () => {
    it("returns override when set", () => {
      setSessionTrust("test-run-1", { researcher: "spot_checked" });
      expect(getSessionTrustOverride("test-run-1", "researcher")).toBe("spot_checked");
    });

    it("returns undefined for unset roles", () => {
      setSessionTrust("test-run-1", { researcher: "spot_checked" });
      expect(getSessionTrustOverride("test-run-1", "designer")).toBeUndefined();
    });

    it("returns undefined for unknown run IDs", () => {
      expect(getSessionTrustOverride("unknown-run", "researcher")).toBeUndefined();
    });
  });

  describe("clearSessionTrust", () => {
    it("removes overrides for a run", () => {
      setSessionTrust("test-run-1", { researcher: "spot_checked" });
      expect(hasSessionTrust("test-run-1")).toBe(true);

      clearSessionTrust("test-run-1");
      expect(hasSessionTrust("test-run-1")).toBe(false);
      expect(getSessionTrustOverride("test-run-1", "researcher")).toBeUndefined();
    });
  });

  describe("auto-cleanup on run events", () => {
    it("clears overrides on run-complete", () => {
      setSessionTrust("test-run-1", { researcher: "spot_checked" });
      expect(hasSessionTrust("test-run-1")).toBe(true);

      harnessEvents.emit({
        type: "run-complete",
        processRunId: "test-run-1",
        processName: "Test",
        stepsExecuted: 3,
      });

      expect(hasSessionTrust("test-run-1")).toBe(false);
    });

    it("clears overrides on run-failed", () => {
      setSessionTrust("test-run-1", { researcher: "spot_checked" });

      harnessEvents.emit({
        type: "run-failed",
        processRunId: "test-run-1",
        processName: "Test",
        error: "something broke",
      });

      expect(hasSessionTrust("test-run-1")).toBe(false);
    });

    it("does not clear overrides for other runs", () => {
      setSessionTrust("test-run-1", { researcher: "spot_checked" });
      setSessionTrust("test-run-2", { designer: "spot_checked" });

      harnessEvents.emit({
        type: "run-complete",
        processRunId: "test-run-1",
        processName: "Test",
        stepsExecuted: 3,
      });

      expect(hasSessionTrust("test-run-1")).toBe(false);
      expect(hasSessionTrust("test-run-2")).toBe(true);
    });
  });
});
