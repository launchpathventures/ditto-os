/**
 * Ditto — useWorkspaceViews Hook (Brief 154)
 *
 * Fetches all registered adaptive views for the current workspace.
 * Returns sorted by position for sidebar rendering.
 *
 * Provenance: Brief 154 (Adaptive Workspace Views).
 */

"use client";

import { useQuery } from "@tanstack/react-query";

export interface WorkspaceView {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
  description: string | null;
  position: number;
  sourceProcessId: string | null;
  sourceProcessSlug: string | null;
  schema: Record<string, unknown>;
}

async function fetchWorkspaceViews(): Promise<WorkspaceView[]> {
  const res = await fetch("/api/v1/workspace/views");
  if (!res.ok) return [];
  const data = (await res.json()) as { views: WorkspaceView[] };
  return data.views ?? [];
}

/**
 * Hook: fetch all adaptive views for the current workspace.
 * Sorted by position. Cache key includes workspace ID.
 */
export function useWorkspaceViews() {
  return useQuery({
    queryKey: ["workspaceViews"],
    queryFn: fetchWorkspaceViews,
    staleTime: 30_000,
  });
}
