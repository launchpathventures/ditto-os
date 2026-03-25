"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ReviewCardBlock } from "@/lib/engine";

/**
 * ReviewCardBlock — inline review with approve/edit/reject.
 * Visual design matches existing review-item.tsx from feed.
 */
interface Props {
  block: ReviewCardBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function ReviewCardBlockComponent({ block, onAction }: Props) {
  const [state, setState] = useState<"pending" | "approved" | "rejected">("pending");

  const confidenceDot = {
    high: "bg-positive",
    medium: "bg-warning",
    low: "bg-negative",
  };

  const handleAction = (action: typeof block.actions[number]) => {
    if (action.id.includes("approve")) setState("approved");
    if (action.id.includes("reject")) setState("rejected");
    onAction?.(action.id, action.payload);
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-surface-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary/50">
        {block.confidence && (
          <div className={cn("w-2 h-2 rounded-full", confidenceDot[block.confidence])} />
        )}
        <span className="text-sm font-medium text-text-primary">{block.stepName}</span>
        {state !== "pending" && (
          <span className={cn(
            "ml-auto text-xs font-medium px-2 py-0.5 rounded",
            state === "approved" ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
          )}>
            {state}
          </span>
        )}
      </div>

      {/* Output text */}
      <div className="px-3 py-2 text-sm text-text-primary whitespace-pre-wrap max-h-48 overflow-y-auto">
        {block.outputText}
      </div>

      {/* Knowledge provenance */}
      {block.knowledgeUsed && block.knowledgeUsed.length > 0 && (
        <div className="px-3 py-1.5 text-xs text-text-secondary border-t border-border/50">
          Based on: {block.knowledgeUsed.join(", ")}
        </div>
      )}

      {/* Actions */}
      {state === "pending" && block.actions.length > 0 && (
        <div className="flex gap-2 px-3 py-2 border-t border-border/50">
          {block.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                action.style === "primary"
                  ? "bg-accent text-white hover:bg-accent/90"
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
    </div>
  );
}
