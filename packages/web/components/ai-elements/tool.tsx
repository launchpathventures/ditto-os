"use client";

/**
 * Tool — Adopted from AI Elements (Deep Adoption, Brief 061)
 *
 * Collapsible tool invocation display using Radix Collapsible,
 * composable subcomponents, status Badge, and CodeBlock for I/O.
 *
 * Provenance: vercel/ai-elements tool.tsx, adapted for Ditto design tokens.
 */

import { createContext, useContext, type ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
import { useControllableState } from "./use-controllable-state";
import { BlockList } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";
import { CodeBlock } from "./code-block";
import { getToolDisplayLabel } from "./tool-display-names";
import { Shimmer } from "./shimmer";

// --- Context ---

interface ToolContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: "running" | "complete" | "error";
}

const ToolContext = createContext<ToolContextValue | null>(null);

function useToolContext() {
  const ctx = useContext(ToolContext);
  if (!ctx) throw new Error("Tool subcomponent must be used within <ToolRoot>");
  return ctx;
}

// --- Status Badge ---

const badgeConfig = {
  running: {
    label: "Running",
    className: "bg-info/10 text-info",
    icon: (
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-current"
            style={{
              animation: `pulse-dot 1s ease-in-out ${i * 150}ms infinite`,
            }}
          />
        ))}
      </span>
    ),
  },
  complete: {
    label: "Done",
    className: "bg-positive/10 text-positive",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  error: {
    label: "Error",
    className: "bg-negative/10 text-negative",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 6-12 12" /><path d="m6 6 12 12" />
      </svg>
    ),
  },
} as const;

function StatusBadge({ status }: { status: "running" | "complete" | "error" }) {
  const config = badgeConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-full)] text-xs transition-colors duration-150",
        config.className,
      )}
      aria-label={config.label}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

// --- Composable Subcomponents ---

interface ToolRootProps {
  status: "running" | "complete" | "error";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

function ToolRoot({ status, open: openProp, defaultOpen = false, onOpenChange: onOpenChangeProp, children, className }: ToolRootProps) {
  const [open, onOpenChange] = useControllableState({ prop: openProp, defaultProp: defaultOpen, onChange: onOpenChangeProp });
  return (
    <ToolContext.Provider value={{ open, onOpenChange, status }}>
      <Collapsible.Root open={open} onOpenChange={onOpenChange} className={cn("my-1", className)}>
        {children}
      </Collapsible.Root>
    </ToolContext.Provider>
  );
}

function ToolHeader({ children, className }: { children: ReactNode; className?: string }) {
  const { status } = useToolContext();
  return (
    <Collapsible.Trigger
      className={cn(
        "flex items-center gap-2 text-sm text-text-primary transition-colors hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded",
        className,
      )}
    >
      {children}
      <StatusBadge status={status} />
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 transition-transform duration-200 ease-in-out [[data-state=open]>&]:rotate-180"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </Collapsible.Trigger>
  );
}

function ToolContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Collapsible.Content
      className={cn(
        "overflow-hidden",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        "duration-200 ease-in-out",
      )}
    >
      <div className={cn("mt-1 pl-[var(--spacing-4)] border-l border-border/40 space-y-2", className)}>
        {children}
      </div>
    </Collapsible.Content>
  );
}

function ToolInput({ data }: { data: Record<string, unknown> }) {
  return (
    <div>
      <span className="text-xs text-text-muted block mb-1">Input</span>
      <CodeBlock code={JSON.stringify(data, null, 2)} language="json" />
    </div>
  );
}

function ToolOutput({ data }: { data: Record<string, unknown> | string }) {
  const code = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <div>
      <span className="text-xs text-text-muted block mb-1">Output</span>
      <CodeBlock code={code} language="json" />
    </div>
  );
}

// --- Backward-Compatible Default Export ---

interface ToolProps {
  toolCallId: string;
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | string | null;
  errorText?: string;
  className?: string;
}

// Map AI SDK tool states to our 3-state model
function mapToolStatus(state: string): "running" | "complete" | "error" {
  switch (state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-accepted":
      return "running";
    case "output-available":
    case "approval-rejected":
      return "complete";
    case "output-error":
      return "error";
    default:
      return "running";
  }
}

/**
 * Default composition — backward-compatible with Brief 058 API.
 * message.tsx uses: <Tool toolCallId={...} toolName={...} state={...} ... />
 */
