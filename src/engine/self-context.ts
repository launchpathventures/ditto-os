/**
 * Ditto — Self Context Helpers
 *
 * Helper functions for the Conversational Self's context assembly.
 * Loads work state summary, self-scoped memories, and session turns.
 *
 * Provenance:
 * - Tiered memory loading: Letta core memory blocks
 * - Session turns: LangGraph checkpointing
 * - Memory scope filtering: Mem0 (ADR-003)
 */

import { db, schema } from "../db";
import { eq, ne, and, desc, gte } from "drizzle-orm";
import { updateWorkingPatterns } from "./user-model";
import { buildInteractionSummary } from "./interaction-events";

const CHARS_PER_TOKEN = 4;

// ============================================================
// Work State Summary
// ============================================================

export interface WorkStateSummary {
  activeRuns: number;
  pendingReviews: number;
  recentCompletions: number;
  details: string;
}

/**
 * Load a summary of current work state: active runs, pending reviews,
 * recent completions (last 24h). Returns both counts and a human-readable summary.
 * Optional userId for interaction signal scoping (defaults to "default" for single-user MVP).
 */
export async function loadWorkStateSummary(userId: string = "default"): Promise<WorkStateSummary> {
  // Active process runs (running or queued)
  const activeRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "running"));

  const queuedRuns = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "queued"));

  // Pending review items
  const pendingReviews = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_review"));

  // Recent completions (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentCompletions = await db
    .select()
    .from(schema.processRuns)
    .where(
      and(
        eq(schema.processRuns.status, "approved"),
        gte(schema.processRuns.completedAt, oneDayAgo),
      ),
    );

  // Also check for waiting_human runs
  const waitingHuman = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_human"));

  const lines: string[] = [];

  if (activeRuns.length + queuedRuns.length > 0) {
    lines.push(`Active runs: ${activeRuns.length + queuedRuns.length}`);
  }
  if (pendingReviews.length > 0) {
    lines.push(`Pending reviews: ${pendingReviews.length}`);
  }
  if (waitingHuman.length > 0) {
    lines.push(`Waiting for human input: ${waitingHuman.length}`);
  }
  if (recentCompletions.length > 0) {
    lines.push(`Completed in last 24h: ${recentCompletions.length}`);
  }
  if (lines.length === 0) {
    lines.push("No active work. Ready for new tasks.");
  }

  // Brief 056 AC12: Include interaction signal summary
  try {
    const interactionSummary = await buildInteractionSummary(userId);
    if (interactionSummary) {
      lines.push("--- UI signals ---");
      lines.push(interactionSummary);
    }
  } catch {
    // Non-critical — interaction signals are supplementary
  }

  return {
    activeRuns: activeRuns.length + queuedRuns.length,
    pendingReviews: pendingReviews.length,
    recentCompletions: recentCompletions.length,
    details: lines.join("\n"),
  };
}

// ============================================================
// Self-Scoped Memories
// ============================================================

/**
 * Load self-scoped memories for a user, sorted by salience (reinforcement + confidence).
 * Applies token budgeting. Returns formatted memory block for context injection.
 */
export async function loadSelfMemories(
  userId: string,
  tokenBudget: number = 1000,
): Promise<string> {
  const charBudget = tokenBudget * CHARS_PER_TOKEN;

  const memories = await db
    .select({
      type: schema.memories.type,
      content: schema.memories.content,
      confidence: schema.memories.confidence,
      reinforcementCount: schema.memories.reinforcementCount,
    })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.active, true),
      ),
    )
    .orderBy(
      desc(schema.memories.reinforcementCount),
      desc(schema.memories.confidence),
    );

  if (memories.length === 0) return "";

  const lines: string[] = [];
  let totalChars = 0;

  for (const mem of memories) {
    const line = `- [${mem.type}] ${mem.content}`;
    if (totalChars + line.length + 1 > charBudget) break;
    lines.push(line);
    totalChars += line.length + 1;
  }

  return lines.join("\n");
}

