/**
 * Ditto — Network Event Emitter (SSE)
 *
 * In-memory ring buffer per user for Network → Workspace event delivery.
 * Supports SSE reconnection via Last-Event-ID header.
 * When the gap exceeds the buffer size, sends a `sync_required` event.
 *
 * Provenance: Brief 089, ADR-025 (SSE reconnection model).
 */

// ============================================================
// Event Types
// ============================================================

export interface NetworkEvent {
  type: string;
  userId: string;
  payload: Record<string, unknown>;
}

interface BufferedEvent {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ============================================================
// Ring Buffer
// ============================================================

const BUFFER_SIZE = 100;

/** Per-user ring buffers */
const userBuffers = new Map<string, BufferedEvent[]>();

/** Global monotonically increasing event ID */
let nextEventId = 1;

/** Per-user subscribers (SSE writers) */
type Subscriber = (event: BufferedEvent) => void;
const subscribers = new Map<string, Set<Subscriber>>();

/**
 * Get or create the ring buffer for a user.
 */
function getBuffer(userId: string): BufferedEvent[] {
  let buffer = userBuffers.get(userId);
  if (!buffer) {
    buffer = [];
    userBuffers.set(userId, buffer);
  }
  return buffer;
}

// ============================================================
// Emit
// ============================================================

/**
 * Emit an event for a user. Stored in the ring buffer and pushed to
 * all active SSE subscribers for that user.
 */
export function emitNetworkEvent(userId: string, type: string, payload: Record<string, unknown>): number {
  const id = nextEventId++;
  const event: BufferedEvent = {
    id,
    type,
    payload,
    timestamp: Date.now(),
  };

  // Add to ring buffer
  const buffer = getBuffer(userId);
  if (buffer.length >= BUFFER_SIZE) {
    buffer.shift(); // Remove oldest
  }
  buffer.push(event);

  // Push to active subscribers
  const subs = subscribers.get(userId);
  if (subs) {
    for (const sub of subs) {
      try {
        sub(event);
      } catch {
        // Subscriber errored — will be cleaned up on disconnect
      }
    }
  }

  return id;
}

// ============================================================
// Subscribe / Unsubscribe
// ============================================================

/**
 * Subscribe to events for a user. Returns an unsubscribe function.
 */
export function subscribeToUser(userId: string, callback: Subscriber): () => void {
  let subs = subscribers.get(userId);
  if (!subs) {
    subs = new Set();
    subscribers.set(userId, subs);
  }
  subs.add(callback);

  return () => {
    subs!.delete(callback);
    if (subs!.size === 0) {
      subscribers.delete(userId);
    }
  };
}

// ============================================================
// Replay (reconnection support)
// ============================================================

/**
 * Get events after a given ID for replay on reconnection.
 * Returns null if the gap exceeds the buffer (sync_required).
 */
export function getEventsAfter(userId: string, lastEventId: number): BufferedEvent[] | null {
  const buffer = getBuffer(userId);

  if (buffer.length === 0) {
    return [];
  }

  // lastEventId=0 means fresh connection — return all buffered events
  if (lastEventId === 0) {
    return [...buffer];
  }

  // Check if the oldest buffered event is newer than lastEventId + 1
  // If so, there's a gap we can't fill — client needs full sync
  const oldestInBuffer = buffer[0].id;
  if (lastEventId < oldestInBuffer - 1) {
    return null;
  }

  // Return events after lastEventId
  return buffer.filter((e) => e.id > lastEventId);
}

// ============================================================
// SSE Writer
// ============================================================

/**
 * Format a buffered event as an SSE message.
 */
export function formatSSE(event: BufferedEvent): string {
  const data = JSON.stringify({ type: event.type, ...event.payload });
  return `id: ${event.id}\ndata: ${data}\n\n`;
}

/**
 * Create an SSE ReadableStream for a user with reconnection support.
 */
export function createSSEStream(
  userId: string,
  lastEventId?: number,
): { stream: ReadableStream; cleanup: () => void } {
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Replay missed events on reconnection
      if (lastEventId !== undefined && lastEventId > 0) {
        const missed = getEventsAfter(userId, lastEventId);
        if (missed === null) {
          // Gap exceeds buffer — send sync_required
          controller.enqueue(
            encoder.encode(
              `id: ${nextEventId}\ndata: ${JSON.stringify({ type: "sync_required" })}\n\n`,
            ),
          );
        } else {
          for (const event of missed) {
            controller.enqueue(encoder.encode(formatSSE(event)));
          }
        }
      }

      // Send connected event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`),
      );

      // Subscribe to new events
      unsubscribe = subscribeToUser(userId, (event) => {
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          // Stream closed
        }
      });

      // Keepalive every 30 seconds
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 30000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  const cleanup = () => {
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
  };

  return { stream, cleanup };
}

// ============================================================
// Testing helpers
// ============================================================

/**
 * Reset all buffers and subscribers (for testing).
 */
export function _resetForTesting(): void {
  userBuffers.clear();
  subscribers.clear();
  nextEventId = 1;
}
