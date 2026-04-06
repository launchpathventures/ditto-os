/**
 * Tests for network SSE event emitter with ring buffer.
 * Provenance: Brief 089 AC 6-8.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  emitNetworkEvent,
  getEventsAfter,
  subscribeToUser,
  formatSSE,
  _resetForTesting,
} from "./network-events";

describe("network-events", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  // ============================================================
  // Ring Buffer
  // ============================================================

  describe("ring buffer", () => {
    it("stores events and retrieves them by user", () => {
      emitNetworkEvent("user-1", "reply_received", { personId: "p1" });
      emitNetworkEvent("user-1", "draft_ready", { personId: "p2" });

      const events = getEventsAfter("user-1", 0);
      expect(events).toHaveLength(2);
      expect(events![0].type).toBe("reply_received");
      expect(events![1].type).toBe("draft_ready");
    });

    it("isolates events by user", () => {
      emitNetworkEvent("user-1", "reply_received", { personId: "p1" });
      emitNetworkEvent("user-2", "draft_ready", { personId: "p2" });

      const events1 = getEventsAfter("user-1", 0);
      const events2 = getEventsAfter("user-2", 0);

      expect(events1).toHaveLength(1);
      expect(events1![0].type).toBe("reply_received");

      expect(events2).toHaveLength(1);
      expect(events2![0].type).toBe("draft_ready");
    });

    it("assigns monotonically increasing IDs", () => {
      const id1 = emitNetworkEvent("user-1", "a", {});
      const id2 = emitNetworkEvent("user-1", "b", {});
      const id3 = emitNetworkEvent("user-2", "c", {});

      expect(id2).toBeGreaterThan(id1);
      expect(id3).toBeGreaterThan(id2);
    });

    it("evicts oldest events when buffer is full", () => {
      // Fill buffer with 100 events (IDs 1-100)
      for (let i = 0; i < 100; i++) {
        emitNetworkEvent("user-1", `event-${i}`, { i });
      }

      // All 100 events retrievable — ask for events after id=0
      let events = getEventsAfter("user-1", 0);
      expect(events).toHaveLength(100);

      // Add one more — should evict the oldest (id=1, type=event-0)
      emitNetworkEvent("user-1", "event-100", { i: 100 });

      // Now buffer has IDs 2-101. Ask for events after id=1 (still in range)
      events = getEventsAfter("user-1", 1);
      expect(events).toHaveLength(100);
      expect(events![0].type).toBe("event-1"); // event-0 (id=1) was evicted
      expect(events![99].type).toBe("event-100");
    });
  });

  // ============================================================
  // Replay / Reconnection
  // ============================================================

  describe("reconnection replay", () => {
    it("replays events after a given ID", () => {
      const id1 = emitNetworkEvent("user-1", "a", {});
      emitNetworkEvent("user-1", "b", {});
      emitNetworkEvent("user-1", "c", {});

      const events = getEventsAfter("user-1", id1);
      expect(events).toHaveLength(2);
      expect(events![0].type).toBe("b");
      expect(events![1].type).toBe("c");
    });

    it("returns empty array when no events after ID", () => {
      const lastId = emitNetworkEvent("user-1", "a", {});

      const events = getEventsAfter("user-1", lastId);
      expect(events).toHaveLength(0);
    });

    it("returns null (sync_required) when gap exceeds buffer", () => {
      // Fill and overflow buffer
      for (let i = 0; i < 110; i++) {
        emitNetworkEvent("user-1", `event-${i}`, {});
      }

      // Ask for events after ID 1 (which was evicted)
      const events = getEventsAfter("user-1", 1);
      expect(events).toBeNull(); // sync_required
    });

    it("returns empty array for user with no events", () => {
      const events = getEventsAfter("user-1", 0);
      expect(events).toHaveLength(0);
    });
  });

  // ============================================================
  // Subscribers
  // ============================================================

  describe("subscribers", () => {
    it("pushes events to subscribers in real-time", () => {
      const received: string[] = [];

      subscribeToUser("user-1", (event) => {
        received.push(event.type);
      });

      emitNetworkEvent("user-1", "reply_received", {});
      emitNetworkEvent("user-1", "draft_ready", {});

      expect(received).toEqual(["reply_received", "draft_ready"]);
    });

    it("does not push events for other users", () => {
      const received: string[] = [];

      subscribeToUser("user-1", (event) => {
        received.push(event.type);
      });

      emitNetworkEvent("user-2", "reply_received", {});

      expect(received).toEqual([]);
    });

    it("unsubscribe stops event delivery", () => {
      const received: string[] = [];

      const unsubscribe = subscribeToUser("user-1", (event) => {
        received.push(event.type);
      });

      emitNetworkEvent("user-1", "a", {});
      unsubscribe();
      emitNetworkEvent("user-1", "b", {});

      expect(received).toEqual(["a"]);
    });

    it("supports multiple subscribers per user", () => {
      const received1: string[] = [];
      const received2: string[] = [];

      subscribeToUser("user-1", (event) => received1.push(event.type));
      subscribeToUser("user-1", (event) => received2.push(event.type));

      emitNetworkEvent("user-1", "a", {});

      expect(received1).toEqual(["a"]);
      expect(received2).toEqual(["a"]);
    });
  });

  // ============================================================
  // SSE Formatting
  // ============================================================

  describe("formatSSE", () => {
    it("formats event as SSE message with id and data", () => {
      const event = {
        id: 42,
        type: "reply_received",
        payload: { personId: "p1" },
        timestamp: Date.now(),
      };

      const sse = formatSSE(event);
      expect(sse).toContain("id: 42\n");
      expect(sse).toContain("data: ");
      expect(sse).toContain('"type":"reply_received"');
      expect(sse).toContain('"personId":"p1"');
      expect(sse.endsWith("\n\n")).toBe(true);
    });
  });
});
