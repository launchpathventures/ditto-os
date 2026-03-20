#!/usr/bin/env tsx
/**
 * Dev Pipeline — Telegram Bot
 *
 * Mobile review surface for the dev pipeline orchestrator.
 * Sends review gate notifications with inline keyboards.
 * Supports /start, /status commands and feedback capture.
 *
 * Usage:
 *   pnpm dev-bot    — start the Telegram bot (long-polling)
 *
 * Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
 *
 * Provenance:
 *   - Telegram Bot API: inline keyboards, pinned messages, long-polling
 *   - Review gate UX: ADR-010 workspace interaction model
 */

import "dotenv/config";
import crypto from "node:crypto";
import { Bot, InlineKeyboard, type Context } from "grammy";
import {
  createSession,
  loadSession,
  saveSession,
  formatStatus,
  formatRoleList,
  formatTransitionBanner,
  shouldWarnContextSize,
  type DevSession,
  type RoleState,
} from "./dev-session.js";
import { runPipeline, runClaude, loadRoleContract, getToolsForRole, type ReviewGateHandler, type GateDecision } from "./dev-pipeline.js";

// --- Config ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set in .env");
  process.exit(1);
}

// Chat ID: explicit from env, or auto-locked on first message
let chatId: number | null = process.env.TELEGRAM_CHAT_ID
  ? Number(process.env.TELEGRAM_CHAT_ID)
  : null;

/** Get chat ID, guaranteed non-null after auth middleware runs */
function getChatId(): number {
  if (chatId === null) throw new Error("Chat ID not set — no messages received yet");
  return chatId;
}

// --- Bot setup ---

const bot = new Bot(BOT_TOKEN);

// Auth middleware — lock to first chat, reject all others
bot.use(async (ctx, next) => {
  const incomingId = ctx.chat?.id;
  if (!incomingId) return;

  if (chatId === null) {
    chatId = incomingId;
    console.log(`Auto-locked to chat ID: ${chatId}`);
    // Send welcome + pinned status on first contact
    sendStartupStatus().catch(() => {});
  }

  if (incomingId !== chatId) return;

  console.log(`[bot] received: ${ctx.message?.text ?? ctx.callbackQuery?.data ?? "(unknown)"}`);
  await next();
});

// Catch errors so the bot doesn't silently die
bot.catch((err) => {
  console.error("[bot] error:", err);
});

// --- State for pending review gates ---

interface PendingGate {
  resolve: (value: GateDecision) => void;
  session: DevSession;
  completedRole: RoleState;
  nextRole?: RoleState;
}

interface PendingFeedback {
  resolve: (value: string) => void;
  roleName: string;
}

interface PendingError {
  resolve: (value: "retry" | "skip" | "quit") => void;
}

let pendingGate: PendingGate | null = null;
/** Persistent session ID for free-text chat — maintains conversation continuity */
let chatSessionId: string | null = null;
let pendingFeedback: PendingFeedback | null = null;
let pendingError: PendingError | null = null;
let pinnedMessageId: number | null = null;

// --- Pinned status message ---

async function updatePinnedMessage(session: DevSession): Promise<void> {
  const text = formatStatus(session);

  try {
    if (pinnedMessageId) {
      await bot.api.editMessageText(getChatId(), pinnedMessageId, text);
    } else {
      const msg = await bot.api.sendMessage(getChatId(), text);
      pinnedMessageId = msg.message_id;
      session.pinnedMessageId = pinnedMessageId;
      saveSession(session);
      try {
        await bot.api.pinChatMessage(getChatId(), pinnedMessageId);
      } catch {
        // May fail in private chats or without pin permission — non-critical
      }
    }
  } catch {
    // Edit may fail if text unchanged — ignore
  }
}

// --- Telegram gate handler ---

