"use client";

/**
 * Ditto — Process Runner View
 *
 * Stepped wizard for process instances with multiple human steps.
 * Sidebar step navigation (✓/→/⚠/○) + current step content area.
 *
 * AC7: Stepped navigation for 3+ pending human steps. State preserved.
 * Clickable completed steps for review. Domain-named steps.
 *
 * Provenance: Hark stepped-wizard pattern (gethark.ai), Brief 042.
 */

import { useState, useMemo } from "react";
import { ActivityLog } from "./activity-log";
import type { ProcessRunDetail, ProcessStepDefinition, ActivityEntry } from "@/lib/process-query";

interface ProcessRunnerProps {
  processName: string;
  stepDefinitions: ProcessStepDefinition[];
  run: ProcessRunDetail;
  activities: ActivityEntry[];
  activitiesLoading?: boolean;
}

type StepState = "done" | "current" | "current-agent" | "failed" | "pending";

function getStepState(
  stepId: string,
  stepDef: ProcessStepDefinition,
  run: ProcessRunDetail,
): StepState {
  const stepRun = run.steps.find((s) => s.stepId === stepId);
  if (!stepRun) return "pending";

  if (stepRun.status === "approved" || stepRun.status === "skipped") return "done";
  if (stepRun.status === "failed") return "failed";
  if (stepRun.status === "running") {
    return stepDef.executor === "human" ? "current" : "current-agent";
  }
  if (
    stepRun.status === "waiting_review" ||
    stepRun.status === "waiting_human"
  ) {
    return "current";
  }
  return "pending";
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-positive/10 text-positive text-sm font-medium">
          ✓
        </span>
      );
    case "current":
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 text-accent text-sm font-medium">
          →
        </span>
      );
    case "current-agent":
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 text-accent text-sm animate-pulse">
          ●
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-caution/10 text-caution text-sm font-medium">
          ⚠
        </span>
      );
    case "pending":
      return (
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-surface text-text-muted text-sm">
          ○
        </span>
      );
  }
}

function StepContent({
  stepDef,
  stepRun,
  state,
}: {
  stepDef: ProcessStepDefinition;
  stepRun: ProcessRunDetail["steps"][number] | undefined;
  state: StepState;
}) {
  if (!stepRun && state === "pending") {
    return (
      <div className="flex items-center justify-center h-32 text-text-muted text-sm">
        This step hasn&apos;t started yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium text-text-primary">
          {stepDef.name}
        </h3>
        {stepDef.description && (
          <p className="text-sm text-text-secondary mt-1">
            {stepDef.description}
          </p>
        )}
      </div>

      {/* Status-specific content */}
      {state === "current" && stepDef.executor === "human" && (
        <div className="bg-accent-subtle rounded-lg px-4 py-3">
          <p className="text-sm text-text-primary">
            This step needs your input.
          </p>
        </div>
      )}

      {state === "current-agent" && (
        <div className="bg-surface rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <p className="text-sm text-text-secondary">Working on this...</p>
        </div>
      )}

      {state === "failed" && stepRun?.error && (
        <div className="bg-negative/5 rounded-lg px-4 py-3 space-y-2">
          <p className="text-sm text-negative">{stepRun.error}</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 text-sm bg-surface-raised text-text-primary rounded-md hover:bg-surface transition-colors shadow-[var(--shadow-subtle)]">
              Try again
            </button>
            <button className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors">
              Skip
            </button>
            <button className="px-3 py-1 text-sm text-accent hover:text-accent-hover transition-colors">
              Ask Ditto
            </button>
          </div>
        </div>
      )}

      {/* Output for completed steps */}
      {state === "done" && stepRun?.outputs && Object.keys(stepRun.outputs).length > 0 && (
        <div className="bg-surface rounded-lg px-4 py-3">
          <p className="text-xs text-text-muted mb-2 uppercase tracking-wide">
            What happened
          </p>
          {typeof stepRun.outputs === "object" &&
          "response" in stepRun.outputs ? (
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {String(stepRun.outputs.response).slice(0, 500)}
              {String(stepRun.outputs.response).length > 500 && "..."}
            </p>
          ) : (
            <pre className="text-xs text-text-muted font-mono overflow-x-auto">
              {JSON.stringify(stepRun.outputs, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ProcessRunner({
  processName,
  stepDefinitions,
  run,
  activities,
  activitiesLoading,
}: ProcessRunnerProps) {
  // Find the first non-done step as default selection
  const firstActiveIdx = useMemo(() => {
    const idx = stepDefinitions.findIndex((s) => {
      const state = getStepState(s.id, s, run);
      return state !== "done";
    });
    return idx >= 0 ? idx : 0;
  }, [stepDefinitions, run]);

  const [selectedIdx, setSelectedIdx] = useState(firstActiveIdx);
  const selectedStep = stepDefinitions[selectedIdx];
  const selectedStepRun = run.steps.find(
    (s) => s.stepId === selectedStep?.id,
  );
  const selectedState = selectedStep
    ? getStepState(selectedStep.id, selectedStep, run)
    : "pending";

  // Check if run is all complete
  const allComplete = run.status === "approved" || run.status === "rejected";

  return (
    <div className="flex h-full">
      {/* Step sidebar navigation */}
      <div className="w-56 flex-shrink-0 border-r border-border py-4 pr-3 space-y-1 overflow-y-auto">
        <h2 className="text-sm font-semibold text-text-primary px-3 mb-3">
          {processName}
        </h2>
        {stepDefinitions.map((step, idx) => {
          const state = getStepState(step.id, step, run);
          const isSelected = idx === selectedIdx;
          const isClickable = state === "done" || state === "current" || state === "current-agent" || state === "failed";

          return (
            <button
              key={step.id}
              onClick={() => isClickable && setSelectedIdx(idx)}
              disabled={!isClickable}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                isSelected
                  ? "bg-surface-raised shadow-[var(--shadow-subtle)]"
                  : isClickable
                    ? "hover:bg-surface cursor-pointer"
                    : "cursor-default opacity-60"
              }`}
            >
              <StepIcon state={state} />
              <span
                className={`text-sm truncate ${
                  isSelected
                    ? "text-text-primary font-medium"
                    : "text-text-secondary"
                }`}
              >
                {step.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {allComplete && (
          <div className="bg-positive/5 rounded-lg px-4 py-3">
            <p className="text-sm text-positive font-medium">
              {run.status === "approved" ? "All done!" : "This was sent back."}
            </p>
          </div>
        )}

        {selectedStep && (
          <StepContent
            stepDef={selectedStep}
            stepRun={selectedStepRun}
            state={selectedState}
          />
        )}

        {/* Activity log */}
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-3">
            Activity
          </h3>
          <ActivityLog activities={activities} isLoading={activitiesLoading} />
        </div>
      </div>
    </div>
  );
}
