/**
 * Ditto Web — Process Data Hooks
 *
 * React Query hooks for process list, detail, activities, and trust.
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================
// Types (duplicated from engine to avoid server imports in client)
// ============================================================

export interface ProcessSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  trustTier: string;
  system: boolean;
  recentRunCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

export interface WorkItemSummary {
  id: string;
  type: string;
  status: string;
  content: string;
  assignedProcess: string | null;
  processName: string | null;
  createdAt: string;
}

export interface ProcessStepDefinition {
  id: string;
  name: string;
  executor: string;
  description?: string;
}

export interface ProcessDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  trustTier: string;
  system: boolean;
  steps: ProcessStepDefinition[];
  trustState: {
    approvalRate: number;
    runsInWindow: number;
    consecutiveCleanRuns: number;
    trend: "improving" | "stable" | "declining";
    approvals: number;
    edits: number;
    rejections: number;
  };
  recentRuns: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    totalCostCents: number | null;
  }>;
}

export interface ProcessRunDetail {
  id: string;
  processId: string;
  processName: string;
  status: string;
  currentStepId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalCostCents: number | null;
  steps: Array<{
    id: string;
    stepId: string;
    status: string;
    executorType: string;
    outputs: Record<string, unknown>;
    startedAt: string | null;
    completedAt: string | null;
    costCents: number | null;
    confidenceLevel: string | null;
    model: string | null;
    error: string | null;
  }>;
}

export interface ActivityEntry {
  id: string;
  action: string;
  description: string | null;
  actorType: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ============================================================
// Hooks
// ============================================================

/**
 * Fetch process list + work items for sidebar.
 */
export function useProcessList() {
  return useQuery<{ processes: ProcessSummary[]; workItems: WorkItemSummary[] }>({
    queryKey: ["processes"],
    queryFn: async () => {
      const res = await fetch("/api/processes");
      if (!res.ok) throw new Error("Failed to fetch processes");
      return res.json();
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch detailed process information.
 */
export function useProcessDetail(processId: string | null) {
  return useQuery<ProcessDetail>({
    queryKey: ["process", processId],
    queryFn: async () => {
      const res = await fetch(`/api/processes?id=${processId}`);
      if (!res.ok) throw new Error("Failed to fetch process detail");
      return res.json();
    },
    enabled: !!processId,
    staleTime: 15_000,
  });
}

/**
 * Fetch process run detail.
 */
export function useProcessRunDetail(runId: string | null) {
  return useQuery<ProcessRunDetail>({
    queryKey: ["processRun", runId],
    queryFn: async () => {
      const res = await fetch(`/api/processes?runId=${runId}`);
      if (!res.ok) throw new Error("Failed to fetch run detail");
      return res.json();
    },
    enabled: !!runId,
    staleTime: 10_000,
  });
}

/**
 * Fetch process activities.
 */
export function useProcessActivities(processId: string | null) {
  return useQuery<{ activities: ActivityEntry[] }>({
    queryKey: ["processActivities", processId],
    queryFn: async () => {
      const res = await fetch(
        `/api/processes?id=${processId}&activities=true`,
      );
      if (!res.ok) throw new Error("Failed to fetch activities");
      return res.json();
    },
    enabled: !!processId,
    staleTime: 15_000,
  });
}

/**
 * Update trust tier for a process.
 */
export function useUpdateTrust() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      processId,
      newTier,
      reason,
    }: {
      processId: string;
      newTier: string;
      reason: string;
    }) => {
      const res = await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateTrust", processId, newTier, reason }),
      });
      if (!res.ok) throw new Error("Failed to update trust");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["process", variables.processId] });
      queryClient.invalidateQueries({ queryKey: ["processes"] });
      queryClient.invalidateQueries({
        queryKey: ["processActivities", variables.processId],
      });
    },
  });
}
