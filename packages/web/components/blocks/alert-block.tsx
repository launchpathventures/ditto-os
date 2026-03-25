"use client";

import { cn } from "@/lib/utils";
import type { AlertBlock } from "@/lib/engine";

interface Props {
  block: AlertBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function AlertBlockComponent({ block, onAction }: Props) {
  const severityStyles = {
    info: { dot: "bg-accent", bg: "bg-accent/5", border: "border-accent/20" },
    warning: { dot: "bg-warning", bg: "bg-warning/5", border: "border-warning/20" },
    error: { dot: "bg-negative", bg: "bg-negative/5", border: "border-negative/20" },
  };

  const style = severityStyles[block.severity];

  return (
    <div className={cn("my-2 rounded-lg border p-3", style.bg, style.border)}>
      <div className="flex items-start gap-2">
        <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", style.dot)} />
        <div className="flex-1">
          <div className="text-sm font-medium text-text-primary">{block.title}</div>
          <p className="text-sm text-text-secondary mt-0.5">{block.content}</p>
          {block.actions && block.actions.length > 0 && (
            <div className="flex gap-2 mt-2">
              {block.actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onAction?.(action.id, action.payload)}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
