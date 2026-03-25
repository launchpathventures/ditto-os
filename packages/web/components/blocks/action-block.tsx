"use client";

import { cn } from "@/lib/utils";
import type { ActionBlock } from "@/lib/engine";

interface Props {
  block: ActionBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function ActionBlockComponent({ block, onAction }: Props) {
  return (
    <div className="flex gap-2 my-2">
      {block.actions.map((action) => (
        <button
          key={action.id}
          onClick={() => onAction?.(action.id, action.payload)}
          className={cn(
            "text-sm font-medium px-3 py-1.5 rounded-md transition-colors",
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
  );
}
