"use client";

/**
 * Ditto — Artifact Mode Layout
 *
 * Three-column layout for artifact review/editing:
 * Conversation (300px) | Artifact Host (flex, min 480px) | Context Panel (320px)
 *
 * The sidebar collapses or hides. Conversation moves to the left column.
 * The artifact takes centre stage. Context panel stays put.
 *
 * Responsive breakpoints from .impeccable.md:
 * - ≥1440px: icon rail (56px) + 300px conversation + flex artifact + 320px context
 * - 1280-1439px: hidden sidebar + 300px conversation + flex artifact + 320px context
 * - 1024-1279px: hidden sidebar + 280px conversation + flex artifact + 280px context
 * - <1024px: full-screen artifact + swipe gestures
 *
 * Brief 048 (Artifact Mode Layout), ADR-024.
 * Provenance: P36 prototype, .impeccable.md artifact mode spec.
 */

import { useRef, useEffect, useCallback } from "react";
import type { UIMessage } from "ai";
import type { NavigationDestination } from "./sidebar";
import { ConversationMessage } from "@/components/self/message";
import { TypingIndicator } from "@/components/self/typing-indicator";
import { PromptInput } from "@/components/self/prompt-input";
import { ArtifactHost } from "./artifact-host";
import { ArtifactContextPanel } from "./artifact-context-panel";
import { useInteractionEvent } from "@/hooks/use-interaction-events";

/** Artifact types matching ArtifactBlock.artifactType from ADR-023 Section 1 */
export type ArtifactType = "document" | "spreadsheet" | "image" | "preview" | "email" | "pdf";

export interface ArtifactLayoutProps {
  /** Artifact type (from ArtifactBlock.artifactType) */
  artifactType: ArtifactType;
  /** Artifact identifier */
  artifactId: string;
  /** Owning process */
  processId: string;
  /** Optional run ID for review context */
  runId?: string;
  /** Chat messages for conversation column */
  messages: UIMessage[];
  /** Chat loading state */
  chatLoading: boolean;
  /** Chat input value */
  input: string;
  /** Chat input change handler */
  onInputChange: (value: string) => void;
  /** Chat submit handler */
  onSubmit: () => void;
  /** Block action handler */
  onAction: (actionId: string, payload?: Record<string, unknown>) => void;
  /** Exit artifact mode callback */
  onExit: () => void;
  /** Navigate to a workspace destination (exits artifact mode) */
  onNavigate: (destination: NavigationDestination) => void;
  /** Review action callback */
  onReviewAction?: (action: "approve" | "edit" | "reject") => void;
  /** Window width for responsive layout */
  windowWidth: number;
}

/** Icon rail nav items — same destinations as sidebar, icon-only */
const ICON_RAIL_ITEMS: Array<{ id: NavigationDestination; label: string; icon: string }> = [
  { id: "today", label: "Today", icon: "◉" },
  { id: "inbox", label: "Inbox", icon: "▪" },
  { id: "work", label: "Work", icon: "▸" },
  { id: "projects", label: "Projects", icon: "◇" },
  { id: "routines", label: "Routines", icon: "↻" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function ArtifactLayout({
  artifactType,
  artifactId,
  processId,
  runId,
  messages,
  chatLoading,
  input,
  onInputChange,
  onSubmit,
  onAction,
  onExit,
  onNavigate,
  onReviewAction,
  windowWidth,
}: ArtifactLayoutProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { emit: emitInteraction } = useInteractionEvent();
  const enteredAtRef = useRef<number>(Date.now());

  // Brief 056 AC7: Track artifact view duration — emit on exit
  useEffect(() => {
    enteredAtRef.current = Date.now();

    return () => {
      const durationMs = Date.now() - enteredAtRef.current;
      emitInteraction("artifact_viewed", artifactId, {
        artifactId,
        processRunId: runId,
        durationMs,
      });
    };
  }, [artifactId, runId, emitInteraction]);

  // Auto-scroll conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // Responsive widths from .impeccable.md artifact mode table
  const isWide = windowWidth >= 1440;
  const isMedium = windowWidth >= 1280 && windowWidth < 1440;
  const isNarrow = windowWidth >= 1024 && windowWidth < 1280;
  // <1024 handled by parent — renders mobile artifact sheet instead

  const conversationWidth = isNarrow ? "280px" : "300px";
  const contextWidth = isNarrow ? "280px" : "320px";

  return (
    <div data-testid="artifact-layout" className="flex-1 flex overflow-hidden">
      {/* Icon rail — only at ≥1440px. Nav items exit artifact mode + navigate (AC3, F1) */}
      {isWide && (
        <div className="w-14 flex-shrink-0 border-r border-border bg-surface flex flex-col items-center py-4 gap-1">
          {ICON_RAIL_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xs text-text-muted hover:bg-surface-raised/50 hover:text-text-primary transition-colors"
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}

      {/* Conversation column (AC4) */}
      <div
        data-testid="artifact-conversation"
        className="flex-shrink-0 border-r border-border bg-background flex flex-col"
        style={{ width: conversationWidth }}
      >
        {/* Back button — when no icon rail (1024-1439px) */}
        {!isWide && (
          <div className="flex items-center px-3 py-2 border-b border-border">
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              <span className="text-xs">←</span>
              <span>Back to workspace</span>
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-1">
            {messages.map((message, _idx, arr) => (
              <ConversationMessage
                key={message.id}
                message={message}
                isStreaming={chatLoading && message.role === "assistant" && message === arr[arr.length - 1]}
                onAction={onAction}
              />
            ))}
            {chatLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Prompt input at bottom of conversation column (not full-width) */}
        <div className="border-t border-border px-3 py-2">
          <PromptInput
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            isLoading={chatLoading}
          />
        </div>
      </div>

      {/* Artifact host — centre, flex (AC5) */}
      <div data-testid="artifact-host" className="flex-1 min-w-[480px] flex flex-col overflow-hidden">
        <ArtifactHost
          artifactType={artifactType}
          artifactId={artifactId}
          processId={processId}
          runId={runId}
        />
      </div>

      {/* Context panel — right (AC6) */}
      <ArtifactContextPanel
        artifactType={artifactType}
        artifactId={artifactId}
        processId={processId}
        runId={runId}
        width={contextWidth}
        onReviewAction={onReviewAction}
        onExit={onExit}
      />
    </div>
  );
}
