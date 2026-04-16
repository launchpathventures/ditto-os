"use client";

/**
 * Hook for tracking orchestrator goal decomposition progress via SSE events.
 *
 * Converts orchestrator-* harness events into ProgressBlock-compatible state
 * so the workspace can surface real-time decomposition progress.
 *
 * Brief 155 MP-1.4: Goal decomposition progress
 * Brief 155 MP-1.5: Build process notification
 */

import { useCallback, useState } from "react";
import { useHarnessEvents, type HarnessEventData } from "./use-harness-events";
import type { ProgressBlock, AlertBlock } from "@/lib/engine";

export interface OrchestratorProgress {
  goalWorkItemId: string;
  goalContent: string;
  totalTasks: number;
  identifiedTasks: number;
  dispatchedTasks: number;
  status: "decomposing" | "routing" | "complete";
  reasoning?: string;
}

export interface BuildNotification {
  goalWorkItemId: string;
  processSlug: string;
  processName: string;
  processDescription: string;
  timestamp: number;
}

interface UseOrchestratorProgressResult {
  /** Active orchestrator decomposition progress, keyed by goalWorkItemId */
  progress: Map<string, OrchestratorProgress>;
  /** Recent build notifications (cleared after 30s) */
  buildNotifications: BuildNotification[];
  /** Convert current progress to a ProgressBlock for rendering */
  toProgressBlock: (goalWorkItemId: string) => ProgressBlock | null;
  /** Convert a build notification to an AlertBlock for rendering */
  toAlertBlock: (notification: BuildNotification) => AlertBlock;
}

export function useOrchestratorProgress(): UseOrchestratorProgressResult {
  const [progress, setProgress] = useState<Map<string, OrchestratorProgress>>(new Map());
  const [buildNotifications, setBuildNotifications] = useState<BuildNotification[]>([]);

  const onEvent = useCallback((event: HarnessEventData) => {
    switch (event.type) {
      case "orchestrator-decomposition-start": {
        const goalId = event.goalWorkItemId as string;
        setProgress((prev) => {
          const next = new Map(prev);
          next.set(goalId, {
            goalWorkItemId: goalId,
            goalContent: event.goalContent as string,
            totalTasks: 0,
            identifiedTasks: 0,
            dispatchedTasks: 0,
            status: "decomposing",
          });
          return next;
        });
        break;
      }

      case "orchestrator-subtask-identified": {
        const goalId = event.goalWorkItemId as string;
        setProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(goalId);
          if (existing) {
            next.set(goalId, {
              ...existing,
              totalTasks: event.total as number,
              identifiedTasks: event.index as number,
            });
          }
          return next;
        });
        break;
      }

      case "orchestrator-subtask-dispatched": {
        const goalId = event.goalWorkItemId as string;
        setProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(goalId);
          if (existing) {
            next.set(goalId, {
              ...existing,
              dispatchedTasks: existing.dispatchedTasks + 1,
              status: "routing",
            });
          }
          return next;
        });
        break;
      }

      case "orchestrator-decomposition-complete": {
        const goalId = event.goalWorkItemId as string;
        setProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(goalId);
          if (existing) {
            next.set(goalId, {
              ...existing,
              totalTasks: event.totalTasks as number,
              status: "complete",
              reasoning: event.reasoning as string,
            });
          }
          return next;
        });
        // Auto-clear completed progress after 10s
        setTimeout(() => {
          setProgress((prev) => {
            const next = new Map(prev);
            next.delete(goalId);
            return next;
          });
        }, 10_000);
        break;
      }

      case "orchestrator-decomposition-failed": {
        // Clear the progress bar immediately on failure
        const goalId = event.goalWorkItemId as string;
        setProgress((prev) => {
          const next = new Map(prev);
          next.delete(goalId);
          return next;
        });
        break;
      }

      case "build-process-created": {
        const notification: BuildNotification = {
          goalWorkItemId: event.goalWorkItemId as string,
          processSlug: event.processSlug as string,
          processName: event.processName as string,
          processDescription: event.processDescription as string,
          timestamp: Date.now(),
        };
        setBuildNotifications((prev) => [...prev, notification]);
        // Auto-clear after 30s
        setTimeout(() => {
          setBuildNotifications((prev) =>
            prev.filter((n) => n.timestamp !== notification.timestamp),
          );
        }, 30_000);
        break;
      }
    }
  }, []);

  useHarnessEvents({ onEvent, enabled: true });

  const toProgressBlock = useCallback(
    (goalWorkItemId: string): ProgressBlock | null => {
      const p = progress.get(goalWorkItemId);
      if (!p) return null;

      const completedSteps = p.status === "complete"
        ? p.totalTasks
        : p.status === "routing"
          ? p.dispatchedTasks
          : p.identifiedTasks;

      return {
        type: "progress",
        entityType: "goal_decomposition",
        entityId: goalWorkItemId,
        currentStep: p.status === "decomposing"
          ? `Breaking down: ${p.goalContent.slice(0, 80)}`
          : p.status === "routing"
            ? `Routing ${p.dispatchedTasks} of ${p.totalTasks} tasks`
            : `Decomposed into ${p.totalTasks} tasks`,
        totalSteps: p.totalTasks || 1,
        completedSteps,
        status: p.status === "complete" ? "complete" : "running",
      };
    },
    [progress],
  );

  const toAlertBlock = useCallback(
    (notification: BuildNotification): AlertBlock => ({
      type: "alert",
      severity: "info",
      title: `New process created: ${notification.processName}`,
      content: notification.processDescription,
    }),
    [],
  );

  return { progress, buildNotifications, toProgressBlock, toAlertBlock };
}
