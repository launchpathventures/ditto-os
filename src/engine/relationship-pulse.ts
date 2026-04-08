/**
 * Ditto — Relationship Pulse (Brief 099b)
 *
 * Adaptive relationship building: Alex proactively reaches out to users
 * when there's something substantive to say. Not a fixed schedule —
 * Alex reasons about each user's state and decides whether to communicate.
 *
 * Composition pattern: uses createCompletion() directly with getCognitiveCore()
 * + user model context. Does NOT use selfConverse() — proactive outreach
 * must not pollute session history (Reviewer Flag B2).
 *
 * Coordinates with status-composer: if a user received a status update
 * this pulse tick, relationship pulse skips them (no double-notify).
 *
 * Layer classification: L2 (Agent/Heartbeat) — relationship pulse is
 * infrastructure that the pulse drives, not a process itself.
 *
 * Provenance: status-composer.ts composeStatusEmail() pattern (direct
 * createCompletion), front-door-cos-intake briefing-as-intake pattern,
 * cognitive/core.md + self.md judgment framework.
 */

import { db, schema } from "../db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createCompletion, extractText } from "./llm";
import { getCognitiveCore } from "./cognitive-core";
import { notifyUser } from "./notify-user";
import type { StatusCheckResult } from "./status-composer";

// ============================================================
// Constants
// ============================================================

/** Users in their first 7 days have higher outreach propensity (AC5) */
const EARLY_RELATIONSHIP_DAYS = 7;

/** Minimum hours between proactive outreach to the same user */
const MIN_HOURS_BETWEEN_OUTREACH = 24;
const MIN_MS_BETWEEN_OUTREACH = MIN_HOURS_BETWEEN_OUTREACH * 60 * 60 * 1000;

// ============================================================
// Types
// ============================================================

export type UserModelDensity = "sparse" | "partial" | "rich";

export interface UserSnapshot {
  userId: string;
  userEmail: string;
  userName?: string;
  personId: string;
  daysSinceSignup: number;
  daysSinceLastContact: number | null;
  modelDensity: UserModelDensity;
  distinctMemoryTypes: number;
  activeProcessCount: number;
  pendingDeliverables: number;
  correctionCount: number;
  memories: Array<{ type: string; content: string }>;
  /** Workspace graduation complexity signals (Brief 099c AC1) */
  complexitySignals: ComplexitySignals;
}

export interface ComplexitySignals {
  /** Concurrent active processes (running/waiting_human) */
  concurrentActiveProcesses: number;
  /** Batch reviews pending (waiting_review) */
  batchReviewCount: number;
  /** Recent correction frequency */
  correctionFrequency: number;
  /** User has expressed desire for visibility */
  wantsVisibility: boolean;
  /** How many signals are active (>=2 triggers suggestion) */
  activeSignalCount: number;
}

export interface RelationshipPulseResult {
  checked: number;
  outreachSent: number;
  skipped: number;
  details: Array<{
    userId: string;
    action: "outreach_sent" | "skipped_status_sent" | "skipped_too_recent" | "skipped_llm_silent" | "skipped_no_person";
  }>;
}

// ============================================================
// User Model Density (AC2, Reviewer Flag B3)
// ============================================================

/**
 * Calculate user model density by counting distinct memory types.
 * 0-2 types = sparse (early relationship, bias toward outreach)
 * 3-5 types = partial (room for deeper intake)
 * 6+  types = rich (natural rhythm)
 */
export function classifyDensity(distinctTypes: number): UserModelDensity {
  if (distinctTypes <= 2) return "sparse";
  if (distinctTypes <= 5) return "partial";
  return "rich";
}

// ============================================================
// Snapshot Assembly
// ============================================================

/**
 * Build a context snapshot for a single user.
 * This is what the LLM reasons about to decide outreach.
 */
