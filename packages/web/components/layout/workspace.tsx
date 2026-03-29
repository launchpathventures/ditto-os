"use client";

/**
 * Ditto — Workspace Layout
 *
 * Three-panel layout: sidebar (w-56) + center (flex-1) + right panel (w-72).
 *
 * Center column renders composed ContentBlock[] for canvas intents (Today, Inbox,
 * Work, Projects, Routines) via the composition engine, OR ProcessDetailContainer
 * for drill-down (scaffold layout mode). Conversation messages render below
 * composed blocks, above the input bar — they are scaffold elements, not
 * ContentBlocks within the composition.
 *
 * Brief 047: Composition engine replaces page-based centre panel routing.
 * ADR-024: Navigation destinations are composition intents, not pages.
 *
 * Provenance: Brief 047, ADR-024, P13 prototype.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useProcessList } from "@/lib/process-query";
import { useFeed } from "@/lib/feed-query";
import { Sidebar, type NavigationDestination } from "./sidebar";
import { RightPanel, type PanelContext } from "./right-panel";
import { ProcessDetailContainer } from "@/components/detail/process-detail";
import { ComposedCanvas } from "./composed-canvas";
import { PromptInput } from "@/components/self/prompt-input";
import { ConversationMessage } from "@/components/self/message";
import { TypingIndicator } from "@/components/self/typing-indicator";
import { ArtifactSheet } from "./artifact-sheet";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { resolveTransition } from "@/lib/transition-map";
import type { CompositionIntent } from "@/lib/compositions";

interface WorkspaceProps {
  userId?: string;
}

/**
 * Center view state — either a composition intent (canvas) or a process
 * drill-down (scaffold layout mode, AC13).
 */
type CenterView =
  | { type: "canvas"; intent: CompositionIntent }
  | { type: "process"; processId: string; runId?: string }
  | { type: "settings" };

export function Workspace({ userId = "default" }: WorkspaceProps) {
  const { data } = useProcessList();
  // Ensure feed data is in React Query cache for composition context
  useFeed();

  const [centerView, setCenterView] = useState<CenterView>({
    type: "canvas",
    intent: "today",
  });
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

  // Scan messages for tool-invocation parts and resolve transitions
  const latestTransition = useMemo(() => {
    if (messages.length === 0) return null;

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

  // Apply transition to panel override
  useEffect(() => {
    if (!latestTransition) return;

    const isCompact = windowWidth < 1024;
    if (isCompact && latestTransition.type === "artifact-review") {
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

  const handleNavigate = useCallback((destination: NavigationDestination) => {
    if (destination === "settings") {
      setCenterView({ type: "settings" });
    } else {
      setCenterView({ type: "canvas", intent: destination });
    }
    setPanelOverride(null); // Clear override on navigation
  }, []);

  const handleSelectProcess = useCallback((processId: string) => {
    setCenterView({ type: "process", processId });
    setPanelOverride(null);
  }, []);

  const handleBack = useCallback(() => {
    setCenterView({ type: "canvas", intent: "today" });
    setPanelOverride(null);
  }, []);

  const handleChatSubmit = useCallback(() => {
    if (input.trim()) {
      sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
      setInput("");
    }
  }, [input, sendMessage, setInput]);

  // Handle block actions from content blocks — both in compositions and messages
  const handleBlockAction = useCallback(
    (actionId: string, payload?: Record<string, unknown>) => {
      // Process drill-down from composition (e.g., "view-process-xxx")
      if (actionId.startsWith("view-process-")) {
        const processId = actionId.replace("view-process-", "");
        handleSelectProcess(processId);
        return;
      }

      // Standard action messages to Self
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
    [sendMessage, handleSelectProcess],
  );

  const processes = data?.processes ?? [];
  const workItems = data?.workItems ?? [];

  // Responsive modes
  const isFullLayout = windowWidth >= 1280;
  const isMediumLayout = windowWidth >= 1024 && windowWidth < 1280;
  const isCompactLayout = windowWidth < 1024;

  // Active navigation destination for sidebar highlight
  const activeDestination: NavigationDestination =
    centerView.type === "canvas"
      ? centerView.intent
      : centerView.type === "settings"
        ? "settings"
        : "routines"; // Process drill-down highlights Routines

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
            activeDestination={activeDestination}
            onNavigate={handleNavigate}
            onSelectProcess={handleSelectProcess}
            collapsed={isMediumLayout}
          />
        ) : (
          <MobileMenuButton
            processes={processes}
            workItems={workItems}
            activeDestination={activeDestination}
            onNavigate={handleNavigate}
            onSelectProcess={handleSelectProcess}
          />
        )}

        {/* Center panel — composed canvas or process detail + conversation + input */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {centerView.type === "process" ? (
              /* Scaffold layout mode — ProcessDetailContainer (AC13) */
              <ProcessDetailContainer
                processId={centerView.processId}
                runId={centerView.runId}
                onBack={handleBack}
              />
            ) : centerView.type === "settings" ? (
              /* Scaffold — Settings page */
              <div className="p-6 max-w-2xl mx-auto">
                <h2 className="text-lg font-semibold text-text-primary mb-4">Settings</h2>
                <p className="text-sm text-text-secondary">
                  Settings page — AI connection, integrations, preferences.
                </p>
              </div>
            ) : (
              /* Canvas — composed blocks (AC5) */
              <div className="p-6 max-w-2xl mx-auto">
                {/* Composed ContentBlock[] from composition engine */}
                <ComposedCanvas
                  intent={centerView.intent}
                  onAction={handleBlockAction}
                />

                {/* Conversation messages — scaffold elements below composition (AC14) */}
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

          {/* Chat input — persistent at bottom of center column (scaffold) */}
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

        {/* Right panel — contextual intelligence + tool-driven overrides */}
        {!isCompactLayout && (
          <RightPanel context={panelContext} panelOverride={panelOverride} />
        )}
      </div>

      {/* Mobile bottom sheet for artifact review */}
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
  activeDestination,
  onNavigate,
  onSelectProcess,
}: {
  processes: import("@/lib/process-query").ProcessSummary[];
  workItems: import("@/lib/process-query").WorkItemSummary[];
  activeDestination: NavigationDestination;
  onNavigate: (destination: NavigationDestination) => void;
  onSelectProcess: (id: string) => void;
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
              activeDestination={activeDestination}
              onNavigate={(dest) => { onNavigate(dest); setOpen(false); }}
              onSelectProcess={(id) => { onSelectProcess(id); setOpen(false); }}
            />
          </div>
          <div className="flex-1 bg-black/20" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
