"use client";

/**
 * Review Page Client Component (Brief 106)
 *
 * Renders ContentBlocks via existing block registry + embedded chat
 * for Alex conversation. The chat context includes the full review
 * page content so Alex can reference specific items.
 */

import { useState, useRef, useCallback } from "react";
import { BlockRenderer } from "@/components/blocks/block-registry";
import type { ContentBlock } from "@/lib/engine";

interface ReviewPageData {
  id: string;
  title: string;
  contentBlocks: ContentBlock[];
  userName: string | null;
  status: string;
}

interface ReviewPageClientProps {
  data: ReviewPageData;
  token: string;
}

interface ChatMessage {
  role: "user" | "alex";
  text: string;
}

export function ReviewPageClient({ data, token }: ReviewPageClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: ChatMessage = { role: "user", text: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch(`/api/v1/network/review/${token}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        });

        if (res.ok) {
          const { reply } = await res.json();
          setMessages((prev) => [...prev, { role: "alex", text: reply }]);
        }
      } catch {
        // Silent fail — user can retry
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [token, isLoading],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Prepared for banner */}
      {data.userName && (
        <div className="rounded-lg bg-surface-secondary px-4 py-2 text-sm text-text-secondary">
          Prepared for {data.userName}
        </div>
      )}

      {/* Title */}
      <h1 className="text-2xl font-semibold text-text-primary">{data.title}</h1>

      {/* Content blocks */}
      <div className="flex flex-col gap-4">
        {data.contentBlocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>

      {/* Chat section */}
      {data.status === "active" && (
        <div className="border-t border-border/50 pt-6">
          <p className="mb-4 text-sm text-text-secondary">
            Questions? Ask Alex below.
          </p>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="mb-4 flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-2 text-sm ${
                    msg.role === "user"
                      ? "ml-auto max-w-[80%] bg-accent text-white"
                      : "mr-auto max-w-[80%] bg-surface-secondary text-text-primary"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
              {isLoading && (
                <div className="mr-auto max-w-[80%] rounded-lg bg-surface-secondary px-4 py-2 text-sm text-text-secondary">
                  ...
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Alex..."
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Completed state */}
      {data.status === "completed" && (
        <div className="border-t border-border/50 pt-6 text-center text-sm text-text-secondary">
          This review has been completed. Alex has incorporated your feedback.
        </div>
      )}
    </div>
  );
}
