"use client";

/**
 * Block renderer for KnowledgeSynthesisBlock.
 * Wires onAction callbacks: "knowledge-confirm" and "knowledge-correct"
 * flow back through the conversation to the Self for feedback capture.
 *
 * Provenance: Brief 044 (AC8), ADR-021 block registry.
 */

import type { KnowledgeSynthesisBlock } from "@/lib/engine";
import { KnowledgeSynthesis } from "@/components/self/knowledge-synthesis";

interface Props {
  block: KnowledgeSynthesisBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function KnowledgeSynthesisBlockComponent({ block, onAction }: Props) {
  return (
    <KnowledgeSynthesis
      entries={block.entries}
      totalDimensions={block.totalDimensions}
      onConfirm={() => onAction?.("knowledge-confirm")}
      onCorrect={(corrections) =>
        onAction?.("knowledge-correct", { corrections })
      }
    />
  );
}
