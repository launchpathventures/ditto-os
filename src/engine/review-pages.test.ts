/**
 * Tests for Bespoke Signed Review Pages (Brief 106)
 *
 * Covers: token generation + validation, expiry enforcement, HMAC forgery
 * rejection, page lifecycle (create → get → complete → archive), chat
 * message persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";

// ============================================================
// DB Mock (same pattern as other engine tests)
// ============================================================

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  vi.stubEnv("REVIEW_PAGE_SECRET", "test-secret-for-review-pages-hmac-256");
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Token Generation & Validation
// ============================================================

describe("Token signing", () => {
  it("generates a valid token with payload.signature format", async () => {
    const { generateToken } = await import("./review-pages");
    const token = generateToken("user-1", "page-1", new Date(Date.now() + 86400000));
    expect(token).toContain(".");
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
  });

  it("validates a correctly signed token", async () => {
    const { generateToken, validateToken } = await import("./review-pages");
    const expiresAt = new Date(Date.now() + 86400000);
    const token = generateToken("user-1", "page-1", expiresAt);
    const payload = validateToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-1");
    expect(payload!.pageId).toBe("page-1");
    expect(payload!.exp).toBe(expiresAt.getTime());
  });

  it("rejects a token with tampered payload", async () => {
    const { generateToken, validateToken } = await import("./review-pages");
    const token = generateToken("user-1", "page-1", new Date(Date.now() + 86400000));
    const [, signature] = token.split(".");

    const tamperedPayload = Buffer.from(
      JSON.stringify({ userId: "hacker", pageId: "page-1", exp: Date.now() + 86400000 }),
    ).toString("base64url");

    const result = validateToken(`${tamperedPayload}.${signature}`);
    expect(result).toBeNull();
  });

  it("rejects a token with tampered signature", async () => {
    const { generateToken, validateToken } = await import("./review-pages");
    const token = generateToken("user-1", "page-1", new Date(Date.now() + 86400000));
    const [payload] = token.split(".");

    const result = validateToken(`${payload}.tampered-signature`);
    expect(result).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { generateToken, validateToken } = await import("./review-pages");
    const token = generateToken("user-1", "page-1", new Date(Date.now() - 1000));
    const result = validateToken(token);
    expect(result).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    const { validateToken } = await import("./review-pages");
    expect(validateToken("")).toBeNull();
    expect(validateToken("no-dots-here")).toBeNull();
    expect(validateToken("too.many.dots.here")).toBeNull();
  });
});

// ============================================================
// Page Lifecycle
// ============================================================

describe("Review page lifecycle", () => {
  it("creates a review page and returns URL with token", async () => {
    const { createReviewPage } = await import("./review-pages");
    const result = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Outreach Approach for Property Managers",
      blocks: [{ type: "text", text: "Here's my approach..." }],
      userName: "Rob",
    });

    expect(result.url).toMatch(/^\/review\/.+/);
    expect(result.token).toBeTruthy();
    expect(result.pageId).toBeTruthy();
  });

  it("retrieves a valid review page by token", async () => {
    const { createReviewPage, getReviewPage } = await import("./review-pages");
    const { token } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Test Page",
      blocks: [{ type: "text", text: "Hello" }],
      userName: "Rob",
    });

    const page = await getReviewPage(token);
    expect(page).not.toBeNull();
    expect(page!.title).toBe("Test Page");
    expect(page!.contentBlocks).toEqual([{ type: "text", text: "Hello" }]);
    expect(page!.userName).toBe("Rob");
    expect(page!.status).toBe("active");
  });

  it("returns null for invalid token", async () => {
    const { getReviewPage } = await import("./review-pages");
    const page = await getReviewPage("invalid.token");
    expect(page).toBeNull();
  });

  it("returns null for archived page", async () => {
    const { createReviewPage, getReviewPage } = await import("./review-pages");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../db/schema");

    const { token, pageId } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Archived Page",
      blocks: [],
    });

    await testDb
      .update(schema.reviewPages)
      .set({ status: "archived" })
      .where(eq(schema.reviewPages.id, pageId));

    const page = await getReviewPage(token);
    expect(page).toBeNull();
  });

  it("completes a review page", async () => {
    const { createReviewPage, getReviewPage, completeReviewPage } = await import("./review-pages");
    const { token } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "To Complete",
      blocks: [],
    });

    const result = await completeReviewPage(token);
    expect(result).toBe(true);

    const page = await getReviewPage(token);
    expect(page).not.toBeNull();
    expect(page!.status).toBe("completed");
  });

  it("cannot complete an already-completed page", async () => {
    const { createReviewPage, completeReviewPage } = await import("./review-pages");
    const { token } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Double Complete",
      blocks: [],
    });

    await completeReviewPage(token);
    const secondResult = await completeReviewPage(token);
    expect(secondResult).toBe(false);
  });
});

// ============================================================
// Chat Message Persistence
// ============================================================

describe("Chat message persistence", () => {
  it("appends chat messages to review page", async () => {
    const { createReviewPage, getReviewPage, appendChatMessage } = await import("./review-pages");
    const { token } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Chat Test",
      blocks: [],
    });

    await appendChatMessage(token, "user", "What about Henderson PM?");
    await appendChatMessage(token, "alex", "Good point — I'll mention the referral.");

    const page = await getReviewPage(token);
    expect(page!.chatMessages).toHaveLength(2);
    expect((page!.chatMessages![0] as { role: string }).role).toBe("user");
    expect((page!.chatMessages![1] as { role: string }).role).toBe("alex");
  });

  it("rejects chat messages on non-active pages", async () => {
    const { createReviewPage, completeReviewPage, appendChatMessage } = await import("./review-pages");
    const { token } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Completed Chat",
      blocks: [],
    });

    await completeReviewPage(token);
    const result = await appendChatMessage(token, "user", "Too late!");
    expect(result).toBe(false);
  });
});

// ============================================================
// Archival
// ============================================================

describe("Archive expired pages", () => {
  it("archives pages past TTL", async () => {
    const { createReviewPage, archiveExpiredPages } = await import("./review-pages");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../db/schema");

    const { pageId } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Expired Page",
      blocks: [],
    });

    // Force the expiry to the past
    await testDb
      .update(schema.reviewPages)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.reviewPages.id, pageId));

    const count = await archiveExpiredPages();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("archives completed pages past grace period", async () => {
    const { createReviewPage, completeReviewPage, archiveExpiredPages } = await import("./review-pages");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../db/schema");

    const { token, pageId } = await createReviewPage({
      userId: "user-1",
      personId: "person-1",
      title: "Grace Period Test",
      blocks: [],
    });

    await completeReviewPage(token);

    // Force completedAt to past the grace period
    await testDb
      .update(schema.reviewPages)
      .set({ completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(schema.reviewPages.id, pageId));

    const count = await archiveExpiredPages();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
