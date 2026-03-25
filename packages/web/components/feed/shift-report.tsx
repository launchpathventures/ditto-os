"use client";

/**
 * Type 1: Shift Report Card — Prominent narrative briefing
 *
 * The most prominent card in the feed. Narrative summary with stats.
 * No heavy left border — uses subtle elevation instead.
 *
 * Redesign AC11: Shift report is the most prominent card.
 *
 * Provenance: Brief 041, workspace-layout-redesign-ux.md
 */

import { useState } from "react";
import type { ShiftReportItem } from "@/lib/feed-types";

interface ShiftReportCardProps {
  item: ShiftReportItem;
}

export function ShiftReportCard({ item }: ShiftReportCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { summary, stats, details } = item.data;

  return (
    <div className="rounded-xl bg-surface-raised shadow-[var(--shadow-subtle)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-text-primary">
          Your briefing
        </h3>
        <span className="text-xs text-text-muted">
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Narrative */}
      <p className="text-sm text-text-secondary leading-relaxed">{summary}</p>

      {/* Stats — compact inline dots */}
      {stats && (
        <div className="mt-3 flex gap-4 text-xs text-text-muted">
          {stats.reviewsPending > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              {stats.reviewsPending} to review
            </span>
          )}
          {stats.runsCompleted > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-positive" />
              {stats.runsCompleted} completed
            </span>
          )}
          {stats.exceptionsActive > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-caution" />
              {stats.exceptionsActive} exceptions
            </span>
          )}
        </div>
      )}

      {/* Expandable detail */}
      {details && (
        <>
          <button
            className="mt-2 text-xs text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Less detail" : "More detail"}
          </button>
          {expanded && (
            <p className="mt-2 text-sm text-text-muted whitespace-pre-line leading-relaxed">
              {details}
            </p>
          )}
        </>
      )}
    </div>
  );
}
