"use client";

/**
 * Type 1: Shift Report Card
 *
 * Narrative daily briefing — collapsible summary with stats.
 * Provenance: Brief 041 AC2. Notion updates pattern.
 */

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ShiftReportItem } from "@/lib/feed-types";

interface ShiftReportCardProps {
  item: ShiftReportItem;
}

export function ShiftReportCard({ item }: ShiftReportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { summary, stats, details } = item.data;

  return (
    <Card className="border-l-4 border-l-accent">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Your briefing</CardTitle>
          <span className="text-xs text-text-muted">
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-secondary">{summary}</p>

        {stats && (
          <div className="mt-3 flex gap-4 text-xs text-text-muted">
            {stats.reviewsPending > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                {stats.reviewsPending} to review
              </span>
            )}
            {stats.runsCompleted > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-positive" />
                {stats.runsCompleted} completed
              </span>
            )}
            {stats.exceptionsActive > 0 && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-negative" />
                {stats.exceptionsActive} exceptions
              </span>
            )}
          </div>
        )}

        {details && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
            {expanded && (
              <p className="mt-2 text-sm text-text-muted whitespace-pre-line">
                {details}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
