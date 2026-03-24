"use client";

/**
 * Type 2: Review Card
 *
 * Inline approve/edit/reject for process outputs waiting review.
 * Confidence indicator: green (high), amber (medium), no dot (low/null).
 * Calls server-side review actions via /api/feed POST.
 *
 * Provenance: Brief 041 AC3, AC9-12. Asana card actions pattern.
 */

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  const { processRunId, processName, stepName, outputText, confidence, flags } = item.data;

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

  // Collapsed confirmation state
  if (state === "approved") {
    return (
      <Card className="opacity-70">
        <CardContent className="py-3 flex items-center gap-2 text-sm text-positive">
          <span className="text-base">&#10003;</span>
          <span>
            {processName} &mdash; {stepName} approved
          </span>
        </CardContent>
      </Card>
    );
  }

  if (state === "rejected") {
    return (
      <Card className="opacity-70">
        <CardContent className="py-3 flex items-center gap-2 text-sm text-negative">
          <span className="text-base">&#10005;</span>
          <span>
            {processName} &mdash; Returned for revision
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-caution">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{processName}</CardTitle>
            <ConfidenceDot level={confidence} />
          </div>
          <span className="text-xs text-text-muted">{stepName}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Flags */}
        {flags && flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flags.map((flag, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full bg-caution/10 px-2 py-0.5 text-xs text-text-secondary"
              >
                {flag}
              </span>
            ))}
          </div>
        )}

        {/* Output preview or editor */}
        {state === "editing" ? (
          <ReviewEditor
            originalText={outputText}
            onSave={handleEditSave}
            onCancel={() => setState("pending")}
            saving={reviewAction.isPending}
          />
        ) : state === "rejecting" ? (
          <div className="space-y-2">
            <p className="text-sm text-text-secondary whitespace-pre-line line-clamp-6">
              {outputText}
            </p>
            <textarea
              className="w-full rounded-lg border border-border bg-surface-raised p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Why are you returning this?"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReject}
                disabled={!rejectReason.trim() || reviewAction.isPending}
              >
                {reviewAction.isPending ? "Sending..." : "Return for revision"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setState("pending")}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary whitespace-pre-line line-clamp-6">
              {outputText}
            </p>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={reviewAction.isPending}
              >
                {reviewAction.isPending ? "Approving..." : "Approve"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setState("editing")}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-text-muted"
                onClick={() => setState("rejecting")}
              >
                Ask Self
              </Button>
            </div>
          </>
        )}

        {reviewAction.isError && (
          <p className="text-xs text-negative">
            {reviewAction.error?.message ?? "Something went wrong"}
          </p>
        )}
      </CardContent>
    </Card>
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
  // low or null — no dot
  return null;
}
