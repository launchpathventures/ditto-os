"use client";

/**
 * Reasoning — Adopted from AI Elements (Deep Adoption, Brief 061)
 *
 * Collapsible reasoning/thinking panel using Radix Collapsible,
 * useControllableState for open/closed, composable subcomponents.
 * Preserves Ditto's timer display as an extension.
 *
 * Provenance: vercel/ai-elements reasoning.tsx, adapted for Ditto design tokens.
 */

import { createContext, useContext, useState, useRef, useEffect, useMemo, forwardRef, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";
import { useControllableState } from "./use-controllable-state";

// --- Context ---

interface ReasoningContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isThinking: boolean;
  seconds: number;
  summary?: string;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const ctx = useContext(ReasoningContext);
  if (!ctx) throw new Error("Reasoning subcomponent must be used within <Reasoning>");
  return ctx;
}

// --- Composable Subcomponents ---

interface ReasoningRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isThinking?: boolean;
  summary?: string;
  children: ReactNode;
  className?: string;
}

function ReasoningRoot({
  open: openProp,
  defaultOpen,
  onOpenChange: onOpenChangeProp,
  isThinking = false,
  summary,
  children,
  className,
}: ReasoningRootProps) {
  const [open, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChangeProp,
  });

  // Timer tracking
  const [seconds, setSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isThinking) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const interval = setInterval(() => {
        setSeconds(Math.ceil((Date.now() - startTimeRef.current!) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (startTimeRef.current !== null) {
      setSeconds(Math.ceil((Date.now() - startTimeRef.current) / 1000));
      startTimeRef.current = null;
    }
  }, [isThinking]);

  return (
    <ReasoningContext.Provider value={{ open, onOpenChange, isThinking, seconds, summary }}>
      <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn("my-2", className)}>
        {children}
      </Collapsible.Root>
    </ReasoningContext.Provider>
  );
}

function ReasoningTrigger({ children, className }: { children?: ReactNode; className?: string }) {
  const { isThinking, seconds, summary } = useReasoningContext();

  const defaultLabel = isThinking ? (
    <Shimmer>Thinking...</Shimmer>
  ) : seconds > 0 ? (
    <span className="flex items-center gap-2">
      <span>Thought for {seconds}s</span>
      {summary && (
        <span className="text-text-muted truncate max-w-[400px]" aria-label="Summary">
          — {summary}
        </span>
      )}
    </span>
  ) : (
    <span>Thought for a few seconds</span>
  );

  return (
    <Collapsible.Trigger
      className={cn(
        "flex w-full items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-secondary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded",
        className,
      )}
    >
      {/* Chevron */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 transition-transform duration-150 ease-out [[data-state=open]>&]:rotate-90"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      {children ?? defaultLabel}
    </Collapsible.Trigger>
  );
}

const ReasoningContent = forwardRef<HTMLDivElement, { children?: ReactNode; className?: string }>(
  function ReasoningContent({ children, className }, ref) {
    return (
      <Collapsible.Content
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          "duration-200 ease-in-out",
        )}
      >
        <div
          ref={ref}
          className={cn(
            "mt-2 border-l-2 border-[var(--color-vivid-deep)] pl-[var(--spacing-4)]",
            "text-sm font-mono text-text-secondary whitespace-pre-wrap max-h-[200px] overflow-y-auto",
            className,
          )}
        >
          {children}
        </div>
      </Collapsible.Content>
    );
  },
);

// --- Backward-Compatible Default Export ---

interface ReasoningProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
}

const AUTO_CLOSE_DELAY = 3000;

/**
 * Default composition — backward-compatible with Brief 058 API.
 * message.tsx uses: <Reasoning text={...} isStreaming={...} />
 */
/**
 * Extract a summary snippet from reasoning text.
 * Takes the last sentence, truncated to ~60 chars with ellipsis.
 */
function extractSummary(text: string): string | undefined {
  if (!text.trim()) return undefined;
  // AC14 (065): Extract last ~80 chars of reasoning for collapsed summary
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  const last = sentences[sentences.length - 1]?.trim();
  if (!last) return undefined;
  if (last.length <= 80) return last;
  return last.slice(0, 77) + "...";
}

export function Reasoning({ text, isStreaming, className }: ReasoningProps) {
  const [open, setOpen] = useState(!!isStreaming);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const userClosedRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => extractSummary(text), [text]);

  // Handle user toggle — respect manual close during streaming
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isStreaming) {
      userClosedRef.current = true;
    }
    setOpen(newOpen);
  };

  // Auto-open when streaming starts (unless user manually closed)
  useEffect(() => {
    if (isStreaming && !open && !userClosedRef.current) {
      setOpen(true);
    }
  }, [isStreaming, open]);

  // Reset user-closed tracking when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      userClosedRef.current = false;
    }
  }, [isStreaming]);

  // Auto-close after streaming ends
  useEffect(() => {
    if (!isStreaming && open && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, open, hasAutoClosed]);

  // Auto-scroll content during streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  return (
    <ReasoningRoot
      open={open}
      onOpenChange={handleOpenChange}
      isThinking={!!isStreaming}
      summary={summary}
      className={className}
    >
      <ReasoningTrigger />
      <ReasoningContent ref={contentRef}>
        {/* AC15 (065): Streaming cursor on reasoning text while thinking */}
        <span className={isStreaming ? "streaming-cursor" : undefined}>
          {text}
        </span>
      </ReasoningContent>
    </ReasoningRoot>
  );
}

// Named exports for composable usage
export { ReasoningRoot, ReasoningTrigger, ReasoningContent };
