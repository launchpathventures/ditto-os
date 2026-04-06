#!/usr/bin/env tsx
/**
 * Dev Pipeline — Telegram Bot (Conversational Self)
 *
 * The Telegram surface for Ditto's Conversational Self.
 * Free-text messages route through selfConverse() — the Self assembles context,
 * converses via LLM, and delegates to dev pipeline roles via tool_use.
 * Explicit commands (/start, /status, /resume) use direct engine APIs.
 *
 * Usage:
 *   pnpm dev-bot    — start the Telegram bot (long-polling)
 *
 * Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
 *
 * Provenance:
 *   - Telegram Bot API: inline keyboards, pinned messages, long-polling
 *   - Review gate UX: ADR-010 workspace interaction model
 *   - Engine bridge: Brief 027 — routes through harness pipeline
 *   - Conversational Self: ADR-016, Brief 030
 *   - Direct engine import: same pattern as src/cli/commands/start.ts
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });
import { initLlm } from "./engine/llm.js";
import { Bot, InlineKeyboard, type Context } from "grammy";
import { runClaude, loadRoleContract } from "./dev-pipeline.js";
import { startProcessRun, fullHeartbeat, type HeartbeatResult } from "./engine/heartbeat.js";
import { approveRun, editRun, rejectRun, getWaitingStepOutput } from "./engine/review-actions.js";
import { selfConverse, type SelfConverseCallbacks } from "./engine/self.js";
import { db, schema } from "./db/index.js";
import { eq } from "drizzle-orm";

// --- Config ---

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set in .env");
  process.exit(1);
}

// AC13: Require TELEGRAM_CHAT_ID when running engine-bridge mode.
// The auto-lock-to-first-message pattern is a security risk when the bot
// routes through the engine with --dangerously-skip-permissions.
if (!CHAT_ID) {
  console.error("TELEGRAM_CHAT_ID not set in .env — required for engine-bridge mode (security: --dangerously-skip-permissions)");
  process.exit(1);
}

const chatId: number = Number(CHAT_ID);

// Validate LLM configuration at startup (Brief 032: fail early, not at first API call)
initLlm();

/** Get chat ID, guaranteed non-null */
function getChatId(): number {
  return chatId;
}

// --- Bot setup ---

const bot = new Bot(BOT_TOKEN);

// Auth middleware — only accept messages from authorized chat
bot.use(async (ctx, next) => {
  const incomingId = ctx.chat?.id;
  if (!incomingId) return;
  if (incomingId !== chatId) return;

  console.log(`[bot] received: ${ctx.message?.text ?? ctx.callbackQuery?.data ?? "(unknown)"}`);
  await next();
});

// Catch errors so the bot doesn't silently die
bot.catch((err) => {
  console.error("[bot] error:", err);
});

// --- Engine bridge state ---

/** Active engine process run ID */
let activeRunId: string | null = null;

/** User ID for the Conversational Self (single-creator MVP) */
const SELF_USER_ID = "creator";

/** Pending feedback capture — when user taps "Edit", we wait for their text */
let pendingEditRunId: string | null = null;

/** Pending reject capture — when user taps "Reject", we wait for their reason */
let pendingRejectRunId: string | null = null;

let pinnedMessageId: number | null = null;

// --- DB initialization check (AC11) ---

async function checkDbInitialized(): Promise<boolean> {
  try {
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "dev-pipeline"))
      .limit(1);
    return !!proc;
  } catch {
    return false;
  }
}

// --- Helper: send step output + review keyboard ---

async function showStepForReview(runId: string): Promise<void> {
  const stepOutput = await getWaitingStepOutput(runId);
  if (!stepOutput) return;

  const label = stepOutput.stepName.replace(/-/g, " ");
  const confidence = stepOutput.confidence ? ` | Confidence: ${stepOutput.confidence}` : "";

  // Send step output (truncated for Telegram)
  const header = `━━━ ${label.toUpperCase()} COMPLETE ━━━${confidence}`;
  const outputPreview = stepOutput.outputText.length > 3500
    ? stepOutput.outputText.slice(0, 3500) + "\n... (truncated)"
    : stepOutput.outputText;

  await sendLongMessage(null, `${header}\n\n${outputPreview}`);

  // Build inline keyboard
  const keyboard = new InlineKeyboard()
    .text("Approve ✓", "engine:approve")
    .text("Reject ✗", "engine:reject")
    .row()
    .text("Feedback 💬", "engine:edit")
    .text("Desk 🖥", "engine:desk");

  await bot.api.sendMessage(
    getChatId(),
    `Ready for review: ${label}`,
    { reply_markup: keyboard },
  );
}

