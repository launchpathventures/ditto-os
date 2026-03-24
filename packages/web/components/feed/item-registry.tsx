"use client";

/**
 * Ditto Web — Feed Item Registry
 *
 * Discriminated union renderer: maps itemType to the correct component.
 * New item types are added here — one switch case per type.
 *
 * Provenance: Brief 041 (Feed & Review), AC pattern: component registry.
 */

import type { FeedItem } from "@/lib/feed-types";
import { ShiftReportCard } from "./shift-report";
import { ReviewCard } from "./review-item";
import { WorkUpdateCard } from "./work-update";
import { ExceptionCard } from "./exception-item";
import { InsightCard } from "./insight-item";
import { ProcessOutputCard } from "./process-output";

interface FeedItemRendererProps {
  item: FeedItem;
}

export function FeedItemRenderer({ item }: FeedItemRendererProps) {
  switch (item.itemType) {
    case "shift-report":
      return <ShiftReportCard item={item} />;
    case "review":
      return <ReviewCard item={item} />;
    case "work-update":
      return <WorkUpdateCard item={item} />;
    case "exception":
      return <ExceptionCard item={item} />;
    case "insight":
      return <InsightCard item={item} />;
    case "process-output":
      return <ProcessOutputCard item={item} />;
    default: {
      // Exhaustiveness check — TypeScript will error if a type is missing
      const _exhaustive: never = item;
      return null;
    }
  }
}
