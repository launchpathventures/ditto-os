"use client";

/**
 * Ditto — Artifact Context Panel
 *
 * Right panel in artifact mode. Shows:
 * - Artifact title + lifecycle badge (reused from ArtifactViewerPanel)
 * - Review actions (Approve / Edit / Reject)
 * - Provenance placeholder (knowledge used, process context)
 * - Version history placeholder
 *
 * AC6: Context panel shows title, lifecycle badge, review actions, provenance.
 *
 * Brief 048, ADR-023 (artifact interaction model).
 * Provenance: ArtifactViewerPanel (Brief 046) — lifecycle badge pattern reused.
 */

import { useCallback, useState } from "react";
import { useProcessRunDetail } from "@/lib/process-query";
import type { ArtifactType } from "./artifact-layout";

interface ArtifactContextPanelProps {
  artifactType: ArtifactType;
  artifactId: string;
  processId: string;
  runId?: string;
  width: string;
  onReviewAction?: (action: "approve" | "edit" | "reject") => void;
  onExit: () => void;
}

type LifecycleStatus = "under-review" | "approved" | "rejected" | "running" | "completed";

function getLifecycleStatus(status: string): LifecycleStatus {
  switch (status) {
    case "waiting_review":
      return "under-review";
    case "approved":
    case "completed":
      return "approved";
    case "rejected":
      return "rejected";
    case "running":
    case "started":
      return "running";
    default:
      return "completed";
  }
}

function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  const config: Record<LifecycleStatus, { label: string; className: string }> = {
    "under-review": { label: "Under Review", className: "bg-caution/10 text-caution" },
    approved: { label: "Approved", className: "bg-positive/10 text-positive" },
    rejected: { label: "Rejected", className: "bg-negative/10 text-negative" },
    running: { label: "Running", className: "bg-accent/10 text-accent" },
    completed: { label: "Completed", className: "bg-positive/10 text-positive" },
  };

  const { label, className } = config[status];

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>
      {label}
    </span>
  );
}

/** Human-readable artifact type labels */
const TYPE_LABELS: Record<ArtifactType, string> = {
  document: "Document",
  spreadsheet: "Spreadsheet",
  image: "Image",
  preview: "Live Preview",
  email: "Email",
  pdf: "PDF",
};

export function ArtifactContextPanel({
  artifactType,
  artifactId,
  processId,
  runId,
  width,
  onReviewAction,
  onExit,
}: ArtifactContextPanelProps) {
  // Collapse state (F4 fix — ADR-023: user can dismiss context panel)
  const [collapsed, setCollapsed] = useState(false);

  // Fetch run data if runId is available
  const { data: run, isLoading } = useProcessRunDetail(runId ?? "");

  const handleReview = useCallback(
    async (action: "approve" | "edit" | "reject") => {
      if (onReviewAction) {
        onReviewAction(action);
      }

      // Also call the review API
      if (runId) {
        try {
          await fetch("/api/feed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              processId,
              runId,
            }),
          });
        } catch {
          // Silently fail — user can retry
        }
      }

      // Exit artifact mode on approve/reject (AC8)
      if (action === "approve" || action === "reject") {
        onExit();
      }
    },
    [onReviewAction, processId, runId, onExit],
  );

  const lifecycle = run ? getLifecycleStatus(run.status) : null;
  const isReviewable = lifecycle === "under-review";

  // Collapsed state — narrow strip with expand button (F4: user can dismiss)
  if (collapsed) {
    return (
      <div className="w-12 flex-shrink-0 border-l border-border bg-surface flex flex-col items-center py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center hover:bg-accent/20 transition-colors"
          title="Show context"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-accent" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 border-l border-border bg-background flex flex-col"
      style={{ width }}
    >
      {/* Header with collapse button (F4 fix) */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-accent"
            style={{ animation: "pulse-dot 3s ease-in-out infinite" }}
          />
          <span className="text-sm font-medium text-text-primary">Context</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-text-muted hover:text-text-primary transition-colors text-sm"
          title="Collapse"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Artifact title + type + lifecycle badge */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary truncate flex-1">
              {run?.processName ?? TYPE_LABELS[artifactType]}
            </h3>
            {lifecycle && <LifecycleBadge status={lifecycle} />}
          </div>
          <p className="text-xs text-text-muted">
            {TYPE_LABELS[artifactType]} artifact
            {artifactId && ` · ${artifactId}`}
          </p>
        </div>

        {/* Loading state */}
        {isLoading && runId && (
          <div className="space-y-3">
            <div className="h-4 bg-surface animate-pulse rounded w-3/4" />
            <div className="h-4 bg-surface animate-pulse rounded w-1/2" />
          </div>
        )}

        {/* Review actions (AC6) */}
        {isReviewable && (
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
              Review
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleReview("approve")}
                className="flex-1 text-sm py-1.5 rounded-lg bg-positive/10 text-positive hover:bg-positive/20 transition-colors font-medium"
              >
                Approve
              </button>
              <button
                onClick={() => handleReview("edit")}
                className="flex-1 text-sm py-1.5 rounded-lg bg-surface text-text-secondary hover:bg-surface-raised transition-colors font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => handleReview("reject")}
                className="flex-1 text-sm py-1.5 rounded-lg bg-negative/10 text-negative hover:bg-negative/20 transition-colors font-medium"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Provenance placeholder (AC6) */}
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Knowledge used
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Provenance data will appear here — what knowledge, rules, and prior
            corrections informed this output.
          </p>
        </div>

        {/* Process context */}
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Process context
          </p>
          <div className="space-y-1.5">
            {run && (
              <>
                <p className="text-sm text-text-secondary">
                  {run.processName}
                </p>
                {run.steps.length > 0 && (
                  <div className="space-y-1">
                    {run.steps.slice(0, 3).map((step) => (
                      <div key={step.id} className="flex items-center gap-2 text-xs">
                        <span
                          className={`flex-shrink-0 ${
                            step.status === "completed" || step.status === "approved"
                              ? "text-positive"
                              : step.status === "running"
                                ? "text-accent"
                                : "text-text-muted"
                          }`}
                        >
                          {step.status === "completed" || step.status === "approved"
                            ? "✓"
                            : step.status === "running"
                              ? "→"
                              : "○"}
                        </span>
                        <span className="text-text-muted">{step.stepId}</span>
                      </div>
                    ))}
                    {run.steps.length > 3 && (
                      <p className="text-xs text-text-muted">
                        +{run.steps.length - 3} more steps
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {!run && !isLoading && (
              <p className="text-sm text-text-secondary">
                Process details will appear when the artifact is linked to a run.
              </p>
            )}
          </div>
        </div>

        {/* Version history placeholder */}
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Versions
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Version history will appear here as the artifact is refined
            through conversation.
          </p>
        </div>
      </div>
    </div>
  );
}
