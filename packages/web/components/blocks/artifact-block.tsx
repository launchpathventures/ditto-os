"use client";

/**
 * Ditto — ArtifactBlock Component
 *
 * Compact reference card for an artifact shown inline in conversation.
 * Title, type icon, status badge (variant-coloured), summary text, "Open" action button.
 * Clicking "Open" dispatches action `open-artifact-{artifactId}`.
 *
 * Provenance: original. Brief 050, ADR-023. Visual upgrade: Brief 063.
 */

import { cn } from "@/lib/utils";
import { FileText, Code, Mail, Image, FileSpreadsheet, Eye, FileIcon } from "lucide-react";
import type { ArtifactBlock } from "@/lib/engine";

const VARIANT_CLASSES: Record<string, string> = {
  positive: "bg-positive/10 text-positive",
  caution: "bg-caution/10 text-caution",
  negative: "bg-negative/10 text-negative",
  neutral: "bg-surface-secondary text-text-secondary",
  info: "bg-info/10 text-info",
};

const ARTIFACT_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  image: Image,
  preview: Eye,
  email: Mail,
  pdf: FileIcon,
};

export function ArtifactBlockComponent({
  block,
  onAction,
}: {
  block: ArtifactBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  const badgeClass = VARIANT_CLASSES[block.status.variant] ?? VARIANT_CLASSES.neutral;
  const IconComponent = ARTIFACT_ICONS[block.artifactType] ?? FileText;

  const subtitle = [
    block.artifactType,
    block.version != null ? `v${block.version}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      data-testid="artifact-block"
      className="my-2 border-l-3 border-l-vivid pl-3 py-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Type icon */}
          <div className="w-8 h-8 rounded-md bg-vivid-subtle flex items-center justify-center flex-shrink-0">
            <IconComponent size={18} className="text-vivid-deep" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h4 className="text-sm font-semibold text-text-primary truncate">
                {block.title}
              </h4>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0", badgeClass)}>
                {block.status.label}
              </span>
            </div>
            <div className="text-xs text-text-muted">
              {subtitle}
              {block.changed && <span className="ml-2">· {block.changed}</span>}
            </div>
            {block.summary && (
              <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed mt-1">
                {block.summary}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            const openAction = block.actions?.find((a) => a.id.startsWith("open-artifact-"));
            onAction?.(`open-artifact-${block.artifactId}`, openAction?.payload);
          }}
          className="flex-shrink-0 text-sm px-3 py-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors font-medium"
        >
          Open
        </button>
      </div>
    </div>
  );
}
