/**
 * Ditto — Magic Link Authentication (Brief 123)
 *
 * Passwordless auth for /chat. Users click a magic link in any Alex email
 * and land in their persistent chat session. Single-use, 24h expiry,
 * rate-limited to 5 per email per hour.
 *
 * Provenance: Slack magic link pattern (pattern level), custom implementation.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db, schema } from "../db";
import { eq, and, gt, sql } from "drizzle-orm";

const MAGIC_LINK_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_LINKS_PER_EMAIL_PER_HOUR = 5;
const WORKSPACE_BOOTSTRAP_PREFIX = "wbt_";
const WORKSPACE_BOOTSTRAP_VERSION = 1;
const WORKSPACE_BOOTSTRAP_TYPE = "workspace-bootstrap";
const WORKSPACE_BOOTSTRAP_SESSION_PREFIX = "workspace-bootstrap:";

/**
 * Generate a cryptographically random 32-character token.
 * Uses base64url encoding of 24 random bytes = 32 chars.
 */
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface MagicLinkResult {
  token: string;
  url: string;
}

export interface WorkspaceBootstrapLoginInput {
  workspaceUrl: string;
  userId: string;
  email: string;
  secret: string;
  expiresInMs?: number;
  jti?: string;
  now?: Date;
}

export interface WorkspaceBootstrapLoginResult extends MagicLinkResult {
  expiresAt: Date;
  jti: string;
}

