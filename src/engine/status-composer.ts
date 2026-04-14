/**
 * Ditto — Status Composer (Brief 098b)
 *
 * Composes status updates for active users based on recent activity.
 * Respects "silence is a feature" — only sends when there's something
 * worth reporting AND enough time has passed since last status email.
 *
 * Thresholds (AC9):
 * - At least 1 new interaction, completed run, or pending approval since last status
 * - At least 3 days since last status email
 *
 * Layer classification: L2 (Agent/Heartbeat) — status composition is
 * infrastructure that the pulse drives, not a process itself.
 *
 * Provenance: Brief 098b, pipeline-tracking template pattern.
 */

import { db, schema } from "../db";
import { eq, and, gt, inArray } from "drizzle-orm";
import { notifyUser } from "./notify-user";
import { checkWorkspaceReadiness } from "./workspace-readiness";
import { isDismissed } from "./suggestion-dismissals";

// ============================================================
// Constants
// ============================================================

/** Minimum days between status emails (AC9) */
const MIN_DAYS_BETWEEN_STATUS = 3;

/** Minimum ms between status emails */
const MIN_MS_BETWEEN_STATUS = MIN_DAYS_BETWEEN_STATUS * 24 * 60 * 60 * 1000;

/** Fixed content string for workspace suggestion dismissal tracking */
const WORKSPACE_SUGGESTION_CONTENT = "workspace_upgrade_suggestion";

// ============================================================
// Types
// ============================================================

export interface StatusData {
  userId: string;
  userEmail: string;
  userName?: string;
  personId: string;
  newInteractions: number;
  completedRuns: number;
  pendingApprovals: number;
  activeRuns: number;
  /** Summary of key activity for composing the email */
  highlights: string[];
}

export interface StatusCheckResult {
  checked: number;
  sent: number;
  skipped: number;
  details: Array<{
    userId: string;
    action: "sent" | "skipped_no_activity" | "skipped_too_recent";
  }>;
}

// ============================================================
// Status Data Gathering (AC8)
// ============================================================

/**
 * Gather status data for a single user.
 * Queries interactions, active/completed runs, and pending approvals
 * since a given cutoff date.
 */
