"use client";

/**
 * Ditto — Sidebar Navigation
 *
 * Eight destinations: Today / Inbox / Work / Projects / Growth / Routines / Roadmap / Settings
 * per ADR-024 Section 2 and .impeccable.md nav label table.
 *
 * Inbox shows count badge when items need attention.
 * Settings is scaffold (fixed page), all others are composition intents.
 *
 * Brief 047 AC4 + Brief 055 AC6: Sidebar navigation items.
 * Provenance: original (ADR-024, P00 v2 prototype, .impeccable.md).
 */

import React, { useMemo } from "react";
import type { ProcessSummary, WorkItemSummary } from "@/lib/process-query";
import type { CompositionIntent } from "@/lib/compositions";

export type NavigationDestination = CompositionIntent | "settings" | (string & {});

/** Adaptive view metadata for sidebar rendering (Brief 154) */
export interface AdaptiveViewNavItem {
  slug: string;
  label: string;
  icon?: string | null;
}

interface SidebarProps {
  processes: ProcessSummary[];
  workItems: WorkItemSummary[];
  activeDestination: NavigationDestination;
  onNavigate: (destination: NavigationDestination) => void;
  onSelectProcess: (processId: string) => void;
  collapsed?: boolean;
  /** Registered adaptive workspace views (Brief 154) */
  adaptiveViews?: AdaptiveViewNavItem[];
}

/* -------------------------------------------------------------------------- */
/* Lucide-style inline SVG icons (stroke-based, 20×20, strokeWidth 1.5)       */
/* -------------------------------------------------------------------------- */

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function IconCheckSquare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconTrendingUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconGitBranch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function IconMap() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconChevronsLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

function IconChevronsRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  );
}

/** Default icon for adaptive views (Brief 154) — grid/squares */
function IconGrid() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Nav item definitions                                                        */
/* -------------------------------------------------------------------------- */

type NavItemDef = {
  id: NavigationDestination;
  label: string;
  Icon: () => React.ReactElement;
};

const MAIN_NAV: NavItemDef[] = [
  { id: "today",    label: "Today",    Icon: IconHome },
  { id: "inbox",    label: "Inbox",    Icon: IconInbox },
  { id: "work",     label: "Work",     Icon: IconCheckSquare },
  { id: "projects", label: "Projects", Icon: IconFolder },
  { id: "growth",   label: "Growth",   Icon: IconTrendingUp },
  { id: "library",  label: "Capabilities", Icon: IconZap },
  { id: "routines", label: "Routines", Icon: IconGitBranch },
  { id: "roadmap",  label: "Roadmap",  Icon: IconMap },
];

/* -------------------------------------------------------------------------- */
/* Sidebar component                                                           */
/* -------------------------------------------------------------------------- */

