"use client";

/**
 * Type 3: Work Update Card
 *
 * One-line status with expandable detail.
 * Provenance: Brief 041 AC4.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WorkUpdateItem } from "@/lib/feed-types";

interface WorkUpdateCardProps {
  item: WorkUpdateItem;
}

export function WorkUpdateCard({ item }: WorkUpdateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { processName, status, summary, detail, stepsExecuted } = item.data;

  const statusIcon = status === "approved" ? "\u2713" : "\u2192";
  const statusColor = status === "approved" ? "text-positive" : "text-info";

  return (
    <Card>
      <CardContent className="py-3">
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
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-xs h-6 px-1"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Less" : "More"}
            </Button>
            {expanded && (
              <div className="mt-2 text-xs text-text-muted space-y-1">
                {stepsExecuted !== undefined && (
                  <p>{stepsExecuted} step{stepsExecuted !== 1 ? "s" : ""} executed</p>
                )}
                {detail && <p>{detail}</p>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