async function gatherStatusData(
  userId: string,
  userEmail: string,
  userName: string | undefined,
  personId: string,
  since: Date,
): Promise<StatusData> {
  // Count new interactions since cutoff — join people to get contact names (Brief 144 AC6)
  const recentInteractions = await db
    .select({
      id: schema.interactions.id,
      type: schema.interactions.type,
      summary: schema.interactions.summary,
      personId: schema.interactions.personId,
      personName: schema.people.name,
      personOrg: schema.people.organization,
      outcome: schema.interactions.outcome,
      subject: schema.interactions.subject,
    })
    .from(schema.interactions)
    .leftJoin(schema.people, eq(schema.interactions.personId, schema.people.id))
    .where(
      and(
        eq(schema.interactions.userId, userId),
        gt(schema.interactions.createdAt, since),
      ),
    );

  // Count completed process runs since cutoff, scoped to this user's interactions.
  // processRuns has no userId column, so we scope via runs that have
  // interactions linked to this user. For single-user MVP this covers all runs;
  // for multi-user, this ensures we only count runs the user is involved in.
  const userRunIds = new Set(
    recentInteractions
      .map((i) => (i as unknown as { processRunId?: string }).processRunId)
      .filter(Boolean) as string[],
  );

  // Also check all user interactions (not just recent) for run scoping
  const allUserInteractions = await db
    .select({ processRunId: schema.interactions.processRunId })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId));

  for (const i of allUserInteractions) {
    if (i.processRunId) userRunIds.add(i.processRunId);
  }

  const completedRuns = userRunIds.size > 0
    ? await db
        .select({ id: schema.processRuns.id })
        .from(schema.processRuns)
        .where(
          and(
            eq(schema.processRuns.status, "approved"),
            gt(schema.processRuns.completedAt, since),
            inArray(schema.processRuns.id, [...userRunIds]),
          ),
        )
    : [];

  // Count pending approvals scoped to user's runs
  const pendingRuns = userRunIds.size > 0
    ? await db
        .select({ id: schema.processRuns.id })
        .from(schema.processRuns)
        .where(
          and(
            eq(schema.processRuns.status, "waiting_review"),
            inArray(schema.processRuns.id, [...userRunIds]),
          ),
        )
    : [];

  // Count active runs scoped to user's runs
  const activeRuns = userRunIds.size > 0
    ? await db
        .select({ id: schema.processRuns.id })
        .from(schema.processRuns)
        .where(
          and(
            inArray(schema.processRuns.status, ["running", "waiting_human"]),
            inArray(schema.processRuns.id, [...userRunIds]),
          ),
        )
    : [];

  // Build highlights with names, summaries, and outcomes — not just counts (Brief 144 AC6-10)
  const highlights: string[] = [];

  // Replies with contact names and outcomes
  const replies = recentInteractions.filter((i) => i.type === "reply_received");
  if (replies.length > 0) {
    for (const r of replies.slice(0, 5)) {
      const who = r.personName || "Someone";
      const org = r.personOrg ? ` at ${r.personOrg}` : "";
      const outcomeNote = r.outcome === "positive" ? " — they're interested" :
                          r.outcome === "negative" ? " — not interested" :
                          r.outcome === "deferred" ? " — asked to revisit later" :
                          r.outcome === "question" ? " — asked a question" :
                          r.outcome === "auto_reply" ? " — auto-reply (OOO)" : "";
      const detail = r.summary ? `: "${r.summary.slice(0, 100)}"` : "";
      highlights.push(`${who}${org} replied${outcomeNote}${detail}`);
    }
    if (replies.length > 5) {
      highlights.push(`...and ${replies.length - 5} more ${replies.length - 5 === 1 ? "reply" : "replies"}`);
    }
  }

  // Outreach with contact names
  const outreach = recentInteractions.filter((i) => i.type === "outreach_sent");
  if (outreach.length > 0) {
    for (const o of outreach.slice(0, 5)) {
      const who = o.personName || "Someone";
      const org = o.personOrg ? ` at ${o.personOrg}` : "";
      highlights.push(`Reached out to ${who}${org}`);
    }
    if (outreach.length > 5) {
      highlights.push(`...and ${outreach.length - 5} more outreach ${outreach.length - 5 === 1 ? "message" : "messages"}`);
    }
  }

  if (completedRuns.length > 0) {
    highlights.push(`${completedRuns.length} ${completedRuns.length === 1 ? "process" : "processes"} completed`);
  }

  if (pendingRuns.length > 0) {
    highlights.push(`${pendingRuns.length} item${pendingRuns.length === 1 ? "" : "s"} waiting for your review`);
  }

  // FLAG-4 fix: Catch-all for interaction types beyond reply/outreach
  // (e.g., follow_up, opt_out). Without this, highlights could be empty
  // while newInteractions > 0, sending contradictory signals to the LLM.
  const otherInteractions = recentInteractions.filter(
    (i) => i.type !== "reply_received" && i.type !== "outreach_sent",
  );
  if (otherInteractions.length > 0 && highlights.length === 0) {
    highlights.push(`${recentInteractions.length} new interaction${recentInteractions.length === 1 ? "" : "s"} recorded`);
  }

  return {
    userId,
    userEmail,
    userName,
    personId,
    newInteractions: recentInteractions.length,
    completedRuns: completedRuns.length,
    pendingApprovals: pendingRuns.length,
    activeRuns: activeRuns.length,
    highlights,
  };
}

// ============================================================
// Silence Check (AC9)
// ============================================================

/**
 * Check if a status email should be sent for this user.
 *
 * "Silence is a feature" — only send when:
 * (a) At least 1 new interaction, completed run, or pending approval since last status
 * (b) At least 3 days since last status email
 */
function shouldSendStatus(
  data: StatusData,
  lastStatusAt: Date | null,
): { send: boolean; reason: string } {
  // Check activity threshold FIRST — if there's nothing to report,
  // that's the real reason (not "too recent"). More accurate reporting.
  const hasActivity =
    data.newInteractions > 0 ||
    data.completedRuns > 0 ||
    data.pendingApprovals > 0;

  if (!hasActivity) {
    return { send: false, reason: "skipped_no_activity" };
  }

  // Check time threshold — don't spam even when there's activity
  if (lastStatusAt) {
    const msSinceLastStatus = Date.now() - lastStatusAt.getTime();
    if (msSinceLastStatus < MIN_MS_BETWEEN_STATUS) {
      return { send: false, reason: "skipped_too_recent" };
    }
  }

  return { send: true, reason: "thresholds_met" };
}

// ============================================================
// Status Email Composition
// ============================================================

