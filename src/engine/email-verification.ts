/**
 * Ditto — Front Door Email Verification
 *
 * Sends a 6-digit code to verify email ownership during the front door chat.
 * The email is a warm, contextual note from Alex — not a system email.
 * Alex knows they're mid-conversation and asks the visitor to confirm.
 *
 * Flow: visitor enters email → code sent → visitor enters code → verified.
 */

import { db, schema } from "../db";
import { and, eq, gt } from "drizzle-orm";
import { randomInt } from "crypto";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_SESSION = 3; // prevent spam

/**
 * Generate a 6-digit verification code, store it, and send it via email.
 * Returns the code ID for tracking (never expose the code itself to the frontend).
 */
export async function sendVerificationCode(
  sessionId: string,
  email: string,
  visitorName?: string,
): Promise<{ codeId: string; error?: string }> {
  // Rate limit: max codes per session
  const existing = await db
    .select()
    .from(schema.emailVerificationCodes)
    .where(
      and(
        eq(schema.emailVerificationCodes.sessionId, sessionId),
        gt(schema.emailVerificationCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );

  if (existing.length >= MAX_CODES_PER_SESSION) {
    return { codeId: "", error: "Too many verification attempts. Please try again later." };
  }

  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const [record] = await db
    .insert(schema.emailVerificationCodes)
    .values({
      sessionId,
      email: email.toLowerCase(),
      code,
      expiresAt,
    })
    .returning();

  // Send the verification email from Alex
  try {
    const { escapeHtml } = await import("./channel");
    const greeting = visitorName ? `Hey ${visitorName}` : "Hey";
    const greetingHtml = visitorName ? `Hey ${escapeHtml(visitorName)}` : "Hey";

    const body = [
      `${greeting},`,
      "",
      `Alex here from Ditto. We're mid-chat on ditto.partners and I need to verify this is your email before we go further. Since I'll be reaching out to people on your behalf, I want to make sure nobody else can use your identity.`,
      "",
      `Your verification code: ${code}`,
      "",
      `Pop that into the chat and we're good to go.`,
      "",
      `Tip: save this email address (alex@ditto.partners) to your contacts — that's where our real conversations happen once we get started.`,
      "",
      `— Alex, Ditto`,
      `https://ditto.partners`,
    ].join("\n");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <p>${greetingHtml},</p>
        <p>Alex here from <a href="https://ditto.partners" style="color: #2d8a6e; text-decoration: none;">Ditto</a>. We're mid-chat and I need to verify this is your email before we go further. Since I'll be reaching out to people on your behalf, I want to make sure nobody else can use your identity.</p>
        <div style="background: #f0faf6; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <p style="margin: 0 0 4px; font-size: 13px; color: #666;">Your verification code</p>
          <p style="margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 0.2em; color: #1a1a1a;">${code}</p>
        </div>
        <p>Pop that into the chat and we're good to go.</p>
        <p style="color: #666; font-size: 13px;">Tip: save this email address to your contacts — that's where our conversations happen once we get started.</p>
        <p style="margin-top: 24px;">— Alex, Ditto</p>
      </div>
    `.trim();

    // Always send verification emails via AgentMail directly — never through
    // sendAndRecord, which applies test mode suppression. Verification emails
    // are transactional, not outreach, and must always be delivered.
    const { AgentMailClient } = await import("agentmail");
    const apiKey = process.env.AGENTMAIL_API_KEY;
    const alexInbox = process.env.AGENTMAIL_ALEX_INBOX;
    if (apiKey && alexInbox) {
      const client = new AgentMailClient({ apiKey });
      await client.inboxes.messages.send(alexInbox, {
        to: [email],
        subject: `Your code from Alex at Ditto: ${code}`,
        text: body,
        html,
      });
    } else {
      console.warn("[email-verification] AGENTMAIL_API_KEY or AGENTMAIL_ALEX_INBOX not set — cannot send verification email");
    }
  } catch (err) {
    console.error("[email-verification] Failed to send code:", (err as Error).message);
    // Don't fail the flow — the code is stored, they can request a resend
  }

  return { codeId: record.id };
}

/**
 * Validate a verification code. Returns true if valid and not expired.
 */
export async function validateVerificationCode(
  sessionId: string,
  email: string,
  code: string,
): Promise<{ valid: boolean; error?: string }> {
  const records = await db
    .select()
    .from(schema.emailVerificationCodes)
    .where(
      and(
        eq(schema.emailVerificationCodes.sessionId, sessionId),
        eq(schema.emailVerificationCodes.email, email.toLowerCase()),
        eq(schema.emailVerificationCodes.verified, false),
      ),
    )
    .orderBy(schema.emailVerificationCodes.createdAt);

  const latest = records[records.length - 1];
  if (!latest) {
    return { valid: false, error: "No verification code found. Please request a new one." };
  }

  if (latest.attempts >= MAX_ATTEMPTS) {
    return { valid: false, error: "Too many attempts. Please request a new code." };
  }

  if (new Date() > latest.expiresAt) {
    return { valid: false, error: "Code expired. Please request a new one." };
  }

  // Increment attempts
  await db
    .update(schema.emailVerificationCodes)
    .set({ attempts: latest.attempts + 1 })
    .where(eq(schema.emailVerificationCodes.id, latest.id));

  if (latest.code !== code.trim()) {
    return { valid: false, error: `Incorrect code. ${MAX_ATTEMPTS - latest.attempts - 1} attempts remaining.` };
  }

  // Mark as verified
  await db
    .update(schema.emailVerificationCodes)
    .set({ verified: true })
    .where(eq(schema.emailVerificationCodes.id, latest.id));

  return { valid: true };
}
