"use client";

/**
 * Ditto — Pipeline Review Hook (Brief 053, AC11)
 *
 * Listens for `gate-pause` events via `useHarnessEvents`, fetches the paused
 * step's output, and exposes a `pendingReview` state for the conversation feed
 * to render inline review prompts.
 *
 * Review actions (approve/edit/reject) route through the existing /api/actions
 * endpoint which calls approveRun/editRun/rejectRun on the engine.
 *
 * Provenance: GitHub PR review notifications (event triggers review UI in working context).
 */

import { useState, useCallback, useRef } from "react";
import type { ContentBlock } from "@/lib/engine";
import type { HarnessEventData } from "./use-harness-events";
import { useInteractionEvent } from "./use-interaction-events";

export interface PendingReview {
  runId: string;
  stepId: string;
  stepName: string;
  output: ContentBlock[];
}

interface UsePipelineReviewOptions {
  /** Called when a review action is taken (to refresh feed, etc.) */
  onReviewAction?: () => void;
}

export function usePipelineReview({ onReviewAction }: UsePipelineReviewOptions = {}) {
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [loading, setLoading] = useState(false);
  const onReviewActionRef = useRef(onReviewAction);
  onReviewActionRef.current = onReviewAction;
  const { emit: emitInteraction } = useInteractionEvent();
  const emitInteractionRef = useRef(emitInteraction);
  emitInteractionRef.current = emitInteraction;

  // Brief 056 AC9: Track when review prompt appeared for duration measurement
  const reviewPromptShownAtRef = useRef<number | null>(null);
  const pendingStepIdRef = useRef<string | null>(null);

  // Use a ref to avoid stale closure on pendingReview.runId in handleHarnessEvent.
  // The ref is always current; the callback has no dependency on pendingReview state.
  const pendingRunIdRef = useRef<string | null>(null);
  // Keep ref in sync with state
  pendingRunIdRef.current = pendingReview?.runId ?? null;

  /**
   * Event handler — call this from useHarnessEvents onEvent callback.
   * When a gate-pause event arrives, fetches the step output and sets pendingReview.
   * Uses pendingRunIdRef (not state) to avoid stale closure on rapid events.
   */
  const handleHarnessEvent = useCallback(async (event: HarnessEventData) => {
    if (event.type === "gate-pause" && event.processRunId && event.stepId) {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/processes?action=getRunOutput&runId=${event.processRunId}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            blocks: ContentBlock[];
            processName: string;
            status: string;
          };
          const review: PendingReview = {
            runId: event.processRunId,
            stepId: event.stepId,
            stepName: (event.stepName as string) ?? event.stepId,
            output: data.blocks,
          };
          setPendingReview(review);
          pendingRunIdRef.current = review.runId;
          pendingStepIdRef.current = review.stepId;
          reviewPromptShownAtRef.current = Date.now();
        }
      } catch {
        // Non-critical — review prompt won't appear
      } finally {
        setLoading(false);
      }
    }

    // Clear pending review when run continues or completes
    // Read from ref (always current) instead of state closure
    if (
      (event.type === "gate-advance" || event.type === "run-complete" || event.type === "run-failed") &&
      event.processRunId === pendingRunIdRef.current
    ) {
      setPendingReview(null);
      pendingRunIdRef.current = null;
    }
  }, []); // No dependencies — reads from refs only

  /**
   * Brief 056 AC9: Emit review_prompt_seen when user takes a review action.
   */
  const emitReviewSeen = useCallback(() => {
    const runId = pendingRunIdRef.current;
    const stepId = pendingStepIdRef.current;
    const shownAt = reviewPromptShownAtRef.current;
    if (runId && stepId && shownAt) {
      const durationBeforeAction = Date.now() - shownAt;
      emitInteractionRef.current("review_prompt_seen", runId, {
        runId,
        stepId,
        durationBeforeAction,
      });
    }
    reviewPromptShownAtRef.current = null;
    pendingStepIdRef.current = null;
  }, []);

  /**
   * Approve the pending review.
   */
  const approve = useCallback(async () => {
    const runId = pendingRunIdRef.current;
    if (!runId) return;
    emitReviewSeen();
    try {
      await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_review",
          runId,
        }),
      });
      setPendingReview(null);
      pendingRunIdRef.current = null;
      onReviewActionRef.current?.();
    } catch {
      // Handle silently — retry on next interaction
    }
  }, [emitReviewSeen]);

  /**
   * Edit/provide feedback on the pending review.
   */
  const edit = useCallback(async (feedback: string) => {
    const runId = pendingRunIdRef.current;
    if (!runId) return;
    emitReviewSeen();
    try {
      await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_review",
          runId,
          feedback,
        }),
      });
      setPendingReview(null);
      pendingRunIdRef.current = null;
      onReviewActionRef.current?.();
    } catch {
      // Handle silently
    }
  }, [emitReviewSeen]);

  /**
   * Reject the pending review.
   */
  const reject = useCallback(async (reason: string) => {
    const runId = pendingRunIdRef.current;
    if (!runId) return;
    emitReviewSeen();
    try {
      await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_review",
          runId,
          reason,
        }),
      });
      setPendingReview(null);
      pendingRunIdRef.current = null;
      onReviewActionRef.current?.();
    } catch {
      // Handle silently
    }
  }, [emitReviewSeen]);

  return {
    pendingReview,
    loading,
    handleHarnessEvent,
    approve,
    edit,
    reject,
  };
}
