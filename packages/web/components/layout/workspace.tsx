"use client";

/**
 * Ditto — Workspace Layout
 *
 * Three-panel layout: sidebar (w-64) + center (flex-1) + right panel (w-72).
 * Center column has feed/detail content + chat input at the bottom.
 * Right column is contextual intelligence (not chat).
 *
 * Redesign AC3: Chat input at bottom of center column.
 * AC14: Three-panel layout.
 * AC16: Responsive breakpoints.
 *
 * Provenance: P13 prototype, workspace-layout-redesign-ux.md
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useProcessList } from "@/lib/process-query";
import { Sidebar } from "./sidebar";
import { RightPanel, type PanelContext } from "./right-panel";
import { ProcessDetailContainer } from "@/components/detail/process-detail";
import { Feed } from "@/components/feed/feed";
import { PromptInput } from "@/components/self/prompt-input";
import { ConversationMessage } from "@/components/self/message";
import { TypingIndicator } from "@/components/self/typing-indicator";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

interface WorkspaceProps {
  userId?: string;
}

type CenterView =
  | { type: "feed" }
  | { type: "process"; processId: string; runId?: string };

export function Workspace({ userId = "default" }: WorkspaceProps) {
  const { data } = useProcessList();
  const [centerView, setCenterView] = useState<CenterView>({ type: "feed" });
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1400,
  );

  // Chat input state — Self conversation via center column input
  const [input, setInput] = useState("");
  const { status: chatStatus, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { userId },
    }),
  });
  const chatLoading = chatStatus === "submitted" || chatStatus === "streaming";

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
  }, []);

  const handleBack = useCallback(() => {
    setCenterView({ type: "feed" });
  }, []);

  const handleChatSubmit = useCallback(() => {
    if (input.trim()) {
      sendMessage({ role: "user", parts: [{ type: "text", text: input }] });
      setInput("");
    }
  }, [input, sendMessage, setInput]);

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

        {/* Center panel — content + chat input at bottom */}
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
                <Feed />
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

        {/* Right panel — contextual intelligence (AC1, AC2) */}
        {!isCompactLayout && (
          <RightPanel context={panelContext} />
        )}
      </div>
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
