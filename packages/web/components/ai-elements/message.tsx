"use client";

/**
 * Message — Adopted from AI Elements
 *
 * Role-based message wrapper with streaming markdown via streamdown,
 * vivid dot indicator for Self messages, and ContentBlock dispatch.
 *
 * AC2: Extended with vivid dot indicator for Self messages, delegates to
 * streamdown for text parts and BlockList for data-content-block parts.
 *
 * Provenance: vercel/ai-elements message.tsx, adapted for Ditto design tokens.
 */

import { Streamdown } from "streamdown";
import type { UIMessage } from "ai";
import { type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { isToolUIPart, isTextUIPart, isReasoningUIPart } from "ai";
import { cn } from "@/lib/utils";
import { BlockList } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";
import type { ConfidenceData } from "@/lib/data-part-schemas";
import { Reasoning } from "./reasoning";
import { Tool } from "./tool";
import { Confirmation } from "./confirmation";
import { ConfidenceCard } from "./confidence-card";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
} from "./chain-of-thought";
import { getToolDisplayLabel } from "./tool-display-names";
import { Shimmer } from "./shimmer";

interface MessageProps {
  message: UIMessage;
  isStreaming?: boolean;
  /** Whether this is the last assistant message (enables retry action) */
  isLast?: boolean;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
  /** Called when user clicks retry on the last assistant message (AC11) */
  onRetry?: () => void;
  className?: string;
}

