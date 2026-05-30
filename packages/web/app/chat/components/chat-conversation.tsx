"use client";

/**
 * Chat Conversation — Authenticated workspace Self surface (Brief 280)
 *
 * This is the post-Day-Zero workspace home. It is a single conversation
 * with the Self/Mira. Processes, reviews, work items, briefings, and
 * progress render as inline `ContentBlock` artifacts in this conversation
 * using the existing block registry — there is no separate panel or tab.
 *
 * Stream seam: workspace `/chat` talks to `/api/chat` / `selfConverseStream()`
 * via the AI SDK v5 `useChat` transport. It MUST NOT call
 * `/api/v1/network/chat/stream` and MUST NOT send `context: "front-door"`
 * (Brief 280 AC4) — workspace tools (`generate_process`, `start_pipeline`,
 * `get_briefing`, `create_work_item`, …) are blocked in front-door context
 * by `src/engine/action-boundaries.ts`.
 *
 * Live run progress that originates outside the message stream (heartbeat
 * step events) still arrives via the `/api/events` SSE harness feed and
 * renders as an inline `ProgressBlock` overlay (Brief 157 MP-2.4 behavior,
 * preserved). Reduced-motion is honored by `ProgressBlockComponent`.
 *
 * Provenance: components/self/conversation.tsx (canonical useChat pattern),
 * components/layout/workspace.tsx (initial-message seeding), Brief 280.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Message } from "@/components/ai-elements/message";
import { MaskedCredentialInput } from "@/components/self/masked-input";
import { useHarnessEvents, type HarnessEventData } from "@/hooks/use-harness-events";
import { ProgressBlockComponent } from "@/components/blocks/progress-block";
import { dataPartSchemas } from "@/lib/data-part-schemas";
import type { ProgressBlock } from "@/lib/engine";

interface ChatConversationProps {
  initialMessages: Array<{ role: string; content: string }>;
  /**
   * Retained for the chat/page.tsx → ChatConversation contract. The
   * workspace Self stream is keyed on the workspace identity (`userId`)
   * server-side, not on these props, so they are no longer read here.
   */
  sessionId?: string;
  authenticatedEmail?: string;
}

interface CredentialRequest {
  service: string;
  processSlug: string | null;
  fieldLabel: string;
  placeholder: string;
}

// Entry points for the empty workspace conversation — "talk to your
// workspace" affordances rather than primitive tabs (Brief 280 IA).
const STARTER_SUGGESTIONS = [
  "What needs my attention?",
  "Start a new process",
  "Show me my briefing",
  "Review something",
];

/**
 * Convert stored {role, content} messages (Brief 123 persisted history)
 * to the UIMessage format the AI SDK v5 `useChat` hook seeds from.
 */
function toUIMessages(messages: Array<{ role: string; content: string }>): UIMessage[] {
  return messages.map((msg, i) => ({
    id: `seed-${i}`,
    role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
    parts: [{ type: "text" as const, text: msg.content }],
  }));
}