// ============================================================
// Session Turns
// ============================================================

export interface SessionTurn {
  role: string;
  content: string;
  timestamp: number;
  surface: string;
}

/**
 * Load recent turns from a session, within token budget.
 * Returns most recent turns first (reversed for chronological order in context).
 */
export async function loadSessionTurns(
  sessionId: string,
  tokenBudget: number = 2000,
): Promise<SessionTurn[]> {
  const charBudget = tokenBudget * CHARS_PER_TOKEN;

  const [session] = await db
    .select({ turns: schema.sessions.turns })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  if (!session || !session.turns || session.turns.length === 0) return [];

  const turns = session.turns as SessionTurn[];

  // Token efficiency (Insight-170): for long conversations (>6 turns),
  // summarize older turns into a compact abstract and keep only recent verbatim.
  // This saves ~500-1000 tokens after turn 5.
  const VERBATIM_TURN_COUNT = 6;

  if (turns.length <= VERBATIM_TURN_COUNT) {
    // Short conversation — return all turns that fit in budget
    const result: SessionTurn[] = [];
    let totalChars = 0;
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      const charLen = turn.content.length + turn.role.length + 10;
      if (totalChars + charLen > charBudget) break;
      result.unshift(turn);
      totalChars += charLen;
    }
    return result;
  }

  // Long conversation — summarize older turns, keep recent verbatim
  const olderTurns = turns.slice(0, turns.length - VERBATIM_TURN_COUNT);
  const recentTurns = turns.slice(turns.length - VERBATIM_TURN_COUNT);

  // Build a compact summary of older turns (no LLM call — extractive summary)
  const summaryParts: string[] = [];
  for (const turn of olderTurns) {
    const content = typeof turn.content === "string" ? turn.content : "";
    // Extract first sentence or first 100 chars
    const firstSentence = content.match(/^[^.!?\n]+[.!?]?/)?.[0] || content.slice(0, 100);
    if (firstSentence.trim()) {
      summaryParts.push(`${turn.role === "user" ? "H" : "A"}: ${firstSentence.trim()}`);
    }
  }
  const summary = summaryParts.join(" | ");

  // Budget: reserve ~200 tokens for summary, rest for verbatim turns
  const SUMMARY_CHAR_BUDGET = 800; // ~200 tokens
  const truncatedSummary = summary.length > SUMMARY_CHAR_BUDGET
    ? summary.slice(0, SUMMARY_CHAR_BUDGET) + "..."
    : summary;

  // Create a synthetic summary turn
  const summaryTurn: SessionTurn = {
    role: "user",
    content: `[Earlier conversation summary (${olderTurns.length} turns): ${truncatedSummary}]`,
    timestamp: olderTurns[0]?.timestamp || Date.now(),
    surface: olderTurns[0]?.surface || "web",
  };

  // Fill verbatim turns within remaining budget
  const summaryCharLen = summaryTurn.content.length + 20;
  const remainingBudget = charBudget - summaryCharLen;

  const result: SessionTurn[] = [summaryTurn];
  let totalChars = 0;

  for (let i = recentTurns.length - 1; i >= 0; i--) {
    const turn = recentTurns[i];
    const charLen = turn.content.length + turn.role.length + 10;
    if (totalChars + charLen > remainingBudget) break;
    result.splice(1, 0, turn); // Insert after summary, before later turns
    totalChars += charLen;
  }

  return result;
}

// ============================================================
// Session Lifecycle
// ============================================================

/** Idle timeout for session suspension: 30 minutes (workspace surfaces) */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Idle timeout for inbound sessions: 24 hours.
 * Async channels (email) have hours between messages. A 30-minute timeout
 * would break conversational continuity across a slow email thread.
 * 24h keeps the thread context alive for a full day of back-and-forth. */
