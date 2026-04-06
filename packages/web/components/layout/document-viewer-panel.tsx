"use client";

/**
 * DocumentViewerPanel — Full document viewer with citation highlighting (Layer 3).
 *
 * Fetches the full parsed markdown from the knowledge API and renders it
 * with the cited section highlighted. Uses react-markdown for rendering.
 *
 * Provenance: Brief 079 (knowledge base), text-block.tsx (markdown rendering).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";

interface DocumentViewerPanelProps {
  documentHash: string;
  highlightChunkId?: string;
  page?: number;
}

interface DocumentData {
  markdown: string;
  fileName: string;
  format: string;
  pageCount: number;
}

interface ChunkData {
  text: string;
  page: number;
  section: string;
}

export function DocumentViewerPanel({
  documentHash,
  highlightChunkId,
  page,
}: DocumentViewerPanelProps) {
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [chunk, setChunk] = useState<ChunkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Fetch document and chunk data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Fetch document markdown
        const docRes = await fetch(
          `/api/knowledge/document?hash=${encodeURIComponent(documentHash)}`,
        );
        if (!docRes.ok) {
          const err = await docRes.json() as { error?: string };
          throw new Error(err.error ?? "Failed to load document");
        }
        const docData = (await docRes.json()) as DocumentData;
        if (!cancelled) setDoc(docData);

        // Fetch chunk text for highlighting
        if (highlightChunkId) {
          const ctxRes = await fetch(
            `/api/knowledge/context?chunkId=${encodeURIComponent(highlightChunkId)}&window=0`,
          );
          if (ctxRes.ok) {
            const ctxData = (await ctxRes.json()) as { chunks: ChunkData[]; targetIndex: number };
            if (!cancelled && ctxData.chunks.length > 0) {
              setChunk(ctxData.chunks[ctxData.targetIndex] ?? ctxData.chunks[0]);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load document");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [documentHash, highlightChunkId]);

  // Scroll to highlighted section after render
  useEffect(() => {
    if (highlightRef.current && !loading) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [loading, chunk]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-muted justify-center">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/40" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent/60" />
        </span>
        Loading document...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="py-8 text-center text-sm text-text-muted">
        <p>{error ?? "Document not available."}</p>
        <p className="mt-1 text-xs">Try re-ingesting the document.</p>
      </div>
    );
  }

  // Split markdown on page boundaries for rendering with page markers
  const pages = splitOnPageBreaks(doc.markdown);

  return (
    <div className="space-y-4">
      {/* Document header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <FileText size={16} className="text-text-muted flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{doc.fileName}</p>
          <p className="text-xs text-text-muted">
            {doc.format.toUpperCase()} · {doc.pageCount} page{doc.pageCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Document content */}
      <div className="prose-sm max-w-none">
        {pages.map((pageContent, pageIdx) => (
          <div key={pageIdx}>
            {/* Page marker */}
            {pages.length > 1 && (
              <div className="flex items-center gap-2 my-3 text-xs text-text-muted">
                <span className="flex-1 border-t border-border" />
                <span>Page {pageIdx + 1}</span>
                <span className="flex-1 border-t border-border" />
              </div>
            )}

            {/* Render markdown with chunk highlighting */}
            <HighlightedMarkdown
              content={pageContent}
              chunkText={chunk && (pageIdx + 1) === chunk.page ? chunk.text : undefined}
              highlightRef={chunk && (pageIdx + 1) === chunk.page ? highlightRef : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Split markdown on page break markers (--- or # Page N).
 */
function splitOnPageBreaks(markdown: string): string[] {
  const pages: string[] = [];
  let current: string[] = [];

  for (const line of markdown.split("\n")) {
    if (line.match(/^---+$/) || line.match(/^#+\s*Page\s+\d+/i)) {
      if (current.length > 0) {
        pages.push(current.join("\n"));
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    pages.push(current.join("\n"));
  }

  return pages.length > 0 ? pages : [markdown];
}

/**
 * Render markdown with optional chunk text highlighted.
 */
function HighlightedMarkdown({
  content,
  chunkText,
  highlightRef,
}: {
  content: string;
  chunkText?: string;
  highlightRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // After render, find the chunk text in the DOM and wrap it with a highlight
  useEffect(() => {
    if (!chunkText || !containerRef.current) return;

    const target = chunkText.trim().toLowerCase();
    const walker = document.createTreeWalker(
      containerRef.current,
      NodeFilter.SHOW_TEXT,
    );

    // Collect all text nodes with their cumulative offsets
    const textNodes: { node: Text; start: number; end: number }[] = [];
    let offset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const len = (node.textContent ?? "").length;
      textNodes.push({ node, start: offset, end: offset + len });
      offset += len;
    }

    // Find the chunk in the concatenated text
    const fullText = textNodes.map((t) => t.node.textContent ?? "").join("");
    const idx = fullText.toLowerCase().indexOf(target);
    if (idx === -1) return;

    const matchEnd = idx + target.length;

    // Find the first and last text nodes that overlap the match
    const startEntry = textNodes.find((t) => t.end > idx);
    const endEntry = textNodes.find((t) => t.end >= matchEnd);
    if (!startEntry || !endEntry) return;

    // Wrap the matching range: find the common ancestor block and apply highlight
    const startNode = startEntry.node;
    const startNodeParent = startNode.parentElement;
    if (!startNodeParent) return;

    // Find the nearest block-level ancestor to wrap
    let blockAncestor: HTMLElement = startNodeParent;
    while (
      blockAncestor.parentElement &&
      blockAncestor.parentElement !== containerRef.current &&
      getComputedStyle(blockAncestor).display === "inline"
    ) {
      blockAncestor = blockAncestor.parentElement;
    }

    // Walk up to find all block siblings in the range
    const endNode = endEntry.node;
    let endBlock: HTMLElement = endNode.parentElement ?? blockAncestor;
    while (
      endBlock.parentElement &&
      endBlock.parentElement !== containerRef.current &&
      getComputedStyle(endBlock).display === "inline"
    ) {
      endBlock = endBlock.parentElement;
    }

    // Apply highlight styles to the range of blocks
    const parent = containerRef.current;
    const children = Array.from(parent.children) as HTMLElement[];
    const startIdx = children.indexOf(blockAncestor);
    const endIdx = children.indexOf(endBlock);

    if (startIdx === -1) {
      // Single block or deeply nested — highlight the block ancestor directly
      blockAncestor.classList.add("bg-vivid/10", "border-l-2", "border-vivid", "rounded-r", "px-3", "py-2", "my-2");
      return;
    }

    for (let i = Math.max(0, startIdx); i <= Math.max(startIdx, endIdx); i++) {
      children[i]?.classList.add("bg-vivid/10", "border-l-2", "border-vivid", "rounded-r", "px-3", "py-1");
    }
  }, [chunkText, content]);

  return (
    <div ref={(node) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (highlightRef && chunkText) {
        (highlightRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    }} className="text-sm leading-relaxed text-text-secondary">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}
