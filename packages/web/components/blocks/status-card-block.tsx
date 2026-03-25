"use client";

import type { StatusCardBlock } from "@/lib/engine";

export function StatusCardBlockComponent({ block }: { block: StatusCardBlock }) {
  return (
    <div className="my-2 rounded-lg border border-border bg-surface-primary overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary/50">
        <span className="text-sm font-medium text-text-primary">{block.title}</span>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded bg-accent/10 text-accent">
          {block.status}
        </span>
      </div>
      {Object.keys(block.details).length > 0 && (
        <div className="px-3 py-2 space-y-1">
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
