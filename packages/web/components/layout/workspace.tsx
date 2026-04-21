"use client";

/**
 * Ditto — Workspace (redesigned shell, real streaming)
 *
 * Workspace owns the single `useChat` instance so conversation state
 * survives mode switches (split ↔ chat-full ↔ artifact). ChatPanel and
 * ArtifactLayout both render from the same `messages` + `sendMessage`
 * pair. Threads persist via /api/chat/threads; replay happens on thread
 * id change only (no stomping in-flight messages with every post-send
 * persistence). Tool-output parts bubble through `resolveTransition` so
 * generated-artifact tools flip the center view to artifact mode.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import { useProcessList } from "@/lib/process-query";
import { useWorkspaceViews } from "@/hooks/use-workspace-views";
import { useNetworkPush } from "@/hooks/use-network-push";
import { resolveTransition, type ArtifactCenterView } from "@/lib/transition-map";
import { Sidebar, type NavigationDestination } from "./sidebar";
import { AdaptiveCanvas } from "./adaptive-canvas";
import { ArtifactLayout } from "./artifact-layout";
import { TodayView } from "./views/today-view";
import { InboxView } from "./views/inbox-view";
import { WorkView } from "./views/work-view";
import { ProjectsView } from "./views/projects-view";
import { AgentsView } from "./views/agents-view";
import { PeopleView } from "./views/people-view";
import { SettingsView } from "./views/settings-view";
import { VIEW_META, type ViewId } from "./views/types";
import { ChatPanel } from "@/components/chat/chat-panel";
import {
  threadStore,
  useThreadStore,
  type ChatThreadDetail,
} from "@/components/chat/thread-store";
import { classifyIntent } from "@/components/chat/intent-router";
import type { ThreadTurn } from "@/lib/engine";

interface WorkspaceProps {
  userId?: string;
  userName?: string;
  orgName?: string;
}

type CenterView =
  | { type: "view"; id: ViewId }
  | { type: "adaptive"; slug: string }
  | { type: "chat-full" }
  | ArtifactCenterView;

const VIEW_IDS: ViewId[] = [
  "today",
  "inbox",
  "work",
  "projects",
  "agents",
  "people",
  "settings",
];

export function Workspace({ userId = "default", userName, orgName }: WorkspaceProps) {
  const { data } = useProcessList();
  const workItems = data?.workItems ?? [];

  const { data: adaptiveData } = useWorkspaceViews();
  useNetworkPush();
  const adaptiveViews = useMemo(
    () => (adaptiveData ?? []).map((v) => ({ slug: v.slug, label: v.label, icon: v.icon })),
    [adaptiveData],
  );
  const adaptiveSlugs = useMemo(
    () => new Set(adaptiveViews.map((v) => v.slug)),
    [adaptiveViews],
  );

  const { active, pendingSend, clearPending, appendTurns } = useThreadStore(userId);

  const initialView = (() => {
    if (typeof window === "undefined") return "today";
    return (window.localStorage.getItem("ditto.view") as ViewId) ?? "today";
  })();
  const [center, setCenter] = useState<CenterView>({
    type: "view",
    id: VIEW_IDS.includes(initialView as ViewId) ? (initialView as ViewId) : "today",
  });
  const previousViewRef = useRef<CenterView>(center);

  const [split, setSplit] = useState(false);
  const [splitWidth, setSplitWidth] = useState(440);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [input, setInput] = useState("");

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1400,
  );
  useEffect(() => {
    function handle() {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const isCompactLayout = windowWidth < 1024;
  const isNarrowSplit = windowWidth < 900;

  useEffect(() => {
    if (center.type === "view") {
      window.localStorage.setItem("ditto.view", center.id);
    }
  }, [center]);

  /* ======================================================== */
  /* useChat — lives at the workspace so it survives mode swaps */
  /* ======================================================== */

  const scope = active?.scope ?? "General";

  // Transport memoised on userId + active thread id; intent scope is
  // captured at construction so it stays stable for the whole thread.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          userId,
          intentContext: scope === "General" ? undefined : scope.toLowerCase(),
        },
      }),
    [userId, scope, active?.id],
  );

  // Replay only on active thread id change — turns-length changes (from
  // post-send persistence) must NOT stomp the live in-stream messages.
  const initialMessages = useMemo<UIMessage[]>(
    () => (active ? turnsToUIMessages(active.turns) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active?.id],
  );

  const { messages, status, sendMessage, setMessages } = useChat({
    id: active?.id,
    messages: initialMessages,
    transport,
  });

  const loading = status === "submitted" || status === "streaming";

  // Reset the in-hook messages when the active thread flips — but never
  // stomp an in-flight stream: if the user switches threads mid-reply,
  // we wait for the persistence effect to flush before replaying.
  useEffect(() => {
    if (loading) return;
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, loading]);

  /* -------- Persist finished turns to the server -------- */

  const persistedIndexRef = useRef(0);
  const persistInFlightRef = useRef(false);

  useEffect(() => {
    persistedIndexRef.current = initialMessages.length;
  }, [initialMessages]);

  useEffect(() => {
    if (!active || loading) return;
    if (persistInFlightRef.current) return;
    if (messages.length <= persistedIndexRef.current) return;
    const slice = messages.slice(persistedIndexRef.current);
    const target = messages.length;
    const turns = slice.map(uiMessageToTurn);
    if (turns.length === 0) return;
    persistInFlightRef.current = true;
    appendTurns(active.id, turns)
      .then((ok) => {
        if (ok) persistedIndexRef.current = target;
        // on failure, leave the ref at its old position so the effect
        // re-runs on the next messages/loading change and retries.
      })
      .finally(() => {
        persistInFlightRef.current = false;
      });
  }, [messages, loading, active, appendTurns]);

  /* -------- Cross-surface send bridge -------- */

  const lastNonceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingSend || pendingSend.nonce === lastNonceRef.current) return;
    lastNonceRef.current = pendingSend.nonce;
    const text = pendingSend.text;
    clearPending();
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [pendingSend, clearPending, sendMessage]);

  /* -------- Transition observer (artifact mode reconnect) -------- */

  const lastTransitionIdRef = useRef<string | null>(null);
  useEffect(() => {
    for (let m = messages.length - 1; m >= 0; m--) {
      const msg = messages[m];
      if (msg.role !== "assistant") continue;
      const parts = msg.parts ?? [];
      for (let p = parts.length - 1; p >= 0; p--) {
        const part = parts[p];
        if (!isToolUIPart(part)) continue;
        // We only care about terminal states.
        const state = (part as { state?: string }).state;
        if (state !== "output-available") continue;
        const output = (part as { output?: unknown }).output;
        if (output === undefined) continue;
        const toolCallId = (part as { toolCallId?: string }).toolCallId;
        const id = toolCallId ?? `${m}-${p}`;
        if (id === lastTransitionIdRef.current) return;
        lastTransitionIdRef.current = id;
        const toolName = getToolName(part);
        const transition = resolveTransition(toolName, output);
        if (!transition) return;
        if (transition.target === "center") {
          setCenter((current) => {
            previousViewRef.current = current;
            return transition.view;
          });
          setSplit(false);
        }
        // Panel-target transitions are ignored — the right panel was
        // retired in this redesign. If we bring it back, re-wire here.
        return;
      }
    }
  }, [messages]);

  /* ======================================================== */
  /* Navigation                                                */
  /* ======================================================== */

  const navigate = useCallback(
    (dest: NavigationDestination) => {
      if (dest === "chatPage") {
        void (async () => {
          if (!threadStore.snapshot().active) {
            await threadStore.create();
          }
          previousViewRef.current = center;
          setCenter({ type: "chat-full" });
        })();
        return;
      }
      if (adaptiveSlugs.has(dest as string)) {
        setCenter({ type: "adaptive", slug: dest as string });
        setSplit(false);
        return;
      }
      if (VIEW_IDS.includes(dest as ViewId)) {
        setCenter({ type: "view", id: dest as ViewId });
        setSplit(false);
        return;
      }
      setCenter({ type: "view", id: "today" });
      setSplit(false);
    },
    [adaptiveSlugs, center],
  );

  const newChat = useCallback(() => {
    void (async () => {
      await threadStore.create();
      previousViewRef.current = center;
      setCenter({ type: "chat-full" });
      setSplit(false);
    })();
  }, [center]);

  const openThread = useCallback(
    (id: string) => {
      void (async () => {
        await threadStore.setActive(id);
        if (center.type !== "chat-full") {
          setSplit(true);
        }
      })();
    },
    [center],
  );

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape") {
        if (center.type === "chat-full" || center.type === "artifact") {
          setCenter(previousViewRef.current);
        } else {
          setSplit(false);
        }
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [newChat, center]);

  /* ======================================================== */
  /* Universal chatbar + intent routing                        */
  /* ======================================================== */

  const currentViewMeta =
    center.type === "view" ? VIEW_META[center.id] : undefined;

  const openScopedSplit = useCallback(async (scope: string) => {
    const existing = threadStore.snapshot().active;
    if (!existing || existing.scope !== scope) {
      await threadStore.create({
        title: `About ${scope.toLowerCase()}`,
        scope,
      });
    }
    setSplit(true);
  }, []);

  const askAbout = useCallback(async (subject: string) => {
    const title = subject.charAt(0).toUpperCase() + subject.slice(1);
    await threadStore.create({ title, scope: `About ${subject}` });
    setSplit(true);
    threadStore.requestSend(`Tell me about ${subject}`, `About ${subject}`);
  }, []);

  const sendFromBar = useCallback(
    (text: string, onAmbiguous: (verdict: "new" | "ambiguous") => void) => {
      if (!currentViewMeta) return;
      const verdict = classifyIntent(text, currentViewMeta.scope);
      if (verdict === "related") {
        void openScopedSplit(currentViewMeta.scope).then(() => {
          threadStore.requestSend(text, currentViewMeta.scope);
        });
      } else {
        onAmbiguous(verdict);
      }
    },
    [currentViewMeta, openScopedSplit],
  );

  const confirmIntent = useCallback(
    (text: string, choice: "current" | "new" | "full") => {
      const scope = currentViewMeta?.scope ?? "General";
      if (choice === "current") {
        void openScopedSplit(scope).then(() => {
          threadStore.requestSend(text, scope);
        });
      } else if (choice === "new") {
        void (async () => {
          await threadStore.create();
          setSplit(true);
          threadStore.requestSend(text, "General");
        })();
      } else {
        void (async () => {
          await threadStore.create();
          previousViewRef.current = center;
          setCenter({ type: "chat-full" });
          setSplit(false);
          threadStore.requestSend(text, "General");
        })();
      }
    },
    [currentViewMeta, openScopedSplit, center],
  );

  /* ======================================================== */
  /* Drag resize                                               */
  /* ======================================================== */

  const mainRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const startDrag = useCallback(() => setDragging(true), []);
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const rect = mainRef.current?.getBoundingClientRect();
      if (!rect) return;
      const leftW = Math.min(Math.max(e.clientX - rect.left, 380), rect.width - 320);
      const chatW = rect.width - leftW;
      setSplitWidth(chatW);
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  /* ======================================================== */
  /* Chat submit helpers                                       */
  /* ======================================================== */

  // ChatPanel owns its own input so parent re-renders aren't triggered
  // on every keystroke. Only the ArtifactLayout still uses workspace-
  // owned input (its chat column takes controlled input props).
  const sendText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      sendMessage({ role: "user", parts: [{ type: "text", text: clean }] });
    },
    [sendMessage],
  );

  // ArtifactLayout's controlled input — stable through an inputRef read.
  const inputRef = useRef("");
  inputRef.current = input;
  const submitArtifactInput = useCallback(() => {
    const clean = inputRef.current.trim();
    if (!clean) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text: clean }] });
  }, [sendMessage]);

  /* ======================================================== */
  /* Render                                                    */
  /* ======================================================== */

  const headerTitle =
    center.type === "view"
      ? VIEW_META[center.id].title
      : center.type === "adaptive"
        ? adaptiveViews.find((v) => v.slug === center.slug)?.label ?? "View"
        : center.type === "artifact"
          ? "Artifact"
          : "Chat";

  const activeDestination: NavigationDestination =
    center.type === "view"
      ? center.id
      : center.type === "adaptive"
        ? center.slug
        : center.type === "chat-full"
          ? "chatPage"
          : "today";

  const chatFull = center.type === "chat-full";
  const splitActive = split && !chatFull && center.type !== "artifact";

  if (center.type === "artifact") {
    return (
      <ArtifactLayout
        artifactType={center.artifactType}
        artifactId={center.artifactId}
        processId={center.processId}
        runId={center.runId}
        messages={messages}
        chatLoading={loading}
        input={input}
        onInputChange={setInput}
        onSubmit={submitArtifactInput}
        onAction={(action) => {
          if (!action) return;
          if (VIEW_IDS.includes(action as ViewId)) {
            setCenter({ type: "view", id: action as ViewId });
            setSplit(false);
          }
        }}
        onExit={() => setCenter(previousViewRef.current)}
        onNavigate={navigate}
        windowWidth={windowWidth}
      />
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: `${isCompactLayout ? 0 : sidebarCollapsed ? 56 : 248}px 1fr`,
        transition: "grid-template-columns 220ms ease",
        background: "var(--color-background)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
      }}
    >
      {!isCompactLayout && (
        <Sidebar
          workItems={workItems}
          activeDestination={activeDestination}
          onNavigate={navigate}
          onOpenThread={openThread}
          onNewChat={newChat}
          collapsed={sidebarCollapsed}
          userId={userId}
          userName={userName}
          orgName={orgName}
          adaptiveViews={adaptiveViews}
          onCollapseToggle={() => setSidebarCollapsed((c) => !c)}
        />
      )}

      <main
        ref={mainRef}
        style={{
          display: "grid",
          gridTemplateColumns: chatFull
            ? "1fr"
            : splitActive && !isNarrowSplit
              ? `1fr ${splitWidth}px`
              : splitActive && isNarrowSplit
                ? `0 1fr`
                : "1fr 0",
          overflow: "hidden",
          background: "var(--color-background)",
          minWidth: 0,
          transition: dragging
            ? "none"
            : "grid-template-columns 260ms cubic-bezier(0.32, 0.72, 0, 1)",
          position: "relative",
        }}
      >
        {!chatFull && (
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: 0,
              borderRight: splitActive ? "1px solid var(--color-border)" : "none",
            }}
          >
            <CenterHeader title={headerTitle} onNewChat={newChat} />
            <div style={{ flex: 1, overflowY: "auto", padding: "40px 32px 24px" }}>
              <div style={{ maxWidth: splitActive ? 640 : 760, margin: "0 auto" }}>
                {renderCenterView(center, { askAbout, navigate })}
              </div>
            </div>
            {currentViewMeta && (
              <UniversalChatbar
                meta={currentViewMeta}
                onSend={sendFromBar}
                onConfirm={confirmIntent}
              />
            )}
          </section>
        )}

        {splitActive && !isNarrowSplit && (
          <div
            onMouseDown={startDrag}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `calc(100% - ${splitWidth + 3}px)`,
              width: 6,
              cursor: "col-resize",
              zIndex: 5,
              background: dragging ? "var(--color-vivid)" : "transparent",
              transition: dragging ? "none" : "background 150ms ease",
            }}
          />
        )}

        {(splitActive || chatFull) && (
          <ChatPanel
            mode={chatFull ? "full" : "split"}
            activeThread={active}
            messages={messages}
            loading={loading}
            onSend={sendText}
            onSendStarter={sendText}
            starters={
              currentViewMeta && !chatFull ? currentViewMeta.starters : undefined
            }
            userName={userName}
            onClose={() => setSplit(false)}
            onExpand={() => {
              previousViewRef.current = center;
              setCenter({ type: "chat-full" });
              setSplit(false);
            }}
            onBlockAction={(action) => {
              if (!action) return;
              if (VIEW_IDS.includes(action as ViewId)) {
                setCenter({ type: "view", id: action as ViewId });
                setSplit(false);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}

/* ============================================================= */
/* Replay helpers                                                */
/* ============================================================= */

function turnsToUIMessages(turns: ThreadTurn[]): UIMessage[] {
  return turns.map((t, i) => ({
    id: `turn-${i}-${t.timestamp}`,
    role: t.role === "user" ? "user" : "assistant",
    parts: [{ type: "text", text: t.content }],
  }));
}

function uiMessageToTurn(m: UIMessage): ThreadTurn {
  let text = "";
  const toolNames: string[] = [];
  for (const part of m.parts ?? []) {
    const p = part as { type: string; text?: string; toolName?: string };
    if (p.type === "text" && typeof p.text === "string") {
      text += p.text;
    } else if (p.type?.startsWith("tool-") || p.type === "dynamic-tool") {
      const n = p.toolName;
      if (n && !toolNames.includes(n)) toolNames.push(n);
    }
  }
  return {
    role: m.role === "user" ? "user" : "assistant",
    content: text,
    timestamp: Date.now(),
    surface: "web",
    ...(toolNames.length > 0 ? { toolNames } : {}),
  };
}

/* ============================================================= */
/* Center view dispatcher                                        */
/* ============================================================= */

function renderCenterView(
  center: CenterView,
  cbs: {
    askAbout: (subject: string) => void;
    navigate: (dest: NavigationDestination) => void;
  },
) {
  if (center.type === "adaptive") {
    return (
      <AdaptiveCanvas
        slug={center.slug}
        onAction={(actionId, payload) => {
          if (actionId === "navigate-inbox") return cbs.navigate("inbox");
          if (actionId.startsWith("empty-")) {
            const subject = (payload?.content as string) ?? actionId;
            cbs.askAbout(subject);
          }
        }}
      />
    );
  }
  if (center.type === "chat-full" || center.type === "artifact") {
    return null;
  }
  switch (center.id) {
    case "today":
      return <TodayView onAskAbout={cbs.askAbout} />;
    case "inbox":
      return <InboxView onAskAbout={cbs.askAbout} />;
    case "work":
      return <WorkView onAskAbout={cbs.askAbout} />;
    case "projects":
      return <ProjectsView onSelectProject={() => {}} onAskAbout={cbs.askAbout} />;
    case "agents":
      return <AgentsView onSelectAgent={() => {}} onAskAbout={cbs.askAbout} />;
    case "people":
      return <PeopleView onAskAbout={cbs.askAbout} />;
    case "settings":
      return <SettingsView />;
  }
}

/* ============================================================= */
/* Center header                                                 */
/* ============================================================= */

function CenterHeader({ title, onNewChat }: { title: string; onNewChat: () => void }) {
  return (
    <div
      style={{
        padding: "12px 32px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--color-background)",
        flexShrink: 0,
        height: 56,
      }}
    >
      <h1
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          margin: 0,
          color: "var(--color-text-primary)",
        }}
      >
        {title}
      </h1>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button
          onClick={onNewChat}
          title="New chat (⌘K)"
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
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================= */
/* Universal chatbar                                             */
/* ============================================================= */

function UniversalChatbar({
  meta,
  onSend,
  onConfirm,
}: {
  meta: (typeof VIEW_META)[ViewId];
  onSend: (text: string, onAmbiguous: (verdict: "new" | "ambiguous") => void) => void;
  onConfirm: (text: string, choice: "current" | "new" | "full") => void;
}) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ text: string; verdict: "new" | "ambiguous" } | null>(
    null,
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const submit = () => {
    const clean = input.trim();
    if (!clean) return;
    onSend(clean, (verdict) => setPending({ text: clean, verdict }));
    setInput("");
  };

  const confirm = (choice: "current" | "new" | "full") => {
    if (!pending) return;
    onConfirm(pending.text, choice);
    setPending(null);
  };

  return (
    <div
      style={{
        padding: "10px 32px 20px",
        background:
          "linear-gradient(to bottom, transparent, var(--color-background) 30%)",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {pending && (
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto 8px",
            background: "var(--color-surface-raised)",
            border: "1px solid #E6D4AA",
            borderRadius: 10,
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "var(--color-caution)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            A
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 13,
                color: "var(--color-text-primary)",
                lineHeight: 1.5,
              }}
            >
              {pending.verdict === "new" ? (
                <>
                  That sounds like a <b>new thread</b> — not really about{" "}
                  {meta.scope.toLowerCase()}. Keep it here, or start fresh?
                </>
              ) : (
                <>
                  Is this about <b>{meta.scope.toLowerCase()}</b>, or something
                  else?
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <BtnSm primary onClick={() => confirm("current")}>
                Keep it here
              </BtnSm>
              <BtnSm onClick={() => confirm("new")}>Start new thread</BtnSm>
              <BtnSm ghost onClick={() => confirm("full")}>
                Open full chat
              </BtnSm>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
          padding: "10px 12px 8px",
          boxShadow: "var(--shadow-subtle)",
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div
          title="Alex will scope to this view"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 9px",
            background: "var(--color-vivid-subtle)",
            border: "1px solid #D1F4E1",
            borderRadius: 999,
            fontSize: 11,
            color: "var(--color-vivid-deep)",
            fontWeight: 500,
            marginBottom: 2,
          }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            <circle cx={12} cy={12} r={4} />
          </svg>
          <span>{meta.scope}</span>
        </div>
        <textarea
          ref={inputRef}
          rows={1}
          placeholder={meta.placeholder}
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
            fontSize: 14.5,
            color: "var(--color-text-primary)",
            resize: "none",
            minHeight: 24,
            maxHeight: 160,
            lineHeight: 1.5,
            padding: "4px 2px",
          }}
        />
        <button
          onClick={submit}
          aria-label="Send"
          disabled={!input.trim()}
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
            cursor: input.trim() ? "pointer" : "default",
            flexShrink: 0,
            opacity: input.trim() ? 1 : 0.35,
            marginBottom: 1,
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
      <div
        style={{
          maxWidth: 760,
          margin: "6px auto 0",
          fontSize: 11.5,
          color: "var(--color-text-muted)",
          textAlign: "center",
        }}
      >
        Enter to send · Alex routes your question to the right place
      </div>
    </div>
  );
}

function BtnSm({
  children,
  onClick,
  primary,
  ghost,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  ghost?: boolean;
}) {
  const bg = primary
    ? "var(--color-vivid)"
    : ghost
      ? "transparent"
      : "var(--color-surface-raised)";
  const color = primary ? "#fff" : "var(--color-text-primary)";
  const border = primary
    ? "var(--color-vivid)"
    : ghost
      ? "transparent"
      : "var(--color-border-strong)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 500,
        border: `1px solid ${border}`,
        background: bg,
        color,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// Re-export for convenience if anything outside this file needs it.
export type { ChatThreadDetail };
