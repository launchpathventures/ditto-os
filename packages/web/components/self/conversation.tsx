"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, useCallback } from "react";
import { ConversationMessage } from "./message";
import { TypingIndicator } from "./typing-indicator";
import { PromptInput } from "./prompt-input";
import { MaskedCredentialInput } from "./masked-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isProcessSaved } from "@/lib/transition-map";
import { emitProcessCreated } from "@/lib/workspace-events";

/**
 * Ditto Conversation Surface (AI SDK v6)
 *
 * Full conversation with the Self. Uses AI SDK v6 useChat hook
 * with parts-based messages. Credential requests are detected from
 * data parts in the message stream.
 *
 * AC1: useChat from @ai-sdk/react with v6 protocol
 * AC4: Messages render via parts (ConversationMessage handles this)
 * AC16: Visual design preserved
 *
 * Provenance: Brief 045, AI SDK v6 migration.
 */

interface ConversationProps {
  userId?: string;
}

interface CredentialRequest {
  service: string;
  processSlug: string | null;
  fieldLabel: string;
  placeholder: string;
}

export function Conversation({ userId = "default" }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [credentialRequests, setCredentialRequests] = useState<CredentialRequest[]>([]);

  const [input, setInput] = useState("");

  const { messages, status, error, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userId },
    }),
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, credentialRequests]);

  const onSubmit = useCallback(() => {
    if (input.trim()) {
      setCredentialRequests([]);
      sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
      setInput("");
    }
  }, [input, sendMessage, setInput]);

  // Handle actions from content blocks (knowledge synthesis, process proposal, etc.)
  const handleBlockAction = useCallback(
    (actionId: string, payload?: Record<string, unknown>) => {
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

  const handleCredentialComplete = useCallback(
    (success: boolean, message: string) => {
      setCredentialRequests((prev) => prev.slice(1));
      sendMessage({
        role: "user",
        parts: [{
          type: "text",
          text: success
            ? `I've entered the credentials. ${message}`
            : `There was a problem with the credentials: ${message}`,
        }],
      });
    },
    [sendMessage],
  );

  // Extract status message from data parts of the streaming message
  const statusMessage = (() => {
    if (!isLoading || messages.length === 0) return undefined;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return undefined;
    for (let i = lastMsg.parts.length - 1; i >= 0; i--) {
      const part = lastMsg.parts[i];
      if ("type" in part && (part as { type: string }).type === "data-status") {
        return ((part as { data: { message: string } }).data).message;
      }
    }
    return undefined;
  })();

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
            <ConversationMessage key={message.id} message={message} onAction={handleBlockAction} />
          ))}

          {/* Masked credential input (AC12) */}
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
