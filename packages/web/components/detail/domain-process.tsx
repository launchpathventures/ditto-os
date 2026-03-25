"use client";

/**
 * Ditto — Domain Process View
 *
 * Recurring process: "How it works" + "How it's going" + trust control + activity log.
 *
 * AC6: "How it works" in plain language, "How it's going" with metrics + sparkline.
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

import { TrustControl } from "./trust-control";
import { ActivityLog } from "./activity-log";
import { EngineTrace } from "./engine-view";
import type { ProcessDetail, ActivityEntry } from "@/lib/process-query";

interface DomainProcessProps {
  process: ProcessDetail;
  activities: ActivityEntry[];
  activitiesLoading?: boolean;
}

/**
 * Simple sparkline rendered as an inline SVG.
 * Takes an array of values (0-1) and draws a trend line.
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 80;
  const height = 24;
  const padding = 2;

  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - (v / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block ml-2">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="text-accent"
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: "improving" | "stable" | "declining" }) {
  if (trend === "improving")
    return <span className="text-positive text-sm">↑ Getting better</span>;
  if (trend === "declining")
    return <span className="text-negative text-sm">↓ Needs attention</span>;
  return <span className="text-text-muted text-sm">→ Steady</span>;
}

export function DomainProcess({
  process,
  activities,
  activitiesLoading,
}: DomainProcessProps) {
  const { trustState, steps, recentRuns } = process;

  // Build sparkline data from recent runs (approval rate per run — simplified as 1/0)
  const sparklineValues = recentRuns
    .slice()
    .reverse()
    .map((r) => (r.status === "approved" ? 1 : r.status === "rejected" ? 0 : 0.5));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {process.name}
        </h2>
        {process.description && (
          <p className="text-sm text-text-secondary mt-1">
            {process.description}
          </p>
        )}
      </div>

      {/* How it works */}
      <section>
        <h3 className="text-sm font-medium text-text-primary mb-3">
          How it works
        </h3>
        <ol className="space-y-2">
          {steps.map((step, idx) => (
            <li key={step.id} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface flex items-center justify-center text-xs text-text-muted font-medium">
                {idx + 1}
              </span>
              <div>
                <p className="text-sm text-text-primary">{step.name}</p>
                {step.description && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* How it's going */}
      <section>
        <h3 className="text-sm font-medium text-text-primary mb-3">
          How it&apos;s going
        </h3>
        <div className="bg-surface-raised rounded-xl p-5 shadow-[var(--shadow-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-semibold text-text-primary">
                {trustState.runsInWindow}
              </p>
              <p className="text-xs text-text-muted">completed</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-text-primary">
                {Math.round(trustState.approvalRate * 100)}%
              </p>
              <p className="text-xs text-text-muted">approved clean</p>
            </div>
            <div>
              <Sparkline values={sparklineValues} />
            </div>
          </div>
          <div className="flex items-center gap-4 pt-2 border-t border-border">
            <TrendArrow trend={trustState.trend} />
            {trustState.consecutiveCleanRuns > 0 && (
              <span className="text-sm text-text-muted">
                {trustState.consecutiveCleanRuns} clean in a row
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Trust control */}
      <section>
        <TrustControl
          processId={process.id}
          processName={process.name}
          currentTier={process.trustTier}
          trustState={trustState}
        />
      </section>

      {/* Engine trace for most recent run */}
      {recentRuns.length > 0 && (
        <EngineTrace
          steps={[]} // Will be populated when run detail is loaded
        />
      )}

      {/* Activity log */}
      <section>
        <h3 className="text-sm font-medium text-text-primary mb-3">
          Recent activity
        </h3>
        <ActivityLog activities={activities} isLoading={activitiesLoading} />
      </section>
    </div>
  );
}
