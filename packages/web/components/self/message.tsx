"use client";

import { cn } from "@/lib/utils";
import type { Message } from "ai";

/**
 * Ditto Conversation Message
 *
 * Renders a single message in the conversation.
 * Self messages have a warm accent dot indicator.
 * User messages have a subtle warm background tint.
 *
 * Visual spec: docs/research/visual-identity-design-system-ux.md §4.4
 */

interface MessageProps {
  message: Message;
}

export function ConversationMessage({ message }: MessageProps) {
  const isSelf = message.role === "assistant";

  return (
    <div
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

      {/* Message content */}
      <div
        className={cn(
          "flex-1 text-base leading-relaxed whitespace-pre-wrap",
          isSelf
            ? "text-text-primary"
            : "bg-accent-subtle rounded-xl px-4 py-3 text-text-primary",
        )}
      >
        {message.content}

        {/* Tool activity indicators */}
        {message.toolInvocations && message.toolInvocations.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolInvocations.map((tool) => (
              <div
                key={tool.toolCallId}
                className="flex items-center gap-2 text-sm text-text-secondary"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                <span>
                  {tool.state === "result"
                    ? `Completed: ${tool.toolName}`
                    : `Working: ${tool.toolName}...`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spacer for user messages (no dot) */}
      {!isSelf && <div className="w-2 flex-shrink-0" />}
    </div>
  );
}
