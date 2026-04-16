/**
 * Ditto — Composition Context Assembly
 *
 * Assembles CompositionContext from React Query cached data.
 * Composition functions are synchronous transforms of this context.
 *
 * Provenance: original (ADR-024 MVP strategy).
 */

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CompositionContext, ActiveRunSummary, RoadmapData, GrowthPlanSummary, ProcessCapability } from "./compositions/types";
import type { ProcessSummary, WorkItemSummary } from "./process-query";
import type { FeedResponse, FeedItem } from "./feed-types";

/** Fetch active runs from the API (Brief 053) */
async function fetchActiveRuns(): Promise<{ activeRuns: ActiveRunSummary[] }> {
  const res = await fetch("/api/processes?action=activeRuns");
  if (!res.ok) return { activeRuns: [] };
  return res.json();
}

/** Fetch growth plan data from the API (Brief 140) */
async function fetchGrowthPlans(): Promise<GrowthPlanSummary[]> {
  const res = await fetch("/api/growth");
  if (!res.ok) return [];
  return res.json();
}

/** Fetch process capabilities from the API (library + today views) */
async function fetchCapabilities(userId?: string): Promise<ProcessCapability[]> {
  const url = userId ? `/api/capabilities?userId=${encodeURIComponent(userId)}` : "/api/capabilities";
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

/** Fetch roadmap data from the API (Brief 055) */
async function fetchRoadmap(): Promise<RoadmapData> {
  const res = await fetch("/api/roadmap");
  if (!res.ok) return { phases: [], briefs: [], stats: { total: 0, ready: 0, inProgress: 0, complete: 0, draft: 0 } };
  return res.json();
}

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
export function useCompositionContext(intent?: string): CompositionContext {
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

  // Brief 053: Fetch active runs — initial load + SSE-driven invalidation
  const { data: activeRunsData } = useQuery({
    queryKey: ["activeRuns"],
    queryFn: fetchActiveRuns,
    refetchInterval: 30_000, // Fallback poll every 30s in case SSE misses
    staleTime: 5_000,
  });

  // Brief 140: Lazy growth plan data — only fetched when growth intent is active
  const { data: growthPlansData } = useQuery({
    queryKey: ["growthPlans"],
    queryFn: fetchGrowthPlans,
    enabled: intent === "growth",
    staleTime: 10_000,
  });

  // Brief 168: Fetch capabilities for library and today intents (recommendations)
  const { data: capabilitiesData } = useQuery({
    queryKey: ["capabilities", "default"],
    queryFn: () => fetchCapabilities("default"),
    enabled: intent === "library" || intent === "today",
    staleTime: 30_000,
  });

  // Brief 055: Lazy roadmap data — only fetched when roadmap intent is active
  const { data: roadmapData } = useQuery({
    queryKey: ["roadmap"],
    queryFn: fetchRoadmap,
    enabled: intent === "roadmap",
    staleTime: 10_000,
  });

  const processes = (processData?.processes ?? []).filter(
    (p) => !p.system && p.status === "active",
  );
  const workItems = processData?.workItems ?? [];
  const feedItems: FeedItem[] = feedData?.items ?? [];
  const pendingReviews = feedItems.filter(
    (item) => item.itemType === "review",
  );
  const activeRuns = activeRunsData?.activeRuns ?? [];

  // Brief 168: Derive recommended subset from scored capabilities
  const recommended = useMemo(() => {
    if (!capabilitiesData) return undefined;
    const recs = capabilitiesData
      .filter((c) => !c.active && c.relevanceScore !== undefined && c.relevanceScore > 0.5)
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, 3);
    return recs.length > 0 ? recs : undefined;
  }, [capabilitiesData]);

  return useMemo(
    () => ({
      processes,
      workItems,
      feedItems,
      pendingReviews,
      activeRuns,
      roadmap: roadmapData,
      growthPlans: growthPlansData,
      capabilities: capabilitiesData,
      recommended,
      now: new Date(),
    }),
    [processes, workItems, feedItems, pendingReviews, activeRuns, roadmapData, growthPlansData, capabilitiesData, recommended],
  );
}