const telegramHandler: ReviewGateHandler = {
  async onRoleStart(session, role) {
    await updatePinnedMessage(session);
  },

  async onRoleComplete(session, completedRole, nextRole) {
    await updatePinnedMessage(session);

    // Send transition banner
    const banner = formatTransitionBanner(completedRole, nextRole);
    await bot.api.sendMessage(getChatId(), banner);

    // Build inline keyboard with skip options for remaining roles
    const keyboard = new InlineKeyboard()
      .text("Approve ✓", "gate:approve")
      .text("Reject ✗", "gate:reject")
      .row()
      .text("Feedback 💬", "gate:feedback")
      .text("Desk 🖥", "gate:desk");

    // Add skip-to buttons for roles after the next one
    const remaining = session.roles
      .slice(session.currentRoleIndex + 2) // +2 = skip "next" (approve does that)
      .filter((r) => r.status === "pending");
    if (remaining.length > 0) {
      keyboard.row();
      for (const r of remaining) {
        const label = r.name.replace("dev-", "");
        keyboard.text(`⏭ ${label}`, `gate:skipto:${r.name}`);
      }
    }

    const nextLabel = nextRole
      ? nextRole.name.replace("dev-", "")
      : "pipeline completion";

    await bot.api.sendMessage(
      getChatId(),
      `Ready for review. Next: ${nextLabel}`,
      { reply_markup: keyboard }
    );

    // Wait for user response
    return new Promise<GateDecision>((resolve) => {
      pendingGate = { resolve, session, completedRole, nextRole };
    });
  },

  async onFeedbackRequest(session, roleName) {
    await bot.api.sendMessage(
      getChatId(),
      `What feedback should ${roleName.replace("dev-", "")} receive?`
    );

    return new Promise<string>((resolve) => {
      pendingFeedback = { resolve, roleName };
    });
  },

  async onRoleError(session, role, error) {
    await updatePinnedMessage(session);

    const label = role.name.replace("dev-", "");
    const keyboard = new InlineKeyboard()
      .text("Retry 🔄", "error:retry")
      .text("Skip ⏭", "error:skip")
      .text("Quit ⏹", "error:quit");

    await bot.api.sendMessage(
      getChatId(),
      `❌ ${label} failed: ${error}`,
      { reply_markup: keyboard }
    );

    return new Promise<"retry" | "skip" | "quit">((resolve) => {
      pendingError = { resolve };
    });
  },

  async onPipelineComplete(session) {
    await updatePinnedMessage(session);
    const summary = formatRoleList(session);
    await bot.api.sendMessage(getChatId(), `✅ Pipeline complete!\n\n${summary}`);
  },

  async onContextWarning(session) {
    await bot.api.sendMessage(
      getChatId(),
      `⚠️ Context preamble at ~${Math.round(session.contextSizeBytes / 1024)}KB. Recommend starting fresh after this gate.`
    );
  },
};


// --- Callback query handlers ---

bot.callbackQuery(/^gate:(.+)$/, async (ctx) => {
  const action = ctx.match![1];
  await ctx.answerCallbackQuery();

  if (!pendingGate) {
    await ctx.reply("No pending review gate.");
    return;
  }

  if (action === "approve") {
    await ctx.reply("✓ Approved. Continuing pipeline...");
    pendingGate.resolve({ action: "approve" });
    pendingGate = null;
  } else if (action === "reject") {
    await ctx.reply("✗ Rejected. Pipeline paused.");
    pendingGate.resolve({ action: "reject" });
    pendingGate = null;
  } else if (action === "feedback") {
    pendingGate.resolve({ action: "feedback" });
    pendingGate = null;
  } else if (action === "desk") {
    await ctx.reply("🖥 Deferred to desktop. Pipeline paused.");
    pendingGate.resolve({ action: "quit" });
    pendingGate = null;
  } else if (action.startsWith("skipto:")) {
    const roleName = action.replace("skipto:", "");
    const label = roleName.replace("dev-", "");
    await ctx.reply(`⏭ Skipping to ${label}...`);
    pendingGate.resolve({ action: "skipto", roleName });
    pendingGate = null;
  }
});

