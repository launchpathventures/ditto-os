/**
 * Channel Abstraction — typed send/receive layer for the Network Agent.
 *
 * Two email adapters:
 * - **AgentMailAdapter** (primary) — purpose-built for AI agents. Programmatic inbox
 *   creation, native reply handling with extracted text, thread management, webhooks.
 * - **GmailChannelAdapter** (fallback) — wraps Brief 078 Google Workspace integration
 *   for users who prefer Gmail or for workspace email (inbox triage, etc).
 *
 * Channel-agnostic interface so voice and SMS adapters can be added without
 * changing process templates.
 *
 * Provenance: Brief 079/081, AgentMail SDK (agentmail npm, depend level),
 * ADR-005 (integration architecture), Brief 078 (Google Workspace).
 */

import { AgentMailClient } from "agentmail";
import type { PersonaId } from "../db/schema";

// ============================================================
// Channel Abstraction Interface
// ============================================================

export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
  personaId: PersonaId;
  mode: "selling" | "connecting" | "nurture";
  /** If true, append opt-out footer */
  includeOptOut?: boolean;
  /** Reply to an existing message (threading) */
  inReplyToMessageId?: string;
  /** User ID for referral footer tracking (Brief 109) */
  referralUserId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

export interface InboundMessage {
  from: string;
  subject: string;
  body: string;
  /** Extracted reply text without quoted history (AgentMail feature) */
  extractedText?: string;
  messageId: string;
  threadId?: string;
  receivedAt: Date;
}

export interface ChannelAdapter {
  readonly channel: "email" | "voice" | "sms";
  send(message: OutboundMessage): Promise<SendResult>;
  search(query: string): Promise<InboundMessage[]>;
  /** List recent messages in the inbox */
  listInbound?(limit?: number): Promise<InboundMessage[]>;
  /** Reply to a specific message (preserves threading) */
  reply?(messageId: string, body: string, personaId: PersonaId): Promise<SendResult>;
}

// ============================================================
// Test Mode — Gate External Emails
// ============================================================

/**
 * When DITTO_TEST_MODE=true, only emails to addresses in
 * DITTO_TEST_EMAILS are actually sent. Everything else is
 * logged and suppressed. Prevents accidental outreach to
 * real people during testing.
 *
 * Set DITTO_TEST_EMAILS to the registering user's email
 * (comma-separated for multiple).
 */
function isTestModeSuppressed(toAddress: string): boolean {
  if (process.env.DITTO_TEST_MODE !== "true") return false;

  const allowlist = (process.env.DITTO_TEST_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    // Test mode with no allowlist = suppress everything
    console.log(`[channel] TEST MODE: suppressed email to ${toAddress} (no DITTO_TEST_EMAILS set)`);
    return true;
  }

  if (allowlist.includes(toAddress.toLowerCase())) {
    return false; // Allowed — send normally
  }

  console.log(`[channel] TEST MODE: suppressed email to ${toAddress} (not in DITTO_TEST_EMAILS)`);
  return true;
}

// ============================================================
// Persona Sign-off Formatting
// ============================================================

const PERSONA_SIGNOFFS: Record<PersonaId, string> = {
  alex: "Alex\nDitto",
  mira: "Mira\nDitto",
};

const OPT_OUT_FOOTER = "\n\n---\nIf you'd prefer not to hear from me, just reply with 'unsubscribe' and I won't reach out again.";

function buildReferralFooter(userId: string): string {
  const baseUrl = process.env.NETWORK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return `\nKnow someone who'd benefit from an advisor like me? ${baseUrl}/welcome/referred?ref=${userId}`;
}

/**
 * Format an outbound message with persona sign-off, optional opt-out footer,
 * and referral footer.
 *
 * @param referralUserId When provided, appends a referral link footer after
 *   the opt-out line (or at the end of the body). Omitted when
 *   `includeOptOut === false` (internal/system emails).
 */
