"use client";

/**
 * Queue — Adopted from AI Elements (Brief 061)
 *
 * Sectioned item list with collapsible sections, item indicators,
 * and action slots. Uses Radix Collapsible + ScrollArea.
 *
 * Adopted as a UI primitive for future feed and batch review compositions.
 * Not mapped to any ContentBlock type directly.
 *
 * Provenance: vercel/ai-elements queue.tsx, adapted for Ditto design tokens.
 */

import { type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";
import { useControllableState } from "./use-controllable-state";

// --- Subcomponents ---

function Queue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ScrollArea.Root className={cn("w-full", className)}>
      <ScrollArea.Viewport className="w-full">
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-[6px] touch-none select-none p-[1px] transition-opacity duration-150 hover:opacity-100 opacity-0 group-hover/queue:opacity-100"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-[var(--radius-full)] bg-border-strong" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

interface QueueSectionProps {
  title: string;
  count?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

function QueueSection({ title, count, open: openProp, defaultOpen = true, onOpenChange: onOpenChangeProp, children, className }: QueueSectionProps) {
  const [open, setOpen] = useControllableState({ prop: openProp, defaultProp: defaultOpen, onChange: onOpenChangeProp });
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={cn("", className)}>
      <Collapsible.Trigger
        className={cn(
          "flex w-full items-center gap-2 py-[var(--spacing-2)] text-sm font-semibold text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded",
        )}
      >
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
        <span className="flex-1 text-left">{title}</span>
        {count !== undefined && (
          <span className="text-xs rounded-[var(--radius-full)] bg-surface px-2 py-0.5 text-text-muted">
            {count}
          </span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Content
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          "duration-200 ease-in-out",
        )}
      >
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function QueueItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "group flex items-center gap-[var(--spacing-3)] py-[var(--spacing-3)]",
        "border-b border-border last:border-b-0",
        "hover:bg-surface transition-colors duration-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

type IndicatorStatus = "positive" | "caution" | "negative" | "info" | "muted";

function QueueItemIndicator({ status = "muted", className }: { status?: IndicatorStatus; className?: string }) {
  const colorMap: Record<IndicatorStatus, string> = {
    positive: "bg-positive",
    caution: "bg-caution",
    negative: "bg-negative",
    info: "bg-info",
    muted: "bg-text-muted",
  };
  return (
    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", colorMap[status], className)} />
  );
}

function QueueItemContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex-1 min-w-0", className)}>
      {children}
    </div>
  );
}

function QueueItemActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150", className)}>
      {children}
    </div>
  );
}

export { Queue, QueueSection, QueueItem, QueueItemIndicator, QueueItemContent, QueueItemActions };
