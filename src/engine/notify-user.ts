/**
 * Ditto — Channel-Agnostic User Notification
 *
 * The intelligence layer decides WHAT to say and WHEN.
 * This module decides HOW to deliver it based on the user's
 * available channels. Today that's email. Tomorrow it could
 * be voice, SMS, or workspace push notification.
 *
 * Every outbound communication from Alex to a user goes through
 * this function. No module should call sendAndRecord() directly
 * for user notifications — use notifyUser() instead.
 *
 * Email throttle architecture (Brief 144):
 *   Layer 1: Caller-level gating (status-composer: 3 days, pulse: 24h)
 *   Layer 2: notifyUser daily cap (MAX_EMAILS_PER_USER_PER_DAY)
 *   Layer 3: lastNotifiedAt on networkUsers (single source of truth for
 *            "when did Alex last email this user" — no fragile interaction queries)
 *
 * Provenance: Insight-161 (email/workspace boundary),
 * channel.ts ChannelAdapter interface.
 */

import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { sendAndRecord } from "./channel";
import { emitNetworkEvent } from "./network-events";
import { recordInteraction } from "./people";

// ============================================================
// Email Throttle Constants
// ============================================================

/**
 * Maximum emails from Alex to a single user per 24h rolling window.
 * Hard safety cap — even if all upstream recency checks have bugs,
 * this prevents the email storm disaster. 5/day covers:
 *   1 status email + 1 pulse email + 2-3 completion notifications
 */
export const MAX_EMAILS_PER_USER_PER_DAY = 5;

/**
 * Minimum milliseconds between ANY two notification emails to a user.
 * Even within the daily cap, never send two emails less than 1 hour apart.
 * This prevents burst patterns (e.g., status + pulse firing on the same tick).
 */
const MIN_MS_BETWEEN_NOTIFICATIONS = 60 * 60 * 1000; // 1 hour

// ============================================================
// Types
// ============================================================

export interface UserNotification {
  /** The network user to notify */
  userId: string;
  /** The person record this notification relates to (for interaction tracking) */
  personId: string;
  /** Notification subject/title */
  subject: string;
  /** Notification body — plain text, channel adapter handles formatting */
  body: string;
  /** Alex or Mira */
  personaId?: "alex" | "mira";
  /** Interaction mode for tracking */
  mode?: "selling" | "connecting" | "nurture";
  /** If replying to a specific inbound message */
  inReplyToMessageId?: string;
  /** Whether to include opt-out footer */
  includeOptOut?: boolean;
  /** When true, always send email regardless of resolved channel — workspace users get both (Brief 099c AC7) */
  urgent?: boolean;
  /** URL to a bespoke review page — when present, email includes a "View details →" link (Brief 106) */
  reviewPageUrl?: string;
  /**
   * Pre-rendered HTML blocks (tables, charts) to splice into the email
   * after the text body, outside the textToHtml() pipeline.
   * Keeps textToHtml pure — always escapes. (Brief 149 AC18)
   */
  htmlBlocks?: string[];
}

export interface NotifyResult {
  success: boolean;
  channel: "email" | "voice" | "sms" | "workspace";
  interactionId?: string;
  /** AgentMail messageId — available when channel is email */
  messageId?: string;
  /** AgentMail threadId — available when channel is email */
  threadId?: string;
  error?: string;
}

// ============================================================
// Channel Resolution
// ============================================================

/**
 * Resolve the best channel for reaching a user.
 *
 * Routing logic (Insight-161):
 * - Email-only user (status "active") → email
 * - Workspace user (status "workspace") → workspace push (when available),
 *   falling back to email. Urgent items go to both.
 * - Voice user (future) → voice call or message
 *
 * Current implementation: always email. The routing decision is
 * separated so that when workspace push / voice channels arrive,
 * only this function changes — no intelligence-layer changes needed.
 */
async function resolveChannel(
  userId: string,
): Promise<"email" | "workspace"> {
  // Look up user's deployment state
  const [user] = await db
    .select({ status: schema.networkUsers.status })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  if (user?.status === "workspace") {
    return "workspace";
  }

  return "email";
}

