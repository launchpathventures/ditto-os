"use client";

/**
 * Ditto — Composed Canvas
 *
 * Renders ContentBlock[] from a composition function via the block registry.
 * Must-show blocks are prepended by the composition engine (not here).
 *
 * This is the Tier 2 (Canvas) rendering surface — everything in the centre
 * column between the navigation and conversation/input is a ContentBlock.
 *
 * ADR-024: No custom React components in the centre canvas.
 * Provenance: Brief 047 AC5, ADR-024.
 */

import { useMemo } from "react";
import { BlockList } from "@/components/blocks/block-registry";
import { compose, type CompositionIntent } from "@/lib/compositions";
import { useCompositionContext } from "@/lib/composition-context";
import type { ContentBlock } from "@/lib/engine";

interface ComposedCanvasProps {
  intent: CompositionIntent;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

/**
 * Renders the composed block output for a navigation intent.
 * Composition is synchronous (pure transform of cached data).
 */
export function ComposedCanvas({ intent, onAction }: ComposedCanvasProps) {
  const context = useCompositionContext();

  const blocks: ContentBlock[] = useMemo(
    () => compose(intent, context),
    [intent, context],
  );

  if (blocks.length === 0) {
    return (
      <div className="text-sm text-text-secondary py-8 text-center">
        Nothing to show yet.
      </div>
    );
  }

  return <BlockList blocks={blocks} onAction={onAction} />;
}