bot.callbackQuery(/^error:(.+)$/, async (ctx) => {
  const action = ctx.match![1] as "retry" | "skip" | "quit";
  await ctx.answerCallbackQuery();

  if (!pendingError) {
    await ctx.reply("No pending error decision.");
    return;
  }

  pendingError.resolve(action);
  pendingError = null;

  const labels = { retry: "🔄 Retrying...", skip: "⏭ Skipping...", quit: "⏹ Pipeline paused." };
  await ctx.reply(labels[action]);
});

// --- Command handlers (MUST be registered before message:text) ---

bot.command("start", async (ctx) => {
  const description = ctx.match;
  if (!description) {
    await ctx.reply(
      "Usage: /start <task description>\nExample: /start Build Phase 4"
    );
    return;
  }

  const existing = loadSession();
  if (existing && existing.status !== "completed") {
    await ctx.reply(
      `Active pipeline: "${existing.taskDescription}"\nUse /resume to continue.`
    );
    return;
  }

  const session = createSession(description);
  pinnedMessageId = null;
  // Chat session stays alive — pipeline runs independently
  await ctx.reply(
    `Starting dev pipeline for: ${description}\nFirst role: PM (reading state.md, roadmap.md)\nWill notify when PM has a recommendation.`
  );

  // Run pipeline asynchronously
  runPipeline(session, telegramHandler).catch(async (err) => {
    await bot.api.sendMessage(
      getChatId(),
      `❌ Pipeline error: ${err instanceof Error ? err.message : String(err)}`
    );
  });
});

bot.command("status", async (ctx) => {
  const session = loadSession();
  if (!session) {
    await ctx.reply("No active pipeline.");
    return;
  }
  const text = formatStatus(session) + "\n\n" + formatRoleList(session);
  await ctx.reply(text);
});

bot.command("resume", async (ctx) => {
  const session = loadSession();
  if (!session) {
    await ctx.reply("No session to resume.");
    return;
  }
  if (session.status === "completed") {
    await ctx.reply("Pipeline already completed.");
    return;
  }

  const currentRole = session.roles[session.currentRoleIndex];
  if (currentRole?.status === "failed" || currentRole?.status === "running") {
    currentRole.status = "pending";
    currentRole.error = undefined;
  }
  session.status = "running";
  saveSession(session);

  pinnedMessageId = session.pinnedMessageId ?? null;
  await ctx.reply(
    `Resuming: ${session.taskDescription}\nContinuing from: ${currentRole?.name.replace("dev-", "") ?? "unknown"}`
  );

  runPipeline(session, telegramHandler).catch(async (err) => {
    await bot.api.sendMessage(
      getChatId(),
      `❌ Pipeline error: ${err instanceof Error ? err.message : String(err)}`
    );
  });
});

// --- Session handoff: run documenter before resetting ---

async function runSessionHandoff(ctx: Context): Promise<void> {
  await ctx.reply("⏳ Capturing session state before resetting...");
  try {
    const result = await runClaude(
      "You are being invoked as the Dev Documenter to wrap up a session. Read docs/state.md and check if anything changed. If state changed: update docs/state.md, capture any insights that emerged. If nothing changed, just confirm. Be brief — output only what you updated.",
      {
        systemPromptAppend: loadRoleContract("dev-documenter"),
        model: "opus",
        noSessionPersistence: true,
      }
    );
    const summary = result.output.trim().slice(0, 500);
    await ctx.reply(`✓ Session wrapped up.\n${summary || "(no changes needed)"}`);
  } catch {
    await ctx.reply("⚠️ Couldn't run documenter — resetting anyway.");
  }
}

