"use client";

import { cn } from "@/lib/utils";
import type { ProgressBlock } from "@/lib/engine";

const STATUS_BAR_COLOR: Record<string, string> = {
  running: "bg-accent",
  paused: "bg-caution",
  complete: "bg-positive",
};

const STATUS_BADGE_VARIANT: Record<string, string> = {
  running: "bg-info/10 text-info",
  paused: "bg-caution/10 text-caution",
  complete: "bg-positive/10 text-positive",
};

export function ProgressBlockComponent({ block }: { block: ProgressBlock }) {
  const pct = block.totalSteps > 0
    ? Math.round((block.completedSteps / block.totalSteps) * 100)
    : 0;

  const statusLabel = block.status.charAt(0).toUpperCase() + block.status.slice(1);

  return (
    <div data-testid="progress-block" className="my-2 space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-primary">{block.currentStep}</span>
        <div className="flex items-center gap-2">
          <span className="text-text-secondary">
            {block.completedSteps} of {block.totalSteps}
          </span>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            STATUS_BADGE_VARIANT[block.status] ?? "bg-surface-secondary text-text-secondary",
          )}>
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", STATUS_BAR_COLOR[block.status])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
