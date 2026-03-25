"use client";

/**
 * Block renderer for ProcessProposalBlock.
 * Wires onAction callbacks: "proposal-approve" and "proposal-adjust"
 * flow back through the conversation to the Self.
 *
 * Provenance: Brief 044 (AC9), ADR-021 block registry.
 */

import type { ProcessProposalBlock } from "@/lib/engine";
import { ProcessProposal } from "@/components/self/process-proposal";

interface Props {
  block: ProcessProposalBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function ProcessProposalBlockComponent({ block, onAction }: Props) {
  return (
    <ProcessProposal
      name={block.name}
      description={block.description}
      steps={block.steps}
      onApprove={() => onAction?.("proposal-approve")}
      onAdjust={() => onAction?.("proposal-adjust")}
    />
  );
}
