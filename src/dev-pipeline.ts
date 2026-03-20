#!/usr/bin/env tsx
/**
 * Dev Pipeline — Orchestrator Script
 *
 * Chains dev roles via `claude -p` with review gates between each.
 * Supports terminal-only mode and Telegram bot integration.
 *
 * Usage:
 *   pnpm dev-pipeline "Build Phase 4"    — start a new pipeline
 *   pnpm dev-pipeline --resume           — resume from last checkpoint
 *   pnpm dev-pipeline --status           — show current pipeline status
 *
 * Provenance:
 *   - claude -p subprocess orchestration: Original
 *   - Orchestrator-worker pattern: Anthropic multi-agent research
 *   - Suspend/resume: Mastra snapshot pattern
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  createSession,
  loadSession,
  saveSession,
  buildContextPreamble,
  shouldWarnContextSize,
  saveRoleOutput,
  formatStatus,
  formatRoleList,
  formatTransitionBanner,
  type DevSession,
  type RoleState,
} from "./dev-session.js";

// --- Role contract loading ---

const COMMANDS_DIR = join(process.cwd(), ".claude", "commands");

export function loadRoleContract(roleName: string): string {
  const filepath = join(COMMANDS_DIR, `${roleName}.md`);
  if (!existsSync(filepath)) {
    throw new Error(`Role contract not found: ${filepath}`);
  }
  return readFileSync(filepath, "utf-8");
}

/**
 * Tool sets per role — ensures each role CAN do what its contract says.
 * Read-only roles get read tools. Producing roles get write tools.
 * Agent tool enables spawning reviewers (architect, builder need this).
 */
const ROLE_TOOLS: Record<string, string[]> = {
  "dev-pm":          ["Read", "Grep", "Glob", "Write", "Edit"],
  "dev-researcher":  ["Read", "Grep", "Glob", "Write", "WebSearch", "WebFetch"],
  "dev-designer":    ["Read", "Grep", "Glob", "Write", "WebSearch", "WebFetch"],
  "dev-architect":   ["Read", "Grep", "Glob", "Write", "Edit", "Agent"],
  "dev-builder":     ["Read", "Grep", "Glob", "Write", "Edit", "Bash", "Agent"],
  "dev-reviewer":    ["Read", "Grep", "Glob"],
  "dev-documenter":  ["Read", "Grep", "Glob", "Write", "Edit"],
};

export function getToolsForRole(roleName: string): string[] | undefined {
  return ROLE_TOOLS[roleName];
}

// --- Claude -p execution ---

interface ClaudeResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface ClaudeOptions {
  /** Append to the default system prompt (preserves CLAUDE.md) */
  systemPromptAppend?: string;
  /** Resume a specific session (for conversation continuity) */
  resumeSessionId?: string;
  /** Use a specific session ID (for first message in a conversation) */
  sessionId?: string;
  /** Model override (e.g., "opus" for parity with Claude Code) */
  model?: string;
  /** Disable session persistence (true for pipeline roles, false for chat) */
  noSessionPersistence?: boolean;
  /** Allowed tools — controls what Claude can do (default: all tools) */
  allowedTools?: string[];
}

export function runClaude(prompt: string, optsOrSystemPrompt: string | ClaudeOptions = {}): Promise<ClaudeResult> {
  // Backwards compat: if string passed, treat as systemPromptAppend
  const opts: ClaudeOptions = typeof optsOrSystemPrompt === "string"
    ? { systemPromptAppend: optsOrSystemPrompt, noSessionPersistence: true }
    : optsOrSystemPrompt;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const args = [
      "-p",
      "--output-format",
      "text",
      "--dangerously-skip-permissions",
    ];

    if (opts.systemPromptAppend) {
      args.push("--append-system-prompt", opts.systemPromptAppend);
    }
    if (opts.noSessionPersistence) {
      args.push("--no-session-persistence");
    }
    if (opts.resumeSessionId) {
      args.push("--resume", opts.resumeSessionId);
    }
    if (opts.sessionId) {
      args.push("--session-id", opts.sessionId);
    }
    if (opts.model) {
      args.push("--model", opts.model);
    }
    if (opts.allowedTools && opts.allowedTools.length > 0) {
      args.push("--allowedTools", ...opts.allowedTools);
    }

    args.push(prompt);

    const child = spawn("claude", args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on("close", (code) => {
      resolve({
        output: stdout,
        exitCode: code ?? 1,
        durationMs: Date.now() - start,
      });
    });
  });
}

