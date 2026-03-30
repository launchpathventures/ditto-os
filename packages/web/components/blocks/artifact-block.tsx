"use client";

/**
 * Ditto — ArtifactBlock Component
 *
 * Compact reference card for an artifact shown inline in conversation.
 * Title, status badge (variant-coloured), summary text, "Open" action button.
 * Clicking "Open" dispatches action `open-artifact-{artifactId}`.
 *
 * Provenance: original. Brief 050, ADR-023.
 */

import type { ArtifactBlock } from "@/lib/engine";

const VARIANT_CLASSES: Record<string, string> = {
  positive: "bg-positive/10 text-positive",
  caution: "bg-caution/10 text-caution",
  negative: "bg-negative/10 text-negative",
  neutral: "bg-surface text-text-secondary",
  info: "bg-accent/10 text-accent",
};

export function ArtifactBlockComponent({
  block,
  onAction,
}: {
  block: ArtifactBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  const badgeClass = VARIANT_CLASSES[block.status.variant] ?? VARIANT_CLASSES.neutral;

  return (
    <div data-testid="artifact-block" className="border border-border rounded-lg p-3 bg-surface/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-text-primary truncate">
              {block.title}
            </h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badgeClass}`}>
              {block.status.label}
            </span>
          </div>
          {block.summary && (
            <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
              {block.summary}
            </p>
          )}
          {block.changed && (
            <p className="text-xs text-text-muted mt-1">{block.changed}</p>
          )}
        </div>
        <button
          onClick={() => {
            const openAction = block.actions?.find((a) => a.id.startsWith("open-artifact-"));
            onAction?.(`open-artifact-${block.artifactId}`, openAction?.payload);
          }}
          className="flex-shrink-0 text-sm px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors font-medium"
        >
          Open
        </button>
      </div>
    </div>
  );
}
