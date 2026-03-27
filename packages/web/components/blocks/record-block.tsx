"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { RecordBlock } from "@/lib/engine";

/**
 * RecordBlock — General structured record. Renders as typographic flow (no cards).
 * Used for review items, inbox items, tasks, roles, knowledge entries, feed items.
 * Separation via border-top, optional border-left accent for process/department color.
 */
interface Props {
  block: RecordBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

const confidenceDot: Record<string, string> = {
  high: "bg-positive",
  medium: "bg-warning",
  low: "bg-negative",
};

const statusVariant: Record<string, string> = {
  positive: "bg-positive/10 text-positive",
  caution: "bg-caution/10 text-caution",
  negative: "bg-negative/10 text-negative",
  neutral: "bg-surface-secondary text-text-secondary",
  info: "bg-info/10 text-info",
};

export function RecordBlockComponent({ block, onAction }: Props) {
  const [actionState, setActionState] = useState<string | null>(null);

  const handleAction = (action: { id: string; label: string; payload?: Record<string, unknown> }) => {
    setActionState(action.label);
    onAction?.(action.id, action.payload);
  };

  return (
    <div
      className="py-3 border-t border-border first:border-t-0"
      style={block.accent ? { borderLeftWidth: 2, borderLeftColor: block.accent, paddingLeft: 12 } : undefined}
    >
      {/* Header: title + subtitle + confidence + status */}
      <div className="flex items-center gap-2 flex-wrap">
        {block.confidence && (
          <div className={cn("w-2 h-2 rounded-full flex-shrink-0", confidenceDot[block.confidence])} />
        )}
        <span className="text-sm font-semibold text-text-primary">{block.title}</span>
        {block.subtitle && (
          <span className="text-xs text-text-muted">{block.subtitle}</span>
        )}
        {block.status && (
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full ml-auto",
            statusVariant[block.status.variant] ?? statusVariant.neutral,
          )}>
            {block.status.label}
          </span>
        )}
      </div>

      {/* Detail text */}
      {block.detail && (
        <p className="mt-1.5 text-sm text-text-secondary">{block.detail}</p>
      )}

      {/* Annotated fields — field table with provenance and flags */}
      {block.fields && block.fields.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {block.fields.map((field, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="text-text-muted min-w-[80px]">{field.label}</span>
              <span className="text-text-primary font-medium">{field.value}</span>
              {field.provenance && (
                <span className="text-xs text-text-muted">← {field.provenance}</span>
              )}
              {field.flag && (
                <span className={cn(
                  "text-xs",
                  field.flag.level === "error" ? "text-negative" :
                  field.flag.level === "warning" ? "text-caution" : "text-info",
                )}>
                  {field.flag.level === "error" ? "✗" : "⚠"} {field.flag.message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pre-checks */}
      {block.checks && block.checks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {block.checks.map((check, i) => (
            <span
              key={i}
              className={cn(
                "text-xs",
                check.passed ? "text-positive" : "text-caution",
              )}
              title={check.detail}
            >
              {check.passed ? "✓" : "⚠"} {check.label}
            </span>
          ))}
        </div>
      )}

      {/* Provenance */}
      {block.provenance && block.provenance.length > 0 && (
        <div className="mt-1.5 text-xs text-text-muted">
          Based on: {block.provenance.join(", ")}
        </div>
      )}

      {/* Actions */}
      {!actionState && block.actions && block.actions.length > 0 && (
        <div className="mt-2 flex gap-2">
          {block.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
                action.style === "primary"
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : action.style === "danger"
                    ? "text-negative hover:bg-negative/10"
                    : "text-text-secondary hover:bg-surface-secondary",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {actionState && (
        <div className="mt-2 text-xs font-medium text-positive">{actionState}</div>
      )}
    </div>
  );
}
