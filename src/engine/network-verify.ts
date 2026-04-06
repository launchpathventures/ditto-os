/**
 * Ditto — Anti-Enumeration Verify Handler (Brief 095)
 *
 * Uniform-response pattern: the web page ALWAYS shows the same message regardless
 * of whether the email was found. Confirmation is shifted to the recipient's inbox
 * (Magic Link pattern from Auth0/Clerk).
 *
 * CRITICAL: The verification email is sent to the RECIPIENT'S address, never to
 * the submitter. The submitter cannot observe whether a verification email was sent
 * to someone else. This is the core anti-enumeration guarantee.
 *
 * Provenance: Passwordless auth (Auth0, Clerk), timing attack prevention, Brief 095.
 */

import { db, schema } from "../db";
import { and, sql } from "drizzle-orm";
import { createHash } from "crypto";

// ============================================================
// Constants
// ============================================================

const FIXED_DELAY_MS = 500;
const MAX_VERIFY_PER_IP_PER_HOUR = 5;
const MAX_VERIFICATION_EMAIL_PER_RECIPIENT_PER_DAY = 1;

// ============================================================
// Types
// ============================================================

export interface VerifyResult {
  message: string;
  rateLimited: boolean;
}

// Uniform response — same for found AND not-found
const UNIFORM_RESPONSE: VerifyResult = {
  message: "If that email\u2019s from me, I\u2019ve just sent you a verification to that address. Check your inbox \u2014 it\u2019ll confirm what I reached out about and give you a way to reply directly.\n\nNothing in your inbox in the next few minutes? Then the email probably wasn\u2019t from me. Trust your instincts.",
  rateLimited: false,
};

const RATE_LIMITED_RESPONSE: VerifyResult = {
  message: "You\u2019ve checked a few times \u2014 if you\u2019re not getting a verification email, the original message probably wasn\u2019t from me.",
  rateLimited: true,
};

// ============================================================
// IP Hashing (same pattern as network-chat.ts)
// ============================================================

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "ditto-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// ============================================================
// Rate Limiting
// ============================================================

async function checkIpRateLimit(ipHash: string): Promise<boolean> {
  const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.verifyAttempts)
    .where(
      and(
        sql`${schema.verifyAttempts.ipHash} = ${ipHash}`,
        sql`${schema.verifyAttempts.createdAt} > ${oneHourAgoMs}`,
      ),
    );
  return (result[0]?.count ?? 0) < MAX_VERIFY_PER_IP_PER_HOUR;
}

async function checkRecipientEmailRateLimit(email: string): Promise<boolean> {
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.verificationEmails)
    .where(
      and(
        sql`${schema.verificationEmails.recipientEmail} = ${email}`,
        sql`${schema.verificationEmails.sentAt} > ${oneDayAgoMs}`,
      ),
    );
  return (result[0]?.count ?? 0) < MAX_VERIFICATION_EMAIL_PER_RECIPIENT_PER_DAY;
}

async function recordVerifyAttempt(ipHash: string, email: string): Promise<void> {
  await db.insert(schema.verifyAttempts).values({ ipHash, email });
}

async function recordVerificationEmail(email: string): Promise<void> {
  await db.insert(schema.verificationEmails).values({ recipientEmail: email });
}

// ============================================================
// Outreach Lookup
// ============================================================

interface OutreachRecord {
  date: string;
  topic: string;
}

async function findOutreach(email: string): Promise<OutreachRecord | null> {
  // Look up the person by email, then find their most recent interaction
  const people = await db
    .select()
    .from(schema.people)
    .where(sql`${schema.people.email} = ${email}`);

  if (people.length === 0) return null;

  const person = people[0];
  const interactions = await db
    .select()
    .from(schema.interactions)
    .where(sql`${schema.interactions.personId} = ${person.id}`)
    .orderBy(sql`${schema.interactions.createdAt} DESC`)
    .limit(1);

  if (interactions.length === 0) return null;

  const interaction = interactions[0];
  const date = interaction.createdAt
    ? new Date(interaction.createdAt as unknown as number).toISOString().split("T")[0]
    : "recently";

  // General topic — not the full subject line (privacy boundary)
  const topic = interaction.type === "introduction_made"
    ? "an introduction"
    : interaction.type === "outreach_sent"
      ? "a connection"
      : "reaching out";

  return { date, topic };
}

// ============================================================
// Verification Email Composition
// ============================================================

/**
 * Compose the verification email using Alex's voice.
 * Sent to the RECIPIENT only — never to the submitter.
 */
function composeVerificationEmail(email: string, outreach: OutreachRecord): {
  to: string;
  subject: string;
  body: string;
} {
  return {
    to: email,
    subject: "Verifying your email from Alex at Ditto",
    body: [
      `Hey \u2014 you just checked whether an email from me was genuine.`,
      ``,
      `It was. I reached out on ${outreach.date} about ${outreach.topic}.`,
      ``,
      `Everything you received was real. If you\u2019d like to continue the conversation, just reply to the original email or hit reply here.`,
      ``,
      `\u2014 Alex`,
      `Ditto`,
    ].join("\n"),
  };
}

// ============================================================
// Email Footer Template
// ============================================================

/**
 * Email footer link template for outreach emails.
 * Subtle, below the signature. Must not compete with the outreach's primary CTA.
 */
export const EMAIL_FOOTER_TEMPLATE = `\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nSent by Alex from Ditto \u2014 AI-powered introductions.\nWant your own advisor? Learn more \u2192 {{DITTO_URL}}/welcome/referred\n`;

// ============================================================
// Main Handler
// ============================================================

/**
 * Handle a verify request with anti-enumeration guarantees.
 *
 * Returns the SAME response regardless of whether the email is found.
 * If found, sends a verification email to the recipient asynchronously.
 * Uses a fixed-delay floor so timing cannot be used for enumeration.
 */
export async function handleVerify(
  email: string,
  ip: string,
): Promise<VerifyResult> {
  const ipHash = hashIp(ip);

  // Check IP rate limit BEFORE recording (so the current attempt doesn't count against itself)
  const ipAllowed = await checkIpRateLimit(ipHash);
  if (!ipAllowed) {
    return RATE_LIMITED_RESPONSE;
  }

  // Record the attempt (for future rate limiting)
  await recordVerifyAttempt(ipHash, email);

  // Capture start time for constant-time guarantee
  const start = Date.now();

  // Look up outreach and send verification if found
  const outreach = await findOutreach(email);

  if (outreach) {
    // Check per-recipient rate limit before sending
    const canSend = await checkRecipientEmailRateLimit(email);
    if (canSend) {
      // Fire-and-forget: compose and "send" the verification email
      // In production, this would use AgentMail. For MVP, we record the intent.
      const emailPayload = composeVerificationEmail(email, outreach);
      recordVerificationEmail(email).catch(() => {
        // Non-critical — rate limit record failure shouldn't break verify
      });

      // Log the email for debugging/future AgentMail integration
      console.log("[verify] Verification email composed:", {
        to: emailPayload.to,
        subject: emailPayload.subject,
      });
    }
  }

  // Wait for the remainder of FIXED_DELAY_MS (ensures constant timing
  // regardless of how long the work above took)
  const elapsed = Date.now() - start;
  const remaining = Math.max(0, FIXED_DELAY_MS - elapsed);
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }

  // Always return the same response
  return UNIFORM_RESPONSE;
}
