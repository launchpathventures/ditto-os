"use client";

/**
 * Type 5: Insight Card
 *
 * Pattern detection + evidence + "Teach this" / No / Tell me more actions.
 * Appears when 3+ similar corrections detected (AC13).
 *
 * Provenance: Brief 041 AC6, AC13. Phase 8 "Teach this" precursor.
 */

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { InsightItem as InsightItemType } from "@/lib/feed-types";

interface InsightCardProps {
  item: InsightItemType;
}

export function InsightCard({ item }: InsightCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const { processName, pattern, count, evidence } = item.data;

  if (dismissed) return null;

  return (
    <Card className="border-l-4 border-l-info">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pattern detected</CardTitle>
          <span className="text-xs text-text-muted">{processName}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">{evidence}</p>
        <p className="text-xs text-text-muted">
          Seen {count} times. Should this become a rule?
        </p>
        <div className="flex gap-2">
          <Button size="sm">Teach this</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
          >
            No
          </Button>
          <Button variant="ghost" size="sm" className="text-text-muted">
            Tell me more
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
