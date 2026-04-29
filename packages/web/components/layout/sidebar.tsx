"use client";

/**
 * Ditto — Sidebar Navigation (Workspace redesign)
 *
 * Seven destinations: Today · Inbox · Work · Projects · Agents · People ·
 * Settings, with a "Chats" section showing recent threads (localStorage-
 * backed) and a primary "New chat" CTA. Mirrors the design handoff's
 * Workspace.html layout.
 *
 * Provenance: original (design handoff 2026-04-21), ADR-024 Section 2,
 * user-requested nav reshape (rename Routines → Agents; add People; drop
 * Growth/Library/Roadmap from nav — composition intents still exist and
 * are reachable via Self).
 */

import React, { useMemo } from "react";
import type { WorkItemSummary } from "@/lib/process-query";
import { useThreadStore, relativeMinutes } from "@/components/chat/thread-store";

export type NavigationDestination =
  | "today"
  | "inbox"
  | "work"
  | "projects"
  | "agents"
  | "people"
  | "settings"
  | "chatPage"
  | (string & {});

export interface AdaptiveViewNavItem {
  slug: string;
  label: string;
  icon?: string | null;
}

interface SidebarProps {
  workItems: WorkItemSummary[];
  activeDestination: NavigationDestination;
  onNavigate: (destination: NavigationDestination) => void;
  onOpenThread: (threadId: string) => void;
  onNewChat: () => void;
  collapsed?: boolean;
  /** Used to scope the thread list so resumed conversations belong to the
   *  right user — not just the "default" fallback. */
  userId?: string;
  userName?: string;
  orgName?: string;
  adaptiveViews?: AdaptiveViewNavItem[];
  onCollapseToggle?: () => void;
  /**
   * Brief 225 — when set, the "+ Connect a project" CTA appears under the
   * Projects nav item. Tapping it seeds a Self conversation message
   * ("Connect a new project") that triggers the `start_project_onboarding`
   * tool. The parent decides what message to seed.
   */
  onConnectProject?: () => void;
}

/* ============================================================= */
/* Icons — stroke-based inline SVG, 17×17 visual, 1.5 stroke       */
/* ============================================================= */

const icons = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  work: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  agents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <line x1={6} y1={3} x2={6} y2={15} />
      <circle cx={18} cy={6} r={3} />
      <circle cx={6} cy={18} r={3} />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx={9} cy={7} r={4} />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  chevronLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}>
      <rect x={3} y={3} width={7} height={7} />
      <rect x={14} y={3} width={7} height={7} />
      <rect x={14} y={14} width={7} height={7} />
      <rect x={3} y={14} width={7} height={7} />
    </svg>
  ),
};

const NAV_ITEMS: Array<{ id: NavigationDestination; label: string; icon: React.ReactNode }> = [
  { id: "today", label: "Today", icon: icons.today },
  { id: "inbox", label: "Inbox", icon: icons.inbox },
  { id: "work", label: "Work", icon: icons.work },
];

const ONGOING_ITEMS: Array<{ id: NavigationDestination; label: string; icon: React.ReactNode }> = [
  { id: "projects", label: "Projects", icon: icons.projects },
  { id: "agents", label: "Agents", icon: icons.agents },
];

/* ============================================================= */

