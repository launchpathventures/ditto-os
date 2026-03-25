"use client";

/**
 * Ditto — Artifact Viewer Panel (Right Panel Variant)
 *
 * Shows process run output for review: name, lifecycle badge,
 * output content, review actions (Approve/Edit/Reject), provenance.
 * Data fetched via existing React Query hooks — no data payloads in PanelContext.
 *
 * AC9: Renders name, lifecycle badge, output content, review actions, provenance.
 * AC10: Approve/Edit/Reject calls existing review endpoints.
 *
 * Provenance: Brief 046, Melty IDE output lifecycle badge pattern.
 */

import { useCallback } from "react";
import { useProcessRunDetail } from "@/lib/process-query";
import { BlockList } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";

interface ArtifactViewerPanelProps {
  runId: string;
  processId: string;
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

export function ArtifactViewerPanel({ runId, processId }: ArtifactViewerPanelProps) {
  const { data: run, isLoading, isError } = useProcessRunDetail(runId);

  const handleReview = useCallback(
    async (action: "approve" | "edit" | "reject") => {
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
        // Silently fail — the user can retry
      }
    },
    [processId, runId],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 bg-surface animate-pulse rounded w-3/4" />
        <div className="h-4 bg-surface animate-pulse rounded w-1/2" />
        <div className="h-20 bg-surface animate-pulse rounded" />
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="text-sm text-text-muted">
        <p>Could not load this output.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-accent hover:text-accent/80 transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const lifecycle = getLifecycleStatus(run.status);
  const isReviewable = lifecycle === "under-review";

  // Collect output blocks from step runs
  const outputBlocks: ContentBlock[] = [];
  for (const step of run.steps) {
    if (step.outputs && typeof step.outputs === "object") {
      const blocks = (step.outputs as { blocks?: ContentBlock[] }).blocks;
      if (blocks) outputBlocks.push(...blocks);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with lifecycle badge */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary truncate flex-1">
          {run.processName}
        </h3>
        <LifecycleBadge status={lifecycle} />
      </div>

      {/* Output content via block registry */}
      {outputBlocks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
            Output
          </p>
          <BlockList blocks={outputBlocks} />
        </div>
      ) : (
        <div className="text-sm text-text-secondary">
          {lifecycle === "running"
            ? "Process is still running..."
            : "No output content available."}
        </div>
      )}

      {/* Step summary */}
      {run.steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Steps
          </p>
          <div className="space-y-1.5">
            {run.steps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-2 text-sm">
                <span
                  className={`flex-shrink-0 text-xs ${
                    step.status === "completed" || step.status === "approved"
                      ? "text-positive"
                      : step.status === "running"
                        ? "text-accent"
                        : step.status === "failed"
                          ? "text-negative"
                          : "text-text-muted"
                  }`}
                >
                  {step.status === "completed" || step.status === "approved"
                    ? "✓"
                    : step.status === "running"
                      ? "→"
                      : step.status === "failed"
                        ? "✗"
                        : "○"}
                </span>
                <span className="text-text-secondary">{step.stepId}</span>
                {step.model && (
                  <span className="text-xs text-text-muted ml-auto">{step.model}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review actions */}
      {isReviewable && (
        <div className="flex gap-2 pt-2 border-t border-border">
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
      )}

      {/* Provenance */}
      {run.totalCostCents !== null && run.totalCostCents > 0 && (
        <p className="text-xs text-text-muted pt-2 border-t border-border">
          Cost: ${(run.totalCostCents / 100).toFixed(2)}
        </p>
      )}
    </div>
  );
}
