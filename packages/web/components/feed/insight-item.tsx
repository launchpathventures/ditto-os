"use client";

/**
 * Type 5: Insight Card — Compact
 *
 * Pattern detection + evidence + "Teach this" action.
 * Provenance: Brief 041, workspace-layout-redesign-ux.md
 * Brief 147: Wired "Teach this" button to learning loop closure.
 */

import { useState } from "react";
import type { InsightItem as InsightItemType } from "@/lib/feed-types";
import { useTeachAction, useDismissInsight } from "@/lib/feed-query";

interface InsightCardProps {
  item: InsightItemType;
}

export function InsightCard({ item }: InsightCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [taught, setTaught] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { processId, processName, pattern, count, evidence } = item.data;
  const teachAction = useTeachAction();
  const dismissAction = useDismissInsight();

  if (dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true); // Optimistic — hide immediately
    try {
      await dismissAction.mutateAsync({ processId, pattern });
    } catch {
      setDismissed(false); // Revert so the card reappears on failure
    }
  };

  const handleTeach = async () => {
    setError(null);
    try {
      await teachAction.mutateAsync({ processId, pattern });
      setTaught(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again");
    }
  };

  return (
    <div className="py-2.5 px-3 rounded-lg hover:bg-surface transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-info text-sm flex-shrink-0 mt-0.5">💡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">
            <span className="font-medium">{processName}</span>
            {" — "}
            <span className="text-text-secondary">{evidence}</span>
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Seen {count} times. Should this become a rule?
          </p>
          <div className="flex gap-3 mt-1">
            {taught ? (
              <span className="text-xs text-green-600 font-medium">✓ Learned!</span>
            ) : (
              <button
                className="text-xs text-accent font-medium hover:text-accent-hover transition-colors disabled:opacity-50"
                onClick={handleTeach}
                disabled={teachAction.isPending}
              >
                {teachAction.isPending ? "Teaching…" : "Teach this"}
              </button>
            )}
            {!taught && (
              <button
                className="text-xs text-text-muted hover:text-text-primary transition-colors"
                onClick={handleDismiss}
              >
                No
              </button>
            )}
            <button
              className="text-xs text-text-muted transition-colors opacity-50 cursor-default"
              disabled
              title="Coming soon"
            >
              Tell me more
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