export function formatEmailBody(message: OutboundMessage): string {
  const referralUserId = message.referralUserId;
  let body = message.body;

  // Add persona sign-off if not already present
  const signoff = PERSONA_SIGNOFFS[message.personaId];
  if (!body.trimEnd().endsWith(signoff)) {
    body = body.trimEnd() + "\n\n" + signoff;
  }

  // Add opt-out footer for first outreach
  if (message.includeOptOut !== false) {
    body += OPT_OUT_FOOTER;
  }

  // Add referral footer (Brief 109 — two-sided acquisition)
  // Skipped when includeOptOut is explicitly false (internal emails)
  if (referralUserId && message.includeOptOut !== false) {
    body += buildReferralFooter(referralUserId);
  }

  return body;
}

// ============================================================
// AgentMail Channel Adapter (Primary)
// ============================================================

/**
 * AgentMail adapter — purpose-built email infrastructure for AI agents.
 *
 * Features over Gmail:
 * - Programmatic inbox creation (alex@ditto.partners, mira@ditto.partners)
 * - Native reply handling with extractedText (reply without quoted history)
 * - Thread management built in
 * - Webhook support for inbound messages
 * - Usage-based pricing, no per-inbox cost
 *
 * Provenance: agentmail npm package (depend level — MIT, v0.4.x)
 */
export class AgentMailAdapter implements ChannelAdapter {
  readonly channel = "email" as const;

  private client: AgentMailClient;
  private inboxId: string;

