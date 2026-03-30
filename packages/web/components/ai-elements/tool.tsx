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

  // Extract result count hint from output if available
  const resultHint = (() => {
    if (status !== "complete" || !output) return "";
    const obj = typeof output === "string" ? null : (output as Record<string, unknown>);
    if (!obj) return "";
    // Common patterns: results array, items array, count field
    const arr = obj.results ?? obj.items ?? obj.data;
    if (Array.isArray(arr)) return ` — ${arr.length} result${arr.length === 1 ? "" : "s"}`;
    return "";
  })();

  const hasExpandableContent = !!(input && !isActive) || !!(output && !hasBlocks);

  // Error state — negative border accent, visible error
  if (status === "error") {
    return (
      <div className={cn("my-1 border-l-2 border-negative pl-3 flex items-center gap-2 text-sm", className)}>
        <span className="text-text-primary">{actionLabel}</span>
        <StatusBadge status="error" />
        {errorText && <span className="text-negative text-sm">{errorText}</span>}
      </div>
    );
  }

  // Running state — pulse dots + label, no chevron
  if (status === "running") {
    return (
      <div className={cn("my-1 flex items-center gap-2 text-sm", className)}>
        <span className="flex gap-0.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-info"
              style={{ animation: `pulse-dot 1s ease-in-out ${i * 150}ms infinite` }}
            />
          ))}
        </span>
        <span className="text-text-secondary">{actionLabel}</span>
      </div>
    );
  }

  // Complete state — muted, checkmark, past-tense label
  if (!hasExpandableContent) {
    return (
      <div className={cn("my-1 flex items-center gap-2 text-sm text-text-muted", className)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-positive flex-shrink-0">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{actionLabel}{resultHint}</span>
      </div>
    );
  }

  return (
    <ToolRoot status={status} className={className}>
      <ToolHeader>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-positive flex-shrink-0">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="text-text-muted">{actionLabel}{resultHint}</span>
      </ToolHeader>
      <ToolContent>
        {input && !isActive && <ToolInput data={input} />}
        {output && !hasBlocks && (
          <ToolOutput data={typeof output === "string" ? output : (output as Record<string, unknown>)} />
        )}
      </ToolContent>
    </ToolRoot>
  );
}

// Named exports for composable usage
export { ToolRoot, ToolHeader, ToolContent, ToolInput, ToolOutput, StatusBadge };