export function Message({
  message,
  isStreaming,
  isLast,
  onAction,
  onToolApprove,
  onToolReject,
  onRetry,
  className,
}: MessageProps) {
  const isSelf = message.role === "assistant";

  if (!isSelf) {
    // User messages — surface pill, right-aligned per .impeccable.md
    // AC1 (066): Entrance animation — slide in from right
    return (
      <div
        data-testid="user-message"
        className={cn(
          "max-w-[720px] mx-auto flex justify-end py-2",
          "animate-in slide-in-from-right-2 fade-in-0 duration-200 ease-out",
          className,
        )}
      >
        <div className="bg-surface-raised rounded-2xl px-4 py-2.5 text-base leading-relaxed text-text-primary max-w-[85%]">
          {message.parts.map((part, i) => (
            <MessagePart
              key={i}
              part={part}
              onAction={onAction}
            />
          ))}
        </div>
      </div>
    );
  }

  // Self messages — typographic flow, no background, vivid dot
  // Don't render the message shell if it only has status/step-start parts
  const hasRenderableContent = message.parts.some((p) => {
    if (isTextUIPart(p) || isReasoningUIPart(p) || isToolUIPart(p)) return true;
    const typed = p as { type?: string };
    if (typed.type === "data-status" || typed.type === "step-start") return false;
    if (typed.type?.startsWith("data-")) return true;
    return false;
  });
  if (!hasRenderableContent) return null;

  const showRetry = isLast && !isStreaming && onRetry;

  return (
    <div
      data-testid="assistant-message"
      className={cn(
        "max-w-[720px] mx-auto flex gap-3 py-3 group/message",
        // AC2 (066): Entrance animation — slide in from bottom
        "animate-in slide-in-from-bottom-1 fade-in-0 duration-200 ease-out",
        className,
      )}
    >
      {/* Vivid dot — Ditto's identity (preserved per Brief 058 constraint) */}
      {/* AC7 (065): Breathing animation during streaming */}
      <div className="flex-shrink-0 mt-1.5">
        <div
          className="w-2 h-2 rounded-full bg-vivid"
          style={isStreaming ? { animation: "dot-breathe 2s ease-in-out infinite" } : undefined}
        />
      </div>
      <div className="flex-1 text-base leading-relaxed text-text-primary">
        <AssistantParts
          parts={message.parts}
          isStreaming={isStreaming}
          onAction={onAction}
          onToolApprove={onToolApprove}
          onToolReject={onToolReject}
        />
        {/* AC4-7 (066): Hover action bar — copy + retry */}
        {!isStreaming && (
          <MessageActions
            message={message}
            showRetry={!!showRetry}
            onRetry={onRetry}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Message hover actions — copy + retry (Brief 066 AC4-7)
// ============================================================

/** Extract plain text from a message, stripping markdown. */
function extractPlainText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("\n")
    // Strip markdown formatting: bold, italic, links, headers, code blocks, images
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, "").replace(/```/g, "").trim())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .trim();
}

function MessageActions({
  message,
  showRetry,
  onRetry,
}: {
  message: UIMessage;
  showRetry: boolean;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = extractPlainText(message);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may fail in some contexts — silent fallback
    }
  }, [message]);

  return (
    <div className="mt-1 h-6 flex items-center gap-2 opacity-0 group-hover/message:opacity-100 transition-opacity duration-150">
      {/* AC5: Copy action */}
      <button
        onClick={handleCopy}
        className="relative flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Copy message"
      >
        {copied ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="text-xs text-positive">Copied!</span>
          </>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>

      {/* AC6: Retry action — only on last assistant message */}
      {showRetry && onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors"
          aria-label="Retry"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ============================================================
// Activity grouping — CLI internal tools + reasoning collapse together
// ============================================================

/** CLI tools that represent internal activity (not user-facing tool results). */
const CLI_INTERNAL_TOOLS = new Set([
  "Read", "Edit", "Write", "MultiEdit", "Grep", "Glob", "Bash",
  "WebSearch", "WebFetch", "Agent", "assess_confidence",
]);

/** Is this part internal activity that should be collapsible as a group? */
function isInternalActivity(part: UIMessage["parts"][number]): boolean {
  if (isReasoningUIPart(part)) return true;
  if (isToolUIPart(part)) {
    const tp = part as { toolName?: string; state?: string };
    // Approval-requested tools must render standalone so the Confirmation component is shown
    if (tp.state === "approval-requested") return false;
    return CLI_INTERNAL_TOOLS.has(tp.toolName ?? "");
  }
  return false;
}

/** Is the last part in a group still streaming/running? */
function isGroupActive(parts: UIMessage["parts"]): boolean {
  const last = parts[parts.length - 1];
  if (!last) return false;
  if (isReasoningUIPart(last)) return true;
  if (isToolUIPart(last)) {
    const tp = last as { state: string };
    return tp.state === "input-streaming" || tp.state === "input-available";
  }
  return false;
}

/** Does this activity group contain only reasoning parts (no tool calls)? */
function isReasoningOnlyGroup(parts: UIMessage["parts"]): boolean {
  return parts.every(isReasoningUIPart);
}

/** Build an outcome-oriented header for an activity group (Insight-126). */
function getActivityHeader(parts: UIMessage["parts"], active: boolean): { text: string; shimmer: boolean } {
  const toolParts = parts.filter(isToolUIPart) as Array<{ toolName?: string }>;

  if (active) {
    // Show the current tool's runningOutcome label
    const last = parts[parts.length - 1];
    if (last && isReasoningUIPart(last)) return { text: "Thinking...", shimmer: true };
    if (last && isToolUIPart(last)) {
      const tp = last as { toolName?: string };
      return { text: getToolDisplayLabel(tp.toolName ?? "tool").runningOutcome, shimmer: true };
    }
    return { text: "Working...", shimmer: true };
  }

  // Complete — reasoning-only groups preserve current behavior
  if (toolParts.length === 0) return { text: "Thought for a moment", shimmer: false };

  // "Checked {N} sources — {deduplicated category list}" (Option C from Designer spec)
  const categories = new Set<string>();
  for (const tp of toolParts) {
    categories.add(getToolDisplayLabel(tp.toolName ?? "tool").category);
  }
  const totalSources = toolParts.length;
  const categoryList = [...categories];
  const categoryText = categoryList.length > 5
    ? undefined // Falls back to "items" when >5 unique categories
    : categoryList.join(", ");
  const suffix = categoryText ? ` — ${categoryText}` : "";
  return { text: `Checked ${totalSources} source${totalSources !== 1 ? "s" : ""}${suffix}`, shimmer: false };
}

/**
 * Extract a brief result hint from tool output for ChainOfThoughtStep description.
 * Returns a short string (file path, result count, first 60 chars) or undefined.
 */
function extractToolResultHint(output: unknown): string | undefined {
  if (!output) return undefined;
  if (typeof output === "string") {
    if (output.length === 0) return undefined;
    return output.length > 60 ? output.slice(0, 57) + "..." : output;
  }
  const obj = output as Record<string, unknown>;
  // File path from Read/Edit/Write
  if (typeof obj.filePath === "string") return obj.filePath;
  if (typeof obj.file_path === "string") return obj.file_path;
  // Result summary
  if (typeof obj.result === "string" && obj.result.length > 0) {
    return obj.result.length > 60 ? obj.result.slice(0, 57) + "..." : obj.result;
  }
  // Array results
  const arr = obj.results ?? obj.items ?? obj.data;
  if (Array.isArray(arr)) return `${arr.length} result${arr.length === 1 ? "" : "s"}`;
  return undefined;
}

/** Map AI SDK tool state to display status. */
function toolIsActive(state: string): boolean {
  return state === "input-streaming" || state === "input-available";
}

const ACTIVITY_AUTO_CLOSE_DELAY = 1500;

/**
 * Activity group wrapper — auto-closes when streaming completes.
 * Respects user manual toggles (Insight-124).
 */
function ActivityGroup({
  active,
  children,
}: {
  active: boolean;
  children: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(active);
  const userToggledRef = useRef(false);

  const handleOpenChange = (newOpen: boolean) => {
    userToggledRef.current = true;
    setOpen(newOpen);
  };

  // Auto-close when active→false (streaming ends), unless user manually opened
  useEffect(() => {
    if (!active && open && !userToggledRef.current) {
      const timer = setTimeout(() => setOpen(false), ACTIVITY_AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
    // Reset user toggle tracking when a new active cycle begins
    if (active) {
      userToggledRef.current = false;
    }
  }, [active, open]);

  return <>{children({ open, onOpenChange: handleOpenChange })}</>;
}

/**
 * Push a confidence card or shimmer placeholder into the elements array.
 * Used both for the primary insertion (before first text) and fallback (end of message).
 */
function pushConfidenceElement(
  elements: ReactNode[],
  assessment: ConfidenceData | undefined,
  isStreaming: boolean | undefined,
  toolSummary: Array<{ name: string; outcome: string }>,
) {
  if (assessment) {
    // Build activity trace from tool summary (AC10)
    const activityTrace = toolSummary.length > 0 ? (
      <div className="space-y-0.5">
        {toolSummary.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs text-text-muted">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-positive flex-shrink-0">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span>{t.outcome}</span>
          </div>
        ))}
      </div>
    ) : undefined;

    elements.push(
      <ConfidenceCard
        key="confidence"
        assessment={assessment}
        isStreaming={isStreaming}
        activityTrace={activityTrace}
      />,
    );
  } else if (isStreaming) {
    // AC13: Shimmer placeholder while streaming — confidence data hasn't arrived yet
    elements.push(
      <div key="confidence-placeholder" className="my-1.5">
        <Shimmer>
          <span className="text-sm text-text-muted">Assessing confidence...</span>
        </Shimmer>
      </div>,
    );
  }
}

/**
 * Render assistant parts with consecutive internal activity grouped
 * into collapsible sections. Text and Ditto tool calls render directly.
 *
 * Activity groups render with outcome-oriented headers (Insight-126)
 * and ChainOfThoughtStep sub-items instead of raw MessagePart rendering.
 * Reasoning-only groups render as standalone Reasoning components.
 */
function AssistantParts({
  parts,
  isStreaming,
  onAction,
  onToolApprove,
  onToolReject,
}: {
  parts: UIMessage["parts"];
  isStreaming?: boolean;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
}) {
  const elements: ReactNode[] = [];
  let i = 0;
  let confidenceCardInserted = false;

  // Extract confidence data part and check for tool usage (AC11, Brief 068)
  let confidenceAssessment: ConfidenceData | undefined;
  let hasToolCalls = false;
  const toolSummary: Array<{ name: string; outcome: string }> = [];

  for (const part of parts) {
    const typed = part as { type?: string; data?: unknown };
    if (typed.type === "data-confidence" && typed.data) {
      confidenceAssessment = typed.data as ConfidenceData;
    }
    if (isToolUIPart(part)) {
      const tp = part as { toolName?: string };
      const toolName = tp.toolName ?? "tool";
      // assess_confidence is metadata, not a user-facing tool call
      if (toolName !== "assess_confidence") {
        hasToolCalls = true;
        toolSummary.push({
          name: toolName,
          outcome: getToolDisplayLabel(toolName).outcome,
        });
      }
    }
  }

  while (i < parts.length) {
    // Skip data-confidence parts — rendered as ConfidenceCard below (Brief 068)
    const typed = parts[i] as { type?: string };
    if (typed.type === "data-confidence") {
      i++;
      continue;
    }

    if (isInternalActivity(parts[i])) {
      // Collect consecutive internal activity parts
      const group: UIMessage["parts"] = [];
      while (i < parts.length && isInternalActivity(parts[i])) {
        group.push(parts[i]);
        i++;
      }

      // Reasoning-only groups: render as standalone Reasoning components (AC8)
      if (isReasoningOnlyGroup(group)) {
        for (const part of group) {
          elements.push(
            <MessagePart
              key={`reasoning-${elements.length}`}
              part={part}
              isStreaming={isStreaming}
              onAction={onAction}
              onToolApprove={onToolApprove}
              onToolReject={onToolReject}
            />,
          );
        }
        continue;
      }

      // Activity group with tool calls — outcome-oriented display
      const active = !!isStreaming && isGroupActive(group);
      const header = getActivityHeader(group, active);
      const groupKey = `activity-${elements.length}`;

      elements.push(
        <ActivityGroup key={groupKey} active={active}>
          {({ open, onOpenChange }) => (
            <ChainOfThought open={open} onOpenChange={onOpenChange}>
              <ChainOfThoughtHeader variant="activity">
                {header.shimmer ? (
                  <Shimmer><span>{header.text}</span></Shimmer>
                ) : (
                  <span>{header.text}</span>
                )}
              </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {group.map((part, gi) => {
              // Reasoning within tool groups: flat inline text (AC8)
              if (isReasoningUIPart(part)) {
                const rp = part as { text: string };
                return (
                  <div
                    key={gi}
                    className="text-sm font-mono text-text-muted whitespace-pre-wrap max-h-[200px] overflow-y-auto pl-[var(--spacing-5)] my-0.5"
                  >
                    {rp.text}
                  </div>
                );
              }

              // Tool calls: compact single-line items (AC7, AC9)
              if (isToolUIPart(part)) {
                const tp = part as {
                  toolName?: string;
                  state: string;
                  output?: unknown;
                };
                const label = getToolDisplayLabel(tp.toolName ?? "tool");
                const active = toolIsActive(tp.state);
                const isError = tp.state === "output-error";
                const hint = !active ? extractToolResultHint(tp.output) : undefined;
                const hintText = hint ? ` · ${hint}` : "";

                // Active: spinner + shimmer label
                if (active) {
                  return (
                    <div key={gi} className="flex items-center gap-2 text-sm py-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0 animate-spin" style={{ animationDuration: "1000ms" }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <Shimmer><span className="text-text-secondary">{label.runningOutcome}</span></Shimmer>
                    </div>
                  );
                }

                // Error: ✕ icon + outcome
                if (isError) {
                  return (
                    <div key={gi} className="flex items-center gap-2 text-sm text-text-muted py-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-negative flex-shrink-0">
                        <path d="m18 6-12 12" /><path d="m6 6 12 12" />
                      </svg>
                      <span>{label.outcome}{hintText}</span>
                    </div>
                  );
                }

                // Complete: ✓ icon + outcome · hint
                return (
                  <div key={gi} className="flex items-center gap-2 text-sm text-text-muted py-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-positive flex-shrink-0">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{label.outcome}{hintText}</span>
                  </div>
                );
              }

              return null;
            })}
          </ChainOfThoughtContent>
            </ChainOfThought>
          )}
        </ActivityGroup>,
      );
    } else {
      // Confidence Card — trust signal ABOVE response text (Brief 068, Insight-128)
      // Insert before the first text part so user sees caveats before reading the answer
      if (!confidenceCardInserted && hasToolCalls && isTextUIPart(parts[i])) {
        confidenceCardInserted = true;
        pushConfidenceElement(elements, confidenceAssessment, isStreaming, toolSummary);
      }

      elements.push(
        <MessagePart
          key={`part-${i}`}
          part={parts[i]}
          isStreaming={isStreaming}
          onAction={onAction}
          onToolApprove={onToolApprove}
          onToolReject={onToolReject}
        />,
      );
      i++;
    }
  }

  // Fallback: if tools were called but no text part appeared (edge case),
  // append the confidence card at the end
  if (!confidenceCardInserted && hasToolCalls) {
    pushConfidenceElement(elements, confidenceAssessment, isStreaming, toolSummary);
  }

  return <>{elements}</>;
}

/**
 * Render a single message part based on its type.
 *
 * Insight-110 boundary: streamed text uses streamdown (Self's voice),
 * ContentBlocks dispatch to Ditto's block registry (structured output).
 */
function MessagePart({
  part,
  isStreaming,
  onAction,
  onToolApprove,
  onToolReject,
}: {
  part: UIMessage["parts"][number];
  isStreaming?: boolean;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
}) {
  // Text part — streamdown for streaming-aware markdown (AC15)
  // AC6 (065): Streaming cursor on text-delta path only (Insight-110)
  if (isTextUIPart(part)) {
    return (
      <div className={cn("prose-ditto", isStreaming && "streaming-cursor")}>
        <Streamdown mode={isStreaming ? "streaming" : "static"}>
          {part.text}
        </Streamdown>
      </div>
    );
  }

  // Reasoning part — adopted Reasoning component (AC4)
  if (isReasoningUIPart(part)) {
    return <Reasoning text={part.text} isStreaming={isStreaming} />;
  }

  // Tool part — adopted Tool + Confirmation components (AC5, AC6)
  if (isToolUIPart(part)) {
    const toolPart = part as {
      toolCallId: string;
      toolName?: string;
      state: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

    // Approval-requested state gets Confirmation component
    if (toolPart.state === "approval-requested" && onToolApprove && onToolReject) {
      return (
        <Confirmation
          toolCallId={toolPart.toolCallId}
          toolName={toolPart.toolName ?? "tool"}
          onApprove={onToolApprove}
          onReject={onToolReject}
        />
      );
    }

    return (
      <Tool
        toolCallId={toolPart.toolCallId}
        toolName={toolPart.toolName ?? "tool"}
        state={toolPart.state}
        input={toolPart.input as Record<string, unknown> | undefined}
        output={toolPart.output as Record<string, unknown> | string | null | undefined}
        errorText={toolPart.errorText}
      />
    );
  }

  // Step start marker
  if ("type" in part && part.type === "step-start") {
    return <div className="border-t border-border/30 my-2" />;
  }

  // Custom data parts — ContentBlocks dispatch to block registry (Insight-110)
  if ("type" in part && typeof part.type === "string") {
    const p = part as { type: string; data?: unknown };

    if (p.type === "data-content-block" && p.data) {
      const block = p.data as ContentBlock;
      return (
        <div className="my-1">
          <BlockList blocks={[block]} onAction={onAction} />
        </div>
      );
    }

    // data-status parts are transient (AC12) — handled by onData callback
    // data-credential-request and data-structured are handled at conversation level
  }

  return null;
}
