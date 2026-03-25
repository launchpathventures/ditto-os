"use client";

/**
 * Type 3: Work Update Card — Compact one-liner
 *
 * Provenance: Brief 041, workspace-layout-redesign-ux.md
 */

import { useState } from "react";
import type { WorkUpdateItem } from "@/lib/feed-types";

interface WorkUpdateCardProps {
  item: WorkUpdateItem;
}

export function WorkUpdateCard({ item }: WorkUpdateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { status, summary, detail, stepsExecuted } = item.data;

  const statusIcon = status === "approved" ? "✓" : "→";
  const statusColor = status === "approved" ? "text-positive" : "text-info";

  return (
    <div className="py-2 px-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${statusColor}`}>{statusIcon}</span>
          <span className="text-sm text-text-primary">{summary}</span>
        </div>
        <span className="text-xs text-text-muted">
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {(detail || stepsExecuted !== undefined) && (
        <>
          <button
            className="mt-1 text-xs text-text-muted hover:text-text-primary transition-colors ml-5"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Less" : "More"}
          </button>
          {expanded && (
            <div className="mt-1 ml-5 text-xs text-text-muted space-y-1">
              {stepsExecuted !== undefined && (
                <p>
                  {stepsExecuted} step{stepsExecuted !== 1 ? "s" : ""} executed
                </p>
              )}
              {detail && <p>{detail}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
