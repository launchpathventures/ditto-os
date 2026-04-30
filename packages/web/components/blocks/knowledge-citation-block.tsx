"use client";

/**
 * KnowledgeCitationBlock Renderer
 *
 * Three-layer progressive disclosure for citation verification:
 * - Hover: quick preview (excerpt)
 * - Click: full chunk text with verbatim quote highlighted (Layer 1)
 * - "Show more context": neighboring chunks via API (Layer 2)
 * - "View document": full document in right panel (Layer 3)
 *
 * Provenance: Brief 061 (block renderer), Brief 079 (knowledge base).
 */

import { useState, useCallback, useRef } from "react";
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
  InlineCitationExpandedView,
} from "@/components/ai-elements/inline-citation";
import { MemoryScopePill, classifyScope } from "@/components/memory-scope-pill";

type SourceItem = KnowledgeCitationBlock["sources"][number];

/** Brief 227 — does this source carry memory-scope metadata? */
function isMemoryCitation(source: SourceItem): boolean {
  return Boolean(source.memoryId) || Boolean(source.memoryScopeType);
}

interface NeighborChunk {
  id: string;
  text: string;
  page: number;
  section: string;
  lineRange: [number, number];
}

interface NeighborState {
  chunks: NeighborChunk[];
  targetIndex: number;
  loading: boolean;
}

/**
 * Check if a source has document citation fields (Brief 079).
 */
function isDocumentCitation(source: SourceItem): boolean {
  return source.page !== undefined || source.section !== undefined || source.verbatimQuote !== undefined;
}

/**
 * Format a document citation subtitle: "Page 3 · Section Name · Lines 20-25"
 */
function formatCitationMeta(source: SourceItem): string {
  const parts: string[] = [];
  if (source.page !== undefined) parts.push(`Page ${source.page}`);
  if (source.section) parts.push(source.section);
  if (source.lineRange) parts.push(`Lines ${source.lineRange[0]}-${source.lineRange[1]}`);
  return parts.join(" · ");
}

/**
 * Expanded citation view — full chunk + neighboring context + view document button.
 */