async function buildUserSnapshot(
  userId: string,
  userEmail: string,
  userName: string | undefined,
  personId: string,
  createdAt: Date,
  wantsVisibility: boolean = false,
): Promise<UserSnapshot> {
  const now = Date.now();

  // Days since signup
  const daysSinceSignup = Math.floor((now - createdAt.getTime()) / (24 * 60 * 60 * 1000));

  // Last contact: most recent interaction where we sent something to the user
  const [lastOutbound] = await db
    .select({ createdAt: schema.interactions.createdAt })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.userId, userId),
        eq(schema.interactions.type, "follow_up"),
      ),
    )
    .orderBy(desc(schema.interactions.createdAt))
    .limit(1);

  const daysSinceLastContact = lastOutbound
    ? Math.floor((now - lastOutbound.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // User model density: count distinct memory types for self-scoped memories
  const memoryRows = await db
    .select({
      type: schema.memories.type,
      content: schema.memories.content,
    })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.active, true),
      ),
    );

  const distinctTypes = new Set(memoryRows.map((m) => m.type)).size;

  // Active processes (running or waiting for human)
  // processRuns has no userId, so we use interactions to scope
  const userInteractions = await db
    .select({ processRunId: schema.interactions.processRunId })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId));

  const userRunIds = new Set(
    userInteractions.map((i) => i.processRunId).filter(Boolean) as string[],
  );

  let activeProcessCount = 0;
  let pendingDeliverables = 0;

  if (userRunIds.size > 0) {
    const activeRuns = await db
      .select({ id: schema.processRuns.id, status: schema.processRuns.status })
      .from(schema.processRuns)
      .where(
        and(
          eq(schema.processRuns.status, "running"),
        ),
      );

    // Filter to user's runs
    activeProcessCount = activeRuns.filter((r) => userRunIds.has(r.id)).length;

    const waitingRuns = await db
      .select({ id: schema.processRuns.id })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.status, "waiting_review"));

    pendingDeliverables = waitingRuns.filter((r) => userRunIds.has(r.id)).length;
  }

  // Correction count: self-scoped correction memories
  const correctionCount = memoryRows.filter((m) => m.type === "correction").length;

  // Complexity signals for workspace graduation (Brief 099c AC1)
  let activeSignalCount = 0;
  if (activeProcessCount >= 3) activeSignalCount++;
  if (pendingDeliverables >= 2) activeSignalCount++;
  if (correctionCount >= 3) activeSignalCount++;
  if (wantsVisibility) activeSignalCount++;

  const complexitySignals: ComplexitySignals = {
    concurrentActiveProcesses: activeProcessCount,
    batchReviewCount: pendingDeliverables,
    correctionFrequency: correctionCount,
    wantsVisibility,
    activeSignalCount,
  };

  return {
    userId,
    userEmail,
    userName,
    personId,
    daysSinceSignup,
    daysSinceLastContact,
    modelDensity: classifyDensity(distinctTypes),
    distinctMemoryTypes: distinctTypes,
    activeProcessCount,
    pendingDeliverables,
    correctionCount,
    memories: memoryRows.map((m) => ({ type: m.type, content: m.content })),
    complexitySignals,
  };
}

// ============================================================
// Proactive Composition (AC3 — createCompletion, not selfConverse)
// ============================================================

/**
 * Ask Alex to decide whether to reach out, and if so, compose the message.
 *
 * Uses createCompletion() directly with getCognitiveCore() — the same
 * proven pattern as status-composer. No session turns created.
 */
