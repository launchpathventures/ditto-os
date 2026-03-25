"use client";

/**
 * Type 2: Review Card — Compact
 *
 * Inline approve/edit/reject. No heavy left border. Compact action text links.
 * Confidence via small dot. Process name in neutral color.
 *
 * Redesign AC9: Compact text links for actions.
 * Redesign AC10: Process name neutral, status via icon.
 *
 * Provenance: Brief 041, workspace-layout-redesign-ux.md
 */

import { useState } from "react";
import { useReviewAction } from "@/lib/feed-query";
import { ReviewEditor } from "./review-editor";
import type { ReviewItem as ReviewItemType } from "@/lib/feed-types";

interface ReviewCardProps {
  item: ReviewItemType;
}

type ReviewState = "pending" | "approved" | "editing" | "rejecting" | "rejected";

export function ReviewCard({ item }: ReviewCardProps) {
  const [state, setState] = useState<ReviewState>("pending");
  const [rejectReason, setRejectReason] = useState("");
  const reviewAction = useReviewAction();

  const { processRunId, processName, stepName, outputText, confidence, flags } =
    item.data;

  const handleApprove = () => {
    reviewAction.mutate(
      { action: "approve", processRunId },
      { onSuccess: () => setState("approved") },
    );
  };

  const handleEditSave = (editedText: string) => {
    reviewAction.mutate(
      { action: "edit", processRunId, editedText },
      { onSuccess: () => setState("approved") },
    );
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    reviewAction.mutate(
      { action: "reject", processRunId, reason: rejectReason },
      { onSuccess: () => setState("rejected") },
    );
  };

  // Collapsed confirmation
  if (state === "approved") {
    return (
      <div className="py-2 px-3 flex items-center gap-2 text-sm text-positive opacity-70">
        <span>✓</span>
        <span>{processName} — approved</span>
      </div>
    );
  }

  if (state === "rejected") {
    return (
      <div className="py-2 px-3 flex items-center gap-2 text-sm text-text-muted opacity-70">
        <span>↩</span>
        <span>{processName} — returned for revision</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-raised shadow-[var(--shadow-subtle)] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ConfidenceDot level={confidence} />
          <span className="text-sm font-medium text-text-primary">
            {processName}
          </span>
        </div>
        <span className="text-xs text-text-muted">{stepName}</span>
      </div>

      {/* Flags */}
      {flags && flags.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {flags.map((flag, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-caution/10 px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="px-4 pb-3">
        {state === "editing" ? (
          <ReviewEditor
            originalText={outputText}
            onSave={handleEditSave}
            onCancel={() => setState("pending")}
            saving={reviewAction.isPending}
          />
        ) : state === "rejecting" ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary whitespace-pre-line line-clamp-4">
              {outputText}
            </p>
            <textarea
              className="w-full rounded-lg border border-border bg-background p-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
              placeholder="Why are you returning this?"
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3 text-sm">
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || reviewAction.isPending}
                className="text-negative hover:text-negative/80 disabled:opacity-50 transition-colors"
              >
                {reviewAction.isPending ? "Sending..." : "Return"}
              </button>
              <button
                onClick={() => setState("pending")}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary whitespace-pre-line line-clamp-4">
              {outputText}
            </p>

            {/* Actions — compact text links (AC9) */}
            <div className="flex gap-3 mt-2 text-sm">
              <button
                onClick={handleApprove}
                disabled={reviewAction.isPending}
                className="text-accent font-medium hover:text-accent-hover disabled:opacity-50 transition-colors"
              >
                {reviewAction.isPending ? "..." : "Approve"}
              </button>
              <button
                onClick={() => setState("editing")}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setState("rejecting")}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                Ask Ditto
              </button>
            </div>
          </>
        )}

        {reviewAction.isError && (
          <p className="text-xs text-negative mt-1">
            {reviewAction.error?.message ?? "Something went wrong"}
          </p>
        )}
      </div>
    </div>
  );
}

function ConfidenceDot({ level }: { level: string | null }) {
  if (level === "high") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-positive"
        title="High confidence"
      />
    );
  }
  if (level === "medium") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-caution"
        title="Medium confidence"
      />
    );
  }
  return null;
}
