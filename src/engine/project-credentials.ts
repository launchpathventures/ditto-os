/**
 * Project credentials — runner bearer token helpers (Brief 223).
 *
 * Bearer tokens are surfaced ONCE on `POST /api/v1/projects` and on the
 * `PATCH …/projects/:slug { rotateBearer: true }` endpoint. The plaintext
 * is never persisted — only the bcrypt(cost=12) hash lives in
 * `projects.runnerBearerHash`.
 *
 * Same hashing pattern as Brief 212's pairing codes (`bridge-credentials.ts`)
 * and Brief 200's clone credentials.
 */
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

export const BEARER_BCRYPT_COST = 12;

/** Generate a fresh bearer token: 32 random bytes, base64url-encoded. */
export function generateBearerToken(): string {
  return randomBytes(32).toString("base64url");
}

/** bcrypt-hash a bearer token at cost 12. */
export async function hashBearerToken(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BEARER_BCRYPT_COST);
}

/** Constant-time-ish compare via bcrypt. */
export async function verifyBearerToken(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
