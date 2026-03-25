"use client";

/**
 * Type 5: Insight Card — Compact
 *
 * Pattern detection + evidence + "Teach this" action.
 * Provenance: Brief 041, workspace-layout-redesign-ux.md
 */

import { useState } from "react";
import type { InsightItem as InsightItemType } from "@/lib/feed-types";

interface InsightCardProps {
  item: InsightItemType;
}

export function InsightCard({ item }: InsightCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const { processName, count, evidence } = item.data;

  if (dismissed) return null;

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
            <button className="text-xs text-accent font-medium hover:text-accent-hover transition-colors">
              Teach this
            </button>
            <button
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
              onClick={() => setDismissed(true)}
            >
              No
            </button>
            <button className="text-xs text-text-muted hover:text-text-primary transition-colors">
              Tell me more
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
