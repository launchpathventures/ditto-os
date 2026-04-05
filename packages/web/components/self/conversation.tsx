"use client";

/**
 * Ditto Conversation Surface (AI SDK v6 + AI Elements)
 *
 * Full conversation with the Self. Composed from adopted AI Elements
 * components. Uses AI SDK v6 useChat hook with full API surface:
 * dataPartSchemas, experimental_throttle, onFinish, onData, stop,
 * regenerate, addToolApprovalResponse.
 *
 * AC1: AI Elements Conversation with use-stick-to-bottom auto-scroll
 * AC7: Suggestion chips for empty conversation
 * AC8: dataPartSchemas — type-safe custom data parts, zero `as never` casts
 * AC9: experimental_throttle at 100ms
 * AC10: stop() wired to abort button
 * AC11: regenerate() wired to retry action
 * AC12: Transient status parts via onData callback
 *
 * Provenance: Brief 058 (AI SDK & Elements Adoption).
 */

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useState, useCallback, useRef } from "react";
import { Conversation as ConversationContainer } from "@/components/ai-elements/conversation";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/self/prompt-input";
import { Suggestions } from "@/components/ai-elements/suggestion";
import { DotParticles } from "@/app/setup/dot-particles";
import { TypingIndicator } from "./typing-indicator";
import { MaskedCredentialInput } from "./masked-input";
import { isProcessSaved } from "@/lib/transition-map";
import { emitProcessCreated } from "@/lib/workspace-events";
import { dataPartSchemas } from "@/lib/data-part-schemas";
import { cn } from "@/lib/utils";

interface ConversationProps {
  userId?: string;
}

interface CredentialRequest {
  service: string;
  processSlug: string | null;
  fieldLabel: string;
  placeholder: string;
}

// AC8 (066): Static suggestion chip text for empty state
const STARTER_SUGGESTIONS = [
  "What needs my attention?",
  "Start a new process",
  "Show me my briefing",
  "Review something",
];

/** Queued message awaiting dispatch after stream completes */
interface QueuedMessage {
  id: string;
  text: string;
}

