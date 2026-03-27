"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { InteractiveTableBlock, TableRow } from "@/lib/engine";

/**
 * InteractiveTableBlock — Table with per-row actions, selection, and batch operations.
 * Distinct from DataBlock: per-row actions, row status, column format hints, batch operations.
 */
interface Props {
  block: InteractiveTableBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

const confidenceDot: Record<string, string> = {
  high: "bg-positive",
  medium: "bg-warning",
  low: "bg-negative",
};

const statusBorder: Record<string, string> = {
  flagged: "border-l-2 border-l-caution",
  approved: "border-l-2 border-l-positive",
  pending: "",
  error: "border-l-2 border-l-negative",
};

function formatCell(value: string | number, format?: string): React.ReactNode {
  const str = String(value);
  switch (format) {
    case "confidence":
      return (
        <div className={cn("w-2 h-2 rounded-full mx-auto", confidenceDot[str] ?? "bg-surface-secondary")} />
      );
    case "badge":
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-text-secondary">
          {str}
        </span>
      );
    case "percentage": {
      const num = parseFloat(str);
      return (
        <span className={cn("tabular-nums", !isNaN(num) && num < 8 ? "text-caution" : "text-text-primary")}>
          {str}
        </span>
      );
    }
    case "currency":
      return <span className="tabular-nums">{str}</span>;
    case "checks":
      return <span className="text-text-muted">{str}</span>;
    default:
      return str;
  }
}

export function InteractiveTableBlockComponent({ block, onAction }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === block.rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(block.rows.map((r) => r.id)));
    }
  };

  const handleAction = (action: { id: string; label: string; payload?: Record<string, unknown> }) => {
    onAction?.(action.id, action.payload);
  };

  return (
    <div className="my-3 rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-secondary">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{block.title}</span>
          {block.summary && (
            <span className="text-xs text-text-muted">{block.summary}</span>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-secondary/50">
            {block.selectable && (
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.size === block.rows.length && block.rows.length > 0}
                  onChange={toggleAll}
                  className="rounded border-border"
                />
              </th>
            )}
            {block.columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-3 py-2 text-left font-medium text-text-secondary",
                  (col.format === "currency" || col.format === "percentage") && "text-right",
                  col.format === "confidence" && "w-8 text-center",
                )}
              >
                {col.label}
              </th>
            ))}
            <th className="w-24 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row: TableRow, ri) => (
            <tr
              key={row.id}
              className={cn(
                "border-t border-border/50 transition-colors hover:bg-surface-secondary/30",
                ri % 2 === 0 ? "bg-surface-primary" : "bg-surface-secondary/20",
                row.status ? statusBorder[row.status] : "",
                selected.has(row.id) && "bg-accent/5",
              )}
            >
              {block.selectable && (
                <td className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="rounded border-border"
                  />
                </td>
              )}
              {block.columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-text-primary",
                    (col.format === "currency" || col.format === "percentage") && "text-right",
                    col.format === "confidence" && "text-center",
                  )}
                >
                  {formatCell(row.cells[col.key] ?? "", col.format)}
                </td>
              ))}
              <td className="px-3 py-2">
                {row.actions && (
                  <div className="flex gap-1 justify-end">
                    {row.actions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleAction(action)}
                        className={cn(
                          "text-xs font-medium px-2 py-1 rounded transition-colors",
                          action.style === "primary"
                            ? "text-accent hover:bg-accent/10"
                            : action.style === "danger"
                              ? "text-negative hover:bg-negative/10"
                              : "text-text-secondary hover:bg-surface-secondary",
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Batch actions */}
      {block.batchActions && block.batchActions.length > 0 && (
        <div className="flex gap-2 px-3 py-2 border-t border-border bg-surface-secondary/50">
          {block.batchActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full transition-colors",
                action.style === "primary"
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "text-text-secondary hover:bg-surface-secondary",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