interface WorkspaceBootstrapPayload {
  typ: typeof WORKSPACE_BOOTSTRAP_TYPE;
  v: typeof WORKSPACE_BOOTSTRAP_VERSION;
  sub: string;
  email: string;
  aud: string;
  exp: number;
  iat: number;
  jti: string;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function normalizeAudience(url: string): string {
  return new URL(url).origin.toLowerCase();
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function getWorkspaceSessionSecret(): string | null {
  return process.env.SESSION_SECRET || process.env.NETWORK_AUTH_SECRET || null;
}

export function createWorkspaceBootstrapLoginLink(
  input: WorkspaceBootstrapLoginInput,
): WorkspaceBootstrapLoginResult {
  if (!input.secret) {
    throw new Error("SESSION_SECRET is required to create a workspace bootstrap login token");
  }

  const now = input.now ?? new Date();
  const expiresInMs = input.expiresInMs ?? MAGIC_LINK_EXPIRY_MS;
  if (expiresInMs > MAGIC_LINK_EXPIRY_MS) {
    throw new Error("Workspace bootstrap login tokens cannot expire later than 24h");
  }

  const expiresAt = new Date(now.getTime() + expiresInMs);
  const jti = input.jti ?? randomBytes(16).toString("hex");
  const payload: WorkspaceBootstrapPayload = {
    typ: WORKSPACE_BOOTSTRAP_TYPE,
    v: WORKSPACE_BOOTSTRAP_VERSION,
    sub: input.userId,
    email: input.email.toLowerCase(),
    aud: normalizeAudience(input.workspaceUrl),
    exp: expiresAt.getTime(),
    iat: now.getTime(),
    jti,
  };
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const sig = signPayload(payloadB64, input.secret);
  const token = `${WORKSPACE_BOOTSTRAP_PREFIX}${payloadB64}.${sig}`;

  return {
    token,
    url: `${normalizeAudience(input.workspaceUrl)}/login/auth?token=${encodeURIComponent(token)}`,
    expiresAt,
    jti,
  };
}

function parseWorkspaceBootstrapToken(token: string, secret: string): WorkspaceBootstrapPayload | null {
  if (!token.startsWith(WORKSPACE_BOOTSTRAP_PREFIX)) return null;
  const raw = token.slice(WORKSPACE_BOOTSTRAP_PREFIX.length);
  const [payloadB64, sig] = raw.split(".");
  if (!payloadB64 || !sig) return null;

  const expectedSig = signPayload(payloadB64, secret);
  if (!safeEqual(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(payloadB64)) as Partial<WorkspaceBootstrapPayload>;
    if (
      payload.typ !== WORKSPACE_BOOTSTRAP_TYPE ||
      payload.v !== WORKSPACE_BOOTSTRAP_VERSION ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.aud !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    return payload as WorkspaceBootstrapPayload;
  } catch {
    return null;
  }
}

/**
 * Create a magic link for the given email and session.
 * Returns the token and full URL, or null if rate limited.
 */
export async function createMagicLink(
  email: string,
  sessionId: string,
): Promise<MagicLinkResult | null> {
  // Rate limit: max 5 per email per hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentLinks = await db
    .select({ id: schema.magicLinks.id })
    .from(schema.magicLinks)
    .where(
      and(
        eq(schema.magicLinks.email, email.toLowerCase()),
        gt(schema.magicLinks.createdAt, new Date(oneHourAgo)),
      ),
    );

  if (recentLinks.length >= MAX_LINKS_PER_EMAIL_PER_HOUR) {
    return null;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

  await db.insert(schema.magicLinks).values({
    email: email.toLowerCase(),
    token,
    sessionId,
    expiresAt,
  });

  const baseUrl = process.env.NETWORK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl}/chat/auth?token=${token}`;

  return { token, url };
}

export interface ValidMagicLink {
  email: string;
  sessionId: string;
}

/**
 * Validate a magic link token. Returns email + sessionId if valid,
 * null if expired, used, or not found.
 */
export async function validateMagicLink(
  token: string,
): Promise<ValidMagicLink | null> {
  const [link] = await db
    .select()
    .from(schema.magicLinks)
    .where(eq(schema.magicLinks.token, token));

  if (!link) return null;
  if (link.usedAt) return null;
  if (link.expiresAt.getTime() < Date.now()) return null;

  return {
    email: link.email,
    sessionId: link.sessionId,
  };
}

/**
 * Consume a magic link (single-use). Atomically marks it as used so
 * concurrent requests cannot both succeed. Returns the link data if
 * successfully consumed, null if already used/expired/not found.
 */
export async function consumeMagicLink(
  token: string,
): Promise<ValidMagicLink | null> {
  // Atomic: UPDATE only if unused AND not expired, then check affected rows
  const now = Date.now();
  const result = await db
    .update(schema.magicLinks)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.magicLinks.token, token),
        sql`${schema.magicLinks.usedAt} IS NULL`,
        gt(schema.magicLinks.expiresAt, new Date(now)),
      ),
    )
    .returning({ email: schema.magicLinks.email, sessionId: schema.magicLinks.sessionId });

  if (result.length === 0) return null;

  return { email: result[0].email, sessionId: result[0].sessionId };
}

/**
 * Consume a workspace bootstrap login token. These tokens are not pre-seeded
 * in the workspace DB; the first successful POST inserts a local nonce marker
 * into `magic_links`. The table's unique token index provides replay
 * protection without adding a new schema table.
 */
export async function consumeWorkspaceBootstrapLoginToken(
  token: string,
  requestUrl: string,
  targetDb: typeof db = db,
): Promise<ValidMagicLink | null> {
  const secret = getWorkspaceSessionSecret();
  if (!secret) return null;

  const payload = parseWorkspaceBootstrapToken(token, secret);
  if (!payload) return null;
  if (payload.exp < Date.now()) return null;

  const expectedAudience = normalizeAudience(requestUrl);
  if (payload.aud !== expectedAudience) return null;

  const expectedEmail = process.env.WORKSPACE_OWNER_EMAIL?.toLowerCase();
  const expectedUserId = process.env.DITTO_WORKSPACE_USER_ID;
  if (!expectedEmail || !expectedUserId) return null;
  if (payload.email.toLowerCase() !== expectedEmail) return null;
  if (payload.sub !== expectedUserId) return null;

  const markerToken = `${WORKSPACE_BOOTSTRAP_SESSION_PREFIX}${payload.jti}`;
  try {
    await targetDb.insert(schema.magicLinks).values({
      email: payload.email.toLowerCase(),
      token: markerToken,
      sessionId: `${WORKSPACE_BOOTSTRAP_SESSION_PREFIX}${payload.sub}`,
      expiresAt: new Date(payload.exp),
      usedAt: new Date(),
    });
  } catch {
    return null;
  }

  return {
    email: payload.email.toLowerCase(),
    sessionId: `${WORKSPACE_BOOTSTRAP_SESSION_PREFIX}${payload.sub}`,
  };
}

export function isWorkspaceBootstrapLoginToken(token: string): boolean {
  return token.startsWith(WORKSPACE_BOOTSTRAP_PREFIX);
}

/**
 * Create a workspace login magic link (Brief 143).
 * Uses a "workspace:" prefixed session ID (not tied to chat sessions).
 * Returns token and full URL, or null if rate limited.
 *
 * Brief 148: Persists frontdoor learned context as person-scoped memories
 * before generating the link — one write per transition.
 */
export async function createWorkspaceMagicLink(
  email: string,
): Promise<MagicLinkResult | null> {
  // Brief 148: Persist frontdoor learned context before generating link
  try {
    const [recentSession] = await db
      .select({ sessionId: schema.chatSessions.sessionId })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.authenticatedEmail, email.toLowerCase()))
      .orderBy(sql`${schema.chatSessions.updatedAt} DESC`)
      .limit(1);

    if (recentSession) {
      const { persistLearnedContext } = await import("./memory-bridge");
      await persistLearnedContext(recentSession.sessionId);
    }
  } catch (err) {
    console.warn(`[magic-link] Failed to persist learned context for ${email}:`, err);
    // Non-fatal — magic link generation must not be blocked
  }

  // Rate limit: max 5 per email per hour (same as chat magic links)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentLinks = await db
    .select({ id: schema.magicLinks.id })
    .from(schema.magicLinks)
    .where(
      and(
        eq(schema.magicLinks.email, email.toLowerCase()),
        gt(schema.magicLinks.createdAt, new Date(oneHourAgo)),
      ),
    );

  if (recentLinks.length >= MAX_LINKS_PER_EMAIL_PER_HOUR) {
    return null;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MS);

  // Use "workspace:" prefix to distinguish from chat session IDs
  const sessionId = `workspace:${randomBytes(16).toString("hex")}`;

  await db.insert(schema.magicLinks).values({
    email: email.toLowerCase(),
    token,
    sessionId,
    expiresAt,
  });

  const baseUrl = process.env.NETWORK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl}/login/auth?token=${token}`;

  return { token, url };
}

/**
 * Build a magic link URL for an email. Used by channel.ts to add
 * "Continue in chat" footer to outbound emails.
 *
 * Creates a magic link tied to the user's existing chat session,
 * or creates a new session if none exists.
 */
export async function getMagicLinkForEmail(
  email: string,
): Promise<string | null> {
  // Find the user's most recent active session
  const [session] = await db
    .select()
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.authenticatedEmail, email.toLowerCase()),
        sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
      ),
    )
    .orderBy(sql`${schema.chatSessions.updatedAt} DESC`)
    .limit(1);

  if (!session) {
    // No active session — can't create a magic link without a session
    return null;
  }

  const result = await createMagicLink(email, session.sessionId);
  return result?.url ?? null;
}
