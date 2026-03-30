"use client";

import { cn } from "@/lib/utils";
import type { SuggestionBlock } from "@/lib/engine";

interface Props {
  block: SuggestionBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function SuggestionBlockComponent({ block, onAction }: Props) {
  return (
    <div className="my-2 rounded-lg bg-vivid-subtle py-3 px-4">
      <div className="text-xs font-semibold tracking-wider text-vivid-deep uppercase mb-1.5">
        Suggestion
      </div>
      <p className="text-sm text-text-primary">{block.content}</p>
      {block.reasoning && (
        <p className="mt-1 text-xs text-text-secondary italic">{block.reasoning}</p>
      )}
      {block.actions && block.actions.length > 0 && (
        <div className="flex gap-2 mt-2">
          {block.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction?.(action.id, action.payload)}
              className={cn(
                "text-xs font-medium px-3 py-1 rounded-full transition-colors",
                action.style === "primary"
                  ? "bg-vivid text-white hover:bg-vivid/90"
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
