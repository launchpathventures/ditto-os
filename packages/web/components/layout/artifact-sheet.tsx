"use client";

/**
 * Ditto — Artifact Bottom Sheet (Mobile <1024px)
 *
 * Two modes:
 * 1. **Panel sheet** (existing Brief 046) — slides up for artifact-review, process-builder, briefing
 * 2. **Full artifact sheet** (Brief 048) — full-screen artifact with swipe gestures
 *    Swipe left → conversation. Swipe right → context. Bottom action bar.
 *
 * Provenance: Brief 046 (panel sheet), Brief 048 (full artifact sheet),
 * iOS/Android bottom sheet convention.
 */

import { useCallback, useRef, useState } from "react";
import type { UIMessage } from "ai";
import type { PanelContext } from "./right-panel";
import type { ArtifactType } from "./artifact-layout";
import { ArtifactViewerPanel } from "./artifact-viewer-panel";
import { ProcessBuilderPanel } from "./process-builder-panel";
import { ArtifactHost } from "./artifact-host";
import { ArtifactContextPanel } from "./artifact-context-panel";
import { ConversationMessage } from "@/components/self/message";
import { TypingIndicator } from "@/components/self/typing-indicator";
import { PromptInput } from "@/components/self/prompt-input";

// ============================================================
// Panel sheet — existing Brief 046 behavior
// ============================================================

interface ArtifactSheetProps {
  context: PanelContext;
  onClose: () => void;
}

export function ArtifactSheet({ context, onClose }: ArtifactSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    setDragY(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    // Only allow dragging down
    if (delta > 0) {
      setDragY(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    // Dismiss if dragged more than 100px
    if (dragY > 100) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-text-primary/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-[var(--shadow-large)] max-h-[80vh] flex flex-col transition-transform"
        style={{
          transform: `translateY(${dragY}px)`,
          transitionDuration: isDragging.current ? "0ms" : "200ms",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Close button */}
        <div className="flex justify-end px-4 -mt-2 mb-1">
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-sm p-1"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {context.type === "artifact-review" && (
            <ArtifactViewerPanel
              runId={context.runId}
              processId={context.processId}
            />
          )}
          {context.type === "process-builder" && (
            <ProcessBuilderPanel yaml={context.yaml} slug={context.slug} />
          )}
          {context.type === "briefing" && (
            <div className="text-sm text-text-secondary">
              <p>Briefing details available in workspace view.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Full artifact sheet — Brief 048 mobile artifact mode (AC9, F3)
// Full-screen artifact with horizontal swipe gestures.
// ============================================================

export interface FullArtifactSheetProps {
  artifactType: ArtifactType;
  artifactId: string;
  processId: string;
  runId?: string;
  messages: UIMessage[];
  chatLoading: boolean;
  statusMessage?: string;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAction: (actionId: string, payload?: Record<string, unknown>) => void;
  onExit: () => void;
}

export function FullArtifactSheet({
  artifactType,
  artifactId,
  processId,
  runId,
  messages,
  chatLoading,
  statusMessage,
  input,
  onInputChange,
  onSubmit,
  onAction,
  onExit,
}: FullArtifactSheetProps) {
  // Panel positions: -1 = conversation (swipe left), 0 = artifact, 1 = context (swipe right)
  const [panelOffset, setPanelOffset] = useState(0);
  const [dragX, setDragX] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
    setDragX(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientX - startX.current;
    setDragX(delta);
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    const threshold = 80;

    if (dragX > threshold && panelOffset > -1) {
      // Swipe right → reveal conversation (move left)
      setPanelOffset((prev) => prev - 1);
    } else if (dragX < -threshold && panelOffset < 1) {
      // Swipe left → reveal context (move right)
      setPanelOffset((prev) => prev + 1);
    }
    setDragX(0);
  }, [dragX, panelOffset]);

  // Panel label for indicator
  const panelLabels = ["Chat", "Output", "Context"] as const;
  const activePanelIndex = panelOffset + 1; // -1→0, 0→1, 1→2

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <span className="text-xs">←</span>
          <span>Back</span>
        </button>

        {/* Panel indicator dots */}
        <div className="flex gap-1.5">
          {panelLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => setPanelOffset(i - 1)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                i === activePanelIndex
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Swipeable panel container */}
      <div
        className="flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform"
          style={{
            width: "300%",
            transform: `translateX(calc(${-((panelOffset + 1) * 100) / 3}% + ${dragX}px))`,
            transitionDuration: isDragging.current ? "0ms" : "250ms",
          }}
        >
          {/* Panel 1: Conversation */}
          <div className="w-1/3 h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {messages.map((message) => (
                <ConversationMessage
                  key={message.id}
                  message={message}
                  onAction={onAction}
                />
              ))}
              {chatLoading && <TypingIndicator status={statusMessage} />}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t border-border px-3 py-2">
              <PromptInput
                value={input}
                onChange={onInputChange}
                onSubmit={onSubmit}
                isLoading={chatLoading}
              />
            </div>
          </div>

          {/* Panel 2: Artifact */}
          <div className="w-1/3 h-full overflow-hidden">
            <ArtifactHost
              artifactType={artifactType}
              artifactId={artifactId}
              processId={processId}
              runId={runId}
            />
          </div>

          {/* Panel 3: Context */}
          <div className="w-1/3 h-full overflow-y-auto">
            <ArtifactContextPanel
              artifactType={artifactType}
              artifactId={artifactId}
              processId={processId}
              runId={runId}
              width="100%"
              onExit={onExit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
