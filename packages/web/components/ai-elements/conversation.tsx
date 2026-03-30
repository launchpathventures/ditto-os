"use client";

/**
 * Conversation — Adopted from AI Elements
 *
 * Message container with auto-scroll via use-stick-to-bottom,
 * empty state with welcome + suggestions, and smooth scroll behavior.
 *
 * AC1: Adopted from AI Elements, renders message list with
 * use-stick-to-bottom auto-scroll.
 *
 * Provenance: vercel/ai-elements conversation.tsx, adapted for Ditto design tokens.
 */

import type { ReactNode } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { cn } from "@/lib/utils";

interface ConversationProps {
  children: ReactNode;
  className?: string;
}

export function Conversation({ children, className }: ConversationProps) {
  return (
    <StickToBottom
      className={cn("flex-1 overflow-hidden relative", className)}
      resize="smooth"
      initial="instant"
    >
      <StickToBottom.Content className="py-8 space-y-1">
        {children}
      </StickToBottom.Content>
      <ScrollToBottomButton />
    </StickToBottom>
  );
}

/**
 * Floating scroll-to-bottom button.
 * Only visible when user has scrolled up during streaming.
 */
function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
      <button
        onClick={() => scrollToBottom()}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full",
          "bg-surface-raised border border-border shadow-medium",
          "text-text-secondary hover:text-text-primary transition-colors",
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        Scroll to bottom
      </button>
    </div>
  );
}
