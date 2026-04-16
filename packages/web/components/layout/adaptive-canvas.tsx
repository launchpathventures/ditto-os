"use client";

/**
 * Ditto — Adaptive Canvas (Brief 154)
 *
 * Renders an adaptive composition view by slug.
 * Parallel to ComposedCanvas but for data-driven views.
 * Fetches the workspace view record, validates schema, evaluates
 * against CompositionContext, renders via BlockList.
 *
 * Provenance: Brief 154 (Adaptive Workspace Views), ComposedCanvas pattern.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BlockList } from "@/components/blocks/block-registry";
import { useCompositionContext } from "@/lib/composition-context";
import { evaluateAdaptiveComposition } from "@/lib/compositions/adaptive";
import { validateCompositionSchema } from "@/lib/compositions/composition-schema";
import type { CompositionSchema } from "@/lib/compositions/composition-schema";
import type { ContentBlock } from "@/lib/engine";
import type { WorkspaceView } from "@/hooks/use-workspace-views";

interface AdaptiveCanvasProps {
  slug: string;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

async function fetchViewBySlug(slug: string): Promise<WorkspaceView | null> {
  const res = await fetch("/api/v1/workspace/views");
  if (!res.ok) return null;
  const data = (await res.json()) as { views: WorkspaceView[] };
  return data.views?.find((v) => v.slug === slug) ?? null;
}

/**
 * Renders an adaptive composition view.
 * Loading → skeleton, error → fallback, success → BlockList.
 */
export function AdaptiveCanvas({ slug, onAction }: AdaptiveCanvasProps) {
  const { data: view, isLoading, error } = useQuery({
    queryKey: ["workspaceView", slug],
    queryFn: () => fetchViewBySlug(slug),
    staleTime: 30_000,
  });

  const context = useCompositionContext();

  const blocks: ContentBlock[] = useMemo(() => {
    if (!view?.schema) return [];

    // Validate schema at render time (belt-and-suspenders — schema was validated at registration)
    const errors = validateCompositionSchema(view.schema);
    if (errors.length > 0) {
      return [
        {
          type: "text",
          text: "I'm having trouble loading this view. The schema has validation errors. Try asking me directly.",
        } as ContentBlock,
      ];
    }

    const schema = view.schema as unknown as CompositionSchema;
    return evaluateAdaptiveComposition(
      schema,
      context,
      view.label,
      view.sourceProcessSlug ?? undefined,
    );
  }, [view, context]);

  // Loading state — skeleton
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 py-4">
        <div className="h-6 bg-surface-raised rounded w-1/3" />
        <div className="h-4 bg-surface-raised rounded w-2/3" />
        <div className="h-32 bg-surface-raised rounded" />
      </div>
    );
  }

  // Error or not found
  if (error || !view) {
    return (
      <div className="text-sm text-text-secondary py-8 text-center">
        I&apos;m having trouble loading this view. Try asking me directly.
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="text-sm text-text-secondary py-8 text-center">
        Nothing to show yet.
      </div>
    );
  }

  return (
    <div key={slug} className="animate-fade-in">
      <BlockList blocks={blocks} onAction={onAction} />
    </div>
  );
}
