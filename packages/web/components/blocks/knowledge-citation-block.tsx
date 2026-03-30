"use client";

/**
 * KnowledgeCitationBlock Renderer (Brief 061 — Block Renderer Upgrade)
 *
 * Uses Sources + InlineCitation AI Elements internally. Maps
 * KnowledgeCitationBlock fields to composable subcomponents.
 * Hover previews only for sources with excerpts.
 *
 * Two-layer architecture: ContentBlock type defines WHAT (engine),
 * AI Elements define HOW (React UI).
 */

import type { KnowledgeCitationBlock } from "@/lib/engine";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import {
  InlineCitationCard,
  InlineCitationSource,
  InlineCitationQuote,
} from "@/components/ai-elements/inline-citation";

export function KnowledgeCitationBlockComponent({ block }: { block: KnowledgeCitationBlock }) {
  return (
    <Sources>
      <SourcesTrigger>
        {block.label || `Used ${block.sources.length} source${block.sources.length !== 1 ? "s" : ""}`}
      </SourcesTrigger>
      <SourcesContent>
        {block.sources.map((source, i) =>
          source.excerpt ? (
            <InlineCitationCard
              key={i}
              trigger={
                <button className="block text-left">
                  <Source name={source.name} type={source.type} />
                </button>
              }
            >
              <InlineCitationSource name={source.name} type={source.type} />
              <InlineCitationQuote>{source.excerpt}</InlineCitationQuote>
            </InlineCitationCard>
          ) : (
            <Source key={i} name={source.name} type={source.type} />
          ),
        )}
      </SourcesContent>
    </Sources>
  );
}
