"use client";

/**
 * Ditto — Sidebar Navigation
 *
 * Urgency-first grouping:
 * - Home (feed view)
 * - To Review (action-required items with count) — hidden when empty
 * - Running (healthy recurring processes) — hidden when empty
 * - How It Works (placeholder)
 *
 * Redesign AC4: Action-required first with count, then running.
 * Redesign AC5: System processes never appear.
 *
 * Provenance: workspace-layout-redesign-ux.md, P13 prototype.
 */

import { useMemo } from "react";
import type { ProcessSummary, WorkItemSummary } from "@/lib/process-query";

interface SidebarProps {
  processes: ProcessSummary[];
  workItems: WorkItemSummary[];
  selectedProcessId: string | null;
  onSelectProcess: (processId: string) => void;
  onGoHome?: () => void;
  collapsed?: boolean;
}

export function Sidebar({
  processes,
  workItems,
  selectedProcessId,
  onSelectProcess,
  onGoHome,
  collapsed,
}: SidebarProps) {
  // Non-system domain processes
  const domainProcesses = useMemo(
    () => processes.filter((p) => !p.system && p.status === "active"),
    [processes],
  );

  // Action-required items (needs review, waiting, in progress)
  const actionItems = useMemo(
    () =>
      workItems.filter(
        (w) => w.status !== "completed" && w.status !== "cancelled",
      ),
    [workItems],
  );

  const hasActions = actionItems.length > 0;
  const hasRunning = domainProcesses.length > 0;

  if (collapsed) {
    return (
      <div className="w-14 flex-shrink-0 border-r border-border bg-surface py-4 flex flex-col items-center gap-2">
        {/* Home */}
        <button
          onClick={onGoHome}
          className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center hover:bg-accent/20 transition-colors mb-2"
          title="Home"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-accent" />
        </button>

        {/* Action count badge */}
        {hasActions && (
          <div
            className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-xs font-medium text-accent-text"
            title={`${actionItems.length} to review`}
          >
            {actionItems.length}
          </div>
        )}

        {/* Process initials */}
        {domainProcesses.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectProcess(p.id)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
              selectedProcessId === p.id
                ? "bg-accent text-accent-text"
                : "bg-surface-raised text-text-secondary hover:text-text-primary"
            }`}
            title={p.name}
          >
            {p.name.charAt(0).toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-56 flex-shrink-0 border-r border-border bg-surface overflow-y-auto">
      <div className="py-4 px-2 space-y-1">
        {/* Home link */}
        <button
          onClick={onGoHome}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
            selectedProcessId === null
              ? "bg-surface-raised text-text-primary font-medium shadow-[var(--shadow-subtle)]"
              : "text-text-secondary hover:bg-surface-raised/50"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
          Home
        </button>

        {/* To Review — hidden when empty (AC4) */}
        {hasActions && (
          <div className="pt-4">
            <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wider px-3 mb-1 flex items-center justify-between">
              <span>To review</span>
              <span className="bg-accent text-accent-text text-[10px] font-semibold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1.5">
                {actionItems.length}
              </span>
            </h3>
            <div className="space-y-px">
              {actionItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    item.assignedProcess && onSelectProcess(item.assignedProcess)
                  }
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm hover:bg-surface-raised/50 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  <span className="truncate text-text-primary text-[13px]">
                    {item.content.length > 35
                      ? item.content.slice(0, 35) + "..."
                      : item.content}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Running — hidden when empty */}
        {hasRunning && (
          <div className="pt-4">
            <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wider px-3 mb-1">
              Running
            </h3>
            <div className="space-y-px">
              {domainProcesses.map((p) => {
                const isSelected = selectedProcessId === p.id;
                const statusIcon =
                  p.lastRunStatus === "failed" || p.lastRunStatus === "rejected"
                    ? "⚠"
                    : p.recentRunCount === 0
                      ? "→"
                      : "✓";
                const statusColor =
                  p.lastRunStatus === "failed" || p.lastRunStatus === "rejected"
                    ? "text-caution"
                    : p.recentRunCount === 0
                      ? "text-text-muted"
                      : "text-positive";

                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectProcess(p.id)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-surface-raised shadow-[var(--shadow-subtle)]"
                        : "hover:bg-surface-raised/50"
                    }`}
                  >
                    <span className={`text-xs flex-shrink-0 ${statusColor}`}>
                      {statusIcon}
                    </span>
                    <span
                      className={`truncate flex-1 text-[13px] ${
                        isSelected
                          ? "text-text-primary font-medium"
                          : "text-text-secondary"
                      }`}
                    >
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
