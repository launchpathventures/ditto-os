"use client";

import { cn } from "@/lib/utils";
import type { DataBlock, FieldAnnotation } from "@/lib/engine";

/**
 * DataBlock — schema-driven structured data display.
 * Replaces shape-detection in inline-data.tsx. Format is declared on the block.
 * Visual design matches existing InlineTable (AC8).
 */
export function DataBlockComponent({ block }: { block: DataBlock }) {
  if (block.format === "table") {
    return <TableView block={block} />;
  }
  if (block.format === "key_value") {
    return <KeyValueView block={block} />;
  }
  return <ListView block={block} />;
}

/** Render annotation indicators for a field */
function FieldAnnotations({ annotation }: { annotation?: FieldAnnotation }) {
  if (!annotation) return null;

  return (
    <>
      {annotation.provenance && (
        <span className="text-xs text-text-muted ml-1">← {annotation.provenance}</span>
      )}
      {annotation.flag && (
        <span className={cn(
          "text-xs ml-1.5",
          annotation.flag.level === "error" ? "text-negative" :
          annotation.flag.level === "warning" ? "text-caution" : "text-info",
        )}>
          {annotation.flag.level === "error" ? "✗" : "⚠"} {annotation.flag.message}
        </span>
      )}
    </>
  );
}

function TableView({ block }: { block: DataBlock }) {
  const rows = block.data as Record<string, unknown>[];
  if (rows.length === 0) return null;

  const headers = block.headers ?? Object.keys(rows[0]);

  return (
    <div className="my-3 rounded-lg border border-border overflow-hidden">
      {block.title && (
        <div className="px-3 py-2 bg-surface-secondary text-sm font-medium text-text-secondary">
          {block.title}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-secondary/50">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-text-secondary">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, ri) => (
            <tr
              key={ri}
              className={cn(
                "border-t border-border/50",
                ri % 2 === 0 ? "bg-surface-primary" : "bg-surface-secondary/20",
              )}
            >
              {headers.map((h, ci) => {
                const annotation = block.annotations?.[h];
                return (
                  <td key={ci} className="px-3 py-2 text-text-primary">
                    <span>{String(row[h] ?? "")}</span>
                    <FieldAnnotations annotation={annotation} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueView({ block }: { block: DataBlock }) {
  const kv = block.data as Record<string, string>;

  return (
    <div className="my-2 rounded-lg border border-border bg-surface-primary p-3 space-y-1">
      {block.title && (
        <div className="text-sm font-medium text-text-primary mb-2">{block.title}</div>
      )}
      {Object.entries(kv).map(([key, value]) => {
        const annotation = block.annotations?.[key];
        return (
          <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="text-text-secondary">{key}</span>
            <span className="text-text-primary font-medium">
              {String(value)}
              <FieldAnnotations annotation={annotation} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ block }: { block: DataBlock }) {
  const items = block.data as Record<string, unknown>[];

  return (
    <div className="my-2 space-y-1">
      {block.title && (
        <div className="text-sm font-medium text-text-primary">{block.title}</div>
      )}
      <ul className="text-sm text-text-primary space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-text-secondary mt-1">-</span>
            <span>{Object.values(item).join(" — ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
