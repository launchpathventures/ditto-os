"use client";

import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { isToolUIPart, isTextUIPart, isReasoningUIPart } from "ai";
import { BlockList } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";

/**
 * Ditto Conversation Message (AI SDK v6 parts-based)
 *
 * Renders a single message via message.parts iteration.
 * Each part dispatches to the block registry or native rendering.
 * Self messages have a warm accent dot indicator.
 *
 * AC4: Renders via message.parts — no flat message.content
 * AC5: Tool parts show lifecycle states
 * AC16: Visual design preserved from Brief 040
 *
 * Provenance: Brief 045, AI SDK v6 UIMessage parts.
 */

interface MessageProps {
  message: UIMessage;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function ConversationMessage({ message, onAction }: MessageProps) {
  const isSelf = message.role === "assistant";

  return (
    <div
      data-testid={isSelf ? "assistant-message" : "user-message"}
      className={cn(
        "flex gap-3 px-4 py-3 max-w-3xl mx-auto",
        !isSelf && "flex-row-reverse",
      )}
    >
      {/* Self indicator dot */}
      {isSelf && (
        <div className="flex-shrink-0 mt-1.5">
          <div className="w-2 h-2 rounded-full bg-accent" />
        </div>
      )}

      {/* Message content via parts */}
      <div
        className={cn(
          "flex-1 text-base leading-relaxed",
          isSelf
            ? "text-text-primary"
            : "bg-accent-subtle rounded-xl px-4 py-3 text-text-primary",
        )}
      >
        {message.parts.map((part, i) => (
          <MessagePart key={i} part={part} onAction={onAction} />
        ))}
      </div>

      {/* Spacer for user messages (no dot) */}
      {!isSelf && <div className="w-2 flex-shrink-0" />}
    </div>
  );
}

/**
 * Render a single message part based on its type.
 * Text parts render inline, tool parts show lifecycle, data parts
 * dispatch to the block registry.
 */
function MessagePart({ part, onAction }: { part: UIMessage["parts"][number]; onAction?: (actionId: string, payload?: Record<string, unknown>) => void }) {
  // Text part
  if (isTextUIPart(part)) {
    return (
      <span className="whitespace-pre-wrap">{part.text}</span>
    );
  }

  // Reasoning part
  if (isReasoningUIPart(part)) {
    return (
      <div className="text-sm text-text-secondary italic my-1">
        {part.text}
      </div>
    );
  }

  // Tool part (dynamic or static) — 4-state lifecycle (AC5)
  if (isToolUIPart(part)) {
    return <ToolPartRenderer part={part} />;
  }

  // Step start marker
  if ("type" in part && part.type === "step-start") {
    return <div className="border-t border-border/30 my-2" />;
  }

  // Custom data parts (content blocks, status, credentials)
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

    if (p.type === "data-status" && p.data) {
      const status = p.data as { message: string };
      return (
        <div className="text-sm text-text-secondary my-1">
          {status.message}
        </div>
      );
    }

    // data-credential-request and data-structured are handled at conversation level
  }

  return null;
}

/**
 * Tool invocation part renderer.
 * Shows the 7-state lifecycle from AI SDK v6.
 */
function ToolPartRenderer({ part }: { part: { toolCallId: string; toolName?: string; state: string; output?: unknown; errorText?: string } }) {
  const toolName = part.toolName ?? "tool";

  switch (part.state) {
    case "input-streaming":
      return (
        <div className="flex items-center gap-2 text-sm text-text-secondary my-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
          <span>Preparing {toolName}...</span>
        </div>
      );

    case "input-available":
      return (
        <div className="flex items-center gap-2 text-sm text-text-secondary my-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse" />
          <span>Working: {toolName}...</span>
        </div>
      );

    case "output-available": {
      // Check if the output contains content blocks
      const output = part.output as { result?: string; blocks?: ContentBlock[] } | null;
      if (output?.blocks && output.blocks.length > 0) {
        return (
          <div className="my-1">
            <BlockList blocks={output.blocks} />
          </div>
        );
      }
      // No blocks — show completion indicator
      return (
        <div className="flex items-center gap-2 text-sm text-text-secondary my-1">
          <div className="w-1.5 h-1.5 rounded-full bg-positive" />
          <span>Completed: {toolName}</span>
        </div>
      );
    }

    case "output-error":
      return (
        <div className="flex items-center gap-2 text-sm text-negative my-1">
          <div className="w-1.5 h-1.5 rounded-full bg-negative" />
          <span>Failed: {toolName}{part.errorText ? ` — ${part.errorText}` : ""}</span>
        </div>
      );

    case "approval-requested":
      return (
        <div className="flex items-center gap-2 text-sm text-warning my-1">
          <div className="w-1.5 h-1.5 rounded-full bg-warning" />
          <span>Approval needed: {toolName}</span>
        </div>
      );

    default:
      return (
        <div className="flex items-center gap-2 text-sm text-text-secondary my-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/40" />
          <span>{toolName}...</span>
        </div>
      );
  }
}