export function Sidebar({
  workItems,
  activeDestination,
  onNavigate,
  onOpenThread,
  onNewChat,
  collapsed = false,
  userId = "default",
  userName,
  orgName,
  adaptiveViews,
  onCollapseToggle,
  onConnectProject,
}: SidebarProps) {
  const inboxCount = useMemo(
    () =>
      workItems.filter(
        (w) => w.status !== "completed" && w.status !== "cancelled",
      ).length,
    [workItems],
  );

  const { threads, activeId } = useThreadStore(userId);
  const recentThreads = useMemo(() => threads.slice(0, 8), [threads]);

  /* ---- Collapsed rail ---- */

  if (collapsed) {
    return (
      <aside
        style={{
          flexShrink: 0,
          width: 56,
          background: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 0 10px",
          gap: 6,
          overflow: "hidden",
          height: "100%",
        }}
      >
        <WordmarkMark />
        <NewChatIconOnly onClick={onNewChat} />
        <div style={{ height: 6 }} />
        {[...NAV_ITEMS, ...ONGOING_ITEMS].map((item) => (
          <IconNavButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeDestination === item.id}
            onClick={() => onNavigate(item.id)}
            badge={item.id === "inbox" && inboxCount > 0 ? inboxCount : undefined}
          />
        ))}
        {adaptiveViews?.length ? (
          <>
            <Divider />
            {adaptiveViews.map((v) => (
              <IconNavButton
                key={v.slug}
                icon={icons.grid}
                label={v.label}
                active={activeDestination === v.slug}
                onClick={() => onNavigate(v.slug)}
              />
            ))}
          </>
        ) : null}
        <div style={{ flex: 1 }} />
        <IconNavButton
          icon={icons.people}
          label="People"
          active={activeDestination === "people"}
          onClick={() => onNavigate("people")}
        />
        <IconNavButton
          icon={icons.settings}
          label="Settings"
          active={activeDestination === "settings"}
          onClick={() => onNavigate("settings")}
        />
      </aside>
    );
  }

  /* ---- Full 248px sidebar ---- */

  return (
    <aside
      style={{
        flexShrink: 0,
        width: 248,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header — wordmark + collapse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          height: 56,
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--color-vivid)",
            textTransform: "lowercase",
          }}
        >
          ditto
        </span>
        {onCollapseToggle && (
          <button
            onClick={onCollapseToggle}
            aria-label="Collapse sidebar"
            style={{
              width: 26,
              height: 26,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <span style={{ width: 14, height: 14 }}>{icons.chevronLeft}</span>
          </button>
        )}
      </div>

      {/* New chat CTA */}
      <div style={{ padding: 12 }}>
        <button
          onClick={onNewChat}
          data-testid="new-chat-button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 10px",
            background: "var(--color-vivid)",
            border: "1px solid var(--color-vivid)",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            fontFamily: "inherit",
            width: "100%",
            whiteSpace: "nowrap",
            transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-accent-hover)";
            e.currentTarget.style.borderColor = "var(--color-accent-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--color-vivid)";
            e.currentTarget.style.borderColor = "var(--color-vivid)";
          }}
        >
          <span style={{ width: 15, height: 15 }}>{icons.plus}</span>
          <span>New chat</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              padding: "1px 5px",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 4,
              background: "rgba(0,0,0,0.1)",
              flexShrink: 0,
            }}
          >
            ⌘K
          </span>
        </button>
      </div>

      {/* Scroll area */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 10px",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeDestination === item.id}
            onClick={() => onNavigate(item.id)}
            count={item.id === "inbox" && inboxCount > 0 ? inboxCount : undefined}
            countAttention={item.id === "inbox"}
          />
        ))}

        <SectionLabel>Ongoing</SectionLabel>
        {ONGOING_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeDestination === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
        {onConnectProject && (
          <button
            onClick={onConnectProject}
            data-testid="connect-project-cta"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "5px 10px 5px 38px",
              borderRadius: 6,
              color: "var(--color-text-muted)",
              fontSize: 12.5,
              fontWeight: 400,
              cursor: "pointer",
              background: "transparent",
              border: "none",
              fontFamily: "inherit",
              width: "100%",
              textAlign: "left",
              marginBottom: 1,
              transition: "background 120ms ease, color 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-surface-raised)";
              e.currentTarget.style.color = "var(--color-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--color-text-muted)";
            }}
          >
            <span style={{ width: 13, height: 13, flexShrink: 0 }}>{icons.plus}</span>
            <span>Connect a project</span>
          </button>
        )}

        {adaptiveViews && adaptiveViews.length > 0 && (
          <>
            {adaptiveViews.map((v) => (
              <NavItem
                key={v.slug}
                icon={icons.grid}
                label={v.label}
                active={activeDestination === v.slug}
                onClick={() => onNavigate(v.slug)}
              />
            ))}
          </>
        )}

        <SectionLabel
          right={
            <button
              onClick={() => onNavigate("chatPage")}
              style={{
                fontSize: 10,
                color: "var(--color-text-muted)",
                cursor: "pointer",
                border: "none",
                background: "none",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              See all
            </button>
          }
        >
          Chats
        </SectionLabel>

        {recentThreads.length === 0 ? (
          <div
            style={{
              padding: "4px 10px",
              fontSize: 11.5,
              color: "var(--color-text-muted)",
              fontStyle: "italic",
            }}
          >
            No chats yet
          </div>
        ) : (
          recentThreads.map((t) => (
            <ThreadRow
              key={t.id}
              title={t.title}
              time={relativeMinutes(t.lastActiveAt)}
              active={t.id === activeId}
              onClick={() => onOpenThread(t.id)}
            />
          ))
        )}
      </nav>

      {/* Footer — People + Settings + user chip */}
      <div
        style={{
          padding: 10,
          borderTop: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <NavItem
          icon={icons.people}
          label="People"
          active={activeDestination === "people"}
          onClick={() => onNavigate("people")}
        />
        <NavItem
          icon={icons.settings}
          label="Settings"
          active={activeDestination === "settings"}
          onClick={() => onNavigate("settings")}
        />
        <UserChip userName={userName} orgName={orgName} />
      </div>
    </aside>
  );
}

/* ============================================================= */
/* Primitives                                                     */
/* ============================================================= */

function NavItem({
  icon,
  label,
  active,
  onClick,
  count,
  countAttention,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  count?: number;
  countAttention?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "7px 10px",
        borderRadius: 6,
        color: active ? "var(--color-vivid-deep)" : "var(--color-text-secondary)",
        fontSize: 13.5,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
        background: active ? "var(--color-vivid-subtle)" : "none",
        border: "none",
        fontFamily: "inherit",
        width: "100%",
        textAlign: "left",
        marginBottom: 1,
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--color-surface-raised)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
    >
      <span style={{ width: 17, height: 17, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {count != null && count > 0 && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 500,
            background: countAttention ? "var(--color-caution)" : "var(--color-border)",
            color: countAttention ? "#fff" : "var(--color-text-secondary)",
            padding: "1px 7px",
            borderRadius: 9999,
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        padding: "14px 10px 6px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{children}</span>
      {right}
    </div>
  );
}

function ThreadRow({
  title,
  time,
  active,
  onClick,
}: {
  title: string;
  time: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 6,
        color: active ? "var(--color-vivid-deep)" : "var(--color-text-secondary)",
        fontSize: 12.75,
        cursor: "pointer",
        marginBottom: 1,
        background: active ? "var(--color-vivid-subtle)" : "none",
        border: "none",
        fontFamily: "inherit",
        width: "100%",
        textAlign: "left",
        lineHeight: 1.35,
        fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--color-surface-raised)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-text-secondary)";
        }
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: active ? "var(--color-vivid)" : "var(--color-border-strong)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--color-text-muted)",
          flexShrink: 0,
        }}
      >
        {time}
      </span>
    </button>
  );
}