async function composeProactiveMessage(
  snapshot: UserSnapshot,
  suggestWorkspace: boolean = false,
): Promise<{ shouldReach: boolean; subject?: string; body?: string }> {
  const cognitiveCore = getCognitiveCore();

  const userName = snapshot.userName || "the user";
  const earlyRelationship = snapshot.daysSinceSignup <= EARLY_RELATIONSHIP_DAYS;

  // Build memory summary for context
  const memorySummary = snapshot.memories.length > 0
    ? snapshot.memories.map((m) => `- [${m.type}] ${m.content}`).join("\n")
    : "(No memories yet — this is a brand new relationship)";

  const systemPrompt = `${cognitiveCore}

## Your Role Right Now

You are Alex, deciding whether to proactively reach out to ${userName} (${snapshot.userEmail}).
This is NOT a conversation — you are composing a message to send, not responding to one.

## User Snapshot

- Days since signup: ${snapshot.daysSinceSignup}
- Days since last contact: ${snapshot.daysSinceLastContact ?? "never contacted"}
- User model density: ${snapshot.modelDensity} (${snapshot.distinctMemoryTypes} distinct memory types)
- Active processes: ${snapshot.activeProcessCount}
- Pending deliverables: ${snapshot.pendingDeliverables}
- Corrections received: ${snapshot.correctionCount}
${earlyRelationship ? "- ** EARLY RELATIONSHIP ** — first 7 days, higher propensity to build trust" : "- Established relationship — natural rhythm, reach out only when substantive"}

## What Alex Knows About This User

${memorySummary}

## Onboarding Relationship Principles

- Demonstrate competence early — every message should show you're working and producing value
- Invite correction warmly — "Does this match what you had in mind?" not "Please review"
- Suggest new value naturally — weave suggestions into deliverables, not as separate pitches
- Deepen understanding progressively — if the user model is sparse, weave intake questions into deliverables
- Respect silence when there's nothing substantive to offer — never "just checking in"

## Rules

1. EVERY message MUST have substantive content: research results, process updates, deliverable summaries, or specific suggestions. NEVER send empty check-ins.
2. If the user model is sparse, weave 1-2 natural intake questions into a deliverable or update (briefing-as-intake pattern). Example: "I found 3 property managers in Christchurch. Before I narrow it down — are you looking for residential or commercial?"
3. If there are pending deliverables or completed processes, lead with those results.
4. If there's genuinely nothing substantive to say, respond with SILENT.
5. Keep messages concise and actionable. No fluff.
6. When suggesting things Alex could do, be specific: "I could research X" not "Let me know if you need anything."

${suggestWorkspace ? `## Workspace Suggestion (weave naturally — Brief 099c AC3)

This user's complexity signals indicate they'd benefit from a workspace — a dedicated place to see all their processes, review items, and interact in real time. Weave a natural suggestion into your outreach. NOT a hard sell or upsell — just a helpful observation: "You've got quite a bit going on — a workspace would let you see it all in one place. Want me to set one up?" Make it feel like a natural part of the update, not a separate pitch.
` : ""}## Response Format

If you decide to reach out, respond with:
SUBJECT: <subject line>
BODY:
<the message body>

If you decide NOT to reach out (nothing substantive), respond with exactly:
SILENT`;

  const response = await createCompletion({
    purpose: "conversation",
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: "Based on the user snapshot and what you know, should you reach out? If yes, compose the message.",
      },
    ],
    maxTokens: 1024,
  });

  const text = extractText(response.content).trim();

  if (text === "SILENT" || text.startsWith("SILENT")) {
    return { shouldReach: false };
  }

  // Parse SUBJECT: and BODY: from response
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const bodyMatch = text.match(/BODY:\n([\s\S]+)$/m);

  if (!subjectMatch || !bodyMatch) {
    // LLM didn't follow format — treat as silent
    console.log(`[relationship] LLM response didn't follow format for user ${snapshot.userId.slice(0, 8)}, treating as silent`);
    return { shouldReach: false };
  }

  return {
    shouldReach: true,
    subject: subjectMatch[1].trim(),
    body: bodyMatch[1].trim(),
  };
}

// ============================================================
// Recency Check
// ============================================================

/**
 * Check if we've sent proactive outreach to this user too recently.
 * Uses the most recent "follow_up" interaction as the recency signal.
 */
async function lastProactiveOutreachAt(userId: string): Promise<Date | null> {
  const [last] = await db
    .select({ createdAt: schema.interactions.createdAt })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.userId, userId),
        eq(schema.interactions.type, "follow_up"),
      ),
    )
    .orderBy(desc(schema.interactions.createdAt))
    .limit(1);

  return last?.createdAt ?? null;
}

// ============================================================
// Main: Run Relationship Pulse (AC1, AC9)
// ============================================================

/**
 * Run the relationship pulse for all active network users.
 * Called by pulseTick() as step 4, after status composition.
 *
 * @param statusResult — result from status-composer this tick.
 *   Users who received a status update are skipped (AC9 — no double-notify).
 */
