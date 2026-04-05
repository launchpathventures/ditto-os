/**
 * Message Queue — Pure logic for conversation message queueing (Brief 062)
 *
 * Extracted from conversation.tsx for testability.
 * Manages queued messages during streaming: add, cancel, dispatch.
 *
 * Provenance: Brief 062 AC9-13, Claude.ai mid-stream input pattern.
 */

/** Queued message awaiting dispatch after stream completes */
export interface QueuedMessage {
  id: string;
  text: string;
}

/**
 * Add a message to the queue.
 * Returns new queue with the message appended.
 */
export function enqueueMessage(
  queue: QueuedMessage[],
  text: string,
  id?: string,
): QueuedMessage[] {
  const msg: QueuedMessage = {
    id: id ?? crypto.randomUUID(),
    text,
  };
  return [...queue, msg];
}

/**
 * Cancel (remove) a queued message by ID.
 * Returns new queue without the cancelled message.
 */
export function cancelQueuedMessage(
  queue: QueuedMessage[],
  id: string,
): QueuedMessage[] {
  return queue.filter((m) => m.id !== id);
}

/**
 * Dequeue the first message for dispatch.
 * Returns [dequeuedMessage, remainingQueue] or [null, originalQueue] if empty.
 */
export function dequeueFirst(
  queue: QueuedMessage[],
): [QueuedMessage | null, QueuedMessage[]] {
  if (queue.length === 0) return [null, queue];
  return [queue[0], queue.slice(1)];
}
