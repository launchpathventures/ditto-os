"use client";

/**
 * Ditto — Workspace Layout
 *
 * Two layout modes (ADR-024 Tier 1 Scaffold):
 *
 * 1. **Workspace mode** (Brief 047): Sidebar (w-56) + center (flex-1) + right panel (w-72)
 *    Center renders composed ContentBlock[] for canvas intents (Today, Inbox,
 *    Work, Projects, Routines) via composition engine, OR ProcessDetailContainer
 *    for drill-down, OR Settings.
 *
 * 2. **Artifact mode** (Brief 048): Conversation (300px) | Artifact (flex) | Context (320px)
 *    Triggered when Self produces an artifact. Sidebar collapses. Artifact
 *    takes centre stage. Conversation narrows to left column.
 *
 * Provenance: Brief 047 (composition engine), Brief 048 (artifact mode layout),
 * ADR-024 (composable workspace architecture), P36 prototype.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useProcessList } from "@/lib/process-query";
import { useFeed } from "@/lib/feed-query";
import { Sidebar, type NavigationDestination } from "./sidebar";
import { RightPanel, type PanelContext } from "./right-panel";
import { ProcessDetailContainer } from "@/components/detail/process-detail";
import { ComposedCanvas } from "./composed-canvas";
import { ArtifactLayout } from "./artifact-layout";
import { ArtifactSheet, FullArtifactSheet } from "./artifact-sheet";
import { PromptInput } from "@/components/self/prompt-input";
import { ConversationMessage } from "@/components/self/message";
import { TypingIndicator } from "@/components/self/typing-indicator";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { resolveTransition } from "@/lib/transition-map";
import type { ArtifactCenterView } from "@/lib/transition-map";
import type { CompositionIntent } from "@/lib/compositions";
import { useInteractionEvent } from "@/hooks/use-interaction-events";

interface WorkspaceProps {
  userId?: string;
}

/**
 * Center view state — canvas, process drill-down, settings, or artifact mode (AC1).
 */
type CenterView =
  | { type: "canvas"; intent: CompositionIntent }
  | { type: "process"; processId: string; runId?: string }
  | { type: "settings" }
  | ArtifactCenterView;

