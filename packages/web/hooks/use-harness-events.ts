"use client";

import { useEffect, useCallback, useRef, useState } from "react";

/**
 * Hook for subscribing to real-time harness events via SSE.
 *
 * Connects to /api/events and emits parsed events to a callback.
 * Auto-reconnects on connection loss.
 *
 * AC8: SSE events (step-complete, gate-pause, gate-advance, run-complete)
 */

export interface HarnessEventData {
  type: string;
  processRunId?: string;
  stepId?: string;
  processName?: string;
  [key: string]: unknown;
}

interface UseHarnessEventsOptions {
  onEvent?: (event: HarnessEventData) => void;
  enabled?: boolean;
}

export function useHarnessEvents({
  onEvent,
  enabled = true,
}: UseHarnessEventsOptions = {}) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!enabled) return;

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as HarnessEventData;
        onEventRef.current?.(data);
      } catch {
        // Ignore parse errors (heartbeats, malformed data)
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();

      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (enabled) connect();
      }, 3000);
    };
  }, [enabled]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect]);

  return { connected };
}
