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
// Persona Sign-off Formatting
// ============================================================

const PERSONA_SIGNOFFS: Record<PersonaId, string> = {
  alex: "Alex\nDitto",
  mira: "Mira\nDitto",
};

const OPT_OUT_FOOTER = "\n\n---\nIf you'd prefer not to hear from me, just reply with 'unsubscribe' and I won't reach out again.";

/**
 * Format an outbound message with persona sign-off and optional opt-out footer.
 */
export function formatEmailBody(message: OutboundMessage): string {
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

  return body;
}

// ============================================================
// AgentMail Channel Adapter (Primary)
// ============================================================

/**
 * AgentMail adapter — purpose-built email infrastructure for AI agents.
 *
 * Features over Gmail:
 * - Programmatic inbox creation (alex@ditto.network, mira@ditto.network)
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

  async reply(messageId: string, body: string, personaId: PersonaId): Promise<SendResult> {
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
