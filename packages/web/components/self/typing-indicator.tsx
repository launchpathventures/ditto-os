"use client";

/**
 * Ditto Typing Indicator (Brief 062 AC7)
 *
 * Vivid dot + shimmer "Thinking..." text — Self's visual presence while thinking.
 * Status text replaces generic "Thinking..." when available.
 *
 * Matches conversation message layout: max-width 720px, vivid dot, left-aligned.
 * Mirrors Self's message structure (vivid dot + text), not a disconnected animation.
 *
 * Provenance: P30 prototype gathering_indicator.
 */

import { Shimmer } from "@/components/ai-elements/shimmer";

interface TypingIndicatorProps {
  status?: string;
}

export function TypingIndicator({ status }: TypingIndicatorProps) {
  return (
    <div className="max-w-[720px] mx-auto py-3">
      <div className="flex items-center gap-3">
        {/* Vivid dot — matches Self message identity dot */}
        <div className="w-2 h-2 rounded-full bg-vivid flex-shrink-0" />

        {/* Status text with shimmer, or default "Thinking..." */}
        <span className="text-sm text-text-secondary">
          <Shimmer>{status ?? "Thinking..."}</Shimmer>
        </span>
      </div>
    </div>
  );
}