/** Show heartbeat result to user and handle waiting_review */
async function handleHeartbeatResult(result: HeartbeatResult): Promise<void> {
  if (result.status === "waiting_review") {
    await showStepForReview(result.processRunId);
  } else if (result.status === "completed") {
    activeRunId = null;
    await bot.api.sendMessage(getChatId(), `✅ Pipeline complete!\n\nSteps executed: ${result.stepsExecuted}\n${result.message}`);
  } else if (result.status === "failed") {
    await bot.api.sendMessage(getChatId(), `❌ Pipeline failed: ${result.message}`);
  } else if (result.status === "waiting_human") {
    await bot.api.sendMessage(getChatId(), `⏸ Waiting for human step: ${result.message}`);
  }
}

// --- Engine gate callback handlers ---

bot.callbackQuery("engine:approve", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!activeRunId) {
    await ctx.reply("No active engine run.");
    return;
  }

  await ctx.reply("✓ Approved. Continuing pipeline...");

  try {
    const { action, heartbeat } = await approveRun(activeRunId);
    if (!action.success) {
      await ctx.reply(`❌ Approve failed: ${action.message}`);
      return;
    }
    await handleHeartbeatResult(heartbeat);
  } catch (err) {
    await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

bot.callbackQuery("engine:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!activeRunId) {
    await ctx.reply("No active engine run.");
    return;
  }

  pendingEditRunId = activeRunId;
  await ctx.reply("What feedback should this step receive? (type your response)");
});

bot.callbackQuery("engine:reject", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!activeRunId) {
    await ctx.reply("No active engine run.");
    return;
  }

  pendingRejectRunId = activeRunId;
  await ctx.reply("Why are you rejecting this? (type your reason)");
});

