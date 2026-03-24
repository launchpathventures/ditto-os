"use client";

/**
 * Ditto — Inline Data Components
 *
 * Renders structured data from Self tool results inline in the
 * conversation. Tables (≤5 rows), progress indicators, and
 * trend arrows — not ASCII art.
 *
 * AC8: Conversation UI renders tables, progress indicators,
 * and trend arrows from Self tool results.
 *
 * Provenance: ADR-009 v2 (typed content blocks), Brief 040.
 */

import { cn } from "@/lib/utils";

// ============================================================
// Inline Table (≤5 rows)
// ============================================================

interface InlineTableProps {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export function InlineTable({ headers, rows, caption }: InlineTableProps) {
  return (
    <div className="my-3 rounded-lg border border-border overflow-hidden">
      {caption && (
        <div className="px-3 py-2 bg-surface-secondary text-sm font-medium text-text-secondary">
          {caption}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-secondary/50">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-medium text-text-secondary"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, ri) => (
            <tr
              key={ri}
              className={cn(
                "border-t border-border/50",
                ri % 2 === 0 ? "bg-surface-primary" : "bg-surface-secondary/20",
              )}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-text-primary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Progress Indicator
// ============================================================

interface ProgressIndicatorProps {
  label: string;
  value: number; // 0-100
  color?: "accent" | "positive" | "negative" | "warning";
}

export function ProgressIndicator({
  label,
  value,
  color = "accent",
}: ProgressIndicatorProps) {
  const colorClasses = {
    accent: "bg-accent",
    positive: "bg-positive",
    negative: "bg-negative",
    warning: "bg-warning",
  };

  return (
    <div className="my-2 flex items-center gap-3">
      <span className="text-sm text-text-secondary min-w-[100px]">
        {label}
      </span>
      <div className="flex-1 h-2 bg-surface-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", colorClasses[color])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-sm font-medium text-text-primary min-w-[40px] text-right">
        {Math.round(value)}%
      </span>
    </div>
  );
}

// ============================================================
// Trend Arrow
// ============================================================

interface TrendArrowProps {
  trend: "improving" | "stable" | "declining";
  label?: string;
}

export function TrendArrow({ trend, label }: TrendArrowProps) {
  const config = {
    improving: { symbol: "↑", color: "text-positive", bg: "bg-positive/10" },
    stable: { symbol: "→", color: "text-text-secondary", bg: "bg-surface-secondary" },
    declining: { symbol: "↓", color: "text-negative", bg: "bg-negative/10" },
  };

  const { symbol, color, bg } = config[trend];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-medium",
        color,
        bg,
      )}
    >
      {symbol}
      {label && <span>{label}</span>}
    </span>
  );
}

// ============================================================
// Structured Data Renderer
// ============================================================

interface StructuredDataProps {
  data: Record<string, unknown>;
}

/**
 * Renders structured data from Self tool results.
 * Detects the data shape and picks the appropriate component.
 */
export function StructuredData({ data }: StructuredDataProps) {
  // Trust data — render with progress + trend
  if ("trust" in data && typeof data.trust === "object" && data.trust !== null) {
    const trust = data.trust as Record<string, unknown>;
    return (
      <div className="my-3 rounded-lg border border-border p-3 space-y-2">
        {data.name && (
          <div className="text-sm font-medium text-text-primary">
            {String(data.name)}
          </div>
        )}
        {typeof trust.approvalRate === "number" && (
          <ProgressIndicator
            label="Approval rate"
            value={trust.approvalRate * 100}
            color={trust.approvalRate >= 0.8 ? "positive" : trust.approvalRate >= 0.6 ? "warning" : "negative"}
          />
        )}
        {typeof trust.correctionRate === "number" && (
          <ProgressIndicator
            label="Correction rate"
            value={trust.correctionRate * 100}
            color={trust.correctionRate <= 0.2 ? "positive" : trust.correctionRate <= 0.4 ? "warning" : "negative"}
          />
        )}
        {trust.trend && typeof trust.trend === "string" && (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Trend:</span>
            <TrendArrow trend={trust.trend as "improving" | "stable" | "declining"} />
            {typeof trust.runsInWindow === "number" && (
              <span className="ml-2">({trust.runsInWindow} runs)</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Recent runs — render as mini table
  if ("recentRuns" in data && Array.isArray(data.recentRuns)) {
    const runs = data.recentRuns as Array<Record<string, unknown>>;
    if (runs.length > 0) {
      return (
        <InlineTable
          caption="Recent Runs"
          headers={["Status", "Created"]}
          rows={runs.map((r) => [
            String(r.status),
            r.created ? new Date(r.created as string).toLocaleDateString() : "—",
          ])}
        />
      );
    }
  }

  // Generic structured data — show as key-value pairs
  if (data.message && typeof data.message === "string") {
    return null; // Self will render the message as text
  }

  return null;
}
