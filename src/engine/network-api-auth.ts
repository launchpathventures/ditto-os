/**
 * Ditto — Network API Authentication
 *
 * Token validation for the Network API. Tokens are stored hashed (SHA-256).
 * Lookup is O(1) via hash index — the token is hashed and queried directly.
 *
 * Timing-safe note: SHA-256 is a one-way hash. The DB query compares hash
 * values, not plaintext tokens. An attacker cannot use query timing to
 * reconstruct the token because they'd need to reverse the hash first.
 * The original O(n) scan with timingSafeEqual was unnecessary — hash
 * lookup is both faster and equally secure.
 *
 * Token format: `dnt_<32 random hex chars>` (ditto network token).
 *
 * Provenance: Brief 088, ADR-025 (Network API auth).
 */

import { createHash, randomBytes } from "crypto";
import { db, schema } from "../db";
import { eq, isNull, and } from "drizzle-orm";

/** Hash a token using SHA-256 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a new network API token */
export function generateToken(): string {
  const random = randomBytes(32).toString("hex");
  return `dnt_${random}`;
}

/** Result of token validation */
export interface TokenValidation {
  userId: string;
  isAdmin: boolean;
}

/**
 * Validate a Bearer token from the Authorization header.
 * Returns { userId, isAdmin } if valid, null if invalid or revoked.
 *
 * O(1) lookup via hash — hashes the token and queries the index directly.
 * No scanning, no timing-safe comparison needed (hash is one-way).
 */
export async function validateToken(authHeader: string | null): Promise<TokenValidation | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  if (!token || !token.startsWith("dnt_")) {
    return null;
  }

  const tokenHash = hashToken(token);

  // O(1) lookup by hash — no scanning
  const [row] = await db
    .select({
      userId: schema.networkTokens.userId,
      isAdmin: schema.networkTokens.isAdmin,
    })
    .from(schema.networkTokens)
    .where(
      and(
        eq(schema.networkTokens.tokenHash, tokenHash),
        isNull(schema.networkTokens.revokedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return { userId: row.userId, isAdmin: row.isAdmin };
}

/**
 * Check if a validated token has admin privileges.
 * Returns the TokenValidation if admin, null otherwise.
 */
export function requireAdmin(auth: TokenValidation | null): TokenValidation | null {
  if (!auth || !auth.isAdmin) {
    return null;
  }
  return auth;
}

/**
 * Create a new token for a user. Returns the raw token (only shown once).
 * The hash is stored in the database.
 */
export async function createToken(
  userId: string,
  options?: { isAdmin?: boolean },
): Promise<{ token: string; id: string }> {
  const token = generateToken();
  const tokenHash = hashToken(token);

  const [row] = await db
    .insert(schema.networkTokens)
    .values({
      userId,
      tokenHash,
      isAdmin: options?.isAdmin ?? false,
    })
    .returning({ id: schema.networkTokens.id });

  return { token, id: row.id };
}

/**
 * Revoke a token by ID. Returns true if a token was actually revoked.
 */
export async function revokeToken(tokenId: string): Promise<boolean> {
  // Check it exists and is not already revoked before updating
  const [existing] = await db
    .select({ id: schema.networkTokens.id })
    .from(schema.networkTokens)
    .where(
      and(
        eq(schema.networkTokens.id, tokenId),
        isNull(schema.networkTokens.revokedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    return false;
  }

  await db
    .update(schema.networkTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.networkTokens.id, tokenId));

  return true;
}

/**
 * List all tokens for display (without revealing the actual token hash).
 */
export async function listTokens(): Promise<Array<{
  id: string;
  userId: string;
  isAdmin: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}>> {
  return db
    .select({
      id: schema.networkTokens.id,
      userId: schema.networkTokens.userId,
      isAdmin: schema.networkTokens.isAdmin,
      createdAt: schema.networkTokens.createdAt,
      revokedAt: schema.networkTokens.revokedAt,
    })
    .from(schema.networkTokens);
}
