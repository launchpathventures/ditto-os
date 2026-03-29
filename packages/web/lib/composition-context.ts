/**
 * Ditto — Composition Context Assembly
 *
 * Assembles CompositionContext from React Query cached data.
 * Composition functions are synchronous transforms of this context.
 *
 * Provenance: original (ADR-024 MVP strategy).
 */

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CompositionContext } from "./compositions/types";
import type { ProcessSummary, WorkItemSummary } from "./process-query";
import type { FeedResponse, FeedItem } from "./feed-types";

/**
 * Hook: assemble CompositionContext from React Query cache.
 *
 * Reads cached data synchronously — composition functions never wait
 * for network. On cold cache, returns empty arrays (the UI shows
 * skeleton state until data arrives and triggers re-render).
 *
 * We read from the cache on every render (no useMemo) because
 * queryClient.getQueryData is cheap and the parent re-renders
 * when useProcessList/useFeed queries update.
 */
export function useCompositionContext(): CompositionContext {
  const queryClient = useQueryClient();

  // Read from React Query cache — synchronous, no network.
  // No useMemo: queryClient is stable so the memo would never
  // recompute, but we need fresh reads each render when parent
  // re-renders due to query updates.
  const processData = queryClient.getQueryData<{
    processes: ProcessSummary[];
    workItems: WorkItemSummary[];
  }>(["processes"]);

  const feedData = queryClient.getQueryData<FeedResponse>(["feed"]);

  const processes = (processData?.processes ?? []).filter(
    (p) => !p.system && p.status === "active",
  );
  const workItems = processData?.workItems ?? [];
  const feedItems: FeedItem[] = feedData?.items ?? [];
  const pendingReviews = feedItems.filter(
    (item) => item.itemType === "review",
  );

  return useMemo(
    () => ({
      processes,
      workItems,
      feedItems,
      pendingReviews,
      now: new Date(),
    }),
    [processes, workItems, feedItems, pendingReviews],
  );
}
