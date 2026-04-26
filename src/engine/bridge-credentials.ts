/**
 * Bridge credentials — pairing code + JWT helpers (Brief 212 AC #5, #11).
 *
 * Pairing codes: 6-char base32 (≥30 bits entropy), bcrypt cost 12, 15-min
 * TTL, single-use, atomically consumed. Codes are surfaced once in the UI
 * and never stored plaintext.
 *
 * Device JWTs: HS256 signed with BRIDGE_JWT_SIGNING_KEY (32+ random bytes,
 * base64). Carries `protocolVersion: "1.0.0"`. JWT body is opaque from the
 * daemon's perspective; only its signed shape matters.
 */
import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;
export const BCRYPT_COST = 12;

const BASE32_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // Crockford-ish: no I, L, O, 0, 1, U
const PAIRING_CODE_LEN = 6;

/** Generate a 6-char Crockford-style base32 code (~30 bits entropy). */
export function generatePairingCode(): string {
  // 6 chars × 30-symbol alphabet ≈ 30 bits entropy.
  // randomBytes guarantees CSPRNG; modulo bias on 30/256 is acceptable for
  // this length given the 15-min TTL + single-use constraint.
  const bytes = randomBytes(PAIRING_CODE_LEN);
  let out = "";
  for (let i = 0; i < PAIRING_CODE_LEN; i++) {
    out += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
  }
  return out;
}

export async function hashPairingCode(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_COST);
}

export async function verifyPairingCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/** Generate a fresh device id (UUID v4). */
export function newDeviceId(): string {
  return randomUUID();
}

/** Read the JWT signing key from env. Throws if not configured. */
export function requireJwtSigningKey(): string {
  const key = process.env.BRIDGE_JWT_SIGNING_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "BRIDGE_JWT_SIGNING_KEY env var is required (≥16 chars; recommended: 32+ random bytes, base64).",
    );
  }
  return key;
}

/**
 * Compute the dial URL the daemon should connect to. Path-based topology
 * per Brief 200 (no per-workspace sub-domains). Honours BRIDGE_DIAL_PUBLIC_URL
 * for explicit deployment overrides; falls back to NEXT_PUBLIC_APP_URL +
 * the canonical bridge dial path.
 */
export function computeDialUrl(): string {
  const explicit = process.env.BRIDGE_DIAL_PUBLIC_URL;
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Replace http(s):// with ws(s)://.
  const wsBase = base.replace(/^http(s?):\/\//, "ws$1://");
  return `${wsBase}/api/v1/bridge/_dial`;
}
