"use client";

/**
 * Ditto — useNetworkPush Hook (Brief 154)
 *
 * Listens to the workspace SSE stream for workspace push events:
 * - workspace_blocks_push → merges pushed blocks into adaptive view cache
 * - workspace_view_refresh → invalidates React Query for target view
 * - workspace_view_registered → invalidates workspaceViews query (sidebar update)
 *
 * Uses the same /api/events SSE stream as useHarnessEvents.
 * Workspace push events are emitted by network agents via emitNetworkEvent()
 * and relayed through the SSE infrastructure.
 *
 * Provenance: Brief 154 (Adaptive Workspace Views), Supabase Realtime pattern.
 */

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Workspace push event types */
const WORKSPACE_PUSH_EVENTS = new Set([
  "workspace_blocks_push",
  "workspace_view_refresh",
  "workspace_view_registered",
]);

interface UseNetworkPushOptions {
  enabled?: boolean;
}

export function useNetworkPush({ enabled = true }: UseNetworkPushOptions = {}) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; viewSlug?: string; [key: string]: unknown };

        if (!WORKSPACE_PUSH_EVENTS.has(data.type)) return;

        switch (data.type) {
          case "workspace_blocks_push": {
            // Invalidate the specific view's query to trigger re-render
            if (data.viewSlug) {
              queryClient.invalidateQueries({ queryKey: ["workspaceView", data.viewSlug] });
            }
            break;
          }

          case "workspace_view_refresh": {
            // Invalidate the specific view's query
            if (data.viewSlug) {
              queryClient.invalidateQueries({ queryKey: ["workspaceView", data.viewSlug] });
            }
            break;
          }

          case "workspace_view_registered": {
            // Invalidate the workspace views list (sidebar update)
            queryClient.invalidateQueries({ queryKey: ["workspaceViews"] });
            break;
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        if (enabled) connect();
      }, 5000);
    };
  }, [enabled, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect]);
}
