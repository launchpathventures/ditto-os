/**
 * Ditto — Workspace Welcome Email (Brief 153)
 *
 * Generates a workspace magic link and sends a welcome email after
 * successful provisioning. Separated from the provisioner for
 * testability and reuse (admin-triggered provisioning should also
 * send welcome emails).
 *
 * Side-effect exemption (Insight-180): sendWorkspaceWelcome() sends via
 * notifyUser(), which is infrastructure-level notification outside harness
 * step execution — consistent with the existing pattern.
 *
 * Provenance: Brief 153 (workspace provisioning wiring), Brief 123 (magic link).
 */

import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { createWorkspaceMagicLink } from "./magic-link";
import { notifyUser } from "./notify-user";

export interface WorkspaceWelcomeResult {
  success: boolean;
  magicLinkUrl?: string;
  error?: string;
}

/**
 * Send a welcome email with a magic link to a user's new workspace.
 *
 * @param userId - The network user ID
 * @param workspaceUrl - The provisioned workspace URL (e.g. https://ditto-ws-xxx.up.railway.app)
 */
export async function sendWorkspaceWelcome(
  userId: string,
  workspaceUrl: string,
): Promise<WorkspaceWelcomeResult> {
  // Look up user
  const [user] = await db
    .select({
      email: schema.networkUsers.email,
      name: schema.networkUsers.name,
      personId: schema.networkUsers.personId,
    })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  if (!user) {
    return { success: false, error: `No network user found for ${userId}` };
  }

  if (!user.personId) {
    return { success: false, error: `No personId linked for user ${userId}` };
  }

  // Generate a workspace magic link
  const magicLink = await createWorkspaceMagicLink(user.email);
  if (!magicLink) {
    return { success: false, error: "Magic link rate limited" };
  }

  // Send the welcome email
  const body = [
    `Your workspace is ready.`,
    ``,
    `Here's your private link:`,
    magicLink.url,
    ``,
    `Click it to get started — everything you've been working on is already there.`,
  ].join("\n");

  try {
    await notifyUser({
      userId,
      personId: user.personId,
      subject: "Your workspace is ready",
      body,
      includeOptOut: false,
      urgent: true, // Workspace welcome should always reach the user
    });

    return { success: true, magicLinkUrl: magicLink.url };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