bot.command("newchat", async (ctx) => {
  if (chatSessionId) {
    await runSessionHandoff(ctx);
  }
  chatSessionId = null;

  await ctx.reply(
    [
      "✓ Fresh session. State captured.",
      "",
      "I still know the project — I just won't carry forward our last conversation thread. Good for switching gears.",
    ].join("\n"),
    { reply_markup: quickActions() }
  );

  // Auto-run PM to orient on the fresh session
  await runAutoPM();
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Agent OS Dev Bot",
      "━━━━━━━━━━━━━━━━",
      "",
      "Just type naturally — I'm Claude with full project context.",
      "",
      "Commands:",
      "  /start <task> — kick off a dev pipeline",
      "  /status — current pipeline state",
      "  /resume — resume paused pipeline",
      "  /newchat — wrap up + reset conversation",
      "  /help — this message",
      "",
      "Or tap a quick action below.",
    ].join("\n"),
    { reply_markup: quickActions() }
  );
});

// --- Quick action buttons ---

function quickActions(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Status", "quick:status")
    .text("📌 What's next?", "quick:whatsnext")
    .row()
    .text("🔄 New Chat", "quick:newchat")
    .text("🛠 Skills", "quick:skills");
}

function skillButtons(): InlineKeyboard {
  return new InlineKeyboard()
    .text("PM", "skill:dev-pm")
    .text("Researcher", "skill:dev-researcher")
    .text("Designer", "skill:dev-designer")
    .row()
    .text("Architect", "skill:dev-architect")
    .text("Builder", "skill:dev-builder")
    .row()
    .text("Reviewer", "skill:dev-reviewer")
    .text("Documenter", "skill:dev-documenter");
}

bot.callbackQuery("quick:status", async (ctx) => {
  await ctx.answerCallbackQuery();
  const session = loadSession();
  if (!session) {
    await ctx.reply("No active pipeline. Ask me anything or tap a skill.");
    return;
  }
  await ctx.reply(formatStatus(session) + "\n\n" + formatRoleList(session));
});

bot.callbackQuery("quick:newchat", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (chatSessionId) {
    await runSessionHandoff(ctx);
  }
  chatSessionId = null;

  await ctx.reply(
    [
      "✓ Fresh session. State captured.",
      "",
      "What are you thinking about?",
    ].join("\n"),
    { reply_markup: quickActions() }
  );
});

bot.callbackQuery("quick:whatsnext", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendClaudeResponse(
    ctx,
    "What should I work on next? Read docs/state.md and docs/roadmap.md and give me a concise recommendation with rationale."
  );
});

bot.callbackQuery("quick:skills", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Invoke a dev role standalone:", { reply_markup: skillButtons() });
});

// --- Skill invocation via buttons ---

