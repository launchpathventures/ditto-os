/**
 * Ditto — Composition Context Assembly
 *
 * Assembles CompositionContext from React Query cached data.
 * Composition functions are synchronous transforms of this context.
 *
 * Provenance: Brief 047, ADR-024 MVP strategy.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CompositionContext } from "./compositions/types";
import type { ProcessSummary, WorkItemSummary } from "./process-query";
import type { FeedResponse, FeedItem } from "./feed-types";

/**
 * Hook: assemble CompositionContext from React Query cache.
 *
 * Returns cached data synchronously — composition functions never wait
 * for network. On cold cache, returns empty arrays (the UI shows
 * skeleton state until data arrives and triggers re-render).
 */
export function useCompositionContext(): CompositionContext {
  const queryClient = useQueryClient();

  return useMemo(() => {
    // Read from React Query cache — synchronous, no network
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

    return {
      processes,
      workItems,
      feedItems,
      pendingReviews,
      now: new Date(),
    };
  }, [queryClient]);
}
