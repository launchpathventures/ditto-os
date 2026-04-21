"use client";

/**
 * Ditto — Chat Panel (presentation)
 *
 * Pure rendering surface for the chat stream. The parent workspace owns
 * useChat + thread persistence + the transition observer; this component
 * takes the resulting UIMessages and the `onSend` / `onSendStarter`
 * callbacks, and draws the split / full-page conversation UI.
 *
 * Input state is local so parent-side callbacks stay stable across the
 * user's keystrokes — workspace avoids re-rendering the panel on every
 * character typed. Auto-scroll hooks a ResizeObserver on the stream so
 * streaming deltas (which don't change `messages.length`) still keep
 * the latest content visible, unless the user has scrolled up manually.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { ConversationMessage } from "@/components/self/message";
import { ChatHero } from "./chat-hero";
import type { ChatThreadDetail } from "./thread-store";

interface ChatPanelProps {
  mode: "split" | "full";
  /** The currently active thread (header title + scope come from here). */
  activeThread: ChatThreadDetail | null;
  messages: UIMessage[];
  loading: boolean;
  /** User submitted a free-text send from the panel input. */
  onSend: (text: string) => void;
  /** User clicked a starter pill or a full-page template card. */
  onSendStarter: (text: string) => void;
  /** Optional starter pills shown when a split thread is empty. */
  starters?: string[];
  /** Called when the user hits the close (×) icon in split mode. */
  onClose?: () => void;
  /** Called when the user hits the expand (arrow) icon in split mode. */
  onExpand?: () => void;
  /** Greeting name for the full-page hero. */
  userName?: string;
  /** Block actions routed from ConversationMessage. */
  onBlockAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function ChatPanel({
  mode,
  activeThread,
  messages,
  loading,
  onSend,
  onSendStarter,
  starters,
  onClose,
  onExpand,
  userName,
  onBlockAction,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const streamRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Don't fight the user — if they've scrolled up, stop pinning to bottom.
  const pinnedRef = useRef(true);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  // Track whether the user is near the bottom; pause auto-scroll if not.
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinnedRef.current = gap < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Pin to bottom on new messages / loading toggle.
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = streamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  // ResizeObserver: streaming deltas grow the last message without changing
  // messages.length — watch scrollHeight via the scroll container's own
  // size + its last child's size so the pin follows the content.
  useEffect(() => {
    const el = streamRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    // Also observe the last message so per-delta growth triggers.
    const last = el.lastElementChild;
    if (last) observer.observe(last);
    return () => observer.disconnect();
  }, [messages.length]);

  const submit = () => {
    const clean = input.trim();
    if (!clean || loading) return;
    setInput("");
    pinnedRef.current = true; // user-initiated — snap to bottom.
    onSend(clean);
  };

  const starter = (text: string) => {
    pinnedRef.current = true;
    onSendStarter(text);
  };

  const hasMessages = messages.length > 0;

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
        height: "100%",
        background: "var(--color-surface)",
        borderLeft: mode === "split" ? "1px solid var(--color-border)" : "none",
      }}
    >
      {mode === "split" && activeThread && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            height: 56,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
            }}
          >
            <AMark />
            <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeThread.title}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--color-text-muted)",
                  fontWeight: 500,
                  marginTop: 1,
                }}
              >
                {activeThread.scope === "General"
                  ? "Open conversation"
                  : activeThread.scope}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {onExpand && (
              <IconButton onClick={onExpand} title="Open as full page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}>
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </IconButton>
            )}
            {onClose && (
              <IconButton onClick={onClose} title="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </IconButton>
            )}
          </div>
        </div>
      )}

      <div
        ref={streamRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding:
            mode === "full" && !hasMessages
              ? 0
              : mode === "full"
                ? "32px 40px 16px"
                : "22px 20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
          maxWidth: mode === "full" && hasMessages ? 820 : undefined,
          width: "100%",
          margin: mode === "full" && hasMessages ? "0 auto" : undefined,
        }}
      >
        {!hasMessages && mode === "full" && (
          <ChatHero userName={userName} onTemplate={starter} />
        )}

        {messages.map((m, i) => (
          <ConversationMessage
            key={m.id ?? i}
            message={m}
            isStreaming={loading && m.role === "assistant" && i === messages.length - 1}
            isLast={i === messages.length - 1}
            onAction={onBlockAction}
          />
        ))}
      </div>

      {mode === "split" && !hasMessages && starters && starters.length > 0 && (
        <div style={{ padding: "0 20px 12px", maxWidth: 820, margin: "0 auto", width: "100%" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Try
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {starters.map((s) => (
              <button
                key={s}
                onClick={() => starter(s)}
                style={{
                  padding: "6px 12px",
                  background: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 999,
                  fontSize: 12.5,
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          padding: mode === "full" ? "14px 40px 24px" : "12px 20px 18px",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "10px 12px",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            boxShadow: "var(--shadow-subtle)",
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={loading ? "Alex is thinking…" : "Message Alex…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 14,
              color: "var(--color-text-primary)",
              resize: "none",
              minHeight: 24,
              maxHeight: 140,
              lineHeight: 1.5,
              padding: 0,
            }}
          />
          <SendButton
            ready={input.trim().length > 0 && !loading}
            onClick={submit}
          />
        </div>
      </div>
    </section>
  );
}

/* ============================================================= */

function AMark() {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        minWidth: 22,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #059669, #3D5A48)",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      A
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 6,
        background: "transparent",
        border: "1px solid transparent",
        color: "var(--color-text-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-surface)";
        e.currentTarget.style.color = "var(--color-text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--color-text-secondary)";
      }}
    >
      <span style={{ width: 15, height: 15 }}>{children}</span>
    </button>
  );
}

function SendButton({ ready, onClick }: { ready: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Send"
      disabled={!ready}
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "var(--color-vivid)",
        border: "none",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: ready ? "pointer" : "default",
        flexShrink: 0,
        opacity: ready ? 1 : 0.35,
        marginBottom: 1,
        transition: "opacity 150ms ease",
      }}
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