bot.callbackQuery("engine:desk", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🖥 Deferred to desktop. Run paused. Resume later with /resume.");
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

  if (activeRunId) {
    await ctx.reply(`Active pipeline running. Use /resume to continue or wait for completion.`);
    return;
  }

  // AC11: Check DB is initialized
  const dbReady = await checkDbInitialized();
  if (!dbReady) {
    await ctx.reply("❌ Database not initialized. Run `pnpm cli sync` first to load process definitions.");
    return;
  }

  await ctx.reply(
    `Starting dev pipeline via engine for: ${description}\nRunning through harness (memory → trust → feedback)...`
  );

  // AC1: Create process run + work item via engine, then run heartbeat
  try {
    const runId = await startProcessRun("dev-pipeline", { task: description });
    activeRunId = runId;

    // Create work item (same pattern as src/cli/commands/start.ts)
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "dev-pipeline"))
      .limit(1);

    if (proc) {
      await db.insert(schema.workItems).values({
        type: "task",
        status: "in_progress",
        content: `Dev Pipeline: ${description}`,
        source: "system_generated",
        assignedProcess: proc.id,
        executionIds: [runId],
      });
    }

    // AC2: Run heartbeat — steps go through full harness pipeline
    // AC12: async execution — bot remains responsive
    const result = await fullHeartbeat(runId);
    await handleHeartbeatResult(result);
  } catch (err) {
    activeRunId = null;
    await bot.api.sendMessage(
      getChatId(),
      `❌ Pipeline error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
});

bot.command("status", async (ctx) => {
  if (!activeRunId) {
    await ctx.reply("No active engine pipeline. Use /start <task> to begin.");
    return;
  }

  try {
    // Get process run status from DB
    const [run] = await db
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, activeRunId))
      .limit(1);

    if (!run) {
      await ctx.reply("Run not found in DB.");
      return;
    }

    // Get step runs
    const stepRuns = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, activeRunId));

    const lines: string[] = [];
    lines.push("📌 Ditto Dev Pipeline (Engine)");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(`Status: ${run.status}`);
    lines.push(`Run ID: ${activeRunId.slice(0, 8)}`);
    lines.push("");

    for (const step of stepRuns) {
      const icon = step.status === "approved" ? "✓"
        : step.status === "running" ? "⏳"
        : step.status === "waiting_review" ? "🔔"
        : step.status === "failed" ? "✗"
        : step.status === "rejected" ? "✗"
        : "○";
      const label = step.stepId.replace(/-/g, " ");
      lines.push(`  ${icon} ${label} (${step.status})`);
    }

    await ctx.reply(lines.join("\n"));
  } catch (err) {
    await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

bot.command("resume", async (ctx) => {
  if (!activeRunId) {
    await ctx.reply("No active run to resume.");
    return;
  }

  await ctx.reply("Resuming pipeline...");

  try {
    const result = await fullHeartbeat(activeRunId);
    await handleHeartbeatResult(result);
  } catch (err) {
    await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
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
  await runSessionHandoff(ctx);

  await ctx.reply(
    [
      "✓ Fresh session. State captured.",
      "",
      "I still know the project — I just won't carry forward our last conversation thread. Good for switching gears.",
    ].join("\n"),
    { reply_markup: quickActions() }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "Ditto — Conversational Self",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "Just type naturally — I'm Ditto. I remember conversations, delegate to dev roles, and learn from feedback.",
      "",
      "Commands:",
      "  /start <task> — kick off a dev pipeline (through engine)",
      "  /status — current pipeline state (from engine DB)",
      "  /resume — resume paused pipeline",
      "  /newchat — wrap up + start fresh session",
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
  if (!activeRunId) {
    await ctx.reply("No active pipeline. Ask me anything or tap a skill.");
    return;
  }
  // Trigger status command
  await ctx.reply("Fetching engine status...");
  // Re-use the status logic
  try {
    const [run] = await db
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, activeRunId!))
      .limit(1);

    if (!run) {
      await ctx.reply("Run not found.");
      return;
    }

    const stepRuns = await db
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, activeRunId!));

    const lines: string[] = [`📌 Status: ${run.status}`, ""];
    for (const step of stepRuns) {
      const icon = step.status === "approved" ? "✓"
        : step.status === "waiting_review" ? "🔔"
        : step.status === "failed" ? "✗"
        : "○";
      lines.push(`  ${icon} ${step.stepId.replace(/-/g, " ")}`);
    }
    await ctx.reply(lines.join("\n"));
  } catch {
    await ctx.reply("Could not fetch status.");
  }
});

bot.callbackQuery("quick:newchat", async (ctx) => {
  await ctx.answerCallbackQuery();
  await runSessionHandoff(ctx);

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
  await sendSelfResponse(
    ctx,
    "What should I work on next? Give me a concise recommendation with rationale."
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

/**
 * Route a message through the Conversational Self (Brief 030, AC10).
 * Uses selfConverse() which assembles context, calls LLM with tool_use,
 * handles delegation, and persists sessions in the DB.
 */
async function sendSelfResponse(ctx: Context | null, message: string): Promise<void> {
  const reply = async (text: string) => {
    if (ctx) await ctx.reply(text);
    else await bot.api.sendMessage(getChatId(), text);
  };

  // Show native typing indicator instead of sending a message
  try {
    await bot.api.sendChatAction(getChatId(), "typing");
  } catch { /* ignore */ }

  const callbacks: SelfConverseCallbacks = {
    onIntermediateText: async (text) => {
      await sendLongMessage(ctx, text);
    },
    onDelegationStart: async (toolName, input) => {
      if (toolName === "start_dev_role") {
        const role = (input.role as string) || "role";
        await reply(`Working on it — delegating to ${role}...`);
      }
      // Re-send typing indicator for the delegation duration
      try { await bot.api.sendChatAction(getChatId(), "typing"); } catch { /* ignore */ }
    },
  };

  try {
    const result = await selfConverse(SELF_USER_ID, message, "telegram", callbacks);

    if (!result.response) {
      await reply("(no response)");
      return;
    }

    await sendLongMessage(ctx, result.response);
  } catch (err) {
    await reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Legacy: run Claude directly via claude -p subprocess.
 * Used for explicit skill invocation buttons and session handoff (documenter).
 * Free-text messages route through selfConverse() instead.
 */
async function sendClaudeResponse(ctx: Context | null, prompt: string): Promise<void> {
  const reply = async (text: string) => {
    if (ctx) await ctx.reply(text);
    else await bot.api.sendMessage(getChatId(), text);
  };

  await reply("⏳ Thinking...");

  try {
    const result = await runClaude(prompt, {
      model: "opus",
      noSessionPersistence: true,
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
    try {
      if (ctx) await ctx.reply(chunk, { parse_mode: "Markdown" });
      else await bot.api.sendMessage(getChatId(), chunk, { parse_mode: "Markdown" });
    } catch {
      // Fallback to plain text if Markdown parsing fails
      if (ctx) await ctx.reply(chunk);
      else await bot.api.sendMessage(getChatId(), chunk);
    }
  }
}

// --- Text message handler (for feedback — AFTER commands so /commands aren't swallowed) ---

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;

  // If waiting for edit feedback at an engine review gate, capture it
  if (pendingEditRunId) {
    const runId = pendingEditRunId;
    pendingEditRunId = null;
    await ctx.reply("✓ Feedback captured. Continuing pipeline...");

    try {
      const { action, heartbeat } = await editRun(runId, text);
      if (!action.success) {
        await ctx.reply(`❌ Edit failed: ${action.message}`);
        return;
      }
      if (action.correctionPattern) {
        const displayPattern = action.correctionPattern.pattern.replace(/_/g, " ");
        await ctx.reply(
          `Note: You've corrected "${displayPattern}" ${action.correctionPattern.count} times. The system is learning from it.`
        );
      }
      await handleHeartbeatResult(heartbeat);
    } catch (err) {
      await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // If waiting for reject reason at an engine review gate, capture it
  if (pendingRejectRunId) {
    const runId = pendingRejectRunId;
    pendingRejectRunId = null;

    try {
      const result = await rejectRun(runId, text);
      if (!result.success) {
        await ctx.reply(`❌ Reject failed: ${result.message}`);
        return;
      }
      await ctx.reply(`✗ ${result.message}`);
      activeRunId = null;
    } catch (err) {
      await ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // AC10: Route all free-text messages through the Conversational Self.
  // Don't await — let it run in the background so the bot stays responsive
  // to new messages while a delegation is in progress.
  sendSelfResponse(ctx, text).catch((err) => {
    console.error("[bot] selfConverse error:", err);
    ctx.reply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
  });
});

// --- Startup ---

async function sendStartupStatus(): Promise<void> {
  // Send welcome + instructions
  const welcome = [
    "📌 Ditto — Your Workspace",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "I'm Ditto. I remember our conversations, know the project state, and can delegate to dev roles when needed.",
    "",
    "💬 Just type — I'll handle framing, delegation, and synthesis.",
    "🛠 Tap Skills — invoke a specific dev role directly.",
    "🚀 /start <task> — kick off a full dev pipeline.",
  ].join("\n");

  try {
    const msg = await bot.api.sendMessage(getChatId(), welcome, {
      reply_markup: quickActions(),
    });
    pinnedMessageId = msg.message_id;
    try {
      await bot.api.pinChatMessage(getChatId(), pinnedMessageId);
    } catch {
      // Pin may fail in some chat types
    }
  } catch {
    // Ignore failures
  }

  // No auto-PM on startup — the Self already loads work state in its context.
  // When the human sends a message, the Self orients naturally.
}

// --- Start bot ---

console.log("Ditto Telegram bot starting (Conversational Self)...");
console.log(`Authorized chat ID: ${chatId}`);

// AC11: Check DB initialization before starting
checkDbInitialized().then((ready) => {
  if (!ready) {
    console.error("WARNING: dev-pipeline process not found in DB. Run `pnpm cli sync` first.");
  }
});

bot.start({
  onStart: async () => {
    console.log("Bot is running (Conversational Self).");
    await sendStartupStatus();
  },
});
