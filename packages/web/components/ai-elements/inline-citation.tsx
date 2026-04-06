"use client";

/**
 * InlineCitation — Adopted from AI Elements (Brief 061)
 *
 * Hover card with source preview and carousel for multiple sources.
 * Uses Radix HoverCard for accessible hover interactions.
 *
 * Provenance: vercel/ai-elements inline-citation.tsx, adapted for Ditto design tokens.
 */

import { useState, type ReactNode } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { cn } from "@/lib/utils";
import { FileText, Globe, Database } from "lucide-react";

// --- Type icon mapping ---

function SourceTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  switch (type) {
    case "web":
      return <Globe size={size} />;
    case "database":
      return <Database size={size} />;
    default:
      return <FileText size={size} />;
  }
}

// --- Composable Subcomponents ---

interface InlineCitationProps {
  children: ReactNode;
  className?: string;
}

function InlineCitation({ children, className }: InlineCitationProps) {
  return <span className={cn("inline", className)}>{children}</span>;
}

interface InlineCitationCardProps {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}

function InlineCitationCard({ trigger, children, className }: InlineCitationCardProps) {
  return (
    <HoverCard.Root openDelay={300} closeDelay={200}>
      <HoverCard.Trigger asChild>
        {trigger}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          sideOffset={4}
          className={cn(
            "z-50 max-w-[320px] rounded-[var(--radius-lg)] bg-surface-raised p-[var(--spacing-4)]",
            "shadow-[var(--shadow-medium)]",
            "animate-in fade-in-0 zoom-in-[0.98] duration-300 ease-out",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=closed]:duration-200 data-[state=closed]:ease-in",
            className,
          )}
        >
          {children}
          <HoverCard.Arrow className="fill-surface-raised" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

interface InlineCitationCarouselProps {
  sources: Array<{ name: string; type: string; excerpt?: string }>;
  className?: string;
}

function InlineCitationCarousel({ sources, className }: InlineCitationCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (sources.length <= 1) {
    const source = sources[0];
    if (!source) return null;
    return (
      <div className={className}>
        <InlineCitationSource name={source.name} type={source.type} />
        {source.excerpt && <InlineCitationQuote>{source.excerpt}</InlineCitationQuote>}
      </div>
    );
  }

  const source = sources[activeIndex];

  return (
    <div className={className}>
      <InlineCitationSource name={source.name} type={source.type} />
      {source.excerpt && <InlineCitationQuote>{source.excerpt}</InlineCitationQuote>}

      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-1.5 mt-[var(--spacing-3)]">
        {activeIndex > 0 && (
          <button
            onClick={() => setActiveIndex(activeIndex - 1)}
            className="text-text-muted hover:text-text-primary text-xs"
            aria-label="Previous source"
          >
            ‹
          </button>
        )}
        {sources.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors duration-150",
              i === activeIndex ? "bg-vivid" : "bg-border-strong",
            )}
            aria-label={`Source ${i + 1}`}
          />
        ))}
        {activeIndex < sources.length - 1 && (
          <button
            onClick={() => setActiveIndex(activeIndex + 1)}
            className="text-text-muted hover:text-text-primary text-xs"
            aria-label="Next source"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}

function InlineCitationSource({ name, type, className }: { name: string; type: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <SourceTypeIcon type={type} size={14} />
      <span className="text-sm font-semibold text-text-primary">{name}</span>
      <span className="text-xs text-text-muted">({type})</span>
    </div>
  );
}

function InlineCitationQuote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-2 border-l-2 border-border pl-[var(--spacing-3)] text-sm text-text-secondary italic",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * InlineCitationExpandedView — Full chunk text with verbatim quote highlighted.
 * Layer 1: click-to-expand citation verification.
 */
function InlineCitationExpandedView({
  fullText,
  verbatimQuote,
  className,
}: {
  fullText: string;
  verbatimQuote?: string;
  className?: string;
}) {
  // Highlight the verbatim quote within the full text
  if (verbatimQuote) {
    const lowerFull = fullText.toLowerCase();
    const lowerQuote = verbatimQuote.toLowerCase();
    const idx = lowerFull.indexOf(lowerQuote);

    if (idx !== -1) {
      const before = fullText.slice(0, idx);
      const match = fullText.slice(idx, idx + verbatimQuote.length);
      const after = fullText.slice(idx + verbatimQuote.length);

      return (
        <div className={cn("mt-2 max-h-[300px] overflow-y-auto text-sm text-text-secondary leading-relaxed", className)}>
          {before}
          <mark className="bg-vivid/15 text-text-primary rounded px-0.5">{match}</mark>
          {after}
        </div>
      );
    }
  }

  // Fallback: show full text without highlighting
  return (
    <div className={cn("mt-2 max-h-[300px] overflow-y-auto text-sm text-text-secondary leading-relaxed", className)}>
      {fullText}
    </div>
  );
}

export {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCarousel,
  InlineCitationSource,
  InlineCitationQuote,
  InlineCitationExpandedView,
  SourceTypeIcon,
};
