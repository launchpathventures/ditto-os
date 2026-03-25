"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ReasoningTraceBlock } from "@/lib/engine";

export function ReasoningTraceBlockComponent({ block }: { block: ReasoningTraceBlock }) {
  const [expanded, setExpanded] = useState(false);

  const confidenceDot = {
    high: "bg-positive",
    medium: "bg-warning",
    low: "bg-negative",
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-surface-primary overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary/30 transition-colors text-left"
      >
        {block.confidence && (
          <div className={cn("w-2 h-2 rounded-full", confidenceDot[block.confidence])} />
        )}
        <span className="text-sm font-medium text-text-primary flex-1">{block.title}</span>
        <span className="text-xs text-text-secondary">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="px-3 py-2 border-t border-border/50 space-y-1.5">
          {block.steps.map((step, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-text-secondary flex-shrink-0">{i + 1}.</span>
              <div>
                <span className="font-medium text-text-primary">{step.label}:</span>{" "}
                <span className="text-text-secondary">{step.detail}</span>
              </div>
            </div>
          ))}
          <div className="pt-1.5 border-t border-border/50 text-sm">
            <span className="font-medium text-text-primary">Conclusion:</span>{" "}
            <span className="text-text-secondary">{block.conclusion}</span>
          </div>
        </div>
      )}
    </div>
  );
}
