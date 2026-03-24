"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { ConversationMessage } from "./message";
import { TypingIndicator } from "./typing-indicator";
import { PromptInput } from "./prompt-input";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Ditto Conversation Surface
 *
 * Full conversation with the Self. Uses Vercel AI SDK useChat hook
 * for streaming. Messages scroll, typing indicator shows during processing.
 *
 * AC5: useChat connects to /api/chat — messages stream to the browser
 * AC6: Message list (scrollable), prompt input, typing indicator
 * AC7: Self's tool calls execute server-side and results render
 * AC10: userId threads through to engine calls
 */

interface ConversationProps {
  userId?: string;
}

export function Conversation({ userId = "default" }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  const { messages, input, setInput, handleSubmit, isLoading, data, error } =
    useChat({
      api: "/api/chat",
      body: { userId },
      onFinish: () => {
        setStatusMessage(undefined);
      },
      onError: () => {
        setStatusMessage(undefined);
      },
    });

  // Parse status messages from data stream
  useEffect(() => {
    if (!data || data.length === 0) return;
    const lastData = data[data.length - 1] as Record<string, unknown> | undefined;
    if (lastData && lastData.type === "status") {
      setStatusMessage(lastData.message as string);
    }
  }, [data]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const onSubmit = useCallback(() => {
    if (input.trim()) {
      handleSubmit();
    }
  }, [input, handleSubmit]);

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="py-8 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-3 h-3 rounded-full bg-accent mb-4" />
              <h1 className="text-xl font-semibold text-text-primary mb-2">
                Hi, I&apos;m Ditto
              </h1>
              <p className="text-text-secondary text-center max-w-md">
                I&apos;m here to help you get work done. Tell me what you&apos;re
                working on, and I&apos;ll help you figure out the best way forward.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <ConversationMessage key={message.id} message={message} />
          ))}

          {isLoading && <TypingIndicator status={statusMessage} />}

          {error && (
            <div className="px-4 py-3 max-w-3xl mx-auto">
              <div className="text-sm text-negative bg-negative/5 rounded-lg px-4 py-3">
                Connection interrupted. Please try again.
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Prompt input — persistent at bottom */}
      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
