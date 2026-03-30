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
import { isToolUIPart, isTextUIPart, isReasoningUIPart } from "ai";
import { cn } from "@/lib/utils";
import { BlockList } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";
import { Reasoning } from "./reasoning";
import { Tool } from "./tool";
import { Confirmation } from "./confirmation";

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
    return (
      <div
        data-testid="user-message"
        className={cn("max-w-[720px] mx-auto flex justify-end py-2", className)}
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
      className={cn("max-w-[720px] mx-auto flex gap-3 py-3 group/message", className)}
    >
      {/* Vivid dot — Ditto's identity (preserved per Brief 058 constraint) */}
      <div className="flex-shrink-0 mt-1.5">
        <div className="w-2 h-2 rounded-full bg-vivid" />
      </div>
      <div className="flex-1 text-base leading-relaxed text-text-primary">
        {message.parts.map((part, i) => (
          <MessagePart
            key={i}
            part={part}
            isStreaming={isStreaming}
            onAction={onAction}
            onToolApprove={onToolApprove}
            onToolReject={onToolReject}
          />
        ))}
        {/* AC11: Retry action — visible on hover for last assistant message */}
        {showRetry && (
          <div className="mt-1 opacity-0 group-hover/message:opacity-100 transition-opacity duration-150">
            <button
              onClick={onRetry}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
  if (isTextUIPart(part)) {
    return (
      <div className="prose-ditto">
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