export async function runRelationshipPulse(
  statusResult: StatusCheckResult,
): Promise<RelationshipPulseResult> {
  const result: RelationshipPulseResult = {
    checked: 0,
    outreachSent: 0,
    skipped: 0,
    details: [],
  };

  // Build set of users who already got status this tick
  const statusSentUserIds = new Set(
    statusResult.details
      .filter((d) => d.action === "sent")
      .map((d) => d.userId),
  );

  // Get all active AND workspace network users (Brief 099c AC8 — workspace users get relationship pulse too)
  const users = await db
    .select()
    .from(schema.networkUsers)
    .where(inArray(schema.networkUsers.status, ["active", "workspace"]));

  if (users.length === 0) return result;

  for (const user of users) {
    result.checked++;

    // Brief 108 AC3: Skip paused users
    if (user.pausedAt) {
      result.skipped++;
      result.details.push({ userId: user.id, action: "skipped_no_person" });
      continue;
    }

    // Skip users without person records
    if (!user.personId) {
      result.skipped++;
      result.details.push({ userId: user.id, action: "skipped_no_person" });
      continue;
    }

    // AC9: Skip users who received status this tick (no double-notify)
    if (statusSentUserIds.has(user.id)) {
      result.skipped++;
      result.details.push({ userId: user.id, action: "skipped_status_sent" });
      console.log(`[relationship] Skipping ${user.email} — status sent this tick`);
      continue;
    }

    // Check recency — don't spam
    const lastOutreach = await lastProactiveOutreachAt(user.id);
    if (lastOutreach) {
      const msSinceLastOutreach = Date.now() - lastOutreach.getTime();
      if (msSinceLastOutreach < MIN_MS_BETWEEN_OUTREACH) {
        result.skipped++;
        result.details.push({ userId: user.id, action: "skipped_too_recent" });
        continue;
      }
    }

    // Build snapshot and ask Alex to decide
    const snapshot = await buildUserSnapshot(
      user.id,
      user.email,
      user.name ?? undefined,
      user.personId,
      user.createdAt,
      user.wantsVisibility ?? false,
    );

    // Workspace graduation: suggest workspace when 2+ complexity signals present
    // AND user hasn't been suggested before (workspaceSuggestedAt is null)
    // AND user is not already a workspace user (Brief 099c AC2)
    const shouldSuggestWorkspace =
      user.status === "active" &&
      snapshot.complexitySignals.activeSignalCount >= 2 &&
      !user.workspaceSuggestedAt;

    console.log(
      `[relationship] User ${user.email}: ${snapshot.modelDensity} model (day ${snapshot.daysSinceSignup}), ${snapshot.activeProcessCount} active processes${shouldSuggestWorkspace ? `, complexity threshold met (${snapshot.complexitySignals.activeSignalCount} signals)` : ""}`,
    );

    try {
      const decision = await composeProactiveMessage(snapshot, shouldSuggestWorkspace);

      if (!decision.shouldReach || !decision.subject || !decision.body) {
        result.skipped++;
        result.details.push({ userId: user.id, action: "skipped_llm_silent" });
        console.log(`[relationship] User ${user.email}: Alex chose silence (nothing substantive)`);
        continue;
      }

      // Send via notifyUser (channel-agnostic)
      await notifyUser({
        userId: user.id,
        personId: user.personId,
        subject: decision.subject,
        body: decision.body,
      });

      // Set workspaceSuggestedAt if we suggested a workspace (Brief 099c AC4 — set once, never cleared)
      if (shouldSuggestWorkspace) {
        await db
          .update(schema.networkUsers)
          .set({ workspaceSuggestedAt: new Date() })
          .where(eq(schema.networkUsers.id, user.id));
        console.log(`[relationship] Workspace suggested to ${user.email}`);
      }

      result.outreachSent++;
      result.details.push({ userId: user.id, action: "outreach_sent" });
      console.log(`[relationship] Sent proactive outreach to ${user.email}: "${decision.subject}"`);
    } catch (err) {
      // Non-fatal — log and continue to next user
      console.error(`[relationship] Error composing for ${user.email}:`, err);
      result.skipped++;
      result.details.push({ userId: user.id, action: "skipped_llm_silent" });
    }
  }

  return result;
}

// Exported for testing
export { buildUserSnapshot, composeProactiveMessage };
