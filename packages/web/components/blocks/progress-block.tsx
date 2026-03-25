"use client";

import { cn } from "@/lib/utils";
import type { ProgressBlock } from "@/lib/engine";

export function ProgressBlockComponent({ block }: { block: ProgressBlock }) {
  const pct = block.totalSteps > 0
    ? Math.round((block.completedSteps / block.totalSteps) * 100)
    : 0;

  const statusColor = {
    running: "bg-accent",
    paused: "bg-warning",
    complete: "bg-positive",
  };

  return (
    <div className="my-2 space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-primary">{block.currentStep}</span>
        <span className="text-text-secondary">
          {block.completedSteps}/{block.totalSteps}
        </span>
      </div>
      <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", statusColor[block.status])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