export function Conversation({ userId = "default" }: ConversationProps) {
  const [credentialRequests, setCredentialRequests] = useState<CredentialRequest[]>([]);
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [input, setInput] = useState("");

  // AC9-13: Message queue state
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);
  // Keep ref in sync for use in callbacks that capture stale state
  useEffect(() => { queueRef.current = messageQueue; }, [messageQueue]);

  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    regenerate,
    addToolApprovalResponse,
  } = useChat({
    // AC8: Type-safe custom data parts via Zod schemas
    dataPartSchemas,
    // AC9: Throttle UI updates during fast streaming (100ms)
    experimental_throttle: 100,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userId },
    }),
    // AC12: Transient status parts received via onData callback
    onData(dataPart) {
      if (dataPart.type === "data-status") {
        const statusData = dataPart.data as { message: string };
        setTransientStatus(statusData.message);
        // Clear status after 5s if no new status arrives
        if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
        transientTimerRef.current = setTimeout(() => setTransientStatus(null), 5000);
      }
    },
    // AC11: onFinish clears transient status + dispatches queued messages
    onFinish() {
      setTransientStatus(null);
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
        transientTimerRef.current = null;
      }
      // AC9: Dispatch first queued message after stream completes
      dispatchNextQueued();
    },
    // AC13: On error, preserve queue — clear transient status but keep queued messages
    onError() {
      setTransientStatus(null);
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
        transientTimerRef.current = null;
      }
      // Queue is intentionally preserved — dispatched when user sends next message
    },
  });

  // Detect credential requests from data parts in the latest message
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;

    const creds: CredentialRequest[] = [];
    for (const part of lastMsg.parts) {
      if ("type" in part && (part as { type: string }).type === "data-credential-request") {
        const data = (part as { data: CredentialRequest }).data;
        creds.push(data);
      }
    }
    if (creds.length > 0) {
      setCredentialRequests(creds);
    }
  }, [messages]);

  // Detect process creation for auto-switch to workspace (Brief 046 AC13)
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;

    for (const part of lastMsg.parts) {
      if (
        "type" in part &&
        (part as { type: string }).type === "tool-invocation" &&
        (part as { state: string }).state === "result"
      ) {
        const toolPart = part as { toolName: string; output: unknown };
        if (isProcessSaved(toolPart.toolName, toolPart.output)) {
          const result = toolPart.output as { processId?: string };
          emitProcessCreated(result?.processId ?? "");
        }
      }
    }
  }, [messages]);

  const isLoading = status === "submitted" || status === "streaming";
  const isStreaming = status === "streaming";

  // AC9: Dispatch first queued message
  const dispatchNextQueued = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length > 0) {
      const next = queue[0];
      setMessageQueue((prev) => prev.slice(1));
      sendMessage({ role: "user", parts: [{ type: "text", text: next.text }] });
    }
  }, [sendMessage]);

  const onSubmit = useCallback(() => {
    if (input.trim()) {
      if (isLoading) {
        // AC9: Queue during active response
        const queued: QueuedMessage = { id: crypto.randomUUID(), text: input };
        setMessageQueue((prev) => [...prev, queued]);
        setInput("");
      } else {
        // Idle — send immediately
        setCredentialRequests([]);
        setTransientStatus(null);

        // AC13: If there are queued messages from a previous error, dispatch them first
        // by sending user's message normally — queued messages will follow via onFinish
        sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
        setInput("");
      }
    }
  }, [input, isLoading, sendMessage]);

  // AC11: Cancel a queued message
  const cancelQueuedMessage = useCallback((id: string) => {
    setMessageQueue((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // AC10 (066): Suggestion chip click pre-fills input (not auto-send)
  const handleSuggestion = useCallback(
    (text: string) => {
      setInput(text);
    },
    [],
  );

  // Handle actions from content blocks (knowledge synthesis, process proposal, suggestions, etc.)
  const handleBlockAction = useCallback(
    async (actionId: string, payload?: Record<string, unknown>) => {
      // Suggestion actions — Accept or Dismiss
      if (actionId.startsWith("suggest-accept-")) {
        const content = (payload?.content as string) ?? "";
        sendMessage({
          role: "user",
          parts: [{ type: "text", text: content ? `I'd like to set that up — ${content}` : "I'd like to set that up." }],
        });
        return;
      }
      if (actionId.startsWith("suggest-dismiss-")) {
        // Record dismissal via API (30-day cooldown), then acknowledge in conversation
        try {
          await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actionId, payload }),
          });
        } catch {
          // Best-effort — dismissal still acknowledged in conversation
        }
        sendMessage({
          role: "user",
          parts: [{ type: "text", text: "Not right now, thanks." }],
        });
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
      const text = actionMessages[actionId] ?? `Action: ${actionId}`;
      sendMessage({ role: "user", parts: [{ type: "text", text }] });
    },
    [sendMessage],
  );

  // AC5: Tool approval via addToolApprovalResponse
  // SDK uses `id` (toolCallId), not `toolCallId` as the param name
  const handleToolApprove = useCallback(
    (toolCallId: string) => {
      addToolApprovalResponse({ id: toolCallId, approved: true });
    },
    [addToolApprovalResponse],
  );

  const handleToolReject = useCallback(
    (toolCallId: string) => {
      addToolApprovalResponse({ id: toolCallId, approved: false });
    },
    [addToolApprovalResponse],
  );

  const handleCredentialComplete = useCallback(
    (success: boolean, message: string) => {
      setCredentialRequests((prev) => prev.slice(1));
      sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: success
              ? `I've entered the credentials. ${message}`
              : `There was a problem with the credentials: ${message}`,
          },
        ],
      });
    },
    [sendMessage],
  );

  // AC11: Retry last response
  const handleRetry = useCallback(() => {
    regenerate();
  }, [regenerate]);

  return (
    <div className="flex flex-col h-full">
      {/* AC1: Message list with use-stick-to-bottom auto-scroll */}
      <ConversationContainer>
        {/* AC8-12 (066): Empty state redesign — Insight-121 compliant */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            {/* AC11: Staggered fade-in — DotParticles at 0ms */}
            <div className="animate-in fade-in-0 duration-300 mb-4">
              <DotParticles size={48} />
            </div>
            {/* AC11: Heading at 100ms delay */}
            <h1
              className="text-xl font-semibold text-text-primary mb-2 animate-in fade-in-0 duration-300"
              style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
            >
              What would you like to work on?
            </h1>
            {/* AC9, AC11: Suggestion grid at 200ms delay */}
            <div
              className="animate-in fade-in-0 duration-300 mt-8"
              style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
            >
              <Suggestions
                suggestions={STARTER_SUGGESTIONS}
                onSelect={handleSuggestion}
                variant="grid"
              />
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const isLastAssistant =
            message.role === "assistant" && index === messages.length - 1;
          return (
            <Message
              key={message.id}
              message={message}
              isStreaming={isStreaming && index === messages.length - 1}
              isLast={isLastAssistant}
              onAction={handleBlockAction}
              onToolApprove={handleToolApprove}
              onToolReject={handleToolReject}
              onRetry={isLastAssistant ? handleRetry : undefined}
            />
          );
        })}

        {/* AC10: Queued messages with pending treatment */}
        {messageQueue.map((queued) => (
          <div
            key={queued.id}
            data-testid="queued-message"
            className="max-w-[720px] mx-auto flex justify-end py-2 group/queued"
          >
            <div className={cn(
              "bg-surface-raised rounded-2xl px-4 py-2.5 text-base leading-relaxed text-text-primary max-w-[85%]",
              "opacity-60 relative",
            )}>
              {/* Clock icon */}
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {queued.text}
              </span>
              {/* AC11: Cancel button on hover */}
              <button
                onClick={() => cancelQueuedMessage(queued.id)}
                data-testid="cancel-queued"
                className="absolute -top-1.5 -right-1.5 opacity-0 group-hover/queued:opacity-100 transition-opacity w-5 h-5 rounded-full bg-surface-raised border border-border flex items-center justify-center text-text-muted hover:text-text-primary"
                aria-label="Cancel queued message"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 6-12 12" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {/* Masked credential input */}
        {credentialRequests.map((req, i) => (
          <div key={`cred-${req.service}-${i}`} className="px-4 max-w-3xl mx-auto">
            <MaskedCredentialInput
              service={req.service}
              processSlug={req.processSlug}
              fieldLabel={req.fieldLabel}
              placeholder={req.placeholder}
              onComplete={handleCredentialComplete}
            />
          </div>
        ))}

        {/* Typing indicator with transient status (AC12) */}
        {isLoading && <TypingIndicator status={transientStatus ?? undefined} />}

        {/* Error state with retry (AC11) */}
        {error && (
          <div className="px-4 py-3 max-w-3xl mx-auto">
            <div className="text-sm text-negative bg-negative/5 rounded-lg px-4 py-3 flex items-center justify-between">
              <span>Connection interrupted. Please try again.</span>
              <button
                onClick={handleRetry}
                className="text-xs font-medium text-negative hover:underline ml-3 flex-shrink-0"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </ConversationContainer>

      {/* Prompt input — persistent at bottom */}
      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={onSubmit}
        onStop={stop}
        isLoading={isLoading}
        isStreaming={isStreaming}
        hasMessages={messages.length > 0}
      />
    </div>
  );
}