export function Workspace({ userId = "default" }: WorkspaceProps) {
  const { data } = useProcessList();
  // Ensure feed data is in React Query cache for composition context
  useFeed();
  const { emit: emitInteraction } = useInteractionEvent();

  const [centerView, setCenterView] = useState<CenterView>({
    type: "canvas",
    intent: "today",
  });
  const [panelOverride, setPanelOverride] = useState<PanelContext | null>(null);
  const [mobileSheet, setMobileSheet] = useState<PanelContext | null>(null);
  // Store previous view for artifact mode exit (AC8)
  // Uses ref to avoid stale closure in transition effect (F2 fix)
  const previousViewRef = useRef<CenterView>({
    type: "canvas",
    intent: "today",
  });
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

  // Scan messages for tool-invocation parts and resolve transitions (AC7)
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

  // Apply transitions — panel overrides OR center view changes (AC7)
  useEffect(() => {
    if (!latestTransition) return;

    if (latestTransition.target === "panel") {
      const isCompact = windowWidth < 1024;
      if (isCompact && latestTransition.context.type === "artifact-review") {
        setMobileSheet(latestTransition.context);
      } else {
        setPanelOverride(latestTransition.context);
      }
    } else if (latestTransition.target === "center") {
      // Artifact mode transition — store current view for exit (AC8)
      setCenterView((current) => {
        previousViewRef.current = current;
        return latestTransition.view;
      });
      setPanelOverride(null);
    }
  }, [latestTransition, windowWidth]);

  // Self speaks first — static welcome message (Brief 057 AC14)
  // No LLM call needed for the greeting. The Self's personality comes through
  // in subsequent real conversations. This avoids stream lifecycle race conditions.
  const [welcomeMessage] = useState(() => {
    if (typeof window === "undefined") return null;
    const dayZeroSeen = localStorage.getItem("ditto-day-zero-seen") === "true";
    if (!dayZeroSeen) return null;
    const alreadyGreeted = sessionStorage.getItem("ditto-greeted") === "true";
    if (alreadyGreeted) return null;
    sessionStorage.setItem("ditto-greeted", "true");
    return "Hi. I'm ready when you are — ask me anything, give me a task, or tell me about your work.";
  });

  // Auto-scroll to latest message (workspace mode only)
  useEffect(() => {
    if (centerView.type !== "artifact") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading, centerView.type]);

  // Track window width for responsive breakpoints
  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Navigation — exits artifact mode (AC8)
  const handleNavigate = useCallback((destination: NavigationDestination) => {
    // Brief 056 AC8: Emit composition_navigated event
    const fromIntent = centerView.type === "canvas" ? centerView.intent : centerView.type;
    emitInteraction("composition_navigated", destination, {
      intent: destination,
      fromIntent,
    });

    if (destination === "settings") {
      setCenterView({ type: "settings" });
    } else {
      setCenterView({ type: "canvas", intent: destination });
    }
    setPanelOverride(null);
  }, [centerView, emitInteraction]);

  const handleSelectProcess = useCallback((processId: string) => {
    setCenterView({ type: "process", processId });
    setPanelOverride(null);
  }, []);

  // Exit artifact mode — restore previous view (AC8, F2 fix: read from ref)
  const handleExitArtifact = useCallback(() => {
    setCenterView(previousViewRef.current);
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

      // Open artifact from ArtifactBlock "Open" button (Brief 050)
      if (actionId.startsWith("open-artifact-")) {
        const artifactId = actionId.replace("open-artifact-", "");
        const processSlug = (payload?.processSlug as string) ?? "unknown";
        setCenterView((current) => {
          previousViewRef.current = current;
          return {
            type: "artifact",
            artifactType: "document",
            artifactId,
            processId: processSlug,
            runId: artifactId,
          };
        });
        setPanelOverride(null);
        return;
      }

      // Brief 055: Scope selection from roadmap composition
      if (actionId.startsWith("select-brief-")) {
        const briefNumber = actionId.replace("select-brief-", "");
        const briefName = (payload?.briefName as string) ?? "";
        const briefStatus = (payload?.briefStatus as string) ?? "ready";
        const padded = briefNumber.padStart(3, "0");
        const prefix = briefStatus === "draft" ? "Plan" : "Build";
        const text = `${prefix} Brief ${padded}: ${briefName}`;

        // Brief 056 AC10: Emit brief_selected event
        emitInteraction("brief_selected", `brief-${briefNumber}`, {
          briefNumber: parseInt(briefNumber, 10),
          action: briefStatus === "draft" ? "plan" : "build",
        });

        setInput(text);
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
    [sendMessage, handleSelectProcess, emitInteraction],
  );

  const processes = data?.processes ?? [];
  const workItems = data?.workItems ?? [];

  // Responsive modes
  const isFullLayout = windowWidth >= 1280;
  const isMediumLayout = windowWidth >= 1024 && windowWidth < 1280;
  const isCompactLayout = windowWidth < 1024;

  // Is artifact mode active?
  const isArtifactMode = centerView.type === "artifact";

  // Active navigation destination for sidebar highlight
  const activeDestination: NavigationDestination =
    centerView.type === "canvas"
      ? centerView.intent
      : centerView.type === "settings"
        ? "settings"
        : centerView.type === "process"
          ? "routines" // Process drill-down highlights Routines
          : "today"; // Artifact mode — no specific highlight

  // Right panel context — reactive to center view
  const panelContext: PanelContext =
    centerView.type === "process"
      ? { type: "process", processId: centerView.processId }
      : { type: "feed" };


  const hasMessages = messages.length > 0;

  // ==========================================
  // Artifact mode — full artifact layout (AC2)
  // ==========================================
  if (isArtifactMode && !isCompactLayout) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar: icon rail at ≥1440px, hidden at 1024-1439px (AC3) */}
          {/* ArtifactLayout handles its own icon rail and back button */}
          <ArtifactLayout
            artifactType={centerView.artifactType}
            artifactId={centerView.artifactId}
            processId={centerView.processId}
            runId={centerView.runId}
            messages={messages}
            chatLoading={chatLoading}
            input={input}
            onInputChange={setInput}
            onSubmit={handleChatSubmit}
            onAction={handleBlockAction}
            onExit={handleExitArtifact}
            onNavigate={handleNavigate}
            windowWidth={windowWidth}
          />
        </div>
      </div>
    );
  }

  // Artifact mode on mobile — full-screen artifact with swipe (AC9, F3 fix)
  if (isArtifactMode && isCompactLayout) {
    return (
      <FullArtifactSheet
        artifactType={centerView.artifactType}
        artifactId={centerView.artifactId}
        processId={centerView.processId}
        runId={centerView.runId}
        messages={messages}
        chatLoading={chatLoading}
        input={input}
        onInputChange={setInput}
        onSubmit={handleChatSubmit}
        onAction={handleBlockAction}
        onExit={handleExitArtifact}
      />
    );
  }

  // ==========================================
  // Workspace mode — standard layout (AC11)
  // ==========================================
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
        <div data-testid="center-panel" className="flex-1 flex flex-col overflow-hidden">
          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            {centerView.type === "process" ? (
              /* Scaffold layout mode — ProcessDetailContainer */
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
            ) : centerView.type === "canvas" ? (
              /* Canvas — composed blocks (P00: 720px centred, generous padding) */
              <div className="max-w-[720px] mx-auto" style={{ padding: "32px 24px 24px" }}>
                {/* Composed ContentBlock[] from composition engine */}
                <ComposedCanvas
                  intent={centerView.intent}
                  onAction={handleBlockAction}
                />

                {/* Welcome message — static Self greeting for first visit */}
                {welcomeMessage && !hasMessages && !chatLoading && (
                  <div className="mt-4 space-y-1">
                    <div className="max-w-[720px] mx-auto flex gap-3 py-3">
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="w-2 h-2 rounded-full bg-vivid" />
                      </div>
                      <div className="flex-1 text-base leading-relaxed text-text-primary">
                        {welcomeMessage}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conversation messages */}
                {hasMessages && (
                  <div className="mt-4 space-y-1">
                    {messages.map((message, _idx, arr) => (
                      <ConversationMessage
                        key={message.id}
                        message={message}
                        isStreaming={chatLoading && message.role === "assistant" && message === arr[arr.length - 1]}
                        onAction={handleBlockAction}
                      />
                    ))}

                    {chatLoading && <TypingIndicator />}

                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Typing indicator when no messages yet but loading */}
                {!hasMessages && chatLoading && (
                  <div className="mt-4">
                    <TypingIndicator />
                  </div>
                )}
              </div>
            ) : null /* artifact mode handled by early return above */}
          </div>

          {/* Chat input — persistent at bottom of center column (P00 input bar) */}
          <div className="bg-background" style={{ padding: "12px 24px 20px" }}>
            <div>
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
