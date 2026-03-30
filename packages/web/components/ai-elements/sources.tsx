"use client";

/**
 * Sources — Adopted from AI Elements (Brief 061)
 *
 * Collapsible "Used N sources" trigger with source list.
 * Uses Radix Collapsible for expand/collapse.
 *
 * Provenance: vercel/ai-elements sources.tsx, adapted for Ditto design tokens.
 */

import { type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
import { useControllableState } from "./use-controllable-state";
import { SourceTypeIcon } from "./inline-citation";

// --- Composable Subcomponents ---

interface SourcesProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

function Sources({
  open: openProp,
  defaultOpen = false,
  onOpenChange: onOpenChangeProp,
  children,
  className,
}: SourcesProps) {
  const [open, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn("my-1", className)}>
      {children}
    </Collapsible.Root>
  );
}

function SourcesTrigger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded",
        className,
      )}
    >
      {children}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 transition-transform duration-200 ease-in-out [[data-state=open]>&]:rotate-90"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Collapsible.Trigger>
  );
}

function SourcesContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Collapsible.Content
      className={cn(
        "overflow-hidden",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        "duration-200 ease-in-out",
      )}
    >
      <div className={cn("mt-[var(--spacing-2)] space-y-[var(--spacing-2)]", className)}>
        {children}
      </div>
    </Collapsible.Content>
  );
}

interface SourceProps {
  name: string;
  type?: string;
  href?: string;
  className?: string;
}

function Source({ name, type = "document", href, className }: SourceProps) {
  const content = (
    <span className={cn("flex items-center gap-1.5 text-sm text-vivid hover:underline", className)}>
      <SourceTypeIcon type={type} size={14} />
      {name}
    </span>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return <div>{content}</div>;
}

// --- Default Export: Inline (1-3) or Collapsed (4+) ---

interface SourceItem {
  name: string;
  type?: string;
  href?: string;
  excerpt?: string;
}

interface DefaultSourcesProps {
  sources: SourceItem[];
  className?: string;
}

/**
 * Default composition — renders inline for 1-3 sources, collapsed for 4+.
 * Brief 062 AC6: citations visible by default, "Based on N sources" for many.
 */
export function DefaultSources({ sources: items, className }: DefaultSourcesProps) {
  if (items.length === 0) return null;

  // Inline display for 1-3 sources
  if (items.length <= 3) {
    return (
      <div className={cn("my-1 flex flex-wrap items-center gap-3", className)}>
        {items.map((item, i) => (
          <Source key={i} name={item.name} type={item.type} href={item.href} />
        ))}
      </div>
    );
  }

  // Collapsed for 4+ sources
  return (
    <Sources className={className}>
      <SourcesTrigger>
        <span>Based on {items.length} sources</span>
      </SourcesTrigger>
      <SourcesContent>
        {items.map((item, i) => (
          <Source key={i} name={item.name} type={item.type} href={item.href} />
        ))}
      </SourcesContent>
    </Sources>
  );
}

export { Sources, SourcesTrigger, SourcesContent, Source };
