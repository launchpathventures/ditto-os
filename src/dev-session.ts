/**
 * Dev Pipeline — Session State Management
 *
 * Manages pipeline state, checkpoints, and role output files.
 * Shared between the orchestrator (dev-pipeline.ts) and the Telegram bot (dev-bot.ts).
 *
 * Provenance: Mastra snapshot pattern (serialize state, resume from checkpoint).
 * File-based persistence — sessions survive process restarts.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// --- Types ---

export type RoleStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface RoleState {
  name: string;
  status: RoleStatus;
  outputFile?: string;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export type PipelineStatus =
  | "running"
  | "gate"
  | "paused"
  | "completed"
  | "failed";

export interface DevSession {
  id: string;
  taskDescription: string;
  roles: RoleState[];
  currentRoleIndex: number;
  status: PipelineStatus;
  startedAt: string;
  updatedAt: string;
  feedback: Record<string, string>;
  contextSizeBytes: number;
  gatesApproved: number;
  feedbackRounds: number;
  pinnedMessageId?: number;
}

// --- Constants ---

const DATA_DIR = join(process.cwd(), "data");
const SESSION_FILE = join(DATA_DIR, "dev-session.json");
const SESSIONS_DIR = join(DATA_DIR, "sessions");

/** Warn when accumulated context exceeds ~100KB (~25K tokens) */
export const CONTEXT_WARN_BYTES = 100_000;

/** Default role sequence for the dev pipeline */
export const DEFAULT_ROLES: string[] = [
  "dev-pm",
  "dev-researcher",
  "dev-designer",
  "dev-architect",
  "dev-builder",
  "dev-reviewer",
  "dev-documenter",
];

// --- Session CRUD ---

export function createSession(taskDescription: string): DevSession {
  const session: DevSession = {
    id: randomUUID().slice(0, 8),
    taskDescription,
    roles: DEFAULT_ROLES.map((name) => ({ name, status: "pending" })),
    currentRoleIndex: 0,
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    feedback: {},
    contextSizeBytes: 0,
    gatesApproved: 0,
    feedbackRounds: 0,
  };
  saveSession(session);
  return session;
}

export function loadSession(): DevSession | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const raw = readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as DevSession;
  } catch {
    return null;
  }
}

export function saveSession(session: DevSession): void {
  session.updatedAt = new Date().toISOString();
  ensureDir(DATA_DIR);
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

export function clearSession(): void {
  if (existsSync(SESSION_FILE)) {
    unlinkSync(SESSION_FILE);
  }
}

// --- Role Output Files ---

export function sessionDir(session: DevSession): string {
  const dir = join(SESSIONS_DIR, session.id);
  ensureDir(dir);
  return dir;
}

export function saveRoleOutput(
  session: DevSession,
  roleName: string,
  output: string
): string {
  const dir = sessionDir(session);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${roleName}-${timestamp}.md`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, output, "utf-8");
  return filepath;
}

// --- Context Assembly ---

/**
 * Build the context preamble for the next role.
 * Includes: task description, prior role outputs (as file references), feedback.
 */
export function buildContextPreamble(session: DevSession): string {
  const parts: string[] = [];

  parts.push(`# Dev Pipeline Task\n\n${session.taskDescription}\n`);

  // Prior role outputs
  const completedRoles = session.roles.filter(
    (r) => r.status === "completed" && r.outputFile
  );
  if (completedRoles.length > 0) {
    parts.push("## Prior Role Outputs\n");
    for (const role of completedRoles) {
      const label = role.name.replace("dev-", "").toUpperCase();
      parts.push(`### ${label}`);
      if (role.outputSummary) {
        parts.push(role.outputSummary);
      }
      parts.push(`Full output: ${role.outputFile}\n`);
    }
  }

  // Feedback for the current role
  const currentRole = session.roles[session.currentRoleIndex];
  if (currentRole) {
    const fb = session.feedback[currentRole.name];
    if (fb) {
      parts.push(
        `## Human Feedback for ${currentRole.name}\n\n${fb}\n\nIncorporate this feedback into your work.\n`
      );
    }
  }

  const preamble = parts.join("\n");
  session.contextSizeBytes = Buffer.byteLength(preamble, "utf-8");
  return preamble;
}

/**
 * Check if context size warrants a fresh session warning.
 */
export function shouldWarnContextSize(session: DevSession): boolean {
  return session.contextSizeBytes >= CONTEXT_WARN_BYTES;
}

// --- Status Formatting ---

export function formatStatus(session: DevSession): string {
  const lines: string[] = [];
  lines.push(`📌 Agent OS Dev Pipeline`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

  const current = session.roles[session.currentRoleIndex];
  if (current) {
    const label = current.name.replace("dev-", "");
    lines.push(
      `Phase: ${session.taskDescription.slice(0, 40)} (${label} → ${current.status})`
    );
  }

  lines.push(`Status: ${statusEmoji(session.status)} ${session.status}`);
  lines.push(
    `Pending review: ${session.status === "gate" ? 1 : 0}`
  );
  lines.push(
    `Today: ${session.gatesApproved} gate${session.gatesApproved !== 1 ? "s" : ""} approved, ${session.feedbackRounds} feedback round${session.feedbackRounds !== 1 ? "s" : ""}`
  );

  const lastCompleted = [...session.roles]
    .reverse()
    .find((r) => r.status === "completed");
  if (lastCompleted?.completedAt) {
    const ago = timeAgo(new Date(lastCompleted.completedAt));
    lines.push(
      `\nLast action: ${lastCompleted.name.replace("dev-", "")} completed (${ago})`
    );
  }

  return lines.join("\n");
}

export function formatRoleList(session: DevSession): string {
  return session.roles
    .map((r) => {
      const icon =
        r.status === "completed"
          ? "✓"
          : r.status === "running"
            ? "⏳"
            : r.status === "failed"
              ? "✗"
              : "○";
      const label = r.name.replace("dev-", "");
      const suffix =
        r.status === "completed" && r.durationMs
          ? ` (${Math.round(r.durationMs / 1000)}s)`
          : r.status === "running"
            ? ` (running)`
            : "";
      return `  ${icon} ${label}${suffix}`;
    })
    .join("\n");
}

export function formatTransitionBanner(
  role: RoleState,
  nextRole?: RoleState
): string {
  const label = role.name.replace("dev-", "").toUpperCase();
  const duration = role.durationMs
    ? `${Math.round(role.durationMs / 1000)}s`
    : "unknown";

  const lines: string[] = [];
  lines.push(`━━━ ✓ ${label} COMPLETE ━━━━━━━━━━━━━━`);
  if (role.outputSummary) {
    lines.push(role.outputSummary);
  }
  lines.push(`Duration: ${duration}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (nextRole) {
    const nextLabel = nextRole.name.replace("dev-", "");
    lines.push(`\n📋 ${nextLabel} is next.`);
  }

  return lines.join("\n");
}

// --- Helpers ---

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function statusEmoji(status: PipelineStatus): string {
  switch (status) {
    case "running":
      return "⏳";
    case "gate":
      return "🔔";
    case "paused":
      return "⏸";
    case "completed":
      return "✅";
    case "failed":
      return "❌";
  }
}

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