function UserChip({ userName, orgName }: { userName?: string; orgName?: string }) {
  const initials = (userName ?? "You")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <button
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        borderRadius: 8,
        cursor: "pointer",
        width: "100%",
        border: "none",
        background: "none",
        fontFamily: "inherit",
        textAlign: "left",
        marginTop: 4,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-surface-raised)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #059669, #3D5A48)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {initials}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {userName ?? "You"}
        </div>
        {orgName && (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {orgName}
          </div>
        )}
      </div>
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{ width: 32, borderTop: "1px solid var(--color-border)", margin: "6px 0" }}
    />
  );
}

function WordmarkMark() {
  return (
    <span
      style={{
        width: 28,
        height: 28,
        marginBottom: 2,
        borderRadius: 8,
        background: "var(--color-vivid)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: "-0.02em",
      }}
    >
      d
    </span>
  );
}

function IconNavButton({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        background: active ? "var(--color-vivid-subtle)" : "transparent",
        color: active ? "var(--color-vivid-deep)" : "var(--color-text-muted)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 120ms ease, color 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--color-surface-raised)";
          e.currentTarget.style.color = "var(--color-text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-text-muted)";
        }
      }}
    >
      <span style={{ width: 17, height: 17 }}>{icon}</span>
      {badge != null && badge > 0 && (
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            background: "var(--color-caution)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 9999,
            padding: "0 4px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function NewChatIconOnly({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="New chat (⌘K)"
      style={{
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        background: "var(--color-vivid)",
        color: "#fff",
        border: "none",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 15, height: 15 }}>{icons.plus}</span>
    </button>
  );
}
