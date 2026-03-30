"use client";

/**
 * Plan — Adopted from AI Elements (Brief 061)
 *
 * Collapsible plan card with streaming shimmer. Uses Card wrapper
 * (one of the rare hero-moment components) + Radix Collapsible.
 *
 * Adopted as a UI primitive for future Self orchestration plans.
 * Not mapped to ProcessProposalBlock (Ditto-original domain component).
 *
 * Provenance: vercel/ai-elements plan.tsx, adapted for Ditto design tokens.
 */

import { createContext, useContext, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";
import { useControllableState } from "./use-controllable-state";

// --- Context ---

interface PlanContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isStreaming?: boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

function usePlanContext() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("Plan subcomponent must be used within <Plan>");
  return ctx;
}

// --- Composable Subcomponents ---

interface PlanProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isStreaming?: boolean;
  children: ReactNode;
  className?: string;
}

function Plan({
  open: openProp,
  defaultOpen = true,
  onOpenChange: onOpenChangeProp,
  isStreaming,
  children,
  className,
}: PlanProps) {
  const [open, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChangeProp,
  });

  return (
    <PlanContext.Provider value={{ open, onOpenChange, isStreaming }}>
      <Collapsible.Root open={open} onOpenChange={onOpenChange}>
        <div
          className={cn(
            "bg-surface-raised rounded-[var(--radius-lg)] p-[var(--spacing-4)]",
            "shadow-[var(--shadow-subtle)] hover:shadow-[var(--shadow-medium)] transition-shadow duration-200",
            className,
          )}
        >
          {children}
        </div>
      </Collapsible.Root>
    </PlanContext.Provider>
  );
}

function PlanHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

function PlanTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-lg font-semibold text-text-primary", className)}>
      {children}
    </h3>
  );
}

function PlanDescription({ children, className }: { children?: ReactNode; className?: string }) {
  const { isStreaming } = usePlanContext();
  if (isStreaming && !children) {
    return (
      <div className={cn("text-sm text-text-secondary mt-1", className)}>
        <Shimmer><span className="invisible">Loading plan description...</span></Shimmer>
      </div>
    );
  }
  return (
    <div className={cn("text-sm text-text-secondary mt-1", className)}>
      {children}
    </div>
  );
}

function PlanTrigger({ className }: { className?: string }) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex items-center text-text-muted hover:text-text-secondary transition-colors",
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
        className="transition-transform duration-200 ease-in-out [[data-state=open]>&]:rotate-90"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Collapsible.Trigger>
  );
}

function PlanContent({ children, className }: { children: ReactNode; className?: string }) {
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

export { Plan, PlanHeader, PlanTitle, PlanDescription, PlanTrigger, PlanContent };