// ============================================================
// Email Throttle Check
// ============================================================

/**
 * Check if sending another email to this user would violate the throttle.
 *
 * Uses networkUsers.lastNotifiedAt — a single timestamp updated on every
 * successful notification. No interaction table scans, no fragile type matching.
 *
 * Two checks:
 * 1. Minimum gap between any two notifications (1 hour)
 * 2. Daily cap (5 emails/24h) — uses interaction count as backup
 */
async function checkEmailThrottle(
  userId: string,
  personId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const [user] = await db
    .select({ lastNotifiedAt: schema.networkUsers.lastNotifiedAt })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  // Check minimum gap between notifications
  if (user?.lastNotifiedAt) {
    const msSinceLast = Date.now() - user.lastNotifiedAt.getTime();
    if (msSinceLast < MIN_MS_BETWEEN_NOTIFICATIONS) {
      const minutesAgo = Math.round(msSinceLast / 60000);
      return {
        allowed: false,
        reason: `Last notification ${minutesAgo}m ago (min gap: ${MIN_MS_BETWEEN_NOTIFICATIONS / 60000}m)`,
      };
    }
  }

  // Check daily cap via interaction count (belt + suspenders with lastNotifiedAt)
  const { gte } = await import("drizzle-orm");
  const { and } = await import("drizzle-orm");
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentNotifications = await db
    .select({ id: schema.interactions.id })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.userId, userId),
        eq(schema.interactions.personId, personId),
        gte(schema.interactions.createdAt, oneDayAgo),
      ),
    )
    .limit(MAX_EMAILS_PER_USER_PER_DAY + 1);

  if (recentNotifications.length >= MAX_EMAILS_PER_USER_PER_DAY) {
    return {
      allowed: false,
      reason: `Daily cap (${MAX_EMAILS_PER_USER_PER_DAY}) exceeded`,
    };
  }

  return { allowed: true };
}

/**
 * Stamp networkUsers.lastNotifiedAt after a successful email send.
 * Fire-and-forget — failure here doesn't affect the notification.
 */
async function stampLastNotified(userId: string): Promise<void> {
  try {
    await db
      .update(schema.networkUsers)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(schema.networkUsers.id, userId));
  } catch {
    console.warn(`[notify] Failed to stamp lastNotifiedAt for user ${userId.slice(0, 8)}`);
  }
}

// ============================================================
// Main Notification Function
// ============================================================

/**
 * Send a notification to a user through the best available channel.
 *
 * This is the single path for all Alex → User communications.
 * The intelligence layer (status-composer, completion-notifier,
 * relationship-pulse, inbound-handler) calls this — never
 * sendAndRecord() directly.
 *
 * Fire-and-forget pattern: callers should .catch() and continue.
 */
