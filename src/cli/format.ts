/**
 * Agent OS — CLI Format Utilities
 *
 * Shared formatting for consistent CLI output.
 * Pattern: GitHub CLI Exporter interface for --json support.
 * Design: Designer spec output formatting principles — scannable, not verbose.
 */

import type { WorkItemType, WorkItemStatus, TrustTier } from "../db/schema";

// ============================================================
// Time formatting
// ============================================================

export function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================================
// Work item formatting (Designer spec: #ID Type Summary / Context | Process | Age)
// ============================================================

/** Map work item type to user-facing label (no implementation terms) */
export function workItemTypeLabel(type: WorkItemType): string {
  const labels: Record<WorkItemType, string> = {
    question: "Question",
    task: "Action",
    goal: "Goal",
    insight: "Insight",
    outcome: "Outcome",
  };
  return labels[type] || type;
}

/** Map work item status to user-facing label */
export function workItemStatusLabel(status: WorkItemStatus): string {
  const labels: Record<WorkItemStatus, string> = {
    intake: "New",
    routed: "Routed",
    in_progress: "In progress",
    waiting_human: "Waiting",
    completed: "Done",
    failed: "Failed",
  };
  return labels[status] || status;
}

/** Format a review-type work item line for status display */
export function formatWorkItemLine(item: {
  id: string;
  type: WorkItemType;
  content: string;
  processName?: string;
  createdAt: Date;
}): string {
  const shortId = item.id.slice(0, 8);
  const typeLabel = item.type === "task" ? "Review" : workItemTypeLabel(item.type);
  const summary = item.content.length > 60
    ? item.content.slice(0, 57) + "..."
    : item.content;
  const age = timeSince(item.createdAt);
  const process = item.processName ? ` | ${item.processName}` : "";
  return `  #${shortId}  ${typeLabel.padEnd(8)} ${summary}\n       ${process ? `Process: ${item.processName}` : "Unassigned"} | ${age}`;
}

// ============================================================
// Process health formatting
// ============================================================

/** Health indicator based on process state */
export function healthIndicator(status: string, hasIssues: boolean): string {
  if (hasIssues) return "\u26A0";  // ⚠
  if (status === "active") return "\u25CF";  // ●
  return "\u25CB";  // ○
}

/** Format trust tier for display (user-facing names) */
export function trustTierLabel(tier: TrustTier): string {
  const labels: Record<TrustTier, string> = {
    supervised: "supervised",
    spot_checked: "spot-checked",
    autonomous: "autonomous",
    critical: "critical",
  };
  return labels[tier] || tier;
}

export function formatProcessHealthLine(proc: {
  name: string;
  status: string;
  trustTier: TrustTier;
  runCount: number;
  hasIssues: boolean;
  issueText?: string;
}): string {
  const indicator = healthIndicator(proc.status, proc.hasIssues);
  const health = proc.hasIssues ? (proc.issueText || "issues") : "healthy";
  const tier = trustTierLabel(proc.trustTier);
  return `  ${proc.name.padEnd(18)} ${indicator} ${health.padEnd(10)} | ${tier.padEnd(12)} | ${proc.runCount} runs`;
}

// ============================================================
// Section headers
// ============================================================

export function sectionHeader(title: string, count?: number): string {
  const suffix = count !== undefined ? ` (${count})` : "";
  return `${title}${suffix}`;
}

export function separator(width: number = 60): string {
  return "\u2500".repeat(width);
}

// ============================================================
// JSON output helpers (GitHub CLI Exporter pattern)
// ============================================================

export function jsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
