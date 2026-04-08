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
import { eq, and, gt, desc, inArray } from "drizzle-orm";
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
  // Count new interactions since cutoff
  const recentInteractions = await db
    .select({ id: schema.interactions.id, type: schema.interactions.type, summary: schema.interactions.summary })
    .from(schema.interactions)
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

  // Build highlights
  const highlights: string[] = [];
  const replies = recentInteractions.filter((i) => i.type === "reply_received");
  if (replies.length > 0) {
    highlights.push(`${replies.length} new ${replies.length === 1 ? "reply" : "replies"} received`);
  }

  const outreach = recentInteractions.filter((i) => i.type === "outreach_sent");
  if (outreach.length > 0) {
    highlights.push(`${outreach.length} outreach ${outreach.length === 1 ? "message" : "messages"} sent`);
  }

  if (completedRuns.length > 0) {
    highlights.push(`${completedRuns.length} ${completedRuns.length === 1 ? "process" : "processes"} completed`);
  }

  if (pendingRuns.length > 0) {
    highlights.push(`${pendingRuns.length} pending ${pendingRuns.length === 1 ? "approval" : "approvals"}`);
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
 * Compose a concise status email body from gathered data.
 * Optionally weaves in a workspace suggestion (AC5, AC8).
 */
function composeStatusEmail(
  data: StatusData,
  workspaceSuggestionReason?: string,
): { subject: string; body: string } {
  const name = data.userName || "there";
  const subject = `Your Ditto update — ${data.highlights[0] || "activity summary"}`;

  const lines: string[] = [
    `Hi ${name},`,
    "",
    "Here's what's been happening:",
    "",
  ];

  for (const highlight of data.highlights) {
    lines.push(`• ${highlight}`);
  }

  if (data.activeRuns > 0) {
    lines.push("");
    lines.push(`${data.activeRuns} ${data.activeRuns === 1 ? "process is" : "processes are"} currently active.`);
  }

  if (data.pendingApprovals > 0) {
    lines.push("");
    lines.push(`You have ${data.pendingApprovals} item${data.pendingApprovals === 1 ? "" : "s"} waiting for your review.`);
  }

  // Workspace suggestion woven into the briefing (AC5, AC8)
  if (workspaceSuggestionReason) {
    lines.push("");
    lines.push(`By the way — ${workspaceSuggestionReason}. I can set one up where you see everything in one place. Just reply "yes" if you'd like that.`);
  }

  lines.push("");
  lines.push("Reply to this email if you have questions or want me to focus on something specific.");

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

  for (const user of users) {
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

    // Find last status email for this user
    const [lastStatus] = await db
      .select({ createdAt: schema.interactions.createdAt })
      .from(schema.interactions)
      .where(
        and(
          eq(schema.interactions.userId, user.id),
          eq(schema.interactions.type, "follow_up"),
        ),
      )
      .orderBy(desc(schema.interactions.createdAt))
      .limit(1);

    const lastStatusAt = lastStatus?.createdAt ?? null;
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

    // Compose and send status update via user's preferred channel
    const { subject, body } = composeStatusEmail(data, workspaceSuggestionReason);

    await notifyUser({
      userId: user.id,
      personId: user.personId!,
      subject,
      body,
    });

    result.sent++;
    result.details.push({ userId: user.id, action: "sent" });

    console.log(`[status] Sent status update to ${user.email}: ${data.highlights.join(", ")}`);
  }

  return result;
}

// Exported for testing
export { shouldSendStatus, composeStatusEmail, gatherStatusData, WORKSPACE_SUGGESTION_CONTENT };
