"use client";

import { useState } from "react";
import type { KnowledgeCitationBlock } from "@/lib/engine";

export function KnowledgeCitationBlockComponent({ block }: { block: KnowledgeCitationBlock }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-secondary hover:text-text-primary transition-colors"
      >
        {block.label}: {block.sources.map((s) => s.name).join(", ")}
        {block.sources.some((s) => s.excerpt) && (expanded ? " ▾" : " ▸")}
      </button>
      {expanded && (
        <div className="mt-1 pl-3 border-l border-border/50 space-y-1">
          {block.sources.map((source, i) => (
            <div key={i} className="text-xs text-text-secondary">
              <span className="font-medium">{source.name}</span>
              <span className="text-text-secondary/60"> ({source.type})</span>
              {source.excerpt && (
                <p className="mt-0.5 italic">{source.excerpt}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