export const INBOUND_SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * Find or create an active session for a user on a surface.
 * If an active session exists and hasn't timed out, resume it.
 * If the active session has timed out, suspend it and create a new one.
 * If no active session exists, create a new one.
 */
export async function getOrCreateSession(
  userId: string,
  surface: "cli" | "telegram" | "web" | "inbound",
): Promise<{ sessionId: string; resumed: boolean; previousSummary: string | null }> {
  // Inbound sessions are SCOPED by surface — an inbound message must NOT resume a
  // web/cli/telegram session (prevents email content leaking into workspace conversation
  // history and vice versa). Workspace surfaces share sessions (ADR-016: cross-surface continuity).
  const isInbound = surface === "inbound";

  const [activeSession] = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        eq(schema.sessions.status, "active"),
        // Inbound: only match inbound sessions. Other surfaces: exclude inbound sessions.
        isInbound
          ? eq(schema.sessions.surface, "inbound")
          : ne(schema.sessions.surface, "inbound"),
      ),
    )
    .orderBy(desc(schema.sessions.lastActiveAt))
    .limit(1);

  if (activeSession) {
    const lastActive = activeSession.lastActiveAt instanceof Date
      ? activeSession.lastActiveAt.getTime()
      : Number(activeSession.lastActiveAt);
    const elapsed = Date.now() - lastActive;

    const timeout = isInbound ? INBOUND_SESSION_IDLE_TIMEOUT_MS : SESSION_IDLE_TIMEOUT_MS;
    if (elapsed < timeout) {
      // Resume existing session
      await db
        .update(schema.sessions)
        .set({ lastActiveAt: new Date() })
        .where(eq(schema.sessions.id, activeSession.id));

      return { sessionId: activeSession.id, resumed: true, previousSummary: null };
    }

    // Session timed out — suspend it with summary
    const summary = generateSessionSummary(activeSession.turns as SessionTurn[]);
    await db
      .update(schema.sessions)
      .set({ status: "suspended", summary })
      .where(eq(schema.sessions.id, activeSession.id));

    // Create new session
    const newSession = await createNewSession(userId, surface);

    // Track working patterns on new session creation (Brief 043)
    // Skip for inbound — async messages don't produce meaningful pattern data
    if (surface !== "inbound") {
      updateWorkingPatterns(userId, surface).catch(() => {});
    }

    return { sessionId: newSession, resumed: false, previousSummary: summary };
  }

  // No active session — check for recently suspended one for context
  const [suspendedSession] = await db
    .select({ summary: schema.sessions.summary })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        eq(schema.sessions.status, "suspended"),
      ),
    )
    .orderBy(desc(schema.sessions.lastActiveAt))
    .limit(1);

  const newSession = await createNewSession(userId, surface);

  // Track working patterns on new session creation (Brief 043)
  if (surface !== "inbound") {
    updateWorkingPatterns(userId, surface).catch(() => {
      // Non-critical — don't block session creation
    });
  }

  return {
    sessionId: newSession,
    resumed: false,
    previousSummary: suspendedSession?.summary ?? null,
  };
}

/**
 * Create a new session in the database.
 */
async function createNewSession(
  userId: string,
  surface: "cli" | "telegram" | "web" | "inbound",
): Promise<string> {
  const [session] = await db
    .insert(schema.sessions)
    .values({
      userId,
      surface,
      status: "active",
      turns: [],
    })
    .returning({ id: schema.sessions.id });

  return session.id;
}

/**
 * Append a turn to a session.
 */
export async function appendSessionTurn(
  sessionId: string,
  turn: SessionTurn,
): Promise<void> {
  const [session] = await db
    .select({ turns: schema.sessions.turns })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  if (!session) return;

  const turns = (session.turns as SessionTurn[]) || [];
  turns.push(turn);

  await db
    .update(schema.sessions)
    .set({
      turns: turns as any,
      lastActiveAt: new Date(),
    })
    .where(eq(schema.sessions.id, sessionId));
}

