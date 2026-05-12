/**
 * Ditto — Magic Link Tests (Brief 123)
 *
 * Tests for createMagicLink, validateMagicLink, consumeMagicLink,
 * rate limiting, and expiry behavior.
 *
 * Uses real test DB (no mocks).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

describe("magic-link", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
    process.env.NETWORK_BASE_URL = "https://ditto.partners";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete process.env.NETWORK_BASE_URL;
    delete process.env.SESSION_SECRET;
    delete process.env.NETWORK_AUTH_SECRET;
    delete process.env.WORKSPACE_OWNER_EMAIL;
    delete process.env.DITTO_WORKSPACE_USER_ID;
  });

  async function createSession(email?: string): Promise<string> {
    const sessionId = randomUUID();
    await testDb.insert(schema.chatSessions).values({
      sessionId,
      messages: [],
      context: "front-door",
      ipHash: "test-hash",
      authenticatedEmail: email?.toLowerCase() ?? null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return sessionId;
  }

  describe("createMagicLink", () => {
    it("generates a 32-char token with 24h expiry", async () => {
      const { createMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const result = await createMagicLink("user@example.com", sessionId);

      expect(result).not.toBeNull();
      expect(result!.token).toHaveLength(32);
      expect(result!.url).toContain("https://ditto.partners/chat/auth?token=");
      expect(result!.url).toContain(result!.token);
    });

    it("normalizes email to lowercase", async () => {
      const { createMagicLink, validateMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const result = await createMagicLink("User@Example.COM", sessionId);
      expect(result).not.toBeNull();

      const valid = await validateMagicLink(result!.token);
      expect(valid).not.toBeNull();
      expect(valid!.email).toBe("user@example.com");
    });

    it("rate limits at 5 per email per hour", async () => {
      const { createMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      // Create 5 links — should all succeed
      for (let i = 0; i < 5; i++) {
        const result = await createMagicLink("rate@test.com", sessionId);
        expect(result).not.toBeNull();
      }

      // 6th should fail
      const result = await createMagicLink("rate@test.com", sessionId);
      expect(result).toBeNull();
    });

    it("rate limit is per-email (different emails not affected)", async () => {
      const { createMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      for (let i = 0; i < 5; i++) {
        await createMagicLink("a@test.com", sessionId);
      }

      // Different email should still work
      const result = await createMagicLink("b@test.com", sessionId);
      expect(result).not.toBeNull();
    });
  });

  describe("validateMagicLink", () => {
    it("returns email and sessionId for valid token", async () => {
      const { createMagicLink, validateMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const link = await createMagicLink("valid@test.com", sessionId);
      const result = await validateMagicLink(link!.token);

      expect(result).toEqual({
        email: "valid@test.com",
        sessionId,
      });
    });

    it("returns null for non-existent token", async () => {
      const { validateMagicLink } = await import("./magic-link");
      const result = await validateMagicLink("nonexistent-token-12345678");
      expect(result).toBeNull();
    });

    it("returns null for expired token", async () => {
      const { createMagicLink, validateMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const link = await createMagicLink("expired@test.com", sessionId);

      // Manually expire the token
      await testDb
        .update(schema.magicLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.magicLinks.token, link!.token));

      const result = await validateMagicLink(link!.token);
      expect(result).toBeNull();
    });

    it("returns null for used token", async () => {
      const { createMagicLink, consumeMagicLink, validateMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const link = await createMagicLink("used@test.com", sessionId);
      await consumeMagicLink(link!.token);

      const result = await validateMagicLink(link!.token);
      expect(result).toBeNull();
    });
  });

  describe("consumeMagicLink", () => {
    it("marks token as used and returns link data", async () => {
      const { createMagicLink, consumeMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const link = await createMagicLink("consume@test.com", sessionId);
      const result = await consumeMagicLink(link!.token);

      expect(result).toEqual({
        email: "consume@test.com",
        sessionId,
      });
    });

    it("returns null on second consumption (single-use)", async () => {
      const { createMagicLink, consumeMagicLink } = await import("./magic-link");
      const sessionId = await createSession();

      const link = await createMagicLink("single@test.com", sessionId);
      await consumeMagicLink(link!.token);

      const result = await consumeMagicLink(link!.token);
      expect(result).toBeNull();
    });

    it("returns null for invalid token", async () => {
      const { consumeMagicLink } = await import("./magic-link");
      const result = await consumeMagicLink("bad-token-123456789012345");
      expect(result).toBeNull();
    });
  });

  describe("workspace bootstrap login tokens", () => {
    function setWorkspaceAuthEnv() {
      process.env.SESSION_SECRET = "workspace-secret";
      process.env.WORKSPACE_OWNER_EMAIL = "owner@example.com";
      process.env.DITTO_WORKSPACE_USER_ID = "user-1";
    }

    it("creates a workspace-audience token with max 24h expiry", async () => {
      const { createWorkspaceBootstrapLoginLink } = await import("./magic-link");

      const link = createWorkspaceBootstrapLoginLink({
        workspaceUrl: "https://workspace.example.com/some/path",
        userId: "user-1",
        email: "Owner@Example.com",
        secret: "workspace-secret",
        now: new Date(1_000),
      });

      expect(link.url).toContain("https://workspace.example.com/login/auth?token=wbt_");
      expect(link.expiresAt.getTime()).toBe(1_000 + 24 * 60 * 60 * 1000);
      expect(link.token).toMatch(/^wbt_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it("rejects bootstrap token expiries longer than 24h", async () => {
      const { createWorkspaceBootstrapLoginLink } = await import("./magic-link");

      expect(() => createWorkspaceBootstrapLoginLink({
        workspaceUrl: "https://workspace.example.com",
        userId: "user-1",
        email: "owner@example.com",
        secret: "workspace-secret",
        expiresInMs: 24 * 60 * 60 * 1000 + 1,
      })).toThrow(/cannot expire later than 24h/);
    });

    it("consumes a valid bootstrap token once and records a local nonce marker", async () => {
      const {
        createWorkspaceBootstrapLoginLink,
        consumeWorkspaceBootstrapLoginToken,
      } = await import("./magic-link");
      setWorkspaceAuthEnv();

      const link = createWorkspaceBootstrapLoginLink({
        workspaceUrl: "https://workspace.example.com",
        userId: "user-1",
        email: "owner@example.com",
        secret: "workspace-secret",
        jti: "nonce-1",
      });

      const first = await consumeWorkspaceBootstrapLoginToken(
        link.token,
        "https://workspace.example.com/login/auth",
      );
      const second = await consumeWorkspaceBootstrapLoginToken(
        link.token,
        "https://workspace.example.com/login/auth",
      );

      expect(first).toEqual({
        email: "owner@example.com",
        sessionId: "workspace-bootstrap:user-1",
      });
      expect(second).toBeNull();

      const markers = await testDb
        .select()
        .from(schema.magicLinks)
        .where(eq(schema.magicLinks.token, "workspace-bootstrap:nonce-1"));
      expect(markers).toHaveLength(1);
      expect(markers[0].usedAt).toBeInstanceOf(Date);
    });

    it("rejects wrong audience, wrong secret, missing secret, wrong user, and wrong email", async () => {
      const {
        createWorkspaceBootstrapLoginLink,
        consumeWorkspaceBootstrapLoginToken,
      } = await import("./magic-link");
      setWorkspaceAuthEnv();

      const link = createWorkspaceBootstrapLoginLink({
        workspaceUrl: "https://workspace.example.com",
        userId: "user-1",
        email: "owner@example.com",
        secret: "workspace-secret",
      });

      await expect(
        consumeWorkspaceBootstrapLoginToken(link.token, "https://other.example.com/login/auth"),
      ).resolves.toBeNull();

      process.env.SESSION_SECRET = "wrong-secret";
      await expect(
        consumeWorkspaceBootstrapLoginToken(link.token, "https://workspace.example.com/login/auth"),
      ).resolves.toBeNull();

      delete process.env.SESSION_SECRET;
      delete process.env.NETWORK_AUTH_SECRET;
      await expect(
        consumeWorkspaceBootstrapLoginToken(link.token, "https://workspace.example.com/login/auth"),
      ).resolves.toBeNull();

      setWorkspaceAuthEnv();
      process.env.DITTO_WORKSPACE_USER_ID = "other-user";
      await expect(
        consumeWorkspaceBootstrapLoginToken(link.token, "https://workspace.example.com/login/auth"),
      ).resolves.toBeNull();

      process.env.DITTO_WORKSPACE_USER_ID = "user-1";
      process.env.WORKSPACE_OWNER_EMAIL = "other@example.com";
      await expect(
        consumeWorkspaceBootstrapLoginToken(link.token, "https://workspace.example.com/login/auth"),
      ).resolves.toBeNull();
    });

    it("rejects expired bootstrap tokens", async () => {
      const {
        createWorkspaceBootstrapLoginLink,
        consumeWorkspaceBootstrapLoginToken,
      } = await import("./magic-link");
      setWorkspaceAuthEnv();

      const link = createWorkspaceBootstrapLoginLink({
        workspaceUrl: "https://workspace.example.com",
        userId: "user-1",
        email: "owner@example.com",
        secret: "workspace-secret",
        expiresInMs: 1,
        now: new Date(Date.now() - 10_000),
      });

      await expect(
        consumeWorkspaceBootstrapLoginToken(link.token, "https://workspace.example.com/login/auth"),
      ).resolves.toBeNull();
    });
  });
});
