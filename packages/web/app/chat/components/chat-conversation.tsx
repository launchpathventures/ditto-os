"use client";

/**
 * Chat Conversation — Authenticated persistent chat (Brief 123)
 *
 * Renders full message history using ai-elements/message.tsx with
 * BlockRegistry dispatch. Same streaming backend as the front door,
 * but with richer message rendering.
 *
 * Brief 157 MP-2.4: Subscribes to SSE harness events so ProgressBlock
 * appears during first process execution without page refresh.
 *
 * Provenance: ditto-conversation.tsx (front door), ai-elements/message.tsx (workspace)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { UIMessage } from "ai";
import { Message } from "@/components/ai-elements/message";
import { ArrowRight } from "lucide-react";
import { useHarnessEvents, type HarnessEventData } from "@/hooks/use-harness-events";
import { ProgressBlockComponent } from "@/components/blocks/progress-block";
import type { ProgressBlock } from "@/lib/engine";

interface ChatConversationProps {
  initialMessages: Array<{ role: string; content: string }>;
  sessionId: string;
  authenticatedEmail: string;
}

/**
 * Convert stored {role, content} messages to UIMessage format
 * that the ai-elements/Message component expects.
 */
function toUIMessages(messages: Array<{ role: string; content: string }>): UIMessage[] {
  return messages.map((msg, i) => ({
    id: `msg-${i}`,
    role: msg.role === "user" ? "user" as const : "assistant" as const,
    parts: [{ type: "text" as const, text: msg.content }],
  }));
}

function makeUIMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

