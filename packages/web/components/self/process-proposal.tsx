"use client";

/**
 * Ditto — Process Proposal Card
 *
 * Shows a proposed process in plain language with step status
 * indicators (done/current/pending). User can approve or adjust.
 * No system vocabulary — everything is human-readable.
 *
 * Provenance: Brief 044 (AC9), Insight-079 (Gathering → Proposing → Working).
 */

import { cn } from "@/lib/utils";

interface ProcessStep {
  name: string;
  description?: string;
  status: "done" | "current" | "pending";
}

interface ProcessProposalProps {
  name: string;
  description?: string;
  steps: ProcessStep[];
  onApprove?: () => void;
  onAdjust?: () => void;
}

function StepIcon({ status }: { status: ProcessStep["status"] }) {
  switch (status) {
    case "done":
      return (
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs font-bold">
          ✓
        </span>
      );
    case "current":
      return (
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold">
          →
        </span>
      );
    case "pending":
      return (
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-xs">
          ○
        </span>
      );
  }
}

export function ProcessProposal({
  name,
  description,
  steps,
  onApprove,
  onAdjust,
}: ProcessProposalProps) {
  return (
    <div className="my-4 rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-secondary/50">
        <h3 className="text-sm font-medium text-text-primary">{name}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
        )}
      </div>

      {/* Steps */}
      <div className="px-4 py-3">
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <StepIcon status={step.status} />
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    "text-sm",
                    step.status === "done"
                      ? "text-text-tertiary line-through"
                      : step.status === "current"
                        ? "text-text-primary font-medium"
                        : "text-text-secondary",
                  )}
                >
                  {step.name}
                </span>
                {step.description && step.status !== "done" && (
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        <button
          onClick={() => onApprove?.()}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          Looks good — let's try it
        </button>
        <button
          onClick={() => onAdjust?.()}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
        >
          I'd change something
        </button>
      </div>
    </div>
  );
}