  constructor(apiKey: string, inboxId: string) {
    this.client = new AgentMailClient({ apiKey });
    this.inboxId = inboxId;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (isTestModeSuppressed(message.to)) {
      return { success: true, messageId: `test-suppressed-${Date.now()}` };
    }

    const body = formatEmailBody(message);

    try {
      if (message.inReplyToMessageId) {
        // Use native reply (preserves threading)
        const result = await this.client.inboxes.messages.reply(
          this.inboxId,
          message.inReplyToMessageId,
          { text: body },
        );
        return {
          success: true,
          messageId: result.messageId,
          threadId: result.threadId,
        };
      }

      const result = await this.client.inboxes.messages.send(this.inboxId, {
        to: [message.to],
        subject: message.subject,
        text: body,
      });

      return {
        success: true,
        messageId: result.messageId,
        threadId: result.threadId,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async search(_query: string): Promise<InboundMessage[]> {
    // AgentMail doesn't have a search API in the same way — use list with filtering
    return this.listInbound(50);
  }

  async listInbound(limit = 20): Promise<InboundMessage[]> {
    try {
      const response = await this.client.inboxes.messages.list(this.inboxId, {
        limit,
      });

      const items = response.messages ?? [];
      // MessageItem has preview but not full text/extractedText.
      // Use preview from list; callers needing extractedText should fetch
      // individual messages via client.inboxes.messages.get().
      return items.map((m) => ({
        from: typeof m.from === "string" ? m.from : String(m.from ?? ""),
        subject: m.subject ?? "",
        body: m.preview ?? "",
        messageId: m.messageId,
        threadId: m.threadId,
        receivedAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get full message details including extractedText (reply without quoted history).
   */
  async getMessage(messageId: string): Promise<InboundMessage | null> {
    try {
      const m = await this.client.inboxes.messages.get(this.inboxId, messageId);
      return {
        from: typeof m.from === "string" ? m.from : String(m.from ?? ""),
        subject: m.subject ?? "",
        body: m.text ?? "",
        extractedText: m.extractedText,
        messageId: m.messageId,
        threadId: m.threadId,
        receivedAt: m.createdAt ? new Date(m.createdAt) : new Date(),
      };
    } catch {
      return null;
    }
  }

  async reply(messageId: string, body: string, personaId: PersonaId, toAddress?: string): Promise<SendResult> {
    if (toAddress && isTestModeSuppressed(toAddress)) {
      return { success: true, messageId: `test-suppressed-${Date.now()}` };
    }

    const signoff = PERSONA_SIGNOFFS[personaId];
    const fullBody = body.trimEnd() + "\n\n" + signoff;

    try {
      const result = await this.client.inboxes.messages.reply(
        this.inboxId,
        messageId,
        { text: fullBody },
      );

      return {
        success: true,
        messageId: result.messageId,
        threadId: result.threadId,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Create an AgentMail inbox for a persona.
 * Returns the inbox ID and email address.
 */
export async function createAgentMailInbox(
  apiKey: string,
  personaId: PersonaId,
  domain = "agentmail.to",
): Promise<{ inboxId: string; email: string }> {
  const client = new AgentMailClient({ apiKey });
  const inbox = await client.inboxes.create({
    username: personaId, // alex or mira
    domain,
    displayName: personaId === "alex" ? "Alex from Ditto" : "Mira from Ditto",
  });
  return {
    inboxId: inbox.inboxId,
    email: inbox.email,
  };
}

// ============================================================
// Gmail Channel Adapter (Fallback)
// ============================================================

/**
 * Gmail channel adapter — sends and searches email via the gws CLI
 * through the integration tool resolver.
 *
 * Retained as fallback for users who prefer Gmail or for non-network-agent
 * email tasks (inbox triage, etc).
 */
export class GmailChannelAdapter implements ChannelAdapter {
  readonly channel = "email" as const;

  private executeToolFn: (name: string, input: Record<string, unknown>) => Promise<string>;

  constructor(executeToolFn: (name: string, input: Record<string, unknown>) => Promise<string>) {
    this.executeToolFn = executeToolFn;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (isTestModeSuppressed(message.to)) {
      return { success: true, messageId: `test-suppressed-${Date.now()}` };
    }

    const body = formatEmailBody(message);

    try {
      const result = await this.executeToolFn("send_message", {
        to: message.to,
        subject: message.subject,
        body,
      });

      return {
        success: true,
        messageId: extractMessageId(result),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async search(query: string): Promise<InboundMessage[]> {
    try {
      const result = await this.executeToolFn("search_messages", { query });
      return parseSearchResults(result);
    } catch {
      return [];
    }
  }
}

// ============================================================
// Parsing Helpers (Gmail)
// ============================================================

function extractMessageId(result: string): string | undefined {
  try {
    const parsed = JSON.parse(result);
    return parsed.id ?? parsed.messageId ?? undefined;
  } catch {
    const match = result.match(/(?:id|messageId)['":\s]+([a-zA-Z0-9]+)/);
    return match?.[1];
  }
}

function parseSearchResults(result: string): InboundMessage[] {
  try {
    const parsed = JSON.parse(result);
    const messages = Array.isArray(parsed) ? parsed : parsed.messages ?? [];
    return messages.map((m: Record<string, unknown>) => ({
      from: String(m.from ?? m.sender ?? ""),
      subject: String(m.subject ?? ""),
      body: String(m.body ?? m.snippet ?? ""),
      messageId: String(m.id ?? m.messageId ?? ""),
      receivedAt: m.date ? new Date(String(m.date)) : new Date(),
    }));
  } catch {
    return [];
  }
}

// ============================================================
// Factory: Create the right adapter from environment
// ============================================================

export interface AgentMailConfig {
  apiKey: string;
  alexInbox: string;
  miraInbox: string;
}

/**
 * Load AgentMail config from environment variables.
 */
export function getAgentMailConfig(): AgentMailConfig | null {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const alexInbox = process.env.AGENTMAIL_ALEX_INBOX;
  const miraInbox = process.env.AGENTMAIL_MIRA_INBOX;

  if (!apiKey) return null;

  return {
    apiKey,
    alexInbox: alexInbox ?? "alex-ditto@agentmail.to",
    miraInbox: miraInbox ?? "mira-ditto@agentmail.to",
  };
}

/**
 * Create an AgentMail adapter for a specific persona.
 * Returns null if AgentMail is not configured.
 */
export function createAgentMailAdapterForPersona(
  personaId: PersonaId,
): AgentMailAdapter | null {
  const config = getAgentMailConfig();
  if (!config) return null;

  const inboxId = personaId === "mira" ? config.miraInbox : config.alexInbox;
  return new AgentMailAdapter(config.apiKey, inboxId);
}

// ============================================================
// Atomic Send + Record (Brief 097)
// ============================================================

export interface SendAndRecordInput {
  to: string;
  subject: string;
  body: string;
  personaId: PersonaId;
  mode: "selling" | "connecting" | "nurture";
  personId: string;
  userId: string;
  processRunId?: string;
  includeOptOut?: boolean;
  inReplyToMessageId?: string;
}

export interface SendAndRecordResult {
  success: boolean;
  interactionId?: string;
  messageId?: string;
  error?: string;
}

/**
 * Atomically send an email via channel adapter AND record it as an interaction.
 * This is the single path for all outreach — no email goes untracked.
 *
 * In test mode (DITTO_TEST_MODE=true), the channel adapter suppresses real sends
 * but the interaction is still recorded and processes still advance.
 */
export async function sendAndRecord(input: SendAndRecordInput): Promise<SendAndRecordResult> {
  const { recordInteraction } = await import("./people");

  const adapter = createAgentMailAdapterForPersona(input.personaId);
  if (!adapter) {
    console.warn("[channel] AgentMail not configured — recording interaction without sending to", input.to);
    // Still record the interaction even if we can't send
    const interaction = await recordInteraction({
      personId: input.personId,
      userId: input.userId,
      type: "outreach_sent",
      channel: "email",
      mode: input.mode,
      subject: input.subject,
      summary: input.body.slice(0, 500),
      outcome: undefined,
      processRunId: input.processRunId,
      metadata: { sendFailed: true, reason: "agentmail_not_configured" },
    });
    return { success: false, interactionId: interaction.id, error: "AgentMail not configured" };
  }

  // Send the email (with referral footer — Brief 109)
  const sendResult = await adapter.send({
    to: input.to,
    subject: input.subject,
    body: input.body,
    personaId: input.personaId,
    mode: input.mode,
    includeOptOut: input.includeOptOut,
    inReplyToMessageId: input.inReplyToMessageId,
    referralUserId: input.userId,
  });

  // Record the interaction regardless of send success
  // (test mode suppression still returns success: true with a test-suppressed messageId)
  const interaction = await recordInteraction({
    personId: input.personId,
    userId: input.userId,
    type: "outreach_sent",
    channel: "email",
    mode: input.mode,
    subject: input.subject,
    summary: input.body.slice(0, 500),
    outcome: undefined,
    processRunId: input.processRunId,
    metadata: {
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
      ...(sendResult.error ? { sendError: sendResult.error } : {}),
    },
  });

  if (sendResult.success) {
    console.log(`[channel] sendAndRecord: email sent to ${input.to}, interaction ${interaction.id}`);
  } else {
    console.error(`[channel] sendAndRecord: send failed for ${input.to}:`, sendResult.error);
  }

  return {
    success: sendResult.success,
    interactionId: interaction.id,
    messageId: sendResult.messageId,
    ...(sendResult.error ? { error: sendResult.error } : {}),
  };
}

/**
 * Check if a reply body contains an opt-out signal.
 */
export function isOptOutSignal(body: string): boolean {
  const lower = body.toLowerCase().trim();
  return (
    lower === "unsubscribe" ||
    lower === "stop" ||
    lower === "remove me" ||
    lower.startsWith("unsubscribe") ||
    lower.includes("please remove me") ||
    lower.includes("don't contact me") ||
    lower.includes("do not contact")
  );
}