export function ChatConversation({
  initialMessages,
  sessionId,
  authenticatedEmail,
}: ChatConversationProps) {
  const [messages, setMessages] = useState<UIMessage[]>(
    toUIMessages(initialMessages),
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeProgress, setActiveProgress] = useState<Map<string, ProgressBlock>>(new Map());
  // Brief 157 AC6: Progressive reveal — show workspace prompt after first process is created
  const [firstProcessCreated, setFirstProcessCreated] = useState<{ name: string; slug: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const msgIdCounter = useRef(initialMessages.length);

  // Brief 157 MP-2.4: Subscribe to SSE harness events for real-time progress
  const onHarnessEvent = useCallback((event: HarnessEventData) => {
    // Brief 157 AC6: Progressive reveal — detect first process creation
    // Checked before runId guard since build-process-created may lack processRunId (F2 fix)
    if (event.type === "build-process-created") {
      setFirstProcessCreated({
        name: event.processName as string,
        slug: event.processSlug as string,
      });
    }

    const runId = event.processRunId as string | undefined;
    if (!runId) return;

    switch (event.type) {
      case "step-start": {
        const stepLabel = (event.processName as string)
          ? `${event.processName}: ${event.roleName as string || event.stepId as string || "starting"}`
          : (event.roleName as string || event.stepId as string || "Working...");
        setActiveProgress((prev) => {
          const next = new Map(prev);
          // Use completedSteps+1 as totalSteps to show indeterminate progress (F3 fix)
          const existing = next.get(runId);
          const completed = existing?.completedSteps ?? 0;
          next.set(runId, {
            type: "progress",
            entityType: "process_run",
            entityId: runId,
            currentStep: stepLabel,
            totalSteps: completed + 1,
            completedSteps: completed,
            status: "running",
          });
          return next;
        });
        break;
      }
      case "step-complete": {
        setActiveProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(runId);
          if (existing) {
            const newCompleted = existing.completedSteps + 1;
            next.set(runId, {
              ...existing,
              currentStep: event.summary as string || existing.currentStep,
              completedSteps: newCompleted,
              // Keep totalSteps at least 1 ahead so bar never shows 100% until run-complete
              totalSteps: Math.max(existing.totalSteps, newCompleted + 1),
            });
          }
          return next;
        });
        break;
      }
      case "run-complete": {
        setActiveProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(runId);
          if (existing) {
            next.set(runId, {
              ...existing,
              status: "complete",
              completedSteps: existing.completedSteps,
              totalSteps: existing.completedSteps,
            });
          }
          // Auto-clear after 5s
          setTimeout(() => {
            setActiveProgress((p) => {
              const n = new Map(p);
              n.delete(runId);
              return n;
            });
          }, 5_000);
          return next;
        });
        break;
      }
      case "run-failed": {
        setActiveProgress((prev) => {
          const next = new Map(prev);
          next.delete(runId);
          return next;
        });
        break;
      }
      case "gate-pause": {
        setActiveProgress((prev) => {
          const next = new Map(prev);
          const existing = next.get(runId);
          if (existing) {
            next.set(runId, { ...existing, status: "paused" });
          }
          return next;
        });
        break;
      }
    }
  }, []);

  useHarnessEvents({ onEvent: onHarnessEvent, enabled: true });

  // Turnstile bot verification
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileToken = useRef<string | null>(null);

  const getTurnstileToken = useCallback((): string | null => {
    const token = turnstileToken.current;
    if (turnstileWidgetId.current != null && typeof window !== "undefined" && (window as any).turnstile) {
      (window as any).turnstile.reset(turnstileWidgetId.current);
      turnstileToken.current = null;
    }
    return token;
  }, []);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || !turnstileRef.current) return;

    function renderWidget() {
      if (turnstileWidgetId.current != null || !turnstileRef.current) return;
      const turnstile = (window as any).turnstile;
      if (!turnstile) return;
      turnstileWidgetId.current = turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => { turnstileToken.current = token; },
        "error-callback": () => { turnstileToken.current = null; },
      });
    }

    if ((window as any).turnstile) {
      renderWidget();
    } else {
      const interval = setInterval(() => {
        if ((window as any).turnstile) {
          renderWidget();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage(text: string) {
    if (sendingRef.current || !text.trim()) return;
    sendingRef.current = true;

    const userId = `msg-${msgIdCounter.current++}`;
    setMessages((prev) => [...prev, makeUIMessage(userId, "user", text)]);
    setInput("");
    setIsStreaming(true);
    setSuggestions([]);

    try {
      const token = getTurnstileToken();
      const res = await fetch("/api/v1/network/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          context: "front-door",
          returningEmail: authenticatedEmail,
          ...(token ? { turnstileToken: token } : {}),
        }),
      });

      if (!res.ok) {
        const errorText = res.status === 429
          ? "I'm getting a lot of messages right now. Give me a moment."
          : "Something went wrong. Please try again.";
        setMessages((prev) => [...prev, makeUIMessage(`msg-${msgIdCounter.current++}`, "assistant", errorText)]);
        setIsStreaming(false);
        sendingRef.current = false;
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      let alexMsgAdded = false;

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "text-replace") {
              streamedText = event.text;
              const msg = makeUIMessage(`msg-stream`, "assistant", streamedText);
              if (alexMsgAdded) {
                setMessages((prev) => [...prev.slice(0, -1), msg]);
              } else {
                alexMsgAdded = true;
                setMessages((prev) => [...prev, msg]);
              }
            }

            if (event.type === "text-delta") {
              streamedText += event.text;
              const msg = makeUIMessage(`msg-stream`, "assistant", streamedText);
              if (!alexMsgAdded) {
                alexMsgAdded = true;
                setMessages((prev) => [...prev, msg]);
              } else {
                setMessages((prev) => [...prev.slice(0, -1), msg]);
              }
            }

            if (event.type === "metadata") {
              setSuggestions(
                Array.isArray(event.suggestions) ? event.suggestions : [],
              );
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        makeUIMessage(`msg-${msgIdCounter.current++}`, "assistant", "Something went wrong. Please try again."),
      ]);
    } finally {
      setIsStreaming(false);
      sendingRef.current = false;
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input.trim());
  }

  function handleAction(actionId: string, payload?: Record<string, unknown>) {
    const text = payload?.message
      ? String(payload.message)
      : actionId;
    sendMessage(text);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[640px] mx-auto space-y-1">
          {messages.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <p className="text-lg">What's on your mind?</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <Message
              key={msg.id}
              message={msg}
              isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
              isLast={i === messages.length - 1 && msg.role === "assistant"}
              onAction={handleAction}
            />
          ))}
          {/* Brief 157 MP-2.4: Real-time progress blocks from SSE */}
          {activeProgress.size > 0 && (
            <div className="space-y-2 py-2">
              {Array.from(activeProgress.values()).map((block) => (
                <ProgressBlockComponent key={block.entityId} block={block} />
              ))}
            </div>
          )}
          {/* Brief 157 AC6: Progressive reveal — workspace prompt after first process */}
          {firstProcessCreated && (
            <div className="my-4 p-4 rounded-lg border border-vivid/20 bg-vivid/5">
              <p className="text-sm text-text-primary">
                Your first process <strong>{firstProcessCreated.name}</strong> is ready.
              </p>
              <a
                href="/"
                className="mt-2 inline-block text-sm font-medium text-vivid hover:underline"
              >
                Open your workspace to see it in action &rarr;
              </a>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick-reply pills */}
      {suggestions.length > 0 && !isStreaming && (
        <div className="max-w-[640px] mx-auto px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="px-3 py-1.5 text-sm rounded-full border border-border/60 text-text-secondary hover:bg-surface-raised transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border/40 bg-surface/50 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Alex..."
            disabled={isStreaming}
            className="flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-vivid text-white disabled:opacity-30 transition-opacity"
            aria-label="Send"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Invisible Turnstile widget */}
      <div ref={turnstileRef} className="hidden" />
    </div>
  );
}
