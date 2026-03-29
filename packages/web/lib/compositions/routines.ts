/**
 * Ditto — Routines Composition
 *
 * "How are my recurring processes doing?" — Process health, trust levels, metrics.
 *
 * Visual reference: P14 (process detail), P31 (process health), P29 (process model library).
 * Provenance: original (ADR-024, P14/P31 prototype reference).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";
import { formatTrustTier, formatRelativeTime } from "./utils";

/**
 * Compose the Routines view — process list with health metrics.
 * Full implementation matching P14/P31 visual patterns.
 */
export function composeRoutines(context: CompositionContext): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { processes } = context;

  if (processes.length === 0) {
    blocks.push({
      type: "text",
      text: "No routines yet. When you define a recurring process, it will appear here with health metrics and trust levels.",
    });
    blocks.push({
      type: "suggestion",
      content: "Try describing a task you do regularly — Ditto can help turn it into a routine.",
      reasoning: "Routines are recurring processes that Ditto runs for you with appropriate oversight.",
      actions: [],
    });
    return blocks;
  }

  // Health summary metrics
  const healthy = processes.filter(
    (p) => p.lastRunStatus !== "failed" && p.lastRunStatus !== "rejected",
  );
  const needsAttention = processes.filter(
    (p) => p.lastRunStatus === "failed" || p.lastRunStatus === "rejected",
  );
  const totalRuns = processes.reduce((sum, p) => sum + p.recentRunCount, 0);

  blocks.push({
    type: "metric",
    metrics: [
      { label: "Routines", value: String(processes.length) },
      {
        label: "Healthy",
        value: String(healthy.length),
        trend: healthy.length === processes.length ? "up" : "flat",
      },
      { label: "Recent runs", value: String(totalRuns) },
      ...(needsAttention.length > 0
        ? [{ label: "Needs attention", value: String(needsAttention.length), trend: "down" as const }]
        : []),
    ],
  });

  // Processes needing attention first
  if (needsAttention.length > 0) {
    blocks.push({ type: "text", text: "**Needs attention**" });

    for (const proc of needsAttention) {
      blocks.push({
        type: "record",
        title: proc.name,
        subtitle: proc.description ?? undefined,
        status: {
          label: proc.lastRunStatus === "failed" ? "Failed" : "Rejected",
          variant: "negative",
        },
        fields: [
          { label: "Recent runs", value: String(proc.recentRunCount) },
          { label: "Review level", value: formatTrustTier(proc.trustTier) },
          ...(proc.lastRunAt
            ? [{ label: "Last run", value: formatRelativeTime(proc.lastRunAt) }]
            : []),
        ],
        actions: [
          { id: `view-process-${proc.id}`, label: "View details" },
        ],
      });
    }
  }

  // Healthy processes
  if (healthy.length > 0) {
    blocks.push({
      type: "text",
      text: needsAttention.length > 0 ? "**Running well**" : "**Your routines**",
    });

    for (const proc of healthy) {
      // Deterministic sparkline placeholder based on run count
      // Real data will come from process detail in Phase 11+
      const sparkline = proc.recentRunCount >= 3
        ? Array.from({ length: Math.min(proc.recentRunCount, 7) }, (_, i) =>
            0.7 + 0.3 * Math.sin(i * 1.2 + proc.recentRunCount),
          )
        : undefined;

      blocks.push({
        type: "record",
        title: proc.name,
        subtitle: proc.description ?? undefined,
        status: {
          label:
            proc.recentRunCount === 0
              ? "Not run yet"
              : proc.lastRunStatus === "completed"
                ? "Healthy"
                : "In progress",
          variant:
            proc.recentRunCount === 0
              ? "neutral"
              : proc.lastRunStatus === "completed"
                ? "positive"
                : "info",
        },
        fields: [
          { label: "Recent runs", value: String(proc.recentRunCount) },
          { label: "Review level", value: formatTrustTier(proc.trustTier) },
          ...(proc.lastRunAt
            ? [{ label: "Last run", value: formatRelativeTime(proc.lastRunAt) }]
            : []),
        ],
        actions: [
          { id: `view-process-${proc.id}`, label: "View details" },
        ],
      });

      // Sparkline chart for processes with recent runs
      if (sparkline && sparkline.length >= 3) {
        blocks.push({
          type: "chart",
          chartType: "sparkline",
          size: "inline",
          data: {
            values: sparkline,
          },
        });
      }
    }
  }

  return blocks;
}

