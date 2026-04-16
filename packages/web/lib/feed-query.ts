"use client";

/**
 * Ditto Web — Feed Query Hooks
 *
 * TanStack Query hooks for feed data fetching + SSE subscription
 * for real-time updates.
 *
 * Provenance: Brief 041 (Feed & Review), AC14.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useHarnessEvents, type HarnessEventData } from "@/hooks/use-harness-events";
import type { FeedResponse } from "./feed-types";

const FEED_QUERY_KEY = ["feed"] as const;

/**
 * Fetch feed items from the API.
 */
async function fetchFeed(): Promise<FeedResponse> {
  const res = await fetch("/api/feed");
  if (!res.ok) {
    throw new Error(`Feed fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Hook: subscribe to feed data with real-time SSE updates.
 * Refetches when harness events arrive (new items, state changes).
 */
export function useFeed() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: fetchFeed,
    refetchInterval: 60_000, // Fallback poll every 60s
  });

  // Refetch on relevant SSE events
  const onEvent = useCallback(
    (event: HarnessEventData) => {
      const refetchEvents = [
        "step-complete",
        "gate-pause",
        "gate-advance",
        "run-complete",
        "run-failed",
        // Brief 155: orchestrator progress + build notifications
        "orchestrator-decomposition-complete",
        "build-process-created",
      ];
      if (refetchEvents.includes(event.type)) {
        queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
      }
    },
    [queryClient],
  );

  useHarnessEvents({ onEvent, enabled: true });

  return query;
}

/**
 * Review action types for mutations.
 */
interface ReviewActionParams {
  action: "approve" | "edit" | "reject";
  processRunId: string;
  editedText?: string;
  reason?: string;
}

interface ReviewActionResult {
  success: boolean;
  message: string;
  correctionPattern?: { pattern: string; count: number } | null;
}

/**
 * Hook: perform review actions (approve/edit/reject) with optimistic updates.
 */
export function useReviewAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ReviewActionParams): Promise<ReviewActionResult> => {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Review action failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Refetch feed after successful review action
      queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });
}

/**
 * Teach action params for "Teach this?" insight acceptance.
 * Brief 147: Learning loop closure.
 */
interface TeachActionParams {
  processId: string;
  pattern: string;
}

interface TeachActionResult {
  success: boolean;
  message: string;
  promoted: number;
  criterion: string;
}

/**
 * Hook: perform "Teach this" action on an insight pattern.
 */
/**
 * Hook: dismiss an insight pattern so it doesn't resurface (30-day cooldown).
 * Brief 147: persistent "No" dismissal.
 */
export function useDismissInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TeachActionParams): Promise<{ success: boolean; message: string }> => {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss-insight", ...params }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Dismiss failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });
}

export function useTeachAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: TeachActionParams): Promise<TeachActionResult> => {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "teach", ...params }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Teach action failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
    },
  });
}
