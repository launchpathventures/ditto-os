"use client";

/**
 * Ditto — Artifact Host
 *
 * Engine-connected content rendering in the artifact mode centre column.
 * Fetches content via `useProcessRunOutput(runId)` and renders through BlockList.
 * No bespoke viewer components — the block registry IS the viewer.
 *
 * Max-width 720px container for readable content.
 * Loading skeleton while fetching. Error state with alert.
 *
 * Brief 050 (Document Viewer + Dev Pipeline Artifact Wiring), ADR-021, ADR-023.
 * Provenance: Claude Artifacts sandboxed content area pattern.
 */

import type { ArtifactType } from "./artifact-layout";
import type { ContentBlock } from "@/lib/engine";
import { useProcessRunOutput } from "@/lib/process-query";
import { BlockList } from "@/components/blocks/block-registry";

interface ArtifactHostProps {
  /** Artifact type from ArtifactBlock */
  artifactType: ArtifactType;
  /** Artifact identifier */
  artifactId: string;
  /** Owning process */
  processId: string;
  /** Run ID for fetching content from API */
  runId?: string;
}

/** Loading skeleton — text line placeholders with pulse animation */
function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-surface rounded w-2/3" />
      <div className="h-4 bg-surface rounded w-full" />
      <div className="h-4 bg-surface rounded w-5/6" />
      <div className="h-4 bg-surface rounded w-full" />
      <div className="h-4 bg-surface rounded w-3/4" />
      <div className="h-6 bg-surface rounded w-1/2 mt-6" />
      <div className="h-4 bg-surface rounded w-full" />
      <div className="h-4 bg-surface rounded w-4/5" />
    </div>
  );
}

export function ArtifactHost({ artifactType, artifactId, processId, runId }: ArtifactHostProps) {
  const { data, isLoading, error } = useProcessRunOutput(runId ?? null);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar area */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border min-h-[44px]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            {data?.processName ?? artifactType.charAt(0).toUpperCase() + artifactType.slice(1)}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          {artifactId}
        </span>
      </div>

      {/* Content area — max-width 720px for readability (AC6) */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[720px] mx-auto">
          {/* Loading state */}
          {isLoading && <LoadingSkeleton />}

          {/* Error state */}
          {error && !isLoading && (
            <div className="p-4 rounded-lg bg-negative/5 border border-negative/20">
              <p className="text-sm font-medium text-negative mb-1">
                Failed to load content
              </p>
              <p className="text-sm text-text-secondary">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          )}

          {/* No runId — placeholder */}
          {!runId && !isLoading && (
            <div className="text-center py-12">
              <p className="text-sm text-text-secondary">
                No content to display. This artifact will be populated when a process run produces output.
              </p>
            </div>
          )}

          {/* Content — BlockList rendering (AC6: no bespoke viewers) */}
          {data && !isLoading && (
            <BlockList blocks={data.blocks as ContentBlock[]} />
          )}
        </div>
      </div>
    </div>
  );
}