export async function notifyUser(
  notification: UserNotification,
): Promise<NotifyResult> {
  // Build the email body — append review page link if present (Brief 106)
  const buildBody = (body: string): string => {
    if (!notification.reviewPageUrl) return body;
    const baseUrl = process.env.NETWORK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const fullUrl = notification.reviewPageUrl.startsWith("http")
      ? notification.reviewPageUrl
      : `${baseUrl}${notification.reviewPageUrl}`;
    return `${body}\n\n---\nView details: ${fullUrl}`;
  };

  const channel = await resolveChannel(notification.userId);

  // Email throttle — hard safety net (Brief 144)
  // Prevents email storms even if upstream silence/recency checks have bugs.
  // Urgent notifications and workspace SSE bypass the throttle.
  if (channel === "email" && !notification.urgent) {
    const throttle = await checkEmailThrottle(notification.userId, notification.personId);
    if (!throttle.allowed) {
      console.warn(
        `[notify] THROTTLED: user ${notification.userId.slice(0, 8)} — ${throttle.reason}. ` +
        `Subject: "${notification.subject.slice(0, 50)}". Suppressing.`,
      );
      return {
        success: false,
        channel: "email",
        error: throttle.reason,
      };
    }
  }

  // Look up user's email
  const [networkUser] = await db
    .select({ email: schema.networkUsers.email })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, notification.userId))
    .limit(1);

  if (!networkUser) {
    return {
      success: false,
      channel,
      error: `No network user found for ${notification.userId}`,
    };
  }

  // Urgent flag (Brief 099c AC7): always send email regardless of channel.
  // Workspace users get both SSE AND email for urgent items.
  if (notification.urgent && channel !== "email") {
    try {
      await sendAndRecord({
        to: networkUser.email,
        subject: notification.subject,
        body: buildBody(notification.body),
        personaId: notification.personaId ?? "alex",
        mode: notification.mode ?? "connecting",
        personId: notification.personId,
        userId: notification.userId,
        includeOptOut: notification.includeOptOut ?? false,
        inReplyToMessageId: notification.inReplyToMessageId,
        htmlBlocks: notification.htmlBlocks,
      });
      await stampLastNotified(notification.userId);
      console.log(`[notify] Urgent email fallback sent to ${networkUser.email}`);
    } catch (err) {
      console.error(`[notify] Urgent email fallback failed for ${networkUser.email}:`, err);
    }
  }

  switch (channel) {
    case "email": {
      try {
        const result = await sendAndRecord({
          to: networkUser.email,
          subject: notification.subject,
          body: buildBody(notification.body),
          personaId: notification.personaId ?? "alex",
          mode: notification.mode ?? "connecting",
          personId: notification.personId,
          userId: notification.userId,
          includeOptOut: notification.includeOptOut ?? false,
          inReplyToMessageId: notification.inReplyToMessageId,
          htmlBlocks: notification.htmlBlocks,
        });

        // Stamp lastNotifiedAt on success — this is the single source of truth
        // for "when did Alex last email this user"
        if (result.success) {
          await stampLastNotified(notification.userId);
        }

        return {
          success: result.success,
          channel: "email",
          interactionId: result.interactionId,
          messageId: result.messageId,
          threadId: result.threadId,
          ...(result.error ? { error: result.error } : {}),
        };
      } catch (err) {
        return {
          success: false,
          channel: "email",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "workspace": {
      // Emit via Network Events SSE (Brief 089). Workspace UI receives in real time.
      try {
        const eventId = emitNetworkEvent(notification.userId, "notification", {
          subject: notification.subject,
          body: notification.body,
          personaId: notification.personaId ?? "alex",
          mode: notification.mode ?? "connecting",
          personId: notification.personId,
        });

        console.log(`[notify] ${notification.userId.slice(0, 8)}: channel=workspace (SSE event ${eventId})`);

        // Record interaction so recency tracking works for workspace users
        const interaction = await recordInteraction({
          personId: notification.personId,
          userId: notification.userId,
          type: "follow_up",
          channel: "workspace",
          mode: notification.mode ?? "connecting",
          subject: notification.subject,
          summary: notification.body.slice(0, 200),
        });

        // Stamp lastNotifiedAt for workspace users too — so pulse/status
        // recency checks work regardless of channel
        await stampLastNotified(notification.userId);

        return {
          success: true,
          channel: "workspace",
          interactionId: interaction?.id,
        };
      } catch (err) {
        // Fallback to email on SSE failure
        console.error(`[notify] Workspace SSE failed for ${networkUser.email}, falling back to email:`, err);
        try {
          const result = await sendAndRecord({
            to: networkUser.email,
            subject: notification.subject,
            body: buildBody(notification.body),
            personaId: notification.personaId ?? "alex",
            mode: notification.mode ?? "connecting",
            personId: notification.personId,
            userId: notification.userId,
            includeOptOut: notification.includeOptOut ?? false,
            inReplyToMessageId: notification.inReplyToMessageId,
            htmlBlocks: notification.htmlBlocks,
          });

          if (result.success) {
            await stampLastNotified(notification.userId);
          }

          return {
            success: result.success,
            channel: "email",
            interactionId: result.interactionId,
            ...(result.error ? { error: result.error } : {}),
          };
        } catch (emailErr) {
          return {
            success: false,
            channel: "workspace",
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
          };
        }
      }
    }

    // Future channels:
    // case "voice": return voiceAdapter.call(...)
    // case "sms": return smsAdapter.send(...)
  }
}
