"use client";

/**
 * Ditto — Sidebar Navigation
 *
 * Seven destinations: Today / Inbox / Work / Projects / Routines / Roadmap / Settings
 * per ADR-024 Section 2 and .impeccable.md nav label table.
 *
 * Inbox shows count badge when items need attention.
 * Settings is scaffold (fixed page), all others are composition intents.
 *
 * Brief 047 AC4 + Brief 055 AC6: Sidebar navigation items.
 * Provenance: original (ADR-024, P00 v2 prototype, .impeccable.md).
 */

import { useMemo } from "react";
import type { ProcessSummary, WorkItemSummary } from "@/lib/process-query";
import type { CompositionIntent } from "@/lib/compositions";

export type NavigationDestination = CompositionIntent | "settings";

interface SidebarProps {
  processes: ProcessSummary[];
  workItems: WorkItemSummary[];
  activeDestination: NavigationDestination;
  onNavigate: (destination: NavigationDestination) => void;
  onSelectProcess: (processId: string) => void;
  collapsed?: boolean;
}

/** Navigation items — user language per .impeccable.md */
const NAV_ITEMS: Array<{
  id: NavigationDestination;
  label: string;
  icon: string;
}> = [
  { id: "today", label: "Today", icon: "◉" },
  { id: "inbox", label: "Inbox", icon: "▪" },
  { id: "work", label: "Work", icon: "▸" },
  { id: "projects", label: "Projects", icon: "◇" },
  { id: "routines", label: "Routines", icon: "↻" },
  { id: "roadmap", label: "Roadmap", icon: "◈" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({
  processes,
  workItems,
  activeDestination,
  onNavigate,
  onSelectProcess,
  collapsed,
}: SidebarProps) {
  // Inbox badge count — action-required items
  const inboxCount = useMemo(
    () =>
      workItems.filter(
        (w) => w.status !== "completed" && w.status !== "cancelled",
      ).length,
    [workItems],
  );

  if (collapsed) {
    return (
      <div className="w-14 flex-shrink-0 border-r border-border bg-surface py-4 flex flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeDestination === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs transition-colors relative ${
                isActive
                  ? "bg-surface-raised text-text-primary font-medium shadow-[var(--shadow-subtle)]"
                  : "text-text-muted hover:bg-surface-raised/50 hover:text-text-primary"
              }`}
              title={item.label}
              style={isActive ? { borderLeft: "2px solid var(--vivid)" } : undefined}
            >
              {item.icon}
              {item.id === "inbox" && inboxCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-accent text-accent-text text-[9px] font-semibold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                  {inboxCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-border bg-surface overflow-y-auto">
      <div className="py-4 px-2 flex flex-col h-full">
        {NAV_ITEMS.filter((item) => item.id !== "settings").map((item) => {
          const isActive = activeDestination === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors mb-0.5 ${
                isActive
                  ? "text-text-primary font-medium"
                  : "text-text-secondary hover:bg-surface-raised/50"
              }`}
              style={isActive ? { borderLeft: "2px solid var(--vivid)" } : undefined}
            >
              <span className={`text-xs flex-shrink-0 ${isActive ? "text-[var(--vivid)]" : "text-text-muted"}`}>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.id === "inbox" && inboxCount > 0 && (
                <span className="bg-accent text-accent-text text-[10px] font-semibold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1.5">
                  {inboxCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Settings pushed to bottom */}
        <div className="mt-auto pt-3 border-t border-border">
          <button
            onClick={() => onNavigate("settings")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
              activeDestination === "settings"
                ? "text-text-primary font-medium"
                : "text-text-secondary hover:bg-surface-raised/50"
            }`}
            style={activeDestination === "settings" ? { borderLeft: "2px solid var(--vivid)" } : undefined}
          >
            <span className={`text-xs flex-shrink-0 ${activeDestination === "settings" ? "text-[var(--vivid)]" : "text-text-muted"}`}>
              ⚙
            </span>
            <span className="flex-1 truncate">Settings</span>
          </button>
        </div>

        {/* Quick access to routines — show process list under Routines when active */}
        {activeDestination === "routines" && processes.length > 0 && (
          <div className="pt-2 space-y-px">
            <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider px-3 mb-1">
              Your routines
            </p>
            {processes
              .filter((p) => !p.system && p.status === "active")
              .map((proc) => {
                const statusIcon =
                  proc.lastRunStatus === "failed" || proc.lastRunStatus === "rejected"
                    ? "⚠"
                    : proc.recentRunCount === 0
                      ? "→"
                      : "✓";
                const statusColor =
                  proc.lastRunStatus === "failed" || proc.lastRunStatus === "rejected"
                    ? "text-caution"
                    : proc.recentRunCount === 0
                      ? "text-text-muted"
                      : "text-positive";

                return (
                  <button
                    key={proc.id}
                    onClick={() => onSelectProcess(proc.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm hover:bg-surface-raised/50 transition-colors"
                  >
                    <span className={`text-xs flex-shrink-0 ${statusColor}`}>
                      {statusIcon}
                    </span>
                    <span className="truncate text-text-secondary text-[13px]">
                      {proc.name}
                    </span>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
