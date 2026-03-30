"use client";

/**
 * ChecklistBlock Renderer (Brief 061 — Block Renderer Upgrade)
 *
 * Uses Task AI Element structure internally. Maps ChecklistBlock
 * fields to Task composable subcomponents. Auto-collapse when >5 items.
 *
 * Two-layer architecture: ContentBlock type defines WHAT (engine),
 * AI Elements define HOW (React UI).
 */

import { cn } from "@/lib/utils";
import type { ChecklistBlock } from "@/lib/engine";
import { Task, TaskTrigger, TaskContent } from "@/components/ai-elements/task";

const statusConfig = {
  done: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-positive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    textClass: "text-text-primary",
  },
  pending: {
    icon: (
      <div className="w-4 h-4 rounded-full border-2 border-border-strong" />
    ),
    textClass: "text-text-secondary",
  },
  warning: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-caution)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" /><path d="M12 17h.01" />
      </svg>
    ),
    textClass: "text-text-primary",
  },
};

export function ChecklistBlockComponent({ block }: { block: ChecklistBlock }) {
  const doneCount = block.items.filter((item) => item.status === "done").length;
  const autoCollapse = block.items.length > 5;

  return (
    <Task defaultOpen={!autoCollapse} data-testid="checklist-block">
      <TaskTrigger>
        <span className="flex-1 text-left">{block.title || "Checklist"}</span>
        <span className="text-xs text-text-muted font-normal">
          ({block.items.length} items)
        </span>
        <span className="text-xs text-text-muted font-normal">
          {doneCount} of {block.items.length} done
        </span>
      </TaskTrigger>
      <TaskContent>
        {block.items.map((item, i) => {
          const config = statusConfig[item.status];
          return (
            <div key={i} className="flex items-start gap-[var(--spacing-2)]">
              <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
              <div className="flex-1">
                <span className={cn("text-sm", config.textClass)}>
                  {item.label}
                </span>
                {item.detail && (
                  <div className="text-xs text-text-muted mt-0.5">
                    {item.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </TaskContent>
    </Task>
  );
}