// ============================================================
// Self Decision Tracking (Brief 034a, Insight-063)
// ============================================================

/**
 * Record a Self-level decision as an activity.
 * Tracks delegations, consultations, and inline responses for pattern detection.
 *
 * Provenance: Activity logging pattern from feedback-recorder.ts.
 */
export async function recordSelfDecision(params: {
  decisionType: "delegation" | "consultation" | "inline_response" | "planning" | "pipeline";
  details: Record<string, unknown>;
  costCents: number;
}): Promise<void> {
  await db.insert(schema.activities).values({
    action: `self.decision.${params.decisionType}`,
    actorType: "self",
    entityType: "session",
    entityId: "self",
    metadata: {
      ...params.details,
      costCents: params.costCents,
    },
  });
}

/** Negation keywords that suggest the human is redirecting the Self's decision */
const NEGATION_KEYWORDS = ["no", "wrong", "not that", "i meant", "actually", "instead"];

/** Role keywords for detection */
const ROLE_KEYWORDS = [
  "pm", "researcher", "designer", "architect", "builder", "reviewer", "documenter",
  "triage", "research", "design", "architecture", "build", "review", "document",
];

/**
 * Check if a human message is redirecting the Self's previous delegation choice.
 * Detection: substring match on negation + role keywords.
 *
 * Provenance: Original — lightweight heuristic for Self-correction detection (Brief 034a).
 */
export function detectSelfRedirect(
  humanMessage: string,
): { isRedirect: boolean; mentionedRole: string | null } {
  const lower = humanMessage.toLowerCase();
  const hasNegation = NEGATION_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hasNegation) return { isRedirect: false, mentionedRole: null };

  const mentionedRole = ROLE_KEYWORDS.find((kw) => lower.includes(kw)) ?? null;
  return { isRedirect: mentionedRole !== null, mentionedRole };
}

/**
 * Record a Self-correction memory when the human redirects a delegation choice.
 * Uses self-scoped memory with the existing feedback-to-memory pattern.
 *
 * Provenance: createMemoryFromFeedback() from feedback-recorder.ts (adapted for self scope).
 */
export async function recordSelfCorrection(
  userId: string,
  originalRole: string,
  correctedRole: string,
  taskSummary: string,
): Promise<void> {
  const content = `Self delegated to ${originalRole} but human wanted ${correctedRole} for: ${taskSummary}`;

  // Check for exact duplicate — reinforce if exists
  const [existing] = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.content, content),
        eq(schema.memories.active, true),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.memories)
      .set({
        reinforcementCount: existing.reinforcementCount + 1,
        lastReinforcedAt: new Date(),
        confidence: Math.min(0.9, 0.3 + existing.reinforcementCount * 0.15),
        updatedAt: new Date(),
      })
      .where(eq(schema.memories.id, existing.id));
  } else {
    await db.insert(schema.memories).values({
      scopeType: "self",
      scopeId: userId,
      type: "correction",
      content,
      source: "feedback",
      confidence: 0.3,
      active: true,
    });
  }
}

// ============================================================
// Session Helpers
// ============================================================

/**
 * Generate a simple summary from session turns.
 * Used when suspending a session (no LLM reconciliation in MVP — deferred).
 */
function generateSessionSummary(turns: SessionTurn[]): string {
  if (!turns || turns.length === 0) return "Empty session.";

  const humanTurns = turns.filter((t) => t.role === "user");
  if (humanTurns.length === 0) return "Session with no user messages.";

  // Summarize by extracting first user message and last exchange
  const first = humanTurns[0].content.slice(0, 200);
  const last = humanTurns[humanTurns.length - 1].content.slice(0, 200);

  if (humanTurns.length === 1) {
    return `Session topic: ${first}`;
  }

  return `Session: started with "${first}" — last message: "${last}" (${turns.length} turns total)`;
}
