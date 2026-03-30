"use client";

/**
 * ChainOfThought — Adopted from AI Elements (Brief 061)
 *
 * Step-by-step reasoning display with per-step status indicators
 * (complete/active/pending), connector lines, and Radix Collapsible.
 *
 * Provenance: vercel/ai-elements chain-of-thought.tsx, adapted for Ditto design tokens.
 */

import { createContext, useContext, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
import { useControllableState } from "./use-controllable-state";

// --- Context ---

interface ChainOfThoughtContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThoughtContext() {
  const ctx = useContext(ChainOfThoughtContext);
  if (!ctx) throw new Error("ChainOfThought subcomponent must be used within <ChainOfThought>");
  return ctx;
}

// --- Composable Subcomponents ---

interface ChainOfThoughtProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

function ChainOfThought({
  open: openProp,
  defaultOpen = false,
  onOpenChange: onOpenChangeProp,
  children,
  className,
}: ChainOfThoughtProps) {
  const [open, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  return (
    <ChainOfThoughtContext.Provider value={{ open, onOpenChange }}>
      <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn("my-2", className)}>
        {children}
      </Collapsible.Root>
    </ChainOfThoughtContext.Provider>
  );
}

function ChainOfThoughtHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex w-full items-center gap-2 text-base font-semibold text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded",
        className,
      )}
    >
      <svg
        width="16"
        height="16"
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
      {children}
    </Collapsible.Trigger>
  );
}

type StepStatus = "complete" | "active" | "pending";

interface ChainOfThoughtStepProps {
  status?: StepStatus;
  title: string;
  description?: string;
  isFirst?: boolean;
  children?: ReactNode;
  className?: string;
}

function ChainOfThoughtStep({
  status = "complete",
  title,
  description,
  isFirst = false,
  children,
  className,
}: ChainOfThoughtStepProps) {
  return (
    <div className={cn("relative flex gap-[var(--spacing-3)] pl-1", className)}>
      {/* Connector line */}
      {!isFirst && (
        <div
          className="absolute left-[8px] bottom-[calc(100%-4px)] w-[2px] h-[calc(100%+var(--spacing-2))] -translate-y-full bg-border"
          aria-hidden="true"
        />
      )}
      {/* Status indicator */}
      <div className="flex-shrink-0 relative z-10 mt-0.5">
        {status === "complete" && (
          <div className="w-4 h-4 rounded-full bg-positive/10 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-positive)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        )}
        {status === "active" && (
          <div className="w-4 h-4 rounded-full bg-vivid/10 flex items-center justify-center">
            <span className="flex gap-[2px]" aria-label="Active">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-[3px] h-[3px] rounded-full bg-vivid"
                  style={{ animation: `pulse-dot 1s ease-in-out ${i * 150}ms infinite` }}
                />
              ))}
            </span>
          </div>
        )}
        {status === "pending" && (
          <div className="w-4 h-4 rounded-full border-2 border-border-strong" />
        )}
      </div>
      {/* Content */}
      <div className="flex-1 pb-[var(--spacing-2)]">
        <div className="text-sm text-text-primary">{title}</div>
        {description && (
          <div className="text-sm text-text-secondary mt-0.5">{description}</div>
        )}
        {children}
      </div>
    </div>
  );
}

function ChainOfThoughtContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Collapsible.Content
      className={cn(
        "overflow-hidden",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        "duration-200 ease-in-out",
      )}
    >
      <div className={cn("mt-[var(--spacing-3)]", className)}>
        {children}
      </div>
    </Collapsible.Content>
  );
}

function ChainOfThoughtSearchResults({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-1 text-xs text-text-muted", className)}>
      {children}
    </div>
  );
}

function ChainOfThoughtImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn("mt-2 rounded-[var(--radius-md)] max-w-full", className)}
    />
  );
}

export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResults,
  ChainOfThoughtImage,
};
