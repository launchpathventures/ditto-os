"use client";

/**
 * Ditto — Living Roadmap View
 *
 * Shows generated process steps with ✓/●/○ icons and current step narration.
 * Used for one-off work items flowing through a process.
 *
 * AC5: Steps with ✓/●/○ icons, current step narration, activity log.
 *
 * Provenance: Brief 042, AI SDK Elements Plan/Task pattern.
 */

import { ActivityLog } from "./activity-log";
import { EngineTrace } from "./engine-view";
import type { ProcessRunDetail, ActivityEntry } from "@/lib/process-query";
import type { ProcessStepDefinition } from "@/lib/process-query";

interface LivingRoadmapProps {
  processName: string;
  stepDefinitions: ProcessStepDefinition[];
  run: ProcessRunDetail | null;
  activities: ActivityEntry[];
  activitiesLoading?: boolean;
}

function getStepStatus(
  stepId: string,
  run: ProcessRunDetail | null,
): "done" | "current" | "pending" {
  if (!run) return "pending";
  const stepRun = run.steps.find((s) => s.stepId === stepId);
  if (!stepRun) return "pending";
  if (
    stepRun.status === "approved" ||
    stepRun.status === "skipped"
  ) {
    return "done";
  }
  if (
    stepRun.status === "running" ||
    stepRun.status === "waiting_review" ||
    stepRun.status === "waiting_human"
  ) {
    return "current";
  }
  return "pending";
}

function StepIcon({ status }: { status: "done" | "current" | "pending" }) {
  if (status === "done") {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-positive/10 text-positive text-sm">
        ✓
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-sm">
        ●
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-surface text-text-muted text-sm">
      ○
    </span>
  );
}

export function LivingRoadmap({
  processName,
  stepDefinitions,
  run,
  activities,
  activitiesLoading,
}: LivingRoadmapProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{processName}</h2>
        {run && (
          <p className="text-sm text-text-muted mt-1">
            {run.status === "approved"
              ? "Completed"
              : run.status === "running"
                ? "In progress"
                : run.status === "waiting_review"
                  ? "Waiting for your review"
                  : run.status === "waiting_human"
                    ? "Waiting for your input"
                    : run.status}
          </p>
        )}
      </div>

      {/* Steps timeline */}
      <div className="space-y-1">
        {stepDefinitions.map((step, idx) => {
          const status = getStepStatus(step.id, run);
          const stepRun = run?.steps.find((s) => s.stepId === step.id);

          return (
            <div key={step.id} className="flex gap-3 items-start py-2">
              <div className="flex flex-col items-center">
                <StepIcon status={status} />
                {idx < stepDefinitions.length - 1 && (
                  <div
                    className={`w-px h-6 mt-1 ${
                      status === "done" ? "bg-positive/30" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm ${
                    status === "current"
                      ? "text-text-primary font-medium"
                      : status === "done"
                        ? "text-text-secondary"
                        : "text-text-muted"
                  }`}
                >
                  {step.name}
                </p>
                {step.description && status === "current" && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {step.description}
                  </p>
                )}
                {stepRun?.error && (
                  <p className="text-xs text-negative mt-0.5">
                    {stepRun.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Engine trace */}
      {run && <EngineTrace steps={run.steps} />}

      {/* Activity log */}
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-3">
          Recent activity
        </h3>
        <ActivityLog activities={activities} isLoading={activitiesLoading} />
      </div>
    </div>
  );
}
