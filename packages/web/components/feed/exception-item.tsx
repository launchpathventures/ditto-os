"use client";

/**
 * Type 4: Exception Card
 *
 * Warning/error with natural language explanation and actions.
 * Provenance: Brief 041 AC5.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ExceptionItem as ExceptionItemType } from "@/lib/feed-types";

interface ExceptionCardProps {
  item: ExceptionItemType;
}

export function ExceptionCard({ item }: ExceptionCardProps) {
  const { processName, stepId, errorMessage, explanation } = item.data;

  return (
    <Card className="border-l-4 border-l-negative">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-negative">{processName}</CardTitle>
          <span className="text-xs text-text-muted">{stepId}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">{explanation}</p>
        <p className="rounded-md bg-surface p-2 text-xs font-mono text-text-muted line-clamp-3">
          {errorMessage}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            Investigate
          </Button>
          <Button variant="secondary" size="sm">
            Pause
          </Button>
          <Button variant="ghost" size="sm" className="text-text-muted">
            Ask Self
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
