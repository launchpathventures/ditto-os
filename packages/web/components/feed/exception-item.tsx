"use client";

/**
 * Type 4: Exception Card — Compact
 *
 * Single-line-scannable: status icon + description + compact text-link actions.
 * No multi-paragraph error dumps. No heavy borders.
 *
 * Redesign AC6: Single-line-scannable exceptions.
 * Redesign AC8: User language, not system names.
 * Redesign AC9: Compact text links, not bordered buttons.
 * Redesign AC10: Neutral name, status via icon.
 *
 * Provenance: workspace-layout-redesign-ux.md
 */

import type { ExceptionItem as ExceptionItemType } from "@/lib/feed-types";

interface ExceptionCardProps {
  item: ExceptionItemType;
}

export function ExceptionCard({ item }: ExceptionCardProps) {
  const { processName, explanation } = item.data;

  return (
    <div className="py-2.5 px-3 rounded-lg hover:bg-surface transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-caution text-sm flex-shrink-0 mt-0.5">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">
            <span className="font-medium">{processName}</span>
            {" — "}
            <span className="text-text-secondary">{explanation}</span>
          </p>
          <div className="flex gap-3 mt-1">
            <button className="text-xs text-text-muted hover:text-text-primary transition-colors">
              Investigate
            </button>
            <button className="text-xs text-text-muted hover:text-text-primary transition-colors">
              Pause
            </button>
            <button className="text-xs text-accent hover:text-accent-hover transition-colors">
              Ask Ditto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Grouped exception card — for multiple exceptions of the same type.
 *
 * Redesign AC7: Repeated exceptions grouped with count and bulk action.
 */
interface GroupedExceptionProps {
  processName: string;
  count: number;
  commonExplanation: string;
}

export function GroupedExceptionCard({
  processName,
  count,
  commonExplanation,
}: GroupedExceptionProps) {
  return (
    <div className="py-2.5 px-3 rounded-lg hover:bg-surface transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-caution text-sm flex-shrink-0 mt-0.5">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">
            <span className="font-medium">{count} issues</span>
            {" with "}
            <span className="font-medium">{processName}</span>
          </p>
          <p className="text-xs text-text-muted mt-0.5">{commonExplanation}</p>
          <div className="flex gap-3 mt-1">
            <button className="text-xs text-text-muted hover:text-text-primary transition-colors">
              Investigate all
            </button>
            <button className="text-xs text-text-muted hover:text-text-primary transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