export function Sidebar({
  processes,
  workItems,
  activeDestination,
  onNavigate,
  onSelectProcess,
  collapsed,
  adaptiveViews,
}: SidebarProps) {
  // Inbox badge count — action-required items
  const inboxCount = useMemo(
    () =>
      workItems.filter(
        (w) => w.status !== "completed" && w.status !== "cancelled",
      ).length,
    [workItems],
  );

  /* ---- Collapsed state: icons only, 56px wide, centered ---- */

  if (collapsed) {
    return (
      <div
        className="flex-shrink-0 bg-background flex flex-col items-center py-4 gap-1 shadow-[var(--shadow-subtle)]"
        style={{ width: 56 }}
      >
        {/* Wordmark placeholder — just a dot in collapsed state */}
        <div
          className="w-8 h-8 flex items-center justify-center mb-2 text-text-muted"
          style={{ fontSize: 11, fontWeight: 600, letterSpacing: "-0.02em", fontFamily: "var(--font-sans)" }}
        >
          D
        </div>

        {/* Main nav */}
        {MAIN_NAV.map(({ id, label, Icon }) => {
          const isActive = activeDestination === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={label}
              className={`relative flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? "text-text-primary opacity-100"
                  : "text-text-muted opacity-60 hover:opacity-100 hover:bg-surface-raised hover:text-text-primary"
              }`}
              style={{
                width: 36,
                height: 36,
                borderRadius: isActive ? 0 : "var(--radius-md)",
                borderLeft: isActive ? "2px solid var(--vivid)" : undefined,
              }}
            >
              <Icon />
              {id === "inbox" && inboxCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 bg-negative text-white flex items-center justify-center"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    minWidth: 16,
                    height: 16,
                    borderRadius: "var(--radius-full)",
                    paddingLeft: 4,
                    paddingRight: 4,
                    lineHeight: 1,
                  }}
                >
                  {inboxCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Adaptive views — below built-in nav, after divider (Brief 154) */}
        {adaptiveViews && adaptiveViews.length > 0 && (
          <>
            <div className="w-8 border-t border-border my-2" />
            {adaptiveViews.map((view) => {
              const isActive = activeDestination === view.slug;
              return (
                <button
                  key={view.slug}
                  onClick={() => onNavigate(view.slug)}
                  title={view.label}
                  className={`relative flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? "text-text-primary opacity-100"
                      : "text-text-muted opacity-60 hover:opacity-100 hover:bg-surface-raised hover:text-text-primary"
                  }`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: isActive ? 0 : "var(--radius-md)",
                    borderLeft: isActive ? "2px solid var(--vivid)" : undefined,
                  }}
                >
                  <IconGrid />
                </button>
              );
            })}
          </>
        )}

        {/* Settings — at bottom */}
        <div className="mt-auto flex flex-col items-center pt-3 w-full border-t border-border">
          <button
            onClick={() => onNavigate("settings")}
            title="Settings"
            className={`flex items-center justify-center transition-colors ${
              activeDestination === "settings"
                ? "text-text-primary"
                : "text-text-muted hover:bg-surface-raised hover:text-text-primary"
            }`}
            style={{
              width: 36,
              height: 36,
              borderRadius: activeDestination === "settings" ? 0 : "var(--radius-md)",
              borderLeft: activeDestination === "settings" ? "2px solid var(--vivid)" : undefined,
            }}
          >
            <IconSettings />
          </button>
        </div>
      </div>
    );
  }

  /* ---- Expanded state: 240px, wordmark + labels ---- */

  return (
    <div
      className="flex-shrink-0 border-r border-border bg-surface flex flex-col h-full overflow-y-auto"
      style={{ width: 240 }}
    >
      {/* Header — "Ditto" wordmark + collapse affordance */}
      <div
        className="flex items-center justify-between px-4 border-b border-border"
        style={{ height: 52, flexShrink: 0 }}
      >
        <span
          className="text-text-primary select-none"
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-sans)",
          }}
        >
          Ditto
        </span>
        {/* Collapse button — wired externally via onNavigate if needed; no-op placeholder */}
        <button
          className="text-text-muted hover:text-text-primary transition-colors"
          style={{ padding: 4, borderRadius: "var(--radius-sm)" }}
          aria-label="Collapse sidebar"
        >
          <IconChevronsLeft />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col px-2 pt-2 flex-1">
        {MAIN_NAV.map(({ id, label, Icon }) => {
          const isActive = activeDestination === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center text-left transition-colors ${
                isActive
                  ? "text-text-primary"
                  : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
              }`}
              style={{
                gap: 12,
                padding: isActive ? "8px 12px 8px 10px" : "8px 12px",
                borderRadius: isActive ? 0 : "var(--radius-md)",
                fontWeight: isActive ? 500 : 400,
                fontSize: 14,
                lineHeight: "20px",
                borderLeft: isActive ? "2px solid var(--vivid)" : undefined,
                marginBottom: 2,
              }}
            >
              <span className="flex-shrink-0">{Icon && <Icon />}</span>
              <span className="flex-1 truncate">{label}</span>
              {id === "inbox" && inboxCount > 0 && (
                <span
                  className="bg-negative text-white flex items-center justify-center flex-shrink-0"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    minWidth: 18,
                    height: 18,
                    borderRadius: "var(--radius-full)",
                    paddingLeft: 5,
                    paddingRight: 5,
                    marginLeft: "auto",
                    lineHeight: 1,
                  }}
                >
                  {inboxCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Routines sub-list — show active process list when Routines is selected */}
        {activeDestination === "routines" && processes.length > 0 && (
          <div className="pt-2 pb-1">
            <p
              className="text-text-muted uppercase tracking-wider px-3 mb-1"
              style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em" }}
            >
              Your routines
            </p>
            {processes
              .filter((p) => !p.system && p.status === "active")
              .map((proc) => {
                const isError =
                  proc.lastRunStatus === "failed" ||
                  proc.lastRunStatus === "rejected";
                const isUnstarted = proc.recentRunCount === 0;

                const statusColor = isError
                  ? "text-caution"
                  : isUnstarted
                    ? "text-text-muted"
                    : "text-positive";

                const StatusDot = isError ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                ) : isUnstarted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 8 12 12 14 14" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                );

                return (
                  <button
                    key={proc.id}
                    onClick={() => onSelectProcess(proc.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-raised transition-colors"
                    style={{
                      borderRadius: "var(--radius-md)",
                      fontSize: 13,
                    }}
                  >
                    <span className={`flex-shrink-0 ${statusColor}`}>
                      {StatusDot}
                    </span>
                    <span className="truncate text-text-secondary">
                      {proc.name}
                    </span>
                  </button>
                );
              })}
          </div>
        )}

        {/* Adaptive views — below built-in nav, after divider (Brief 154) */}
        {adaptiveViews && adaptiveViews.length > 0 && (
          <div className="pt-2 pb-1 mt-1 border-t border-border">
            {adaptiveViews.map((view) => {
              const isActive = activeDestination === view.slug;
              return (
                <button
                  key={view.slug}
                  onClick={() => onNavigate(view.slug)}
                  className={`w-full flex items-center text-left transition-colors ${
                    isActive
                      ? "text-text-primary"
                      : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
                  }`}
                  style={{
                    gap: 12,
                    padding: isActive ? "8px 12px 8px 10px" : "8px 12px",
                    borderRadius: isActive ? 0 : "var(--radius-md)",
                    fontWeight: isActive ? 500 : 400,
                    fontSize: 14,
                    lineHeight: "20px",
                    borderLeft: isActive ? "2px solid var(--vivid)" : undefined,
                    marginBottom: 2,
                  }}
                >
                  <span className="flex-shrink-0"><IconGrid /></span>
                  <span className="flex-1 truncate">{view.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer — Settings separated by border-top */}
      <div className="px-2 pb-2 pt-2 border-t border-border flex-shrink-0">
        <button
          onClick={() => onNavigate("settings")}
          className={`w-full flex items-center text-left transition-colors ${
            activeDestination === "settings"
              ? "text-text-primary"
              : "text-text-secondary hover:bg-surface-raised hover:text-text-primary"
          }`}
          style={{
            gap: 12,
            padding:
              activeDestination === "settings"
                ? "8px 12px 8px 10px"
                : "8px 12px",
            borderRadius:
              activeDestination === "settings" ? 0 : "var(--radius-md)",
            fontWeight: activeDestination === "settings" ? 500 : 400,
            fontSize: 14,
            lineHeight: "20px",
            borderLeft:
              activeDestination === "settings"
                ? "2px solid var(--vivid)"
                : undefined,
          }}
        >
          <span className="flex-shrink-0">
            <IconSettings />
          </span>
          <span className="flex-1 truncate">Settings</span>
        </button>
      </div>
    </div>
  );
}
