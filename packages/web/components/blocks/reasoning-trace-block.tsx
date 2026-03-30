"use client";

/**
 * ReasoningTraceBlock Renderer (Brief 061 — Block Renderer Upgrade)
 *
 * Uses ChainOfThought AI Element internally. Maps ReasoningTraceBlock fields
 * to ChainOfThought composable subcomponents. All steps render as "complete"
 * status (traces are post-hoc).
 *
 * Two-layer architecture: ContentBlock type defines WHAT (engine),
 * AI Elements define HOW (React UI).
 */

import { cn } from "@/lib/utils";
import type { ReasoningTraceBlock } from "@/lib/engine";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtContent,
} from "@/components/ai-elements/chain-of-thought";

export function ReasoningTraceBlockComponent({ block }: { block: ReasoningTraceBlock }) {
  // Confidence badge color mapping
  const confidenceBadge = block.confidence ? {
    high: { text: "High", className: "text-positive bg-positive/10" },
    medium: { text: "Medium", className: "text-caution bg-caution/10" },
    low: { text: "Low", className: "text-negative bg-negative/10" },
  }[block.confidence] : null;

  return (
    <ChainOfThought defaultOpen={false}>
      <ChainOfThoughtHeader>
        <span className="flex-1 text-left">{block.title}</span>
        <span className="text-xs text-text-muted">({block.steps.length} steps)</span>
        {confidenceBadge && (
          <span
            className={cn(
              "text-xs rounded-[var(--radius-full)] px-2 py-0.5",
              confidenceBadge.className,
            )}
          >
            {confidenceBadge.text}
          </span>
        )}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {block.steps.map((step, i) => (
          <ChainOfThoughtStep
            key={i}
            status="complete"
            title={step.label}
            description={step.detail}
            isFirst={i === 0}
          />
        ))}
        {/* Conclusion */}
        <div className="mt-[var(--spacing-4)] text-sm text-text-primary">
          <span className="text-text-muted">Conclusion: </span>
          {block.conclusion}
        </div>
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
