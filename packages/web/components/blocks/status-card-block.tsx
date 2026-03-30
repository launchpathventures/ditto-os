"use client";

import { cn } from "@/lib/utils";
import type { StatusCardBlock } from "@/lib/engine";

const STATUS_BADGE_VARIANT: Record<string, string> = {
  running: "bg-positive/10 text-positive",
  complete: "bg-positive/10 text-positive",
  paused: "bg-caution/10 text-caution",
  failed: "bg-negative/10 text-negative",
  draft: "bg-surface-secondary text-text-secondary",
};

const STATUS_BORDER_COLOR: Record<string, string> = {
  running: "border-l-positive",
  complete: "border-l-positive",
  paused: "border-l-caution",
  failed: "border-l-negative",
  draft: "border-l-border-strong",
};

function getBadgeVariant(status: string): string {
  return STATUS_BADGE_VARIANT[status.toLowerCase()] ?? "bg-info/10 text-info";
}

function getBorderColor(status: string): string {
  return STATUS_BORDER_COLOR[status.toLowerCase()] ?? "border-l-info";
}

export function StatusCardBlockComponent({ block }: { block: StatusCardBlock }) {
  return (
    <div className={cn("my-2 border-l-2 pl-3 py-3", getBorderColor(block.status))}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">{block.title}</span>
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full ml-auto",
          getBadgeVariant(block.status),
        )}>
          {block.status}
        </span>
      </div>
      <div className="text-xs text-text-muted mt-0.5">{block.entityType}</div>
      {Object.keys(block.details).length > 0 && (
        <div className="mt-2 space-y-0.5">
          {Object.entries(block.details).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-text-secondary">{key}</span>
              <span className="text-text-primary font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