/**
 * Compose a status email using LLM with Alex voice spec (Brief 144 AC7).
 * Falls back to hardcoded template if LLM fails (AC11).
 * Optionally weaves in a workspace suggestion (AC5, AC8).
 */
async function composeStatusEmail(
  data: StatusData,
  workspaceSuggestionReason?: string,
): Promise<{ subject: string; body: string }> {
  // Try LLM composition first
  try {
    const { createCompletion, extractText } = await import("./llm");
    const { getAlexEmailPrompt } = await import("./alex-voice");

    const alexVoice = getAlexEmailPrompt();
    const name = data.userName || "mate";

    const activitySummary = data.highlights.length > 0
      ? data.highlights.map((h) => `- ${h}`).join("\n")
      : "No significant activity to report.";

    const response = await createCompletion({
      system: [
        alexVoice,
        "",
        `You are writing a status update email to ${name} (${data.userEmail}).`,
        "This is a regular update about what you've been doing on their behalf.",
        "",
        "RULES:",
        "- Lead with the most important thing — a reply, a result, something that needs their attention",
        "- Name specific people and outcomes — never just counts",
        "- If there are pending approvals, make that the clear CTA",
        "- Keep it concise — this should take 30 seconds to read",
        "- End with one clear next step or invitation to reply",
        "- Do NOT include a greeting like 'Hi' or 'Hey' — jump straight into it",
        workspaceSuggestionReason
          ? `- Weave this suggestion naturally into the update: "${workspaceSuggestionReason}". Frame it as helpful, not a pitch.`
          : "",
      ].filter(Boolean).join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `Activity since last update:`,
            activitySummary,
            data.activeRuns > 0 ? `\n${data.activeRuns} active processes running.` : "",
            data.pendingApprovals > 0 ? `\n${data.pendingApprovals} items waiting for review.` : "",
          ].filter(Boolean).join("\n"),
        },
      ],
      maxTokens: 400,
      purpose: "writing",
    });

    const body = extractText(response.content).trim();

    if (body.length > 20) {
      // Quality gate on LLM-composed status email
      const { validateEmailVoice } = await import("./email-quality-gate");
      const gateResult = await validateEmailVoice(body, { recipientName: data.userName, callerContext: "composeStatusEmail" });
      const finalBody = gateResult.body;

      // Generate a subject from the first highlight
      const subject = data.highlights[0]
        ? `Update: ${data.highlights[0].slice(0, 60)}`
        : "Your update from Alex";

      return { subject, body: finalBody };
    }
  } catch (err) {
    console.warn("[status] LLM composition failed, using fallback:", (err as Error).message);
  }

  // Fallback: hardcoded template (AC11 — never sends an empty email)
  return composeStatusEmailFallback(data, workspaceSuggestionReason);
}

/**
 * Hardcoded fallback template for status emails.
 * Used when LLM composition fails. Still sounds like Alex — warm, direct, specific.
 */
function composeStatusEmailFallback(
  data: StatusData,
  workspaceSuggestionReason?: string,
): { subject: string; body: string } {
  const name = data.userName || "mate";
  const subject = data.highlights[0]
    ? `Update: ${data.highlights[0].slice(0, 60)}`
    : "Your update from Alex";

  const lines: string[] = [
    `${name} — quick update on what's been happening.`,
    "",
  ];

  for (const highlight of data.highlights) {
    lines.push(`- ${highlight}`);
  }

  if (data.activeRuns > 0) {
    lines.push("");
    lines.push(`${data.activeRuns} ${data.activeRuns === 1 ? "thing" : "things"} still in progress.`);
  }

  if (data.pendingApprovals > 0) {
    lines.push("");
    lines.push(`${data.pendingApprovals} item${data.pendingApprovals === 1 ? "" : "s"} need${data.pendingApprovals === 1 ? "s" : ""} your call — reply and I'll action it.`);
  }

  if (workspaceSuggestionReason) {
    lines.push("");
    lines.push(`By the way — ${workspaceSuggestionReason}. I can set up a workspace where you see everything in one place. Just reply "yes" if you'd like that.`);
  }

  lines.push("");
  lines.push("Reply to this email if you want me to adjust anything or dig deeper on something.");

  return { subject, body: lines.join("\n") };
}

// ============================================================
// Main: Run Status Composition Cycle (AC10)
// ============================================================

/**
 * Run the status composition cycle for all active network users.
 * Called by the pulse on each tick.
 *
 * For each active user:
 * 1. Find their last status email timestamp
 * 2. Gather activity data since then
 * 3. Check silence thresholds
 * 4. Send if warranted
 */
