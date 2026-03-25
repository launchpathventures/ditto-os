"use client";

/**
 * Ditto — Process Detail Container
 *
 * Routes to one of 3 variants based on process state:
 * - Living roadmap: one-off work item flowing through a process (has active run)
 * - Domain process: recurring process (default for active processes)
 * - Process runner: active instance with 3+ steps including human steps
 *
 * AC4: Clicking sidebar item navigates to process detail.
 * AC5-AC8: Three variants.
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

import { useMemo } from "react";
import {
  useProcessDetail,
  useProcessActivities,
  useProcessRunDetail,
} from "@/lib/process-query";
import { LivingRoadmap } from "./living-roadmap";
import { DomainProcess } from "./domain-process";
import { ProcessRunner } from "./process-runner";

interface ProcessDetailContainerProps {
  processId: string;
  /** Optional specific run to display in runner/roadmap mode */
  runId?: string;
  onBack: () => void;
}

export function ProcessDetailContainer({
  processId,
  runId,
  onBack,
}: ProcessDetailContainerProps) {
  const { data: process, isLoading } = useProcessDetail(processId);
  const { data: activitiesData, isLoading: activitiesLoading } =
    useProcessActivities(processId);

  // If a specific run is requested, load it
  const latestRunId = runId ?? process?.recentRuns[0]?.id ?? null;
  const { data: runDetail } = useProcessRunDetail(
    latestRunId && process?.recentRuns[0]?.status !== "approved"
      ? latestRunId
      : null,
  );

  const activities = activitiesData?.activities ?? [];

  // Determine which variant to show
  const variant = useMemo(() => {
    if (!process) return "loading";

    // If we have a specific active run
    if (runDetail) {
      // Process runner: active run with 3+ steps (any steps, not just human)
      // that has human steps (AC7 threshold)
      const hasHumanSteps = process.steps.some(
        (s) => s.executor === "human",
      );
      const pendingHumanSteps = process.steps.filter((s) => {
        if (s.executor !== "human") return false;
        const sr = runDetail.steps.find((r) => r.stepId === s.id);
        return !sr || sr.status === "waiting_human" || sr.status === "queued";
      });

      if (
        hasHumanSteps &&
        process.steps.length >= 3 &&
        pendingHumanSteps.length >= 1
      ) {
        return "runner";
      }

      // Living roadmap: active run flowing through steps
      return "roadmap";
    }

    // Default: domain process view (recurring)
    return "domain";
  }, [process, runDetail]);

  if (isLoading || !process) {
    return (
      <div className="p-6 space-y-4">
        {/* Skeleton */}
        <div className="h-6 w-48 bg-surface animate-pulse rounded" />
        <div className="h-4 w-32 bg-surface animate-pulse rounded" />
        <div className="space-y-2 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-surface animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Back button */}
      <div className="px-6 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="text-sm text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
        >
          ← Back
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {variant === "runner" && runDetail ? (
          <ProcessRunner
            processName={process.name}
            stepDefinitions={process.steps}
            run={runDetail}
            activities={activities}
            activitiesLoading={activitiesLoading}
          />
        ) : variant === "roadmap" && runDetail ? (
          <div className="p-6">
            <LivingRoadmap
              processName={process.name}
              stepDefinitions={process.steps}
              run={runDetail}
              activities={activities}
              activitiesLoading={activitiesLoading}
            />
          </div>
        ) : (
          <div className="p-6">
            <DomainProcess
              process={process}
              activities={activities}
              activitiesLoading={activitiesLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
