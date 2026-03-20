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

/** Format a work item line for status display */
export function formatWorkItemLine(item: {
  id: string;
  type: WorkItemType;
  status: WorkItemStatus;
  content: string;
  processName?: string;
  createdAt: Date;
}): string {
  const shortId = item.id.slice(0, 8);
  // Distinguish action tasks (human steps waiting) from review tasks
  const typeLabel = item.status === "waiting_human"
    ? "Action"
    : item.type === "task"
      ? "Task"
      : workItemTypeLabel(item.type);
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
  isSystem?: boolean;
}): string {
  const indicator = healthIndicator(proc.status, proc.hasIssues);
  const health = proc.hasIssues ? (proc.issueText || "issues") : "healthy";
  const tier = trustTierLabel(proc.trustTier);
  const systemLabel = proc.isSystem ? " [system]" : "";
  return `  ${proc.name.padEnd(18)} ${indicator} ${health.padEnd(10)} | ${tier.padEnd(12)} | ${proc.runCount} runs${systemLabel}`;
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

// ============================================================
// Goal tree formatting (Brief 022)
// Unicode box-drawing for goal → task hierarchy.
// Provenance: GitHub CLI issue hierarchy, npm cli-tree patterns.
// ============================================================

/** Status marker for goal tree */
function taskStatusMarker(status: string): string {
  switch (status) {
    case "completed": return "\u2713"; // ✓
    case "in_progress": return "\u25CF"; // ●
    case "paused":
    case "waiting_human": return "\u23F8"; // ⏸
    case "failed": return "\u2717"; // ✗
    default: return "\u25CB"; // ○ (pending/intake)
  }
}

export interface GoalTreeTask {
  taskId: string;
  stepId: string;
  name: string;
  status: string;
  dependsOn: string[];
  routeAroundInfo?: string;
}

export interface GoalTreeData {
  goalId: string;
  goalContent: string;
  goalStatus: string;
  tasks: GoalTreeTask[];
  attentionNeeded: number;
}

/**
 * Format a goal tree for CLI display.
 *
 * Example output:
 *   GOAL: Build out Phase 5                    in progress
 *   ├── ✓ Research orchestrator patterns          complete
 *   ├── ● Design orchestrator UX                  running
 *   ├── ○ Write Phase 5 brief                     waiting (depends on Research, Design)
 *   └── ⏸ Build orchestrator                      paused
 *        └── Routed around — working on templates
 *
 *   Progress: 1/4 tasks complete
 *   Your attention needed: 1 item
 */
export function formatGoalTree(data: GoalTreeData): string {
  const lines: string[] = [];
  const goalMarker = taskStatusMarker(data.goalStatus);

  const goalSummary = data.goalContent.length > 50
    ? data.goalContent.slice(0, 47) + "..."
    : data.goalContent;
  lines.push(`  GOAL: ${goalSummary}${"".padEnd(Math.max(1, 45 - goalSummary.length))}${workItemStatusLabel(data.goalStatus as WorkItemStatus)}`);

  // Build task name lookup for dependency display
  const taskNameById = new Map<string, string>();
  for (const task of data.tasks) {
    taskNameById.set(task.taskId, task.name);
  }

  for (let i = 0; i < data.tasks.length; i++) {
    const task = data.tasks[i];
    const isLast = i === data.tasks.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500" : "\u251C\u2500\u2500"; // └── or ├──
    const marker = taskStatusMarker(task.status);

    // Build dependency info
    let depInfo = "";
    if (task.status === "intake" && task.dependsOn.length > 0) {
      const depNames = task.dependsOn
        .map((id) => taskNameById.get(id) || id.slice(0, 8))
        .join(", ");
      depInfo = ` (depends on ${depNames})`;
    }

    const statusLabel = task.status === "intake" ? "waiting" : task.status;
    lines.push(`  ${connector} ${marker} ${task.name.padEnd(35)} ${statusLabel}${depInfo}`);

    // Route-around info (AC 6)
    if (task.routeAroundInfo) {
      const indent = isLast ? "    " : "\u2502   "; // │ or space
      lines.push(`  ${indent}   \u2514\u2500\u2500 ${task.routeAroundInfo}`);
    }
  }

  // Summary lines (ACs 7-8)
  const completedCount = data.tasks.filter((t) => t.status === "completed").length;
  lines.push("");
  lines.push(`  Progress: ${completedCount}/${data.tasks.length} tasks complete`);

  if (data.attentionNeeded > 0) {
    lines.push(`  Your attention needed: ${data.attentionNeeded} item${data.attentionNeeded > 1 ? "s" : ""}`);
  }

  return lines.join("\n");
}

// ============================================================
// Escalation formatting (Brief 022)
// ============================================================

export interface EscalationData {
  type: "blocked" | "error" | "aggregate_uncertainty";
  reason: string;
  tasksCompleted?: number;
  tasksRemaining?: number;
  openQuestions?: string[];
  options?: string[];
}

/**
 * Format an orchestrator escalation message for CLI display.
 */
export function formatEscalation(data: EscalationData): string {
  const lines: string[] = [];
  const icon = data.type === "error" ? "\u26A0" : "\u23F8"; // ⚠ or ⏸

  const typeLabel = data.type === "blocked" ? "Orchestrator paused: missing input"
    : data.type === "error" ? "Orchestrator error"
    : "Orchestrator stopped: too much uncertainty";

  lines.push(`  ${icon} ${typeLabel}`);
  lines.push("");
  lines.push(`  ${data.reason}`);

  if (data.tasksCompleted !== undefined && data.tasksRemaining !== undefined) {
    lines.push("");
    lines.push(`  Completed: ${data.tasksCompleted} tasks`);
    lines.push(`  Remaining: ${data.tasksRemaining} tasks`);
  }

  if (data.openQuestions && data.openQuestions.length > 0) {
    lines.push("");
    lines.push("  Open questions:");
    for (const q of data.openQuestions) {
      lines.push(`    \u2022 ${q}`);
    }
  }

  return lines.join("\n");
}
