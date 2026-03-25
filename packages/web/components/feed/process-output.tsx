"use client";

/**
 * Type 6: Process Output Card
 *
 * Renders process outputs via block registry when blocks are available,
 * falls back to text/JSON for legacy outputs.
 *
 * AC9: Process outputs render via block registry instead of JSON.stringify
 *
 * Provenance: Brief 041 (original), Brief 045 (block registry migration).
 */

import { useState } from "react";
import type { ProcessOutputItem as ProcessOutputItemType } from "@/lib/feed-types";
import { BlockList } from "@/components/blocks/block-registry";

interface ProcessOutputCardProps {
  item: ProcessOutputItemType;
}

export function ProcessOutputCard({ item }: ProcessOutputCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { processName, outputName, summary, content, blocks } = item.data;
  const hasBlocks = blocks && blocks.length > 0;

  return (
    <div className="py-2.5 px-3 rounded-lg hover:bg-surface transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-positive text-sm flex-shrink-0 mt-0.5">&#10003;</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">
            <span className="font-medium">{processName}</span>
            {outputName && (
              <span className="text-text-muted"> — {outputName}</span>
            )}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">{summary}</p>

          <button
            className="mt-1 text-xs text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "View content"}
          </button>

          {expanded && (
            <div className="mt-2">
              {hasBlocks ? (
                <BlockList blocks={blocks} />
              ) : (
                <div className="rounded-lg bg-surface p-3 text-xs font-mono text-text-secondary max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {typeof content === "string"
                    ? content
                    : JSON.stringify(content, null, 2)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
