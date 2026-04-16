"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook for subscribing to real-time harness events via SSE.
 *
 * Connects to /api/events and emits parsed events to a callback.
 * Auto-reconnects on connection loss.
 *
 * Brief 053: Also invalidates the activeRuns query key on pipeline-related events
 * so compositions re-render with fresh progress data.
 *
 * AC8: SSE events (step-complete, gate-pause, gate-advance, run-complete)
 */

/** Events that should trigger activeRuns cache invalidation */
const PIPELINE_EVENTS = new Set([
  "step-complete",
  "gate-pause",
  "gate-advance",
  "run-complete",
  "run-failed",
  // Brief 155 MP-1.4: orchestrator decomposition progress
  "orchestrator-decomposition-start",
  "orchestrator-subtask-identified",
  "orchestrator-subtask-dispatched",
  "orchestrator-decomposition-complete",
  "orchestrator-decomposition-failed",
  // Brief 155 MP-1.5: build notification
  "build-process-created",
]);

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
  const queryClient = useQueryClient();

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

        // Brief 053 AC7: Invalidate activeRuns on pipeline-related events
        if (PIPELINE_EVENTS.has(data.type)) {
          queryClient.invalidateQueries({ queryKey: ["activeRuns"] });
        }
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
