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
import { UnipileClient } from "unipile-node-sdk";
import type { PersonaId } from "../db/schema";
import { db, schema } from "../db";
import { eq, and, gte, ne, inArray, sql } from "drizzle-orm";

// ============================================================
// Social Platform Types
// ============================================================

export type SocialPlatform = "linkedin" | "whatsapp" | "instagram" | "telegram" | "x";

// ============================================================
// Channel Abstraction Interface
// ============================================================

export interface OutboundMessage {
  to: string;
  /** Subject line. Required for email, optional/ignored for social DMs. */
  subject?: string;
  body: string;
  personaId: PersonaId;
  mode: "selling" | "connecting" | "nurture" | "ghost";
  /** If true, append opt-out footer */
  includeOptOut?: boolean;
  /** Reply to an existing message (threading) */
  inReplyToMessageId?: string;
  /** User ID for referral footer tracking (Brief 109) */
  referralUserId?: string;
  /** Magic link URL for "Continue in chat" footer (Brief 123) */
  magicLinkUrl?: string;
  /** Sending identity: 'principal', 'agent-of-user', 'ghost' (Brief 124) */
  sendingIdentity?: "principal" | "user" | "agent-of-user" | "ghost";
  /**
   * BCC address — used in ghost mode to copy the user (Brief 124).
   * Note: per-message sender display name is NOT supported by AgentMail.
   * Display name is set at inbox level. v1 ghost emails use the inbox's
   * configured display name. Per-user ghost inbox is a future enhancement.
   */
  bccAddress?: string;
  /**
   * Social platform for routing (Brief 133). Only used when channel is "social".
   * `to` becomes a platform-specific identifier (Unipile attendee ID or handle).
   */
  platform?: SocialPlatform;
  /**
   * Pre-rendered HTML blocks (tables, charts) spliced into the email
   * after the text body, outside textToHtml(). (Brief 149 AC18)
   */
  htmlBlocks?: string[];
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
  readonly channel: "email" | "voice" | "sms" | "social";
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

/**
 * Social channel test mode gate (Brief 133).
 * Uses DITTO_TEST_SOCIAL_IDS allowlist (Unipile attendee IDs or handles).
 */
function isSocialTestModeSuppressed(recipientId: string): boolean {
  if (process.env.DITTO_TEST_MODE !== "true") return false;

  const allowlist = (process.env.DITTO_TEST_SOCIAL_IDS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    console.log(`[channel] TEST MODE: suppressed social send to ${recipientId} (no DITTO_TEST_SOCIAL_IDS set)`);
    return true;
  }

  if (allowlist.includes(recipientId.toLowerCase())) {
    return false;
  }

  console.log(`[channel] TEST MODE: suppressed social send to ${recipientId} (not in DITTO_TEST_SOCIAL_IDS)`);
  return true;
}

// ============================================================
// Persona Sign-off Formatting
// ============================================================

const PERSONA_SIGNOFFS: Record<PersonaId, string> = {
  alex: "— Alex",
  mira: "— Mira",
};

const OPT_OUT_FOOTER = "\n\n---\nIf you'd prefer not to hear from me, just reply with 'unsubscribe' and I won't reach out again.";

/** Escape HTML special characters to prevent injection/broken markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert a plain text email body to a clean HTML email.
 *
 * All emails should send both text and html to avoid spam filters.
 * This function wraps the text in a minimal, branded HTML template.
 * Handles markdown-style bold (**text**), line breaks, paragraphs,
 * and horizontal rules (---). All text is HTML-escaped first.
 */
export function textToHtml(text: string): string {
  const bodyHtml = text
    .split(/\n{2,}/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return "";
      if (trimmed === "---") return '<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />';
      // Escape HTML FIRST, then apply markdown-style bold, then line breaks
      const escaped = escapeHtml(trimmed);
      const formatted = escaped
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />");
      return `<p style="margin: 0 0 12px;">${formatted}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a; font-size: 15px; line-height: 1.6;">
${bodyHtml}
</div>`.trim();
}

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
/**
 * Format an outbound message body with persona sign-off and footers.
 *
 * @param htmlBlocks Optional pre-rendered HTML blocks (tables, charts)
 *   to splice into the email template after the text body, outside
 *   the textToHtml() pipeline. Keeps textToHtml pure — always escapes.
 *   (Brief 149 AC18)
 */
export function formatEmailBody(message: OutboundMessage, htmlBlocks?: string[]): string {
  // Ghost mode (Brief 124): no Ditto branding, no persona sign-off,
  // no opt-out footer, no referral footer, no magic link footer.
  // The email must appear to come entirely from the user.
  if (message.sendingIdentity === "ghost") {
    return message.body;
  }

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

  // Add magic link footer (Brief 123 — workspace lite)
  if (message.magicLinkUrl) {
    body += `\n\nContinue in chat: ${message.magicLinkUrl}`;
  }

  return body;
}

/**
 * Convert a plain text body + optional pre-rendered HTML blocks into
 * a complete HTML email. Text goes through textToHtml() (escaped),
 * then htmlBlocks are appended raw (already safe HTML from our renderers).
 *
 * This keeps textToHtml() pure — it always escapes — while allowing
 * structured HTML content (outreach tables, charts) to be included
 * without double-escaping. (Brief 149 AC18)
 */
export function textToHtmlWithBlocks(text: string, htmlBlocks?: string[]): string {
  const baseHtml = textToHtml(text);

  if (!htmlBlocks || htmlBlocks.length === 0) {
    return baseHtml;
  }

  // Insert htmlBlocks before the closing </div> of the textToHtml wrapper
  const closingDiv = "</div>";
  const lastDivIndex = baseHtml.lastIndexOf(closingDiv);
  if (lastDivIndex === -1) {
    // Fallback: just append
    return baseHtml + "\n" + htmlBlocks.join("\n");
  }

  return (
    baseHtml.slice(0, lastDivIndex) +
    "\n" +
    htmlBlocks.join("\n") +
    "\n" +
    baseHtml.slice(lastDivIndex)
  );
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
    const html = message.htmlBlocks?.length
      ? textToHtmlWithBlocks(body, message.htmlBlocks)
      : textToHtml(body);

    // Ghost mode (Brief 124): BCC the user on ghost sends.
    const isGhostSend = message.sendingIdentity === "ghost";
    const ghostBcc = isGhostSend && message.bccAddress ? message.bccAddress : undefined;

    try {
      if (message.inReplyToMessageId) {
        // Use native reply (preserves threading)
        const result = await this.client.inboxes.messages.reply(
          this.inboxId,
          message.inReplyToMessageId,
          {
            text: body,
            html,
            ...(ghostBcc ? { bcc: ghostBcc } : {}),
          },
        );
        return {
          success: true,
          messageId: result.messageId,
          threadId: result.threadId,
        };
      }

      const result = await this.client.inboxes.messages.send(this.inboxId, {
        to: [message.to],
        subject: message.subject ?? "",
        text: body,
        html,
        ...(ghostBcc ? { bcc: ghostBcc } : {}),
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

  /**
   * Reply to a specific message with persona sign-off.
   * WARNING: Do NOT use for ghost mode — this always appends Ditto persona
   * sign-off. Ghost mode replies must go through send() with inReplyToMessageId
   * and sendingIdentity: "ghost" to get correct formatting.
   */
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
        subject: message.subject ?? "",
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
// Gmail API Channel Adapter (Brief 152 — Sending Identity Routing)
// ============================================================

/**
 * Gmail API adapter — sends email via Google's Gmail API using OAuth tokens.
 * Used for 'user' sending identity when the user has connected Gmail.
 *
 * Token lifecycle: access tokens expire after 1 hour. This adapter checks
 * expiry before each send and refreshes using the stored refresh token.
 * Decrypted tokens never leave this adapter's scope.
 *
 * Provenance: Brief 152, googleapis SDK (depend level — Apache-2.0)
 */
export class GmailApiAdapter implements ChannelAdapter {
  readonly channel = "email" as const;

  private userId: string;
  private fromAddress: string;
  private displayName: string;

  constructor(userId: string, fromAddress: string, displayName: string) {
    this.userId = userId;
    this.fromAddress = fromAddress;
    this.displayName = displayName;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (isTestModeSuppressed(message.to)) {
      return { success: true, messageId: `test-suppressed-gmail-${Date.now()}` };
    }

    try {
      // Dynamic import to avoid pulling googleapis into bundles that don't need it
      const { google } = await import("googleapis");
      const { getGoogleCredential, updateGoogleTokens } = await import("./integration-availability");

      const tokens = await getGoogleCredential(this.userId);
      if (!tokens) {
        return { success: false, error: "Google credential not found" };
      }

      // Set up OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
      );
      oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
      });

      // Auto-refresh if expired
      if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
        const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
        const updatedTokens = {
          access_token: refreshed.access_token!,
          refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
          token_type: refreshed.token_type ?? "Bearer",
          expiry_date: refreshed.expiry_date ?? Date.now() + 3600 * 1000,
          email: tokens.email,
        };
        oauth2Client.setCredentials(updatedTokens);
        // Persist refreshed tokens atomically
        await updateGoogleTokens(this.userId, updatedTokens);
      }

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Build the email body — for 'user' identity, use user's voice (no Ditto branding)
      const body = message.sendingIdentity === "user" || message.sendingIdentity === "ghost"
        ? message.body
        : formatEmailBody(message);
      const html = textToHtml(body);

      // Construct RFC 2822 email
      const fromHeader = this.displayName
        ? `"${this.displayName}" <${this.fromAddress}>`
        : this.fromAddress;

      const emailLines = [
        `From: ${fromHeader}`,
        `To: ${message.to}`,
        `Subject: ${message.subject ?? ""}`,
        "MIME-Version: 1.0",
        'Content-Type: multipart/alternative; boundary="boundary152"',
        "",
        "--boundary152",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        body,
        "--boundary152",
        "Content-Type: text/html; charset=UTF-8",
        "",
        html,
        "--boundary152--",
      ];

      if (message.inReplyToMessageId) {
        emailLines.splice(3, 0, `In-Reply-To: ${message.inReplyToMessageId}`);
        emailLines.splice(4, 0, `References: ${message.inReplyToMessageId}`);
      }

      const rawEmail = emailLines.join("\r\n");
      const encodedEmail = Buffer.from(rawEmail)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedEmail },
      });

      return {
        success: true,
        messageId: result.data.id ?? undefined,
        threadId: result.data.threadId ?? undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async search(_query: string): Promise<InboundMessage[]> {
    // Gmail search is not implemented for send-only adapter
    return [];
  }
}

// ============================================================
// Unipile Social Channel Adapter (Brief 133)
// ============================================================

/** Platform-specific daily send limits to avoid account restriction. */
const PLATFORM_DAILY_LIMITS: Record<SocialPlatform, number> = {
  linkedin: 50,
  whatsapp: 200,
  instagram: 100,
  telegram: 500,
  x: 300,
};

/**
 * In-memory daily send counter per platform. Resets at midnight UTC.
 * Simple approach for v1 — database-backed tracking is a future enhancement.
 */
const dailySendCounts: Record<string, { count: number; date: string }> = {};

function getDailyKey(accountId: string, platform: SocialPlatform): string {
  return `${accountId}:${platform}`;
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkRateLimit(accountId: string, platform: SocialPlatform): { allowed: boolean; remaining: number } {
  const key = getDailyKey(accountId, platform);
  const today = getTodayUTC();
  const entry = dailySendCounts[key];
  const limit = PLATFORM_DAILY_LIMITS[platform];

  if (!entry || entry.date !== today) {
    return { allowed: true, remaining: limit };
  }

  const remaining = Math.max(0, limit - entry.count);
  return { allowed: remaining > 0, remaining };
}

function recordSend(accountId: string, platform: SocialPlatform): void {
  const key = getDailyKey(accountId, platform);
  const today = getTodayUTC();
  const entry = dailySendCounts[key];

  if (!entry || entry.date !== today) {
    dailySendCounts[key] = { count: 1, date: today };
  } else {
    entry.count++;
  }
}

/** Reset rate limit counters (for testing). */
export function _resetRateLimits(): void {
  for (const key of Object.keys(dailySendCounts)) {
    delete dailySendCounts[key];
  }
}

/**
 * Unipile adapter — unified messaging API for social channels.
 *
 * Sends LinkedIn DMs, WhatsApp, Instagram, Telegram messages via the
 * Unipile REST API. Session management and anti-detection handled by Unipile.
 *
 * Provenance: Brief 133, unipile-node-sdk (depend level — ISC, v1.9.x)
 */
export class UnipileAdapter implements ChannelAdapter {
  readonly channel = "social" as const;

  private client: UnipileClient;
  private accountId: string;
  private platform: SocialPlatform;

  constructor(dsn: string, apiKey: string, accountId: string, platform: SocialPlatform) {
    this.client = new UnipileClient(dsn, apiKey);
    this.accountId = accountId;
    this.platform = platform;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const platform = message.platform || this.platform;

    if (isSocialTestModeSuppressed(message.to)) {
      return { success: true, messageId: `test-suppressed-social-${Date.now()}` };
    }

    // Rate limit check
    const { allowed, remaining } = checkRateLimit(this.accountId, platform);
    if (!allowed) {
      return {
        success: false,
        error: `Daily ${platform} message limit reached (${PLATFORM_DAILY_LIMITS[platform]}). Remaining: ${remaining}. Will reset tomorrow.`,
      };
    }

    // Ghost mode: no Ditto branding — body is used as-is
    const body = message.sendingIdentity === "ghost" ? message.body : formatEmailBody(message);

    try {
      if (message.inReplyToMessageId) {
        // Send to existing chat
        const result = await this.client.messaging.sendMessage({
          chat_id: message.inReplyToMessageId,
          text: body,
        });
        recordSend(this.accountId, platform);
        return {
          success: true,
          messageId: result.message_id ?? undefined,
          threadId: message.inReplyToMessageId,
        };
      }

      // Start new chat with the recipient
      const result = await this.client.messaging.startNewChat({
        account_id: this.accountId,
        text: body,
        attendees_ids: [message.to],
      });
      recordSend(this.accountId, platform);
      return {
        success: true,
        messageId: result.message_id ?? undefined,
        threadId: result.chat_id ?? undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** v1 stub — search not implemented for social channels. */
  async search(_query: string): Promise<InboundMessage[]> {
    return [];
  }

  /** v1 stub — reply via send() with inReplyToMessageId (chat_id). */
  async reply?(_messageId: string, _body: string, _personaId: PersonaId): Promise<SendResult> {
    throw new Error("UnipileAdapter.reply() not implemented — use send() with inReplyToMessageId");
  }
}

// ============================================================
// Unipile Configuration
// ============================================================

export interface UnipileConfig {
  /** Unipile API base URL (e.g. https://api1.unipile.com:13111) */
  dsn: string;
  /** Unipile API access token */
  apiKey: string;
}

/**
 * Load Unipile config from environment variables.
 */
export function getUnipileConfig(): UnipileConfig | null {
  const dsn = process.env.UNIPILE_DSN;
  const apiKey = process.env.UNIPILE_API_KEY;

  if (!dsn || !apiKey) return null;

  return { dsn, apiKey };
}

/**
 * Create a Unipile adapter for a specific connected account and platform.
 * Returns null if Unipile is not configured.
 */
export function createUnipileAdapter(
  accountId: string,
  platform: SocialPlatform,
): UnipileAdapter | null {
  const config = getUnipileConfig();
  if (!config) return null;

  return new UnipileAdapter(config.dsn, config.apiKey, accountId, platform);
}

// ============================================================
// Voice Channel Adapter (Brief 142)
// ============================================================

/**
 * Voice channel adapter — v1 is web embed only via ElevenLabs.
 * `send()` is a no-op for v1 (outbound phone calls are v2).
 * `search()` queries stored transcripts from interactions table.
 */
export class VoiceChannelAdapter implements ChannelAdapter {
  readonly channel = "voice" as const;

  async send(_message: OutboundMessage): Promise<SendResult> {
    // v1: web embed only — outbound calls are v2
    return { success: false, error: "Outbound voice calls not supported in v1" };
  }

  async search(_query: string): Promise<InboundMessage[]> {
    // v1: transcript search not implemented
    return [];
  }
}

export function createVoiceAdapter(): VoiceChannelAdapter | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  return new VoiceChannelAdapter();
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
  /** Subject line. Required for email, optional for social DMs. */
  subject?: string;
  body: string;
  personaId: PersonaId;
  mode: "selling" | "connecting" | "nurture" | "ghost";
  personId: string;
  userId: string;
  processRunId?: string;
  includeOptOut?: boolean;
  inReplyToMessageId?: string;
  /** Magic link URL for "Continue in chat" footer (Brief 123) */
  magicLinkUrl?: string;
  /** Skip auto-generating magic link footer (when body already contains the link) */
  skipMagicLink?: boolean;
  /** Sending identity: 'principal', 'agent-of-user', 'ghost' (Brief 124) */
  sendingIdentity?: "principal" | "user" | "agent-of-user" | "ghost";
  /** User email address for BCC in ghost mode (Brief 124) */
  userEmail?: string;
  /** Additional metadata to store on the interaction record (never exposed in email headers/body — Brief 126 AC18) */
  metadata?: Record<string, unknown>;
  /** Social platform for routing (Brief 133). When set, routes to UnipileAdapter. */
  platform?: SocialPlatform;
  /** Unipile account ID for the connected social account (Brief 133). Required when platform is set. */
  unipileAccountId?: string;
  /**
   * Pre-rendered HTML blocks (tables, charts) spliced into the email
   * after the text body, outside textToHtml(). (Brief 149 AC18)
   */
  htmlBlocks?: string[];
  /** Step run ID for invocation guard (Insight-180, Brief 151) */
  stepRunId?: string;
  /** Injected channel adapter — when non-null, used instead of default AgentMail (Brief 152) */
  adapter?: ChannelAdapter | null;
}

export interface SendAndRecordResult {
  success: boolean;
  interactionId?: string;
  messageId?: string;
  threadId?: string;
  error?: string;
}

/** Max outreach_sent interactions to same person in 24 hours (Brief 151 AC2) */
const MAX_OUTREACH_PER_PERSON_PER_DAY = 3;

/** Default cross-cycle contact cooldown in days (Brief 163 MP-8.3) */
const CROSS_CYCLE_COOLDOWN_DAYS = 7;

/**
 * Log outreach suppression to activities table (Brief 151 AC3, Insight-184 corollary 3).
 * Records what was decided, not just what was done.
 */
async function logOutreachSuppressed(
  personId: string,
  processRunId: string | undefined,
  reason: string,
): Promise<void> {
  try {
    await db.insert(schema.activities).values({
      action: "outreach.suppressed",
      actorType: "system",
      entityType: "person",
      entityId: personId,
      metadata: { reason, processRunId: processRunId ?? null },
    });
  } catch {
    // Non-critical — don't fail the outreach path if logging fails
  }
}

/**
 * Atomically send an email via channel adapter AND record it as an interaction.
 * This is the single path for all outreach — no email goes untracked.
 *
 * In test mode (DITTO_TEST_MODE=true), the channel adapter suppresses real sends
 * but the interaction is still recorded and processes still advance.
 *
 * Brief 151: Dedup safety net — rejects duplicate outreach to the same person
 * within the same process run, and enforces a per-person daily cap.
 */
export async function sendAndRecord(input: SendAndRecordInput): Promise<SendAndRecordResult> {
  const { recordInteraction, getRecentInteractionsForPerson } = await import("./people");

  // Brief 151 AC1: Dedup — reject duplicate outreach to same person in same run
  if (input.processRunId) {
    const dupes = await getRecentInteractionsForPerson(
      input.personId,
      "outreach_sent",
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      input.processRunId,
    );
    if (dupes.length > 0) {
      console.log(`[channel] DUPLICATE SUPPRESSED: already sent outreach to ${input.personId} in run ${input.processRunId}`);
      await logOutreachSuppressed(input.personId, input.processRunId, "duplicate_outreach_suppressed");
      return { success: false, error: "duplicate_outreach_suppressed" };
    }
  }

  // Brief 151 AC2: Per-person daily cap
  const recentToday = await getRecentInteractionsForPerson(
    input.personId,
    "outreach_sent",
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );
  if (recentToday.length >= MAX_OUTREACH_PER_PERSON_PER_DAY) {
    console.log(`[channel] DAILY CAP: ${recentToday.length} outreach to ${input.personId} in 24h (max ${MAX_OUTREACH_PER_PERSON_PER_DAY})`);
    await logOutreachSuppressed(input.personId, input.processRunId, "daily_person_cap_exceeded");
    return { success: false, error: "daily_person_cap_exceeded" };
  }

  // Brief 163 MP-8.3: Cross-cycle contact dedup — check if person was contacted
  // by a DIFFERENT cycle within the cooldown window. Prevents multi-cycle spam.
  // Wrapped in try-catch: non-cycle runs (no processRuns table access) skip gracefully.
  if (input.processRunId) {
    try {
      // Find the current run's cycle type and config
      const [currentRun] = await db
        .select({ cycleType: schema.processRuns.cycleType, cycleConfig: schema.processRuns.cycleConfig })
        .from(schema.processRuns)
        .where(eq(schema.processRuns.id, input.processRunId))
        .limit(1);

      if (currentRun?.cycleType) {
        // Cooldown is configurable per-cycle via cycleConfig.crossCycleCooldownDays
        const config = (currentRun.cycleConfig as Record<string, unknown>) || {};
        const cooldownDays = typeof config.crossCycleCooldownDays === "number"
          ? config.crossCycleCooldownDays
          : CROSS_CYCLE_COOLDOWN_DAYS;
        const cooldownSince = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
        // Find OTHER cycle runs created within the cooldown window (bounded for performance)
        const otherCycleRuns = await db
          .select({ id: schema.processRuns.id })
          .from(schema.processRuns)
          .where(
            and(
              sql`${schema.processRuns.cycleType} IS NOT NULL`,
              ne(schema.processRuns.id, input.processRunId),
              gte(schema.processRuns.createdAt, cooldownSince),
            ),
          );

        const otherRunIds = otherCycleRuns.map((r) => r.id);

        if (otherRunIds.length > 0) {
          // Check for outreach to this person from other cycles within cooldown
          const crossCycleOutreach = await db
            .select({ id: schema.interactions.id, processRunId: schema.interactions.processRunId })
            .from(schema.interactions)
            .where(
              and(
                eq(schema.interactions.personId, input.personId),
                eq(schema.interactions.type, "outreach_sent"),
                gte(schema.interactions.createdAt, cooldownSince),
                inArray(schema.interactions.processRunId, otherRunIds),
              ),
            )
            .limit(1);

          if (crossCycleOutreach.length > 0) {
            console.log(`[channel] CROSS-CYCLE DEDUP: person ${input.personId} contacted by another cycle (run ${crossCycleOutreach[0].processRunId}) within ${cooldownDays}d`);
            await logOutreachSuppressed(input.personId, input.processRunId, "cross_cycle_contact_conflict");
            return { success: false, error: "cross_cycle_contact_conflict" };
          }
        }
      }
    } catch {
      // Non-cycle context or DB not fully available — skip cross-cycle dedup
    }
  }

  // Ghost mode (Brief 124): map "ghost" to "connecting" for interaction records
  const interactionMode = input.mode === "ghost" ? "connecting" as const : input.mode;
  const isGhost = input.sendingIdentity === "ghost";

  // Route to social adapter when platform is specified (Brief 133)
  const isSocial = !!input.platform && !!input.unipileAccountId;
  const channelType = isSocial ? "social" : "email";

  if (isSocial) {
    const socialAdapter = createUnipileAdapter(input.unipileAccountId!, input.platform!);
    if (!socialAdapter) {
      console.warn("[channel] Unipile not configured — recording interaction without sending to", input.to);
      const interaction = await recordInteraction({
        personId: input.personId,
        userId: input.userId,
        type: "outreach_sent",
        channel: channelType,
        mode: interactionMode,
        subject: input.subject ?? `${input.platform} DM`,
        summary: input.body.slice(0, 500),
        outcome: undefined,
        processRunId: input.processRunId,
        metadata: { sendFailed: true, reason: "unipile_not_configured", platform: input.platform, body: input.body, ...(input.metadata || {}) },
      });
      return { success: false, interactionId: interaction.id, error: "Unipile not configured" };
    }

    const sendResult = await socialAdapter.send({
      to: input.to,
      body: input.body,
      personaId: input.personaId,
      mode: input.mode === "ghost" ? "connecting" : input.mode,
      sendingIdentity: input.sendingIdentity,
      platform: input.platform,
      inReplyToMessageId: input.inReplyToMessageId,
    });

    const interaction = await recordInteraction({
      personId: input.personId,
      userId: input.userId,
      type: "outreach_sent",
      channel: channelType,
      mode: interactionMode,
      subject: input.subject ?? `${input.platform} DM`,
      summary: input.body.slice(0, 500),
      outcome: undefined,
      processRunId: input.processRunId,
      metadata: {
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
        platform: input.platform,
        body: input.body,
        ...(isGhost ? { sendingIdentity: "ghost" } : {}),
        ...(sendResult.error ? { sendError: sendResult.error } : {}),
        ...(input.metadata || {}),
      },
    });

    if (sendResult.success) {
      console.log(`[channel] sendAndRecord: ${input.platform} DM sent to ${input.to}, interaction ${interaction.id}`);
    } else {
      console.error(`[channel] sendAndRecord: ${input.platform} send failed for ${input.to}:`, sendResult.error);
    }

    return {
      success: sendResult.success,
      interactionId: interaction.id,
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
      ...(sendResult.error ? { error: sendResult.error } : {}),
    };
  }

  // Email path (existing behavior)

  // Auto-generate magic link for "Continue in chat" footer (Brief 123)
  // Best-effort: if magic link generation fails, email sends without it
  let magicLinkUrl = input.magicLinkUrl;
  if (!magicLinkUrl && !input.skipMagicLink) {
    try {
      const { getMagicLinkForEmail } = await import("./magic-link");
      magicLinkUrl = (await getMagicLinkForEmail(input.to)) ?? undefined;
    } catch {
      // Magic link generation is optional — don't block email delivery
    }
  }

  // Brief 152: use injected adapter (from channel resolver) when provided
  const adapter = input.adapter ?? createAgentMailAdapterForPersona(input.personaId);
  if (!adapter) {
    console.warn("[channel] AgentMail not configured — recording interaction without sending to", input.to);
    const interaction = await recordInteraction({
      personId: input.personId,
      userId: input.userId,
      type: "outreach_sent",
      channel: "email",
      mode: interactionMode,
      subject: input.subject ?? "(no subject)",
      summary: input.body.slice(0, 500),
      outcome: undefined,
      processRunId: input.processRunId,
      metadata: { sendFailed: true, reason: "agentmail_not_configured", body: input.body, ...(input.metadata || {}) },
    });
    return { success: false, interactionId: interaction.id, error: "AgentMail not configured" };
  }

  // Send the email (with referral footer — Brief 109, ghost mode skips all footers)
  const sendResult = await adapter.send({
    to: input.to,
    subject: input.subject ?? "(no subject)",
    body: input.body,
    personaId: input.personaId,
    mode: input.mode === "ghost" ? "connecting" : input.mode,
    includeOptOut: isGhost ? false : input.includeOptOut,
    inReplyToMessageId: input.inReplyToMessageId,
    referralUserId: isGhost ? undefined : input.userId,
    magicLinkUrl: isGhost ? undefined : magicLinkUrl,
    sendingIdentity: input.sendingIdentity,
    bccAddress: isGhost ? input.userEmail : undefined,
    htmlBlocks: input.htmlBlocks,
  });

  // Record the interaction regardless of send success
  const interaction = await recordInteraction({
    personId: input.personId,
    userId: input.userId,
    type: "outreach_sent",
    channel: "email",
    mode: interactionMode,
    subject: input.subject ?? "(no subject)",
    summary: input.body.slice(0, 500),
    outcome: undefined,
    processRunId: input.processRunId,
    metadata: {
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
      body: input.body,
      ...(isGhost ? { sendingIdentity: "ghost" } : {}),
      ...(sendResult.error ? { sendError: sendResult.error } : {}),
      ...(input.metadata || {}),
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
    threadId: sendResult.threadId,
    ...(sendResult.error ? { error: sendResult.error } : {}),
  };
}

// ============================================================
// Content Publishing — LinkedIn (Unipile) + X (API v2)
// ============================================================
// ADR-029: publishPost() is invoked from within land-content step
// execution. It traverses the full harness pipeline including
// outbound-quality-gate. Must NOT be callable outside step execution.

export interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  platform: SocialPlatform;
  /** For X threads: array of individual tweet results */
  threadResults?: Array<{
    postId: string;
    postUrl: string;
    index: number;
  }>;
  error?: string;
}

// ── X API v2 Client ──────────────────────────────────────────

export interface XApiConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/**
 * Load X API credentials from environment variables.
 * Returns null if not configured.
 */
export function getXApiConfig(): XApiConfig | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;

  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

/**
 * Generate OAuth 1.0a signature for X API v2.
 *
 * Implements the OAuth 1.0a signing process:
 * 1. Build parameter string (sorted alphabetically)
 * 2. Build signature base string
 * 3. HMAC-SHA1 with composite signing key
 * 4. Return Authorization header value
 */
function buildOAuth1Header(
  method: string,
  url: string,
  config: XApiConfig,
  queryParams?: Record<string, string>,
): string {
  // Dynamic import avoided — crypto is a Node.js built-in
  const crypto = require("crypto") as typeof import("crypto");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: config.accessToken,
    oauth_version: "1.0",
  };

  // Build parameter string (sorted).
  // Per OAuth 1.0a spec (RFC 5849 §3.4.1.3): query params + oauth params
  // are included in the signature. JSON POST bodies are NOT signed.
  const allParams: Record<string, string> = { ...oauthParams, ...(queryParams ?? {}) };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&");

  // Build signature base string
  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join("&");

  // Sign with composite key
  const signingKey = `${encodeURIComponent(config.apiSecret)}&${encodeURIComponent(config.accessTokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  // Build Authorization header
  const authParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const header = Object.keys(authParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(authParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

/**
 * X API v2 client — posts tweets and threads.
 *
 * Uses OAuth 1.0a for single-user posting (app key + user access token).
 * No external SDK — direct fetch to api.x.com/2/tweets.
 *
 * Provenance: ADR-029, X API v2 docs (depend level — official REST API)
 */
export class XApiClient {
  private config: XApiConfig;
  private baseUrl = "https://api.x.com/2";

  constructor(config: XApiConfig) {
    this.config = config;
  }

  /**
   * Post a single tweet. Returns tweet ID and URL.
   */
  /**
   * Upload media (image/video) to X.
   * Uses v1.1 media upload endpoint (still required for v2 tweets).
   * Returns media_id_string for attaching to tweets.
   */
  /**
   * Upload media (image) to X via v1.1 media upload endpoint.
   * Uses multipart/form-data — OAuth signature excludes body params per spec.
   * Supports images up to 5MB. Videos require chunked upload (not yet implemented).
   */
  async uploadMedia(
    mediaBuffer: Buffer,
    mimeType: string,
  ): Promise<{ mediaId: string }> {
    // Size guard: simple upload supports images <5MB only
    const MAX_SIMPLE_UPLOAD = 5 * 1024 * 1024;
    if (mediaBuffer.length > MAX_SIMPLE_UPLOAD) {
      throw new Error(`Media too large for simple upload (${(mediaBuffer.length / 1024 / 1024).toFixed(1)}MB, max 5MB). Video/large image upload not yet supported.`);
    }

    const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";

    // Multipart form data — OAuth signature does NOT include multipart body params
    const boundary = `----DittoMediaUpload${Date.now()}`;
    const mediaCategory = mimeType.startsWith("video/") ? "tweet_video" : "tweet_image";

    const bodyParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${mediaBuffer.toString("base64")}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="media_category"\r\n\r\n${mediaCategory}\r\n`,
      `--${boundary}--\r\n`,
    ];
    const body = bodyParts.join("");

    // OAuth signature for multipart requests: sign only OAuth params, not body
    const authHeader = buildOAuth1Header("POST", uploadUrl, this.config);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`X media upload error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { media_id_string: string };
    return { mediaId: data.media_id_string };
  }

  /**
   * Post a single tweet, optionally with media attachments.
   */
  async postTweet(
    text: string,
    replyToTweetId?: string,
    mediaIds?: string[],
  ): Promise<{ tweetId: string; tweetUrl: string }> {
    const url = `${this.baseUrl}/tweets`;
    const body: Record<string, unknown> = { text };

    if (replyToTweetId) {
      body.reply = { in_reply_to_tweet_id: replyToTweetId };
    }

    if (mediaIds && mediaIds.length > 0) {
      body.media = { media_ids: mediaIds };
    }

    const authHeader = buildOAuth1Header("POST", url, this.config);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`X API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { data: { id: string; text: string } };
    const tweetId = data.data.id;

    return {
      tweetId,
      tweetUrl: `https://x.com/i/status/${tweetId}`,
    };
  }

  /**
   * Post a thread (array of tweet texts). Each tweet replies to the previous.
   * Returns results for all successfully posted tweets.
   * On partial failure, returns what was posted + error for the rest.
   */
  async postThread(
    tweets: string[],
    mediaIds?: string[],
  ): Promise<{
    results: Array<{ postId: string; postUrl: string; index: number }>;
    error?: string;
  }> {
    const results: Array<{ postId: string; postUrl: string; index: number }> = [];
    let previousTweetId: string | undefined;

    for (let i = 0; i < tweets.length; i++) {
      try {
        // Attach media to the first tweet only
        const tweetMediaIds = i === 0 ? mediaIds : undefined;
        const { tweetId, tweetUrl } = await this.postTweet(tweets[i], previousTweetId, tweetMediaIds);
        results.push({ postId: tweetId, postUrl: tweetUrl, index: i });
        previousTweetId = tweetId;
      } catch (err) {
        // Partial failure: record what we got so far + error
        return {
          results,
          error: `Thread failed at tweet ${i + 1}/${tweets.length}: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    return { results };
  }

  /**
   * Get public metrics for a tweet.
   * Uses GET /2/tweets/:id?tweet.fields=public_metrics
   */
  async getTweetMetrics(
    tweetId: string,
  ): Promise<{
    metrics: { likes: number; retweets: number; replies: number; impressions: number; quotes: number };
  }> {
    const url = `${this.baseUrl}/tweets/${tweetId}?tweet.fields=public_metrics`;
    const authHeader = buildOAuth1Header("GET", url.split("?")[0], this.config, { "tweet.fields": "public_metrics" });

    const response = await fetch(url, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`X API metrics error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      data: { public_metrics: { like_count: number; retweet_count: number; reply_count: number; impression_count: number; quote_count: number } };
    };
    const pm = data.data.public_metrics;

    return {
      metrics: {
        likes: pm.like_count,
        retweets: pm.retweet_count,
        replies: pm.reply_count,
        impressions: pm.impression_count,
        quotes: pm.quote_count,
      },
    };
  }

  /**
   * Send a direct message to a user on X.
   * Uses POST /2/dm_conversations/with/:participant_id/messages
   */
  async sendDm(
    participantId: string,
    text: string,
  ): Promise<{ messageId: string }> {
    const url = `${this.baseUrl}/dm_conversations/with/${participantId}/messages`;
    const authHeader = buildOAuth1Header("POST", url, this.config);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`X DM API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { data: { dm_event_id: string } };
    return { messageId: data.data.dm_event_id };
  }
}

/**
 * Publish content to a social platform.
 *
 * Routes to Unipile Posts API (LinkedIn) or X API v2 (X).
 * This is for PUBLIC content publishing (feed posts, tweets),
 * NOT for DMs (use sendAndRecord() for DMs).
 *
 * DITTO_TEST_MODE suppresses publishing.
 *
 * @param platform - Target platform ("linkedin" or "x")
 * @param content - Text content to publish
 * @param options - Platform-specific options (stepRunId required as invocation guard)
 */
export async function publishPost(
  platform: "linkedin" | "x",
  content: string,
  options?: {
    /**
     * Step run ID — proves this call originates from within step execution.
     * Callers must provide this; publishPost() is not meant to be called
     * outside the harness pipeline (ADR-029, Brief 141).
     */
    stepRunId?: string;
    /** Unipile account ID (required for LinkedIn) */
    unipileAccountId?: string;
    /** Image URLs to attach (LinkedIn only, via Unipile) */
    attachments?: string[];
    /** If content is an array of strings, post as X thread */
    threadTweets?: string[];
    /** Local file paths for media to attach (images/video) */
    mediaFilePaths?: string[];
  },
): Promise<PublishResult> {
  // Invocation guard: publishPost() must be called from within step execution.
  // The stepRunId proves the call originates from the harness pipeline.
  if (!options?.stepRunId && process.env.DITTO_TEST_MODE !== "true") {
    return {
      success: false,
      platform,
      error: "publishPost() requires stepRunId — must be called from within step execution (see ADR-029)",
    };
  }

  // Test mode suppression (same pattern as Brief 133)
  if (process.env.DITTO_TEST_MODE === "true") {
    console.log(`[channel] TEST MODE: suppressed ${platform} publish (${content.slice(0, 80)}...)`);
    return {
      success: true,
      postId: `test-suppressed-publish-${Date.now()}`,
      postUrl: `https://${platform}.com/test-suppressed`,
      platform,
    };
  }

  if (platform === "linkedin") {
    return publishToLinkedIn(content, options?.unipileAccountId, options?.attachments);
  }

  if (platform === "x") {
    return publishToX(content, options?.threadTweets, options?.mediaFilePaths);
  }

  return { success: false, platform, error: `Unsupported publish platform: ${platform}` };
}

async function publishToLinkedIn(
  content: string,
  unipileAccountId?: string,
  attachments?: string[],
): Promise<PublishResult> {
  const config = getUnipileConfig();
  if (!config) {
    return { success: false, platform: "linkedin", error: "Unipile not configured" };
  }
  if (!unipileAccountId) {
    return { success: false, platform: "linkedin", error: "Unipile account ID required for LinkedIn publishing" };
  }

  try {
    const client = new UnipileClient(config.dsn, config.apiKey);
    const postParams: Record<string, unknown> = {
      account_id: unipileAccountId,
      text: content,
    };
    if (attachments && attachments.length > 0) {
      postParams.attachments = attachments;
    }

    // Unipile SDK's TypeScript types don't include the Posts API (UsersResource).
    // Type the method signature explicitly so changes to the SDK surface a compile error.
    type UnipilePostsClient = { users: { createPost: (params: { account_id: string; text: string; attachments?: string[] }) => Promise<{ id?: string; post_id?: string; url?: string }> } };
    const postsClient = client as unknown as UnipilePostsClient;
    const result = await postsClient.users.createPost(postParams as Parameters<UnipilePostsClient["users"]["createPost"]>[0]);

    const postId = String(result.id ?? result.post_id ?? "");
    const postUrl = typeof result.url === "string" ? result.url : `https://www.linkedin.com/feed/update/${postId}`;

    return {
      success: true,
      postId,
      postUrl,
      platform: "linkedin",
    };
  } catch (err) {
    return {
      success: false,
      platform: "linkedin",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function publishToX(
  content: string,
  threadTweets?: string[],
  mediaFilePaths?: string[],
): Promise<PublishResult> {
  const config = getXApiConfig();
  if (!config) {
    return { success: false, platform: "x", error: "X API not configured (missing X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET)" };
  }

  const client = new XApiClient(config);

  // Upload media if provided
  let mediaIds: string[] | undefined;
  if (mediaFilePaths && mediaFilePaths.length > 0) {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    mediaIds = [];
    for (const filePath of mediaFilePaths) {
      try {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4",
        };
        const mimeType = mimeMap[ext] || "image/png";
        const { mediaId } = await client.uploadMedia(buffer, mimeType);
        mediaIds.push(mediaId);
      } catch (err) {
        console.warn(`[channel] Failed to upload media ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  try {
    // Thread mode: array of tweets (media attaches to first tweet only)
    if (threadTweets && threadTweets.length > 1) {
      const { results, error } = await client.postThread(threadTweets, mediaIds);

      if (results.length === 0) {
        return { success: false, platform: "x", error: error ?? "Thread posting failed" };
      }

      return {
        success: !error,
        postId: results[0].postId,
        postUrl: results[0].postUrl,
        platform: "x",
        threadResults: results,
        error,
      };
    }

    // Single tweet with optional media
    const { tweetId, tweetUrl } = await client.postTweet(content, undefined, mediaIds);
    return {
      success: true,
      postId: tweetId,
      postUrl: tweetUrl,
      platform: "x",
    };
  } catch (err) {
    return {
      success: false,
      platform: "x",
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