function ExpandedCitationView({
  source,
  neighbors,
  onLoadNeighbors,
  onViewDocument,
}: {
  source: SourceItem;
  neighbors: NeighborState | null;
  onLoadNeighbors: () => void;
  onViewDocument?: () => void;
}) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <InlineCitationSource name={source.name} type={source.type} />
          {formatCitationMeta(source) && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatCitationMeta(source)}</p>
          )}
        </div>
        {source.matchConfidence !== undefined && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${source.matchConfidence >= 0.9 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {Math.round(source.matchConfidence * 100)}% match
          </span>
        )}
      </div>

      {/* Layer 1: Full chunk text with highlighted quote */}
      {source.fullText ? (
        <InlineCitationExpandedView
          fullText={source.fullText}
          verbatimQuote={source.verbatimQuote}
        />
      ) : source.verbatimQuote ? (
        <InlineCitationQuote>{source.verbatimQuote}</InlineCitationQuote>
      ) : source.excerpt ? (
        <InlineCitationQuote>{source.excerpt}</InlineCitationQuote>
      ) : null}

      {/* Layer 2: Neighboring chunks */}
      {neighbors?.chunks && neighbors.chunks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Surrounding context</p>
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {neighbors.chunks.map((chunk, idx) => (
              <div
                key={chunk.id}
                className={`text-sm leading-relaxed p-2 rounded ${
                  idx === neighbors.targetIndex
                    ? "bg-vivid/10 border border-vivid/20"
                    : "text-text-secondary"
                }`}
              >
                <span className="text-xs text-muted-foreground">
                  Page {chunk.page} · {chunk.section}
                </span>
                <p className="mt-0.5">{chunk.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        {source.chunkId && !neighbors?.chunks?.length && (
          <button
            onClick={onLoadNeighbors}
            disabled={neighbors?.loading}
            className="text-xs text-vivid hover:text-vivid/80 transition-colors disabled:opacity-50"
          >
            {neighbors?.loading ? "Loading..." : "Show more context"}
          </button>
        )}
        {source.documentHash && onViewDocument && (
          <button
            onClick={onViewDocument}
            className="text-xs text-vivid hover:text-vivid/80 transition-colors"
          >
            View document
          </button>
        )}
      </div>
    </div>
  );
}

export function KnowledgeCitationBlockComponent({
  block,
  onAction,
}: {
  block: KnowledgeCitationBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [neighborCache, setNeighborCache] = useState<Record<number, NeighborState>>({});
  const abortRef = useRef<AbortController | null>(null);

  const handleToggle = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  const handleLoadNeighbors = useCallback(async (index: number, chunkId: string) => {
    // Abort any in-flight neighbor fetch
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setNeighborCache((prev) => ({
      ...prev,
      [index]: { chunks: [], targetIndex: 0, loading: true },
    }));

    try {
      const res = await fetch(
        `/api/knowledge/context?chunkId=${encodeURIComponent(chunkId)}&window=2`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json() as { chunks: NeighborChunk[]; targetIndex: number };
        if (!controller.signal.aborted) {
          setNeighborCache((prev) => ({
            ...prev,
            [index]: { ...data, loading: false },
          }));
        }
      } else {
        if (!controller.signal.aborted) {
          setNeighborCache((prev) => ({
            ...prev,
            [index]: { chunks: [], targetIndex: 0, loading: false },
          }));
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNeighborCache((prev) => ({
        ...prev,
        [index]: { chunks: [], targetIndex: 0, loading: false },
      }));
    }
  }, []);

  const handleViewDocument = useCallback((source: SourceItem) => {
    onAction?.("open-document-viewer", {
      documentHash: source.documentHash,
      chunkId: source.chunkId,
      page: source.page,
    });
  }, [onAction]);

  return (
    <Sources>
      <SourcesTrigger>
        {block.label || `Used ${block.sources.length} source${block.sources.length !== 1 ? "s" : ""}`}
      </SourcesTrigger>
      <SourcesContent>
        {block.sources.map((source, i) => {
          const isExpanded = expandedIndex === i;

          if (isDocumentCitation(source)) {
            return (
              <div key={i}>
                {/* Clickable source row */}
                <button
                  className="block text-left w-full hover:bg-surface-subtle rounded px-1 py-0.5 transition-colors"
                  onClick={() => handleToggle(i)}
                >
                  <div className="flex items-center gap-1">
                    <Source name={source.name} type={source.type} />
                    <span className="text-xs text-muted-foreground">
                      {formatCitationMeta(source)}
                    </span>
                    {source.matchConfidence !== undefined && (
                      <span className={`text-xs ${source.matchConfidence >= 0.9 ? "text-green-600" : "text-amber-500"}`}>
                        {Math.round(source.matchConfidence * 100)}%
                      </span>
                    )}
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`ml-auto text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </button>

                {/* Expanded view */}
                {isExpanded && (
                  <ExpandedCitationView
                    source={source}
                    neighbors={neighborCache[i] ?? null}
                    onLoadNeighbors={() => source.chunkId && handleLoadNeighbors(i, source.chunkId)}
                    onViewDocument={source.documentHash ? () => handleViewDocument(source) : undefined}
                  />
                )}
              </div>
            );
          }

          // Non-document citations — original behavior, extended with scope pill
          // for memory citations (Brief 227).
          const memoryPill = isMemoryCitation(source) ? (
            <MemoryScopePill source={source} className="mr-1" />
          ) : null;
          const memoryScope = isMemoryCitation(source) ? classifyScope(source) : null;
          const showPromote =
            memoryScope?.kind === "project" && Boolean(source.memoryId);

          if (source.excerpt || memoryPill) {
            return (
              <InlineCitationCard
                key={i}
                trigger={
                  <button className="inline-flex items-center gap-1 text-left">
                    {memoryPill}
                    <Source name={source.name} type={source.type} />
                  </button>
                }
              >
                {memoryPill && (
                  <div className="mb-2">
                    <MemoryScopePill source={source} />
                  </div>
                )}
                <InlineCitationSource name={source.name} type={source.type} />
                {source.excerpt && (
                  <InlineCitationQuote>{source.excerpt}</InlineCitationQuote>
                )}
                {showPromote && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs text-vivid hover:underline"
                      onClick={() =>
                        onAction?.("promote-memory-scope", {
                          memoryId: source.memoryId,
                        })
                      }
                    >
                      Promote
                    </button>
                  </div>
                )}
              </InlineCitationCard>
            );
          }

          return <Source key={i} name={source.name} type={source.type} />;
        })}
      </SourcesContent>
    </Sources>
  );
}
