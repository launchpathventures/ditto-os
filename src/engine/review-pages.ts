/**
 * Ditto — Bespoke Signed Review Pages (Brief 106)
 *
 * Ephemeral authenticated pages where Alex presents rich content
 * (ContentBlocks) and the user can chat. Bridges the gap between
 * email-only and full workspace.
 *
 * Token signing uses HMAC-SHA256, consistent with the inbound webhook
 * pattern (packages/web/app/api/v1/network/inbound/route.ts).
 *
 * Provenance: Brief 106, Insight-164 (professional consent model),
 * Insight-161 (email-workspace boundary).
 */

import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { db, schema } from "../db";
import { eq, and, lt } from "drizzle-orm";

// ============================================================
// Constants
// ============================================================

const DEFAULT_TTL_DAYS = 30;
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours after completion

// ============================================================
// Token Signing
// ============================================================

function getSigningSecret(): string {
  const secret = process.env.REVIEW_PAGE_SECRET || process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("REVIEW_PAGE_SECRET or AGENTMAIL_WEBHOOK_SECRET must be set");
  }
  return secret;
}

/**
 * Generate an HMAC-SHA256 signed token encoding userId, pageId, and expiresAt.
 * The token is a URL-safe base64 encoding of: payload.signature
 */
export function generateToken(
  userId: string,
  pageId: string,
  expiresAt: Date,
): string {
  const payload = JSON.stringify({ userId, pageId, exp: expiresAt.getTime() });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Validate a token's HMAC signature and extract the payload.
 * Returns null if the signature is invalid or the token has expired.
 */
export function validateToken(
  token: string,
): { userId: string; pageId: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  // Verify HMAC signature (timing-safe)
  const expected = createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");

  try {
    const valid = timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
    if (!valid) return null;
  } catch {
    return null;
  }

  // Decode payload
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (!payload.userId || !payload.pageId || !payload.exp) return null;

    // Check expiry
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// ============================================================
// Review Page Lifecycle
// ============================================================

export interface CreateReviewPageInput {
  userId: string;
  personId: string;
  title: string;
  blocks: unknown[];
  userName?: string;
  ttlDays?: number;
}

export interface ReviewPageData {
  id: string;
  userId: string;
  personId: string;
  title: string;
  contentBlocks: unknown[];
  chatMessages: unknown[] | null;
  status: string;
  userName: string | null;
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}

/**
 * Create a review page with a signed token.
 * Returns the full URL path (/review/[token]).
 */
export async function createReviewPage(
  input: CreateReviewPageInput,
): Promise<{ url: string; token: string; pageId: string }> {
  const pageId = randomUUID();
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const token = generateToken(input.userId, pageId, expiresAt);

  await db.insert(schema.reviewPages).values({
    id: pageId,
    userId: input.userId,
    personId: input.personId,
    token,
    title: input.title,
    contentBlocks: input.blocks,
    chatMessages: [],
    status: "active",
    userName: input.userName ?? null,
    expiresAt,
  });

  return {
    url: `/review/${token}`,
    token,
    pageId,
  };
}

/**
 * Get a review page by token.
 * Validates HMAC signature, checks expiry, AND checks DB status.
 * Returns null if invalid, expired, or archived.
 */
export async function getReviewPage(
  token: string,
): Promise<ReviewPageData | null> {
  // Validate token signature and expiry
  const payload = validateToken(token);
  if (!payload) return null;

  // Check DB status (reject archived/expired)
  const [page] = await db
    .select()
    .from(schema.reviewPages)
    .where(eq(schema.reviewPages.token, token))
    .limit(1);

  if (!page) return null;

  // Reject if DB status is archived or expired
  if (page.status === "archived" || page.status === "expired") return null;

  // If completed, check grace period (24h)
  if (page.status === "completed" && page.completedAt) {
    const graceDeadline = new Date(page.completedAt.getTime() + GRACE_PERIOD_MS);
    if (Date.now() > graceDeadline.getTime()) return null;
  }

  // Track first access
  if (!page.firstAccessedAt) {
    await db
      .update(schema.reviewPages)
      .set({ firstAccessedAt: new Date() })
      .where(eq(schema.reviewPages.id, page.id));
  }

  return {
    id: page.id,
    userId: page.userId,
    personId: page.personId,
    title: page.title,
    contentBlocks: page.contentBlocks as unknown[],
    chatMessages: page.chatMessages as unknown[] | null,
    status: page.status,
    userName: page.userName,
    createdAt: page.createdAt,
    expiresAt: page.expiresAt,
    completedAt: page.completedAt,
  };
}

/**
 * Mark a review page as completed.
 * The page remains accessible for a 24h grace period.
 */
export async function completeReviewPage(token: string): Promise<boolean> {
  const payload = validateToken(token);
  if (!payload) return false;

  const result = await db
    .update(schema.reviewPages)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.reviewPages.token, token),
        eq(schema.reviewPages.status, "active"),
      ),
    );

  return (result.changes ?? 0) > 0;
}

/**
 * Append a chat message to a review page's chat history.
 */
export async function appendChatMessage(
  token: string,
  role: "user" | "alex",
  text: string,
): Promise<boolean> {
  const [page] = await db
    .select()
    .from(schema.reviewPages)
    .where(eq(schema.reviewPages.token, token))
    .limit(1);

  if (!page || page.status !== "active") return false;

  const messages = (page.chatMessages as unknown[] | null) ?? [];
  messages.push({ role, text, timestamp: new Date().toISOString() });

  await db
    .update(schema.reviewPages)
    .set({ chatMessages: messages })
    .where(eq(schema.reviewPages.id, page.id));

  return true;
}

/**
 * Archive all review pages past their TTL or past grace period.
 * Called from heartbeat/scheduler.
 */
export async function archiveExpiredPages(): Promise<number> {
  const now = new Date();

  // Archive pages past TTL that are still active
  const expiredResult = await db
    .update(schema.reviewPages)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.reviewPages.status, "active"),
        lt(schema.reviewPages.expiresAt, now),
      ),
    );

  // Archive completed pages past grace period
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);
  const completedResult = await db
    .update(schema.reviewPages)
    .set({ status: "archived" })
    .where(
      and(
        eq(schema.reviewPages.status, "completed"),
        lt(schema.reviewPages.completedAt, graceCutoff),
      ),
    );

  const total = (expiredResult.changes ?? 0) + (completedResult.changes ?? 0);
  if (total > 0) {
    console.log(`[review-pages] Archived ${total} expired/completed review pages`);
  }
  return total;
}
