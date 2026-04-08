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
 * Provenance: Insight-161 (email/workspace boundary),
 * channel.ts ChannelAdapter interface.
 */

import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { sendAndRecord } from "./channel";
import { emitNetworkEvent } from "./network-events";
import { recordInteraction } from "./people";

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
}

export interface NotifyResult {
  success: boolean;
  channel: "email" | "voice" | "sms" | "workspace";
  interactionId?: string;
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
    // Workspace user: route to workspace push notification via SSE (Brief 099c AC5).
    // Assumes workspace is always online when provisioned — online detection deferred.
    return "workspace";
  }

  // Default: email (active users, unknown status, churned edge cases)
  return "email";
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
      });
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
        });

        return {
          success: result.success,
          channel: "email",
          interactionId: result.interactionId,
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
          });

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
