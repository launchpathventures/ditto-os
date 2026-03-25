"use client";

/**
 * Ditto — Workspace Layout
 *
 * Three-panel layout: sidebar (w-64) + center (flex-1) + right panel (w-72).
 * Center column has feed/detail content + conversation messages + chat input.
 * Right column is contextual intelligence, adaptive to tool results.
 *
 * Brief 046: Conversation messages render in workspace centre column.
 * Tool results trigger right panel transitions via transition-map.ts.
 *
 * Redesign AC3: Chat input at bottom of center column.
 * AC14: Three-panel layout.
 * AC16: Responsive breakpoints.
 * Brief 046 AC1-3: Conversation messages between feed and input.
 * Brief 046 AC4-6: Right panel adaptive modes.
 * Brief 046 AC11: Panel override clears on navigation.
 * Brief 046 AC12: Mobile bottom sheet for artifact-review.
 *
 * Provenance: P13 prototype, workspace-layout-redesign-ux.md, Brief 046
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useProcessList } from "@/lib/process-query";
import { Sidebar } from "./sidebar";
import { RightPanel, type PanelContext } from "./right-panel";
import { ProcessDetailContainer } from "@/components/detail/process-detail";
import { Feed } from "@/components/feed/feed";
import { PromptInput } from "@/components/self/prompt-input";
import { ConversationMessage } from "@/components/self/message";
import { TypingIndicator } from "@/components/self/typing-indicator";
import { ArtifactSheet } from "./artifact-sheet";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { resolveTransition } from "@/lib/transition-map";

interface WorkspaceProps {
  userId?: string;
}

type CenterView =
  | { type: "feed" }
  | { type: "process"; processId: string; runId?: string };

export function Workspace({ userId = "default" }: WorkspaceProps) {
  const { data } = useProcessList();
  const [centerView, setCenterView] = useState<CenterView>({ type: "feed" });
  const [panelOverride, setPanelOverride] = useState<PanelContext | null>(null);
  const [mobileSheet, setMobileSheet] = useState<PanelContext | null>(null);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1400,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Chat state — Self conversation via center column input
  const [input, setInput] = useState("");
  const { messages, status: chatStatus, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userId },
    }),
  });
  const chatLoading = chatStatus === "submitted" || chatStatus === "streaming";

  // Scan messages for tool-invocation parts and resolve transitions (AC5, AC6)
  const latestTransition = useMemo(() => {
    if (messages.length === 0) return null;

    // Scan from most recent message backward to find the latest completed tool result
    for (let m = messages.length - 1; m >= 0; m--) {
      const msg = messages[m];
      if (msg.role !== "assistant") continue;

      for (let p = msg.parts.length - 1; p >= 0; p--) {
        const part = msg.parts[p];
        if (
          "type" in part &&
          (part as { type: string }).type === "tool-invocation" &&
          (part as { state: string }).state === "result"
        ) {
          const toolPart = part as {
            toolName: string;
            output: unknown;
            state: string;
          };
          const transition = resolveTransition(toolPart.toolName, toolPart.output);
          if (transition) return transition;
        }
      }
    }
    return null;
  }, [messages]);

  // Apply transition to panel override (only when it changes)
  useEffect(() => {
    if (!latestTransition) return;

    const isCompact = windowWidth < 1024;
    if (isCompact && latestTransition.type === "artifact-review") {
      // Mobile: show bottom sheet instead of right panel
      setMobileSheet(latestTransition);
    } else {
      setPanelOverride(latestTransition);
    }
  }, [latestTransition, windowWidth]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // Track window width for responsive breakpoints
  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSelectProcess = useCallback((processId: string) => {
    setCenterView({ type: "process", processId });
    setPanelOverride(null); // Clear override on navigation (AC11)
  }, []);

  const handleBack = useCallback(() => {
    setCenterView({ type: "feed" });
    setPanelOverride(null); // Clear override on navigation (AC11)
  }, []);

  const handleChatSubmit = useCallback(() => {
    if (input.trim()) {
      sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
      setInput("");
    }
  }, [input, sendMessage, setInput]);

  // Handle block actions from content blocks in workspace messages
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

  const processes = data?.processes ?? [];
  const workItems = data?.workItems ?? [];

  // Responsive modes (AC16)
  const isFullLayout = windowWidth >= 1280;
  const isMediumLayout = windowWidth >= 1024 && windowWidth < 1280;
  const isCompactLayout = windowWidth < 1024;

  // Right panel context — reactive to center view
  const panelContext: PanelContext =
    centerView.type === "process"
      ? { type: "process", processId: centerView.processId }
      : { type: "feed" };

  // Extract status message from streaming data parts
  const statusMessage = (() => {
    if (!chatLoading || messages.length === 0) return undefined;
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

  const hasMessages = messages.length > 0;

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!isCompactLayout ? (
          <Sidebar
            processes={processes}
            workItems={workItems}
            selectedProcessId={
              centerView.type === "process" ? centerView.processId : null
            }
            onSelectProcess={handleSelectProcess}
            onGoHome={handleBack}
            collapsed={isMediumLayout}
          />
        ) : (
          <MobileMenuButton
            processes={processes}
            workItems={workItems}
            selectedProcessId={
              centerView.type === "process" ? centerView.processId : null
            }
            onSelectProcess={handleSelectProcess}
            onGoHome={handleBack}
          />
        )}

        {/* Center panel — content + conversation + chat input at bottom */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {centerView.type === "process" ? (
              <ProcessDetailContainer
                processId={centerView.processId}
                runId={centerView.runId}
                onBack={handleBack}
              />
            ) : (
              <div className="p-6 max-w-2xl mx-auto">
                {/* Feed cards above conversation (AC1) */}
                <Feed />

                {/* Conversation messages below feed, above input (AC1) */}
                {hasMessages && (
                  <div className="mt-4 space-y-1">
                    {messages.map((message) => (
                      <ConversationMessage
                        key={message.id}
                        message={message}
                        onAction={handleBlockAction}
                      />
                    ))}

                    {chatLoading && <TypingIndicator status={statusMessage} />}

                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Typing indicator when no messages yet but loading */}
                {!hasMessages && chatLoading && (
                  <div className="mt-4">
                    <TypingIndicator status={statusMessage} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat input — persistent at bottom of center column (AC3) */}
          <div className="border-t border-border bg-background px-6 py-3">
            <div className="max-w-2xl mx-auto">
              <PromptInput
                value={input}
                onChange={setInput}
                onSubmit={handleChatSubmit}
                isLoading={chatLoading}
              />
            </div>
          </div>
        </div>

        {/* Right panel — contextual intelligence (AC1, AC2) + tool-driven overrides (AC4) */}
        {!isCompactLayout && (
          <RightPanel context={panelContext} panelOverride={panelOverride} />
        )}
      </div>

      {/* Mobile bottom sheet for artifact review (AC12) */}
      {isCompactLayout && mobileSheet && (
        <ArtifactSheet
          context={mobileSheet}
          onClose={() => setMobileSheet(null)}
        />
      )}
    </div>
  );
}

/**
 * Mobile hamburger menu button with sidebar drawer overlay.
 */
function MobileMenuButton({
  processes,
  workItems,
  selectedProcessId,
  onSelectProcess,
  onGoHome,
}: {
  processes: import("@/lib/process-query").ProcessSummary[];
  workItems: import("@/lib/process-query").WorkItemSummary[];
  selectedProcessId: string | null;
  onSelectProcess: (id: string) => void;
  onGoHome: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-40 w-10 h-10 rounded-lg bg-surface-raised shadow-[var(--shadow-medium)] flex items-center justify-center"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" className="text-text-primary">
          <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 bg-surface shadow-[var(--shadow-large)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-text-primary">Navigation</span>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary transition-colors text-sm">×</button>
            </div>
            <Sidebar
              processes={processes}
              workItems={workItems}
              selectedProcessId={selectedProcessId}
              onSelectProcess={(id) => { onSelectProcess(id); setOpen(false); }}
              onGoHome={() => { onGoHome(); setOpen(false); }}
            />
          </div>
          <div className="flex-1 bg-black/20" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