// --- Terminal interaction ---

function askTerminal(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function formatRemainingRoles(session: DevSession): string {
  const remaining = session.roles
    .slice(session.currentRoleIndex + 1)
    .filter((r) => r.status === "pending");
  if (remaining.length === 0) return "";
  return remaining
    .map((r) => r.name.replace("dev-", ""))
    .join(", ");
}

async function terminalReviewGate(
  session: DevSession,
  completedRole: RoleState,
  nextRole?: RoleState
): Promise<GateDecision> {
  console.log("\n" + formatTransitionBanner(completedRole, nextRole));
  console.log("");

  if (shouldWarnContextSize(session)) {
    console.log(
      `⚠️  Context preamble at ${Math.round(session.contextSizeBytes / 1024)}KB. Consider starting a fresh session after this gate.`
    );
    console.log("");
  }

  const remaining = formatRemainingRoles(session);

  while (true) {
    const answer = await askTerminal(
      `[a]pprove  [r]eject  [f]eedback  [s]kip to...  [q]uit\n${remaining ? `Remaining: ${remaining}\n` : ""}> `
    );
    const lower = answer.toLowerCase();
    switch (lower) {
      case "a":
      case "approve":
        return { action: "approve" };
      case "r":
      case "reject":
        return { action: "reject" };
      case "f":
      case "feedback":
        return { action: "feedback" };
      case "q":
      case "quit":
        return { action: "quit" };
      case "s":
      case "skip": {
        const target = await askTerminal(
          `Skip to which role? (${remaining})\n> `
        );
        const roleName = `dev-${target.toLowerCase().trim()}`;
        const idx = session.roles.findIndex((r) => r.name === roleName);
        if (idx === -1 || idx <= session.currentRoleIndex) {
          console.log(`Unknown or already-completed role: ${target}`);
          continue;
        }
        return { action: "skipto", roleName };
      }
      default:
        // Check if they typed a role name directly (e.g., "builder")
        const directRole = `dev-${lower.trim()}`;
        const directIdx = session.roles.findIndex((r) => r.name === directRole);
        if (directIdx > session.currentRoleIndex) {
          return { action: "skipto", roleName: directRole };
        }
        console.log("Please enter a, r, f, s, or q (or type a role name to skip to it).");
    }
  }
}

// --- Review gate handler interface ---

export type GateDecision =
  | { action: "approve" }
  | { action: "reject" }
  | { action: "feedback" }
  | { action: "quit" }
  | { action: "skipto"; roleName: string };

export interface ReviewGateHandler {
  onRoleStart(session: DevSession, role: RoleState): Promise<void>;
  onRoleComplete(
    session: DevSession,
    role: RoleState,
    nextRole?: RoleState
  ): Promise<GateDecision>;
  onFeedbackRequest(session: DevSession, roleName: string): Promise<string>;
  onRoleError(
    session: DevSession,
    role: RoleState,
    error: string
  ): Promise<"retry" | "skip" | "quit">;
  onPipelineComplete(session: DevSession): Promise<void>;
  onContextWarning(session: DevSession): Promise<void>;
}

// --- Terminal gate handler ---

const terminalHandler: ReviewGateHandler = {
  async onRoleStart(session, role) {
    const label = role.name.replace("dev-", "");
    console.log(`\nRunning ${label}...\n`);
  },

  async onRoleComplete(session, role, nextRole) {
    return terminalReviewGate(session, role, nextRole);
  },

  async onFeedbackRequest(_session, _roleName) {
    return askTerminal("Feedback: ");
  },

  async onRoleError(_session, role, error) {
    const label = role.name.replace("dev-", "");
    console.log(`\n❌ ${label} failed: ${error}`);
    while (true) {
      const answer = await askTerminal("[r]etry  [s]kip  [q]uit\n> ");
      switch (answer.toLowerCase()) {
        case "r":
        case "retry":
          return "retry";
        case "s":
        case "skip":
          return "skip";
        case "q":
        case "quit":
          return "quit";
        default:
          console.log("Please enter r, s, or q.");
      }
    }
  },

  async onPipelineComplete(session) {
    console.log("\n✅ Pipeline complete!\n");
    console.log(formatRoleList(session));
  },

  async onContextWarning(session) {
    console.log(
      `\n⚠️  Context preamble at ${Math.round(session.contextSizeBytes / 1024)}KB (~${Math.round(session.contextSizeBytes / 4)}  tokens). Recommend starting a fresh session after this gate.`
    );
  },
};

// --- Pipeline execution ---

async function executeRole(
  session: DevSession,
  roleState: RoleState,
  handler: ReviewGateHandler
): Promise<boolean> {
  roleState.status = "running";
  roleState.startedAt = new Date().toISOString();
  saveSession(session);

  await handler.onRoleStart(session, roleState);

  const roleContract = loadRoleContract(roleState.name);
  const preamble = buildContextPreamble(session);

  const prompt = `${preamble}\n\nYou are being invoked as part of an automated dev pipeline. Complete your role and produce your output. When done, summarize what you produced in 2-3 sentences at the end of your response, prefixed with "SUMMARY:".`;

  try {
    const result = await runClaude(prompt, {
      systemPromptAppend: roleContract,
      model: "opus",
      noSessionPersistence: true,
    });

    if (result.exitCode !== 0) {
      roleState.status = "failed";
      roleState.error = `claude -p exited with code ${result.exitCode}`;
      roleState.durationMs = result.durationMs;
      saveSession(session);
      return false;
    }

    roleState.status = "completed";
    roleState.durationMs = result.durationMs;
    roleState.completedAt = new Date().toISOString();

    // Save output to file
    roleState.outputFile = saveRoleOutput(session, roleState.name, result.output);

    // Extract summary if present
    const summaryMatch = result.output.match(/SUMMARY:\s*([\s\S]*?)$/i);
    if (summaryMatch) {
      roleState.outputSummary = summaryMatch[1].trim().slice(0, 500);
    } else {
      roleState.outputSummary = result.output.slice(-300).trim();
    }

    saveSession(session);
    return true;
  } catch (err) {
    roleState.status = "failed";
    roleState.error = err instanceof Error ? err.message : String(err);
    roleState.durationMs = Date.now() - new Date(roleState.startedAt).getTime();
    saveSession(session);
    return false;
  }
}

export async function runPipeline(
  session: DevSession,
  handler: ReviewGateHandler
): Promise<void> {
  while (session.currentRoleIndex < session.roles.length) {
    const roleState = session.roles[session.currentRoleIndex];
    const nextRole = session.roles[session.currentRoleIndex + 1];

    // Skip already completed roles (for resume)
    if (roleState.status === "completed" || roleState.status === "skipped") {
      session.currentRoleIndex++;
      saveSession(session);
      continue;
    }

    // Execute the role
    const success = await executeRole(session, roleState, handler);

    if (!success) {
      // Role failed — ask what to do
      const errorAction = await handler.onRoleError(
        session,
        roleState,
        roleState.error ?? "Unknown error"
      );

      if (errorAction === "retry") {
        roleState.status = "pending";
        roleState.error = undefined;
        saveSession(session);
        continue;
      } else if (errorAction === "skip") {
        roleState.status = "skipped";
        session.currentRoleIndex++;
        saveSession(session);
        continue;
      } else {
        session.status = "paused";
        saveSession(session);
        return;
      }
    }

    // Role completed — checkpoint and review gate
    session.status = "gate";
    saveSession(session);

    // Context size warning
    if (shouldWarnContextSize(session)) {
      await handler.onContextWarning(session);
    }

    const decision = await handler.onRoleComplete(session, roleState, nextRole);

    switch (decision.action) {
      case "approve":
        session.gatesApproved++;
        session.currentRoleIndex++;
        session.status = "running";
        saveSession(session);
        break;

      case "feedback": {
        const feedbackText = await handler.onFeedbackRequest(
          session,
          nextRole?.name ?? roleState.name
        );
        const targetRole = nextRole?.name ?? roleState.name;
        session.feedback[targetRole] = feedbackText;
        session.feedbackRounds++;
        session.gatesApproved++;
        session.currentRoleIndex++;
        session.status = "running";
        saveSession(session);
        console.log("✓ Feedback captured. Continuing...");
        break;
      }

      case "skipto": {
        // Skip intermediate roles, jump to the target
        const targetIdx = session.roles.findIndex(
          (r) => r.name === decision.roleName
        );
        if (targetIdx > session.currentRoleIndex) {
          // Mark skipped roles
          for (let i = session.currentRoleIndex + 1; i < targetIdx; i++) {
            session.roles[i].status = "skipped";
          }
          session.gatesApproved++;
          session.currentRoleIndex = targetIdx;
          session.status = "running";
          const skipped = targetIdx - (session.currentRoleIndex + 1);
          console.log(
            `✓ Skipping to ${decision.roleName.replace("dev-", "")}${skipped > 0 ? ` (${skipped} roles skipped)` : ""}`
          );
        } else {
          session.currentRoleIndex++;
        }
        saveSession(session);
        break;
      }

      case "reject":
        session.status = "paused";
        saveSession(session);
        console.log(
          "Pipeline paused. Fix the issue and run with --resume to continue."
        );
        return;

      case "quit":
        session.status = "paused";
        saveSession(session);
        console.log("Pipeline paused. Run with --resume to continue.");
        return;
    }
  }

  session.status = "completed";
  saveSession(session);
  await handler.onPipelineComplete(session);
}

// --- CLI entry point ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--status")) {
    const session = loadSession();
    if (!session) {
      console.log("No active pipeline. Start one with: pnpm dev-pipeline \"<task>\"");
      return;
    }
    console.log(formatStatus(session));
    console.log("");
    console.log(formatRoleList(session));
    return;
  }

  if (args.includes("--resume")) {
    const session = loadSession();
    if (!session) {
      console.log("No session to resume.");
      return;
    }
    if (session.status === "completed") {
      console.log("Pipeline already completed.");
      console.log(formatRoleList(session));
      return;
    }
    // Reset failed or interrupted role to pending for retry
    const currentRole = session.roles[session.currentRoleIndex];
    if (currentRole?.status === "failed" || currentRole?.status === "running") {
      currentRole.status = "pending";
      currentRole.error = undefined;
    }
    session.status = "running";
    saveSession(session);
    console.log(`Resuming pipeline: ${session.taskDescription}`);
    console.log(`Continuing from: ${currentRole?.name ?? "unknown"}\n`);
    await runPipeline(session, terminalHandler);
    return;
  }

  // New pipeline
  const taskDescription = args.filter((a) => !a.startsWith("--")).join(" ");
  if (!taskDescription) {
    console.log("Usage:");
    console.log('  pnpm dev-pipeline "Build Phase 4"    — start a new pipeline');
    console.log("  pnpm dev-pipeline --resume           — resume from checkpoint");
    console.log("  pnpm dev-pipeline --status           — show current status");
    return;
  }

  const existing = loadSession();
  if (existing && existing.status !== "completed") {
    console.log(`Active pipeline exists: "${existing.taskDescription}"`);
    console.log("Use --resume to continue or delete data/dev-session.json to start fresh.");
    return;
  }

  const session = createSession(taskDescription);
  console.log(`Starting dev pipeline: ${taskDescription}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await runPipeline(session, terminalHandler);
}

// Only run CLI when executed directly, not when imported
const isDirectExecution =
  process.argv[1]?.endsWith("dev-pipeline.ts") ||
  process.argv[1]?.endsWith("dev-pipeline.js");

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Pipeline error:", err);
    process.exit(1);
  });
}
