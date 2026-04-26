/**
 * Brief 223 — project bearer credential helpers.
 */
import { describe, it, expect } from "vitest";
import {
  generateBearerToken,
  hashBearerToken,
  verifyBearerToken,
  BEARER_BCRYPT_COST,
} from "./project-credentials";

describe("project-credentials", () => {
  it("generates distinct bearer tokens with healthy entropy", () => {
    const a = generateBearerToken();
    const b = generateBearerToken();
    expect(a).not.toBe(b);
    // 32 random bytes → 43-char base64url (no padding).
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it("hashes at cost 12 and verifies the original", async () => {
    const plaintext = generateBearerToken();
    const hash = await hashBearerToken(plaintext);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyBearerToken(plaintext, hash)).toBe(true);
  });

  it("rejects a wrong bearer", async () => {
    const hash = await hashBearerToken("alpha-token");
    expect(await verifyBearerToken("beta-token", hash)).toBe(false);
  });

  it("uses cost 12 explicitly (Brief 200/212 convention)", () => {
    expect(BEARER_BCRYPT_COST).toBe(12);
  });
});