bot.callbackQuery(/^skill:(.+)$/, async (ctx) => {
  const roleName = ctx.match![1];
  await ctx.answerCallbackQuery();
  await ctx.reply(`⏳ Running ${roleName.replace("dev-", "")}...`);

  try {
    const contract = loadRoleContract(roleName);
    const result = await runClaude(
      "You are being invoked standalone (not as part of a pipeline). Read docs/state.md for current context. Complete your role and produce your output. If your role requires updating docs/state.md, capturing insights in docs/insights/, or updating other project files — do so. Summarize what you produced at the end, prefixed with SUMMARY:.",
      {
        systemPromptAppend: contract,
        model: "opus",
        noSessionPersistence: true,
      }
    );

    if (result.exitCode !== 0) {
      await ctx.reply(`❌ ${roleName} failed (exit ${result.exitCode})`);
      return;
    }

    await sendLongMessage(ctx, result.output.trim());
  } catch (err) {
    await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// --- Shared helpers ---

async function sendClaudeResponse(ctx: Context | null, prompt: string): Promise<void> {
  const reply = async (text: string) => {
    if (ctx) await ctx.reply(text);
    else await bot.api.sendMessage(getChatId(), text);
  };

  await reply("⏳ Thinking...");

  const isFirst = chatSessionId === null;
  if (isFirst) chatSessionId = crypto.randomUUID();

  try {
    const result = await runClaude(prompt, {
      // No systemPromptAppend — let CLAUDE.md and project context do the work
      // Same as opening a Claude Code chat in this project directory
      model: "opus",
      sessionId: isFirst ? chatSessionId! : undefined,
      resumeSessionId: isFirst ? undefined : chatSessionId!,
      noSessionPersistence: false,
    });

    if (result.exitCode !== 0) {
      await reply("❌ Claude returned an error. Try again.");
      return;
    }

    await sendLongMessage(ctx, result.output.trim());
  } catch (err) {
    await reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function sendLongMessage(ctx: Context | null, text: string): Promise<void> {
  if (!text) {
    const msg = "(no output)";
    if (ctx) await ctx.reply(msg);
    else await bot.api.sendMessage(getChatId(), msg);
    return;
  }
  const chunks = text.length <= 4096
    ? [text]
    : (text.match(/[\s\S]{1,4096}/g) ?? [text]);
  for (const chunk of chunks) {
    if (ctx) await ctx.reply(chunk);
    else await bot.api.sendMessage(getChatId(), chunk);
  }
}

// --- Text message handler (for feedback — AFTER commands so /commands aren't swallowed) ---

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  // If waiting for feedback at a review gate, capture it
  if (pendingFeedback) {
    const roleName = pendingFeedback.roleName;
    pendingFeedback.resolve(text);
    pendingFeedback = null;
    await ctx.reply(
      `✓ Feedback captured for ${roleName.replace("dev-", "")}. Continuing...`
    );
    return;
  }

  // Otherwise, treat as a conversation with Claude — persistent session, Opus model
  await sendClaudeResponse(ctx, text);
});

// --- Startup: pin current state ---

async function sendStartupStatus(): Promise<void> {
  if (chatId === null) return;

  const session = loadSession();
  if (session && session.status !== "completed") {
    await updatePinnedMessage(session);
    return;
  }

  // Send welcome + instructions first
  const welcome = [
    "📌 Agent OS — Your Workspace",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "I'm Claude with full project context. Talk to me like you would at your desk — I remember our conversation.",
    "",
    "💬 Just type — ask questions, think through problems, give direction.",
    "🛠 Tap Skills — invoke a specific dev role.",
    "🚀 /start <task> — kick off a full dev pipeline.",
    "",
    "📌 This message stays pinned and updates as things change.",
  ].join("\n");

  try {
    if (pinnedMessageId) {
      await bot.api.editMessageText(getChatId(), pinnedMessageId, welcome, {
        reply_markup: quickActions(),
      });
    } else {
      const msg = await bot.api.sendMessage(getChatId(), welcome, {
        reply_markup: quickActions(),
      });
      pinnedMessageId = msg.message_id;
      try {
        await bot.api.pinChatMessage(getChatId(), pinnedMessageId);
      } catch {
        // Pin may fail in some chat types
      }
    }
  } catch {
    // Ignore failures
  }

  // Auto-run PM to give a daily brief style orientation
  await runAutoPM();
}

async function runAutoPM(): Promise<void> {
  try {
    // Use the chat session so PM output becomes part of the conversation context
    await sendClaudeResponse(
      null,
      "Read docs/state.md and docs/roadmap.md. Give me a concise orientation: what was last done, what's next, any blockers or decisions needed. End with a concrete recommendation for what to do now. If you notice anything that should be captured as an insight or that state.md needs updating, do it."
    );
  } catch (err) {
    console.error("[bot] auto-PM failed:", err);
  }
}

// --- Start bot ---

console.log("Dev Pipeline Telegram bot starting (long-polling)...");
console.log(
  chatId
    ? `Authorized chat ID: ${chatId}`
    : "No chat ID configured — will lock to first message received"
);
bot.start({
  onStart: async () => {
    console.log("Bot is running.");
    await sendStartupStatus();
  },
});