export async function runStatusComposition(): Promise<StatusCheckResult> {
  const result: StatusCheckResult = {
    checked: 0,
    sent: 0,
    skipped: 0,
    details: [],
  };

  // Get all active AND workspace network users (Brief 099c AC8)
  const users = await db
    .select()
    .from(schema.networkUsers)
    .where(inArray(schema.networkUsers.status, ["active", "workspace"]));

  if (users.length === 0) return result;

  // Deduplicate by email — multiple user records for the same email
  // can exist across test sessions. Only process the most recent one.
  const seenEmails = new Set<string>();
  const deduped = users.filter((u) => {
    const email = u.email.toLowerCase();
    if (seenEmails.has(email)) return false;
    seenEmails.add(email);
    return true;
  });

  for (const user of deduped) {
    result.checked++;

    // Brief 108 AC3: Skip paused users
    if (user.pausedAt) {
      result.skipped++;
      result.details.push({ userId: user.id, action: "skipped_no_activity" });
      continue;
    }

    if (!user.personId) {
      result.skipped++;
      result.details.push({ userId: user.id, action: "skipped_no_activity" });
      continue;
    }

    // Use networkUsers.lastNotifiedAt — the single source of truth for
    // "when did Alex last email this user". Updated by notifyUser() on
    // every successful send. No fragile interaction table queries.
    //
    // BUG FIX: Previously queried interactions for type "follow_up", but
    // notifyUser sends via sendAndRecord which records "outreach_sent".
    // The query never matched → lastStatusAt was always null → the 3-day
    // gate never fired → status email on EVERY pulse tick (every 5 min).
    const lastStatusAt = user.lastNotifiedAt ?? null;
    const since = lastStatusAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days

    // Gather activity data
    const data = await gatherStatusData(
      user.id,
      user.email,
      user.name ?? undefined,
      user.personId,
      since,
    );

    // Check silence thresholds
    const check = shouldSendStatus(data, lastStatusAt);

    if (!check.send) {
      result.skipped++;
      result.details.push({
        userId: user.id,
        action: check.reason as "skipped_no_activity" | "skipped_too_recent",
      });
      continue;
    }

    // Check workspace readiness for email-only users (Brief 110)
    let workspaceSuggestionReason: string | undefined;
    if (user.status !== "workspace") {
      const readiness = await checkWorkspaceReadiness(user.id);
      if (readiness.ready) {
        // Check dismissal — don't suggest if previously dismissed and still in 30-day window (AC6)
        const dismissed = await isDismissed(user.id, WORKSPACE_SUGGESTION_CONTENT);
        // Check cooldown — don't suggest if we already suggested within the last 30 days (AC7)
        const SUGGESTION_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
        const suggestedRecently = user.workspaceSuggestedAt
          && (Date.now() - user.workspaceSuggestedAt.getTime()) < SUGGESTION_COOLDOWN_MS;

        if (!dismissed && !suggestedRecently) {
          workspaceSuggestionReason = readiness.reason;
          // Mark suggestion timestamp (one-time tracking)
          await db
            .update(schema.networkUsers)
            .set({ workspaceSuggestedAt: new Date() })
            .where(eq(schema.networkUsers.id, user.id));
        }
      }
    }

    // Gather outreach batch summary for the period (Brief 149 AC19)
    let htmlBlocks: string[] | undefined;
    try {
      const { gatherOutreachBatchSummary, renderOutreachTableHtml } = await import("./outreach-table");
      const outreachSummary = await gatherOutreachBatchSummary(user.id, since);
      if (outreachSummary.entries.length > 0) {
        htmlBlocks = [renderOutreachTableHtml(outreachSummary)];
      }
    } catch (err) {
      console.warn("[status] Failed to gather outreach summary:", (err as Error).message);
    }

    // Compose and send status update via user's preferred channel
    const { subject, body } = await composeStatusEmail(data, workspaceSuggestionReason);

    await notifyUser({
      userId: user.id,
      personId: user.personId!,
      subject,
      body,
      htmlBlocks,
    });

    result.sent++;
    result.details.push({ userId: user.id, action: "sent" });

    console.log(`[status] Sent status update to ${user.email}: ${data.highlights.join(", ")}`);
  }

  return result;
}

// Exported for testing
export { shouldSendStatus, composeStatusEmail, gatherStatusData, WORKSPACE_SUGGESTION_CONTENT };
