"use client";

/**
 * Block renderer for GatheringIndicatorBlock.
 * No actions — purely informational.
 *
 * Provenance: Brief 044 (AC10), ADR-021 block registry.
 */

import type { GatheringIndicatorBlock } from "@/lib/engine";
import { GatheringIndicator } from "@/components/self/gathering-indicator";

export function GatheringIndicatorBlockComponent({
  block,
}: {
  block: GatheringIndicatorBlock;
}) {
  return <GatheringIndicator message={block.message} />;
}
