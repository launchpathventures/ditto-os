"use client";

/**
 * Ditto Web — Feed Container
 *
 * Main feed component: priority ordering, entity grouping, date separators.
 * Subscribes to real-time updates via SSE.
 *
 * Provenance: Brief 041 (Feed & Review).
 */

import { useMemo } from "react";
import { useFeed } from "@/lib/feed-query";
import { FeedItemRenderer } from "./item-registry";
import { GroupedExceptionCard } from "./exception-item";
import { FeedEmpty, FeedLoading, FeedError } from "./empty-state";
import { PRIORITY_ORDER } from "@/lib/feed-types";
import type { FeedItem, EntityGroup, ExceptionItem } from "@/lib/feed-types";

/**
 * Group feed items by entity (work item), preserving ungrouped items.
 * Items with the same entityId cluster together.
 */
function groupByEntity(items: FeedItem[]): Array<EntityGroup | FeedItem> {
  const groups = new Map<string, FeedItem[]>();
  const ungrouped: FeedItem[] = [];

  for (const item of items) {
    if (item.entityId) {
      const existing = groups.get(item.entityId) ?? [];
      existing.push(item);
      groups.set(item.entityId, existing);
    } else {
      ungrouped.push(item);
    }
  }

  const result: Array<EntityGroup | FeedItem> = [];

  // Interleave groups and ungrouped by their first item's position
  // Build a sequence preserving priority-then-time order
  const all: Array<{ sortKey: number; entry: EntityGroup | FeedItem }> = [];

  for (const [entityId, entityItems] of groups) {
    // Group sort key = best priority of its items, then earliest timestamp
    const bestPriority = Math.min(
      ...entityItems.map((i) => PRIORITY_ORDER[i.priority]),
    );
    const earliestTime = Math.min(
      ...entityItems.map((i) => new Date(i.timestamp).getTime()),
    );

    // Only create a group header if there's more than one item
    if (entityItems.length > 1) {
      all.push({
        sortKey: bestPriority * 1e15 - earliestTime,
        entry: {
          entityId,
          entityLabel: entityItems[0].entityLabel ?? entityId.slice(0, 8),
          items: entityItems,
        },
      });
    } else {
      all.push({
        sortKey: bestPriority * 1e15 - earliestTime,
        entry: entityItems[0],
      });
    }
  }

  for (const item of ungrouped) {
    all.push({
      sortKey:
        PRIORITY_ORDER[item.priority] * 1e15 -
        new Date(item.timestamp).getTime(),
      entry: item,
    });
  }

  all.sort((a, b) => a.sortKey - b.sortKey);
  for (const { entry } of all) result.push(entry);

  return result;
}

function isEntityGroup(entry: EntityGroup | FeedItem): entry is EntityGroup {
  return "items" in entry && Array.isArray(entry.items);
}

/** Group consecutive exception items by process name (AC7). */
interface ExceptionGroup {
  type: "exception-group";
  processName: string;
  count: number;
  commonExplanation: string;
  items: ExceptionItem[];
}

type RenderEntry = FeedItem | EntityGroup | ExceptionGroup;

function isExceptionGroup(entry: RenderEntry): entry is ExceptionGroup {
  return "type" in entry && (entry as ExceptionGroup).type === "exception-group";
}

function groupExceptions(items: Array<EntityGroup | FeedItem>): RenderEntry[] {
  const result: RenderEntry[] = [];
  const exceptionsByProcess = new Map<string, ExceptionItem[]>();

  for (const entry of items) {
    if (!isEntityGroup(entry) && entry.itemType === "exception") {
      const exc = entry as ExceptionItem;
      const key = exc.data.processName;
      const existing = exceptionsByProcess.get(key) ?? [];
      existing.push(exc);
      exceptionsByProcess.set(key, existing);
    } else {
      result.push(entry);
    }
  }

  // Add grouped exceptions
  for (const [processName, exceptions] of exceptionsByProcess) {
    if (exceptions.length >= 2) {
      result.push({
        type: "exception-group",
        processName,
        count: exceptions.length,
        commonExplanation: exceptions[0].data.explanation,
        items: exceptions,
      });
    } else {
      result.push(exceptions[0]);
    }
  }

  return result;
}

/**
 * Date separator: shows "Today", "Yesterday", or the date.
 */
function dateSeparatorLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function Feed() {
  const { data, isLoading, isError } = useFeed();

  const grouped = useMemo(() => {
    if (!data?.items) return [];
    const byEntity = groupByEntity(data.items);
    return groupExceptions(byEntity);
  }, [data]);

  if (isLoading) return <FeedLoading />;
  if (isError) return <FeedError />;
  if (!data?.items.length) return <FeedEmpty />;

  // Track date separators
  let lastDate = "";

  return (
    <div className="space-y-2 pb-8">
      {grouped.map((entry, idx) => {
        if (isExceptionGroup(entry)) {
          return (
            <GroupedExceptionCard
              key={`exc-group-${entry.processName}`}
              processName={entry.processName}
              count={entry.count}
              commonExplanation={entry.commonExplanation}
            />
          );
        }

        if (isEntityGroup(entry)) {
          return (
            <div key={entry.entityId} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  {entry.entityLabel}
                </span>
                <span className="flex-1 h-px bg-border" />
              </div>
              {entry.items.map((item) => (
                <FeedItemRenderer key={item.id} item={item} />
              ))}
            </div>
          );
        }

        // Ungrouped item — add date separator if needed
        const item = entry;
        const itemDate = dateSeparatorLabel(item.timestamp);
        const showDateSep = itemDate !== lastDate;
        lastDate = itemDate;

        return (
          <div key={item.id}>
            {showDateSep && (
              <div className="flex items-center gap-2 px-1 pt-2 pb-1">
                <span className="text-xs font-medium text-text-muted">
                  {itemDate}
                </span>
                <span className="flex-1 h-px bg-border" />
              </div>
            )}
            <FeedItemRenderer item={item} />
          </div>
        );
      })}
    </div>
  );
}
