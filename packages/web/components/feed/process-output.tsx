"use client";

/**
 * Type 6: Process Output Card
 *
 * Rendered process output with summary + content area.
 * Content area is a placeholder for json-render (deferred).
 *
 * Provenance: Brief 041 AC7.
 */

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProcessOutputItem as ProcessOutputItemType } from "@/lib/feed-types";

interface ProcessOutputCardProps {
  item: ProcessOutputItemType;
}

export function ProcessOutputCard({ item }: ProcessOutputCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { processName, outputName, outputType, summary, content } = item.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{processName}</CardTitle>
          <span className="text-xs text-text-muted">{outputName}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-text-secondary">{summary}</p>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-6 px-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide content" : "View content"}
        </Button>

        {expanded && (
          <div className="rounded-md bg-surface p-3 text-xs font-mono text-text-secondary max-h-60 overflow-y-auto whitespace-pre-wrap">
            {typeof content === "string"
              ? content
              : JSON.stringify(content, null, 2)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