export function ChatConversation({ initialMessages }: ChatConversationProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [credentialRequests, setCredentialRequests] = useState<CredentialRequest[]>([]);
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const [activeProgress, setActiveProgress] = useState<Map<string, ProgressBlock>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    // Brief 280 AC4: workspace Self stream, not the network front door.
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userId: "default" },
    }),
    // Type-safe custom data parts (content-block, status, credential-request).
    dataPartSchemas,
    // Throttle UI updates during fast streaming.
    experimental_throttle: 100,
    // Conversation continuity: seed Brief-123 persisted history if present.
    messages: toUIMessages(initialMessages),
    onData(dataPart) {
      if (dataPart.type === "data-status") {
        const statusData = dataPart.data as { message: string };
        setTransientStatus(statusData.message);
        if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
        transientTimerRef.current = setTimeout(() => setTransientStatus(null), 5000);
      }
    },
    onFinish() {
      setTransientStatus(null);
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
        transientTimerRef.current = null;
      }
    },
    onError() {
      setTransientStatus(null);
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
        transientTimerRef.current = null;
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  // Detect credential requests in the latest assistant message.
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;
    const creds: CredentialRequest[] = [];
    for (const part of lastMsg.parts) {
      if ("type" in part && (part as { type: string }).type === "data-credential-request") {
        creds.push((part as { data: CredentialRequest }).data);
      }
    }
    if (creds.length > 0) setCredentialRequests(creds);
  }, [messages]);

  // Brief 157 MP-2.4 (preserved): live run progress from the harness SSE
  // feed renders inline. This is run telemetry that does not flow through
  // the message stream, so it is overlaid below the conversation.
  const onHarnessEvent = useCallback((event: HarnessEventData) => {
    const runId = event.processRunId as string | undefined;
    if (!runId) return;
    switch (event.type) {
      case "step-start": {
        const stepLabel = (event.processName as string)
          ? `${event.processName}: ${(event.roleName as string) || (event.stepId as string) || "starting"}`
          : ((event.roleName as string) || (event.stepId as string) || "Working...");
        setActiveProgress((prev) => {
          const next = new Map(prev);
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
              currentStep: (event.summary as string) || existing.currentStep,
              completedSteps: newCompleted,
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
          if (existing) next.set(runId, { ...existing, status: "paused" });
          return next;
        });
        break;
      }
    }
  }, []);

  useHarnessEvents({ onEvent: onHarnessEvent, enabled: true });

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeProgress]);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;
      setCredentialRequests([]);
      setTransientStatus(null);
      sendMessage({ role: "user", parts: [{ type: "text", text: trimmed }] });
      setInput("");
    },
    [isLoading, sendMessage],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  // Inline block actions. Drill-downs navigate to real route shapes
  // (Brief 280 AC13); everything else continues the conversation so the
  // user is never forced out of chat (Brief 280 objective).
  const handleBlockAction = useCallback(
    async (actionId: string, payload?: Record<string, unknown>) => {
      const href = typeof payload?.href === "string" ? payload.href : null;
      if (href) {
        router.push(href);
        return;
      }

      if (actionId.startsWith("suggest-accept-")) {
        const content = (payload?.content as string) ?? "";
        send(content ? `I'd like to set that up — ${content}` : "I'd like to set that up.");
        return;
      }
      if (actionId.startsWith("suggest-dismiss-")) {
        try {
          await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actionId, payload }),
          });
        } catch {
          // Best-effort — dismissal still acknowledged in conversation.
        }
        send("Not right now, thanks.");
        return;
      }

      // Explicit message payload (e.g. proposal-run carries the run prompt).
      if (typeof payload?.message === "string" && payload.message.trim()) {
        send(payload.message);
        return;
      }

      const actionMessages: Record<string, string> = {
        "knowledge-confirm": "That looks right.",
        "knowledge-correct": payload?.corrections
          ? `Let me correct that: ${payload.corrections}`
          : "I'd like to fix something.",
        "proposal-approve": "Looks good — let's try it.",
        "proposal-adjust": "I'd change something about that.",
      };
      send(actionMessages[actionId] ?? `Action: ${actionId}`);
    },
    [router, send],
  );

  const handleToolApprove = useCallback(
    (toolCallId: string) => addToolApprovalResponse({ id: toolCallId, approved: true }),
    [addToolApprovalResponse],
  );
  const handleToolReject = useCallback(
    (toolCallId: string) => addToolApprovalResponse({ id: toolCallId, approved: false }),
    [addToolApprovalResponse],
  );

  const handleCredentialComplete = useCallback(
    (success: boolean, message: string) => {
      setCredentialRequests((prev) => prev.slice(1));
      send(
        success
          ? `I've entered the credentials. ${message}`
          : `There was a problem with the credentials: ${message}`,
      );
    },
    [send],
  );

  const handleRetry = useCallback(() => regenerate(), [regenerate]);

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
          {messages.map((msg, i) => {
            const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
            return (
              <Message
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1}
                isLast={isLastAssistant}
                onAction={handleBlockAction}
                onToolApprove={handleToolApprove}
                onToolReject={handleToolReject}
                onRetry={isLastAssistant ? handleRetry : undefined}
              />
            );
          })}

          {/* Credential capture (masked) — inline, never a separate page */}
          {credentialRequests.map((req, i) => (
            <div key={`cred-${req.service}-${i}`} className="py-2">
              <MaskedCredentialInput
                service={req.service}
                processSlug={req.processSlug}
                fieldLabel={req.fieldLabel}
                placeholder={req.placeholder}
                onComplete={handleCredentialComplete}
              />
            </div>
          ))}

          {/* Brief 157 MP-2.4 (preserved): real-time run progress */}
          {activeProgress.size > 0 && (
            <div className="space-y-2 py-2">
              {Array.from(activeProgress.values()).map((block) => (
                <ProgressBlockComponent key={block.entityId} block={block} />
              ))}
            </div>
          )}

          {/* Transient tool/status line (AC: tool progress state) */}
          {isLoading && transientStatus && (
            <p className="py-2 text-sm text-text-muted">{transientStatus}</p>
          )}

          {/* Error with retry */}
          {error && (
            <div className="my-2 text-sm text-negative bg-negative/5 rounded-lg px-4 py-3 flex items-center justify-between">
              <span>Connection interrupted. Please try again.</span>
              <button
                onClick={handleRetry}
                className="text-xs font-medium text-negative hover:underline ml-3 flex-shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Starter entry points (empty conversation only) */}
      {messages.length === 0 && !isLoading && (
        <div className="max-w-[640px] mx-auto px-4 pb-2 flex flex-wrap gap-2">
          {STARTER_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
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
            placeholder="Message your workspace…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-accent text-accent-foreground disabled:opacity-30 transition-opacity"
            aria-label="Send"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
