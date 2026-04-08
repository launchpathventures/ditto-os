/**
 * Ditto — Admin Notification (Brief 108)
 *
 * Sends notifications to the Ditto admin team on trust downgrades
 * and quality threshold breaches. Uses email to ADMIN_EMAIL env var.
 *
 * Fire-and-forget pattern: callers should .catch() and continue.
 *
 * Provenance: Brief 108, notify-user.ts pattern (same fire-and-forget approach).
 */

import { sendAndRecord } from "./channel";

// ============================================================
// Types
// ============================================================

export interface AdminNotification {
  /** Subject line for the notification email */
  subject: string;
  /** Plain text body */
  body: string;
  /** User name affected (for context) */
  userName?: string;
  /** Process name affected */
  processName?: string;
}

export interface AdminNotifyResult {
  success: boolean;
  error?: string;
}

// ============================================================
// Main Function
// ============================================================

/**
 * Send a notification to the admin email address.
 *
 * Used for trust downgrades, quality threshold breaches, and
 * other events that need admin attention.
 *
 * Requires ADMIN_EMAIL env var to be set. If not set, logs a
 * warning and returns success: false.
 */
export async function notifyAdmin(
  notification: AdminNotification,
): Promise<AdminNotifyResult> {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.warn("[notify-admin] ADMIN_EMAIL not configured — skipping notification");
    return { success: false, error: "ADMIN_EMAIL not configured" };
  }

  try {
    // Use sendAndRecord with a synthetic "admin" person context.
    // Admin notifications don't need interaction tracking — we use
    // sendAndRecord for the email delivery infrastructure only.
    const result = await sendAndRecord({
      to: adminEmail,
      subject: notification.subject,
      body: notification.body,
      personaId: "alex",
      mode: "connecting",
      // Use a placeholder personId/userId for admin notifications.
      // These won't be tracked as real interactions.
      personId: "admin-notification",
      userId: "admin-notification",
    });

    if (result.success) {
      console.log(`[notify-admin] Notification sent: ${notification.subject}`);
    } else {
      console.error(`[notify-admin] Failed to send: ${result.error}`);
    }

    return { success: result.success, error: result.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[notify-admin] Error sending notification:`, error);
    return { success: false, error };
  }
}

// ============================================================
// Convenience: Trust Downgrade Notification
// ============================================================

/**
 * Send a downgrade notification to the admin team.
 * Called from executeTierChange() when a process tier drops.
 *
 * Brief 108 AC7: Email includes user name, process name,
 * old tier, new tier, evidence (recent correction/failure data).
 */
export async function notifyAdminOfDowngrade(params: {
  userName: string;
  processName: string;
  fromTier: string;
  toTier: string;
  reason: string;
  triggers?: Array<{ name: string; threshold: string; actual: string }>;
}): Promise<AdminNotifyResult> {
  const triggerDetails = params.triggers
    ?.map((t) => `  - ${t.name}: ${t.actual} (threshold: ${t.threshold})`)
    .join("\n") ?? "  (no trigger details)";

  const body = [
    `Trust tier downgrade detected for ${params.userName}'s process "${params.processName}".`,
    "",
    `Previous tier: ${params.fromTier}`,
    `New tier: ${params.toTier}`,
    `Reason: ${params.reason}`,
    "",
    "Trigger details:",
    triggerDetails,
    "",
    "Action required: Review this user's processes in the admin dashboard.",
  ].join("\n");

  return notifyAdmin({
    subject: `[Ditto Admin] Trust downgrade: ${params.processName} (${params.fromTier} → ${params.toTier})`,
    body,
    userName: params.userName,
    processName: params.processName,
  });
}
