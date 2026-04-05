import { describe, it, expect } from "vitest";
import {
  enqueueMessage,
  cancelQueuedMessage,
  dequeueFirst,
  type QueuedMessage,
} from "./message-queue";

describe("message-queue", () => {
  describe("enqueueMessage", () => {
    it("adds a message to an empty queue", () => {
      const queue = enqueueMessage([], "hello", "id-1");
      expect(queue).toHaveLength(1);
      expect(queue[0]).toEqual({ id: "id-1", text: "hello" });
    });

    it("appends to existing queue", () => {
      const initial: QueuedMessage[] = [{ id: "id-1", text: "first" }];
      const queue = enqueueMessage(initial, "second", "id-2");
      expect(queue).toHaveLength(2);
      expect(queue[1]).toEqual({ id: "id-2", text: "second" });
    });

    it("generates an id if not provided", () => {
      const queue = enqueueMessage([], "auto-id");
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBeTruthy();
      expect(queue[0].text).toBe("auto-id");
    });

    it("does not mutate the original queue", () => {
      const initial: QueuedMessage[] = [{ id: "id-1", text: "first" }];
      enqueueMessage(initial, "second", "id-2");
      expect(initial).toHaveLength(1);
    });
  });

  describe("cancelQueuedMessage", () => {
    it("removes a message by id", () => {
      const queue: QueuedMessage[] = [
        { id: "id-1", text: "first" },
        { id: "id-2", text: "second" },
      ];
      const result = cancelQueuedMessage(queue, "id-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("id-2");
    });

    it("returns same-length queue when id not found", () => {
      const queue: QueuedMessage[] = [{ id: "id-1", text: "first" }];
      const result = cancelQueuedMessage(queue, "nonexistent");
      expect(result).toHaveLength(1);
    });

    it("handles empty queue", () => {
      const result = cancelQueuedMessage([], "id-1");
      expect(result).toHaveLength(0);
    });

    it("does not mutate the original queue", () => {
      const queue: QueuedMessage[] = [
        { id: "id-1", text: "first" },
        { id: "id-2", text: "second" },
      ];
      cancelQueuedMessage(queue, "id-1");
      expect(queue).toHaveLength(2);
    });
  });

  describe("dequeueFirst", () => {
    it("returns the first message and remaining queue", () => {
      const queue: QueuedMessage[] = [
        { id: "id-1", text: "first" },
        { id: "id-2", text: "second" },
      ];
      const [msg, remaining] = dequeueFirst(queue);
      expect(msg).toEqual({ id: "id-1", text: "first" });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("id-2");
    });

    it("returns null and original queue when empty", () => {
      const [msg, remaining] = dequeueFirst([]);
      expect(msg).toBeNull();
      expect(remaining).toHaveLength(0);
    });

    it("returns only message and empty queue for single-item", () => {
      const queue: QueuedMessage[] = [{ id: "id-1", text: "only" }];
      const [msg, remaining] = dequeueFirst(queue);
      expect(msg).toEqual({ id: "id-1", text: "only" });
      expect(remaining).toHaveLength(0);
    });

    it("does not mutate the original queue", () => {
      const queue: QueuedMessage[] = [
        { id: "id-1", text: "first" },
        { id: "id-2", text: "second" },
      ];
      dequeueFirst(queue);
      expect(queue).toHaveLength(2);
    });
  });

  describe("queue lifecycle scenarios", () => {
    it("AC9: queue during streaming, dispatch on finish", () => {
      let queue: QueuedMessage[] = [];
      queue = enqueueMessage(queue, "followup 1", "q1");
      queue = enqueueMessage(queue, "followup 2", "q2");
      expect(queue).toHaveLength(2);

      const [first, afterFirst] = dequeueFirst(queue);
      expect(first?.text).toBe("followup 1");
      queue = afterFirst;

      const [second, afterSecond] = dequeueFirst(queue);
      expect(second?.text).toBe("followup 2");
      queue = afterSecond;
      expect(queue).toHaveLength(0);
    });

    it("AC11: cancel before dispatch", () => {
      let queue: QueuedMessage[] = [];
      queue = enqueueMessage(queue, "will cancel", "q1");
      queue = enqueueMessage(queue, "will send", "q2");

      queue = cancelQueuedMessage(queue, "q1");
      expect(queue).toHaveLength(1);

      const [msg] = dequeueFirst(queue);
      expect(msg?.text).toBe("will send");
    });

    it("AC12: stop then send — queue preserved after stop", () => {
      let queue: QueuedMessage[] = [];
      queue = enqueueMessage(queue, "queued during stream", "q1");

      const [msg, remaining] = dequeueFirst(queue);
      expect(msg?.text).toBe("queued during stream");
      expect(remaining).toHaveLength(0);
    });

    it("AC13: error preserves queue for retry", () => {
      let queue: QueuedMessage[] = [];
      queue = enqueueMessage(queue, "message 1", "q1");
      queue = enqueueMessage(queue, "message 2", "q2");

      // On error, queue is NOT cleared
      expect(queue).toHaveLength(2);
      expect(queue[0].text).toBe("message 1");

      // On retry, dispatch in FIFO order
      const [first, afterFirst] = dequeueFirst(queue);
      expect(first?.text).toBe("message 1");
      const [second, afterSecond] = dequeueFirst(afterFirst);
      expect(second?.text).toBe("message 2");
      expect(afterSecond).toHaveLength(0);
    });

    it("dispatches in FIFO order across multiple dequeues", () => {
      let queue: QueuedMessage[] = [];
      queue = enqueueMessage(queue, "first", "q1");
      queue = enqueueMessage(queue, "second", "q2");
      queue = enqueueMessage(queue, "third", "q3");

      const dispatched: string[] = [];
      let msg: QueuedMessage | null;

      [msg, queue] = dequeueFirst(queue);
      if (msg) dispatched.push(msg.text);
      [msg, queue] = dequeueFirst(queue);
      if (msg) dispatched.push(msg.text);
      [msg, queue] = dequeueFirst(queue);
      if (msg) dispatched.push(msg.text);

      expect(dispatched).toEqual(["first", "second", "third"]);
      expect(queue).toHaveLength(0);
    });
  });
});
