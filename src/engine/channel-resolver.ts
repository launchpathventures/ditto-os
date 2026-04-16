/**
 * Ditto — Channel Resolver
 *
 * Resolves the correct email delivery channel at runtime based on
 * the step's sending identity and the user's connected integrations.
 *
 * Identity × Channel Matrix:
 * | Identity      | Gmail Connected | Gmail NOT Connected     |
 * |---------------|-----------------|-------------------------|
 * | principal     | AgentMail       | AgentMail               |
 * | user          | Gmail API       | AgentMail (fallback)    |
 * | agent-of-user | Gmail API       | AgentMail (fallback)    |
 * | ghost         | Gmail API       | AgentMail (fallback)    |
 *
 * agent-of-user and ghost are legacy values that resolve identically to 'user'.
 *
 * Provenance: Brief 152 (Sending Identity Channel Routing),
 * Composio entity-based tool resolution (pattern level)
 */

import type { ChannelAdapter } from "./channel";
import type { PersonaId } from "../db/schema";
import { createAgentMailAdapterForPersona, GmailApiAdapter } from "./channel";
import { hasIntegration, getGoogleCredential } from "./integration-availability";
import { db, schema } from "../db";

// ============================================================
// Types
// ============================================================

export interface ResolvedChannel {
  /** Resolved adapter. Null when AgentMail is not configured — sendAndRecord handles this gracefully. */
  adapter: ChannelAdapter | null;
  fromIdentity: {
    personaId: PersonaId;
    fromAddress: string;
    displayName: string;
  };
  /** The channel that was selected */
  channel: "agentmail" | "gmail-api";
  /** If a fallback was used, the reason why */
  fallbackReason?: string;
}

/** Sending identities that resolve to 'user' channel routing */
const USER_IDENTITIES = new Set(["user", "agent-of-user", "ghost"]);

// ============================================================
// Resolution
// ============================================================

/**
 * Resolve the email delivery channel based on sending identity and
 * the user's connected integrations.
 *
 * - 'principal' always routes to AgentMail (Alex sends as Alex).
 * - 'user' (and legacy 'agent-of-user'/'ghost') routes to Gmail API
 *   when connected, with AgentMail as fallback.
 *
 * Logs channel routing decisions as activities for the learning layer.
 */
export async function resolveEmailChannel(
  sendingIdentity: string | null | undefined,
  userId: string,
): Promise<ResolvedChannel> {
  const identity = sendingIdentity ?? "principal";

  // Principal identity: always AgentMail
  if (!USER_IDENTITIES.has(identity)) {
    const result = resolveAgentMailChannel("alex");
    await logRoutingDecision(userId, identity, result.channel, undefined);
    return result;
  }

  // User identity: try Gmail API first, fall back to AgentMail
  const hasGmail = await hasIntegration(userId, "google-workspace");
  if (hasGmail) {
    const tokens = await getGoogleCredential(userId);
    if (tokens) {
      const result: ResolvedChannel = {
        adapter: new GmailApiAdapter(userId, tokens.email, ""),
        fromIdentity: {
          personaId: "alex",
          fromAddress: tokens.email,
          displayName: "",
        },
        channel: "gmail-api",
      };
      await logRoutingDecision(userId, identity, "gmail-api", undefined);
      return result;
    }
  }

  // Fallback: AgentMail
  const fallbackReason = "gmail_not_connected";
  const result = resolveAgentMailChannel("alex", fallbackReason);
  await logRoutingDecision(userId, identity, "agentmail", fallbackReason);
  return result;
}

/**
 * Resolve to AgentMail adapter for a given persona.
 */
function resolveAgentMailChannel(
  personaId: PersonaId,
  fallbackReason?: string,
): ResolvedChannel {
  const adapter = createAgentMailAdapterForPersona(personaId);
  const config = getAgentMailConfig();

  return {
    adapter,
    fromIdentity: {
      personaId,
      fromAddress: config?.alexInbox ?? "alex@agentmail.to",
      displayName: personaId === "alex" ? "Alex from Ditto" : "Mira from Ditto",
    },
    channel: "agentmail",
    fallbackReason,
  };
}

function getAgentMailConfig() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) return null;
  return {
    alexInbox: process.env.AGENTMAIL_ALEX_INBOX ?? "alex-ditto@agentmail.to",
    miraInbox: process.env.AGENTMAIL_MIRA_INBOX ?? "mira-ditto@agentmail.to",
  };
}

// ============================================================
// Activity Logging
// ============================================================

/**
 * Log channel routing decision as an activity for the learning layer.
 * Enables: "How often does user identity fall back to AgentMail?"
 *
 * Note: no stepRunId guard (Insight-180) — this is diagnostic logging
 * of a routing decision, not an external side effect. The actual email
 * send flows through sendAndRecord which enforces the guard.
 */
async function logRoutingDecision(
  userId: string,
  sendingIdentity: string,
  channel: string,
  fallbackReason: string | undefined,
): Promise<void> {
  try {
    await db.insert(schema.activities).values({
      action: "channel.routing_decision",
      actorType: "system",
      entityType: "user",
      entityId: userId,
      metadata: {
        sendingIdentity,
        channel,
        ...(fallbackReason ? { fallbackReason } : {}),
      },
    });
  } catch {
    // Non-critical — don't fail the send path if logging fails
  }
}
