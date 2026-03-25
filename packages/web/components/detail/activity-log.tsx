"use client";

/**
 * Ditto — Activity Log Component
 *
 * Unified timeline of human + system actions per process instance.
 * Filterable: "All" / "Mine" / "Ditto's". Per-entry expandable detail.
 *
 * AC8: Unified timeline, filterable, expandable details.
 * Provenance: Hark activity log pattern (gethark.ai), Brief 042.
 */

import { useState } from "react";
import type { ActivityEntry } from "@/lib/process-query";

type FilterMode = "all" | "mine" | "ditto";

interface ActivityLogProps {
  activities: ActivityEntry[];
  isLoading?: boolean;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    "step.complete": "Completed a step",
    "step.start": "Started a step",
    "step.execute": "Executed",
    "gate.pause": "Paused for review",
    "gate.advance": "Approved to continue",
    "feedback.approve": "Approved",
    "feedback.edit": "Made changes",
    "feedback.reject": "Sent back",
    "trust_change": "Trust level changed",
    "integration.call": "Used an integration",
    "run.start": "Started a run",
    "run.complete": "Run completed",
    "self.delegation": "Delegated work",
    "self.consultation": "Consulted a role",
  };
  return map[action] ?? action.replace(/[._]/g, " ");
}

function isHumanActor(actorType: string): boolean {
  return actorType === "human" || actorType === "user";
}

export function ActivityLog({ activities, isLoading }: ActivityLogProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-12 bg-surface animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (!activities.length) {
    return (
      <p className="text-sm text-text-muted py-4">No activity yet.</p>
    );
  }

  const filtered = activities.filter((a) => {
    if (filter === "mine") return isHumanActor(a.actorType);
    if (filter === "ditto") return !isHumanActor(a.actorType);
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        {(["all", "mine", "ditto"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === mode
                ? "bg-surface-raised text-text-primary shadow-[var(--shadow-subtle)]"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {mode === "all" ? "All" : mode === "mine" ? "Mine" : "Ditto's"}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {filtered.map((entry) => {
          const isExpanded = expandedId === entry.id;
          const isHuman = isHumanActor(entry.actorType);
          const hasDetail =
            entry.description ||
            (entry.metadata && Object.keys(entry.metadata).length > 0);

          return (
            <button
              key={entry.id}
              onClick={() =>
                hasDetail &&
                setExpandedId(isExpanded ? null : entry.id)
              }
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                hasDetail ? "hover:bg-surface cursor-pointer" : "cursor-default"
              } ${isExpanded ? "bg-surface" : ""}`}
            >
              <div className="flex items-center gap-3">
                {/* Actor indicator */}
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isHuman ? "bg-accent" : "bg-text-muted"
                  }`}
                />

                {/* Action */}
                <span className="text-sm text-text-primary flex-1 truncate">
                  {humanizeAction(entry.action)}
                </span>

                {/* Who */}
                <span className="text-xs text-text-muted flex-shrink-0">
                  {isHuman ? "You" : "Ditto"}
                </span>

                {/* When */}
                <span className="text-xs text-text-muted flex-shrink-0 w-16 text-right">
                  {formatTime(entry.createdAt)}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && hasDetail && (
                <div className="mt-2 ml-4 text-xs text-text-secondary space-y-1">
                  {entry.description && <p>{entry.description}</p>}
                  {entry.metadata &&
                    Object.keys(entry.metadata).length > 0 && (
                      <pre className="font-mono text-text-muted bg-background rounded p-2 overflow-x-auto">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
