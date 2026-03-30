"use client";

/**
 * Task — Adopted from AI Elements (Brief 061)
 *
 * Collapsible task container with file items.
 * Uses Radix Collapsible for expand/collapse.
 *
 * Provenance: vercel/ai-elements task.tsx, adapted for Ditto design tokens.
 */

import { type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
import { FileCode } from "lucide-react";
import { useControllableState } from "./use-controllable-state";

// --- Composable Subcomponents ---

interface TaskProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

function Task({
  open: openProp,
  defaultOpen,
  onOpenChange: onOpenChangeProp,
  children,
  className,
}: TaskProps) {
  const [open, onOpenChange] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? true,
    onChange: onOpenChangeProp,
  });

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn("my-2", className)}>
      {children}
    </Collapsible.Root>
  );
}

function TaskTrigger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Collapsible.Trigger
      className={cn(
        "flex w-full items-center gap-2 text-sm font-semibold text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded",
        className,
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
      {children}
    </Collapsible.Trigger>
  );
}

function TaskContent({ children, className }: { children: ReactNode; className?: string }) {
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

function TaskItemFile({ name, className }: { name: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-[var(--spacing-2)] text-sm text-text-secondary", className)}>
      <FileCode size={14} className="flex-shrink-0 text-text-muted" />
      <span>{name}</span>
    </div>
  );
}

export { Task, TaskTrigger, TaskContent, TaskItemFile };
