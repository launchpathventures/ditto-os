"use client";

import { cn } from "@/lib/utils";
import type { ChecklistBlock } from "@/lib/engine";

export function ChecklistBlockComponent({ block }: { block: ChecklistBlock }) {
  const statusStyles = {
    done: { icon: "✓", color: "text-positive" },
    pending: { icon: "○", color: "text-text-muted" },
    warning: { icon: "!", color: "text-warning" },
  };

  return (
    <div data-testid="checklist-block" className="my-2 space-y-1">
      {block.title && (
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          {block.title}
        </p>
      )}
      {block.items.map((item, i) => {
        const style = statusStyles[item.status];
        return (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className={cn("flex-shrink-0 text-xs mt-0.5 w-3 text-center", style.color)}>
              {style.icon}
            </span>
            <div className="flex-1">
              <span className={cn(
                "text-text-secondary",
                item.status === "done" && "line-through text-text-muted",
              )}>
                {item.label}
              </span>
              {item.detail && (
                <span className="text-text-muted text-xs ml-1">— {item.detail}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
