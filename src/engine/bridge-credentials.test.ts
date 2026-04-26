import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generatePairingCode,
  hashPairingCode,
  verifyPairingCode,
  newDeviceId,
  requireJwtSigningKey,
  computeDialUrl,
  PAIRING_CODE_TTL_MS,
} from "./bridge-credentials.js";

describe("bridge credentials", () => {
  describe("pairing codes", () => {
    it("generates a 6-char base32 code in the Crockford-ish alphabet", () => {
      for (let i = 0; i < 50; i++) {
        const c = generatePairingCode();
        expect(c).toHaveLength(6);
        expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]+$/);
      }
    });

    it("codes are not trivially repeating", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) seen.add(generatePairingCode());
      // ~30 bits entropy, 100 trials — collisions extremely unlikely.
      expect(seen.size).toBeGreaterThan(95);
    });

    it("hash + verify roundtrip succeeds; mismatch fails", async () => {
      const code = generatePairingCode();
      const hash = await hashPairingCode(code);
      expect(await verifyPairingCode(code, hash)).toBe(true);
      expect(await verifyPairingCode("WRONG1", hash)).toBe(false);
    });

    it("PAIRING_CODE_TTL_MS is 15 minutes", () => {
      expect(PAIRING_CODE_TTL_MS).toBe(15 * 60 * 1000);
    });
  });

  describe("device id", () => {
    it("returns a UUIDv4-shaped string", () => {
      const id = newDeviceId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe("requireJwtSigningKey", () => {
    const original = process.env.BRIDGE_JWT_SIGNING_KEY;
    beforeEach(() => {
      delete process.env.BRIDGE_JWT_SIGNING_KEY;
    });
    afterEach(() => {
      if (original === undefined) delete process.env.BRIDGE_JWT_SIGNING_KEY;
      else process.env.BRIDGE_JWT_SIGNING_KEY = original;
    });

    it("throws when the env var is unset", () => {
      expect(() => requireJwtSigningKey()).toThrow(/BRIDGE_JWT_SIGNING_KEY/);
    });

    it("throws when the env var is too short", () => {
      process.env.BRIDGE_JWT_SIGNING_KEY = "abc";
      expect(() => requireJwtSigningKey()).toThrow(/BRIDGE_JWT_SIGNING_KEY/);
    });

    it("returns the key when ≥16 chars", () => {
      process.env.BRIDGE_JWT_SIGNING_KEY = "a".repeat(32);
      expect(requireJwtSigningKey()).toBe("a".repeat(32));
    });
  });

  describe("computeDialUrl", () => {
    const original = { url: process.env.BRIDGE_DIAL_PUBLIC_URL, app: process.env.NEXT_PUBLIC_APP_URL };
    beforeEach(() => {
      delete process.env.BRIDGE_DIAL_PUBLIC_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
    });
    afterEach(() => {
      if (original.url) process.env.BRIDGE_DIAL_PUBLIC_URL = original.url;
      else delete process.env.BRIDGE_DIAL_PUBLIC_URL;
      if (original.app) process.env.NEXT_PUBLIC_APP_URL = original.app;
      else delete process.env.NEXT_PUBLIC_APP_URL;
    });

    it("honours BRIDGE_DIAL_PUBLIC_URL when set", () => {
      process.env.BRIDGE_DIAL_PUBLIC_URL = "wss://example.ditto.you/api/v1/bridge/_dial";
      expect(computeDialUrl()).toBe("wss://example.ditto.you/api/v1/bridge/_dial");
    });

    it("falls back to NEXT_PUBLIC_APP_URL with ws:// scheme", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://workspace.example.com";
      expect(computeDialUrl()).toBe("wss://workspace.example.com/api/v1/bridge/_dial");
    });

    it("defaults to localhost when nothing is set", () => {
      expect(computeDialUrl()).toBe("ws://localhost:3000/api/v1/bridge/_dial");
    });
  });
});
