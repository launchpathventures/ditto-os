/**
 * Tests for workspace push module (Brief 154).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  pushBlocksToWorkspace,
  refreshWorkspaceView,
  _resetRateLimitsForTesting,
} from "./workspace-push";
import { _resetForTesting, getEventsAfter } from "./network-events";

// Set test mode to bypass stepRunId guard
process.env.DITTO_TEST_MODE = "true";

describe("workspace-push", () => {
  beforeEach(() => {
    _resetForTesting();
    _resetRateLimitsForTesting();
  });

  // ============================================================
  // pushBlocksToWorkspace
  // ============================================================

  describe("pushBlocksToWorkspace", () => {
    it("emits a workspace_blocks_push event", () => {
      const eventId = pushBlocksToWorkspace(
        "user-1",
        "clients",
        [{ type: "text", text: "Hello" } as any],
        "append",
        "step-1",
      );

      expect(eventId).not.toBeNull();

      const events = getEventsAfter("user-1", 0);
      expect(events).toHaveLength(1);
      expect(events![0].type).toBe("workspace_blocks_push");
      expect(events![0].payload.viewSlug).toBe("clients");
      expect(events![0].payload.mode).toBe("append");
      expect(Array.isArray(events![0].payload.blocks)).toBe(true);
    });

    it("returns null when rate limited", () => {
      // Push 20 events (max)
      for (let i = 0; i < 20; i++) {
        const id = pushBlocksToWorkspace(
          "user-1",
          "clients",
          [{ type: "text", text: `Block ${i}` } as any],
          "append",
          "step-1",
        );
        expect(id).not.toBeNull();
      }

      // 21st should be rate limited
      const result = pushBlocksToWorkspace(
        "user-1",
        "clients",
        [{ type: "text", text: "Blocked" } as any],
        "append",
        "step-1",
      );
      expect(result).toBeNull();
    });

    it("rate limits per user independently", () => {
      // Fill up user-1's rate limit
      for (let i = 0; i < 20; i++) {
        pushBlocksToWorkspace("user-1", "view", [{ type: "text", text: "x" } as any], "append", "s1");
      }

      // user-2 should still work
      const result = pushBlocksToWorkspace("user-2", "view", [{ type: "text", text: "x" } as any], "append", "s1");
      expect(result).not.toBeNull();
    });

    it("rejects without stepRunId in non-test mode", () => {
      const orig = process.env.DITTO_TEST_MODE;
      delete process.env.DITTO_TEST_MODE;

      const result = pushBlocksToWorkspace("user-1", "clients", [], "append");
      expect(result).toBeNull();

      process.env.DITTO_TEST_MODE = orig;
    });
  });

  // ============================================================
  // refreshWorkspaceView
  // ============================================================

  describe("refreshWorkspaceView", () => {
    it("emits a workspace_view_refresh event", () => {
      const eventId = refreshWorkspaceView("user-1", "clients");

      expect(eventId).not.toBeNull();

      const events = getEventsAfter("user-1", 0);
      expect(events).toHaveLength(1);
      expect(events![0].type).toBe("workspace_view_refresh");
      expect(events![0].payload.viewSlug).toBe("clients");
    });

    it("returns null when rate limited", () => {
      // Fill up rate limit
      for (let i = 0; i < 20; i++) {
        refreshWorkspaceView("user-1", "view");
      }

      const result = refreshWorkspaceView("user-1", "view");
      expect(result).toBeNull();
    });
  });
});