export function Tool({ toolCallId: _toolCallId, toolName, state, input, output, errorText, className }: ToolProps) {
  const status = mapToolStatus(state);
  const isActive = state === "input-streaming" || state === "input-available";
  const displayLabel = getToolDisplayLabel(toolName);

  // Check if the output contains content blocks
  const outputObj = output as { result?: string; blocks?: ContentBlock[] } | null;
  const hasBlocks = outputObj?.blocks && outputObj.blocks.length > 0;

  // If output has content blocks, render them directly (not collapsible)
  if (state === "output-available" && hasBlocks) {
    return (
      <div className={cn("my-1", className)}>
        <BlockList blocks={outputObj!.blocks!} />
      </div>
    );
  }

  // Human-readable label based on status
  const actionLabel = status === "running" ? displayLabel.running : displayLabel.complete;

  // Extract contextual hint from output (file path, search query, etc.)
  const resultHint = (() => {
    if (status !== "complete" || !output) return "";
    const obj = typeof output === "string" ? null : (output as Record<string, unknown>);
    if (!obj) return "";
    // AC8 (065): Result summary with · separator
    if (typeof obj.result === "string" && obj.result.length > 0) {
      const summary = obj.result.length > 60 ? obj.result.slice(0, 57) + "..." : obj.result;
      return ` · ${summary}`;
    }
    // Common patterns: results array, items array, count field
    const arr = obj.results ?? obj.items ?? obj.data;
    if (Array.isArray(arr)) return ` · ${arr.length} result${arr.length === 1 ? "" : "s"}`;
    return "";
  })();

  // Only expandable if there's meaningful input or output to show
  const hasInput = input && !isActive && Object.keys(input).length > 0;
  const hasOutput = output && !hasBlocks && (() => {
    if (typeof output === "string") return output.length > 0;
    const obj = output as Record<string, unknown>;
    const result = obj?.result;
    return typeof result === "string" && result.length > 0;
  })();
  const hasExpandableContent = !!hasInput || !!hasOutput;

  // AC10 (065): Error — compact single-line with ✕ icon
  if (status === "error") {
    if (!hasExpandableContent) {
      return (
        <div className={cn("space-y-1", className)}>
          <div className="flex items-center gap-2 text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-negative flex-shrink-0">
              <path d="m18 6-12 12" /><path d="m6 6 12 12" />
            </svg>
            <span className="text-text-muted">{actionLabel}</span>
            {errorText && <span className="text-negative">· {errorText}</span>}
          </div>
        </div>
      );
    }
    // AC11 (065): Expandable error with chevron
    return (
      <ToolRoot status={status} className={cn("space-y-1", className)}>
        <Collapsible.Trigger className="flex items-center gap-2 text-sm w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-negative flex-shrink-0">
            <path d="m18 6-12 12" /><path d="m6 6 12 12" />
          </svg>
          <span className="text-text-muted flex-1 text-left">{actionLabel}{errorText ? ` · ${errorText}` : ""}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0 transition-transform duration-200 ease-in-out [[data-state=open]>&]:rotate-180">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Collapsible.Trigger>
        <ToolContent>
          {hasInput && <ToolInput data={input!} />}
          {hasOutput && (
            <ToolOutput data={typeof output === "string" ? output : (output as Record<string, unknown>)} />
          )}
        </ToolContent>
      </ToolRoot>
    );
  }

  // AC9 (065): Running — compact single-line with spinning ↻ + shimmer
  if (status === "running") {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center gap-2 text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0 animate-spin" style={{ animationDuration: "1000ms" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <Shimmer><span className="text-text-secondary">{actionLabel}</span></Shimmer>
        </div>
      </div>
    );
  }

  // AC8 (065): Complete — compact single-line: ✓ {past-tense label} · {result summary}
  if (!hasExpandableContent) {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-positive flex-shrink-0">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>{actionLabel}{resultHint}</span>
        </div>
      </div>
    );
  }

  // AC11 (065): Complete with expandable I/O — chevron on right
  return (
    <ToolRoot status={status} className={cn("space-y-1", className)}>
      <Collapsible.Trigger className="flex items-center gap-2 text-sm w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-vivid)] focus-visible:ring-offset-2 rounded">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-positive flex-shrink-0">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="text-text-muted flex-1 text-left">{actionLabel}{resultHint}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0 transition-transform duration-200 ease-in-out [[data-state=open]>&]:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Collapsible.Trigger>
      <ToolContent>
        {hasInput && <ToolInput data={input!} />}
        {hasOutput && (
          <ToolOutput data={typeof output === "string" ? output : (output as Record<string, unknown>)} />
        )}
      </ToolContent>
    </ToolRoot>
  );
}

// Named exports for composable usage
export { ToolRoot, ToolHeader, ToolContent, ToolInput, ToolOutput, StatusBadge };
