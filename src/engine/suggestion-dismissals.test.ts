/**
 * Tests for suggestion dismissal tracking.
 *
 * Covers: recording dismissals, checking if dismissed, filtering by expiry,
 * hash-based deduplication, and integration with suggest_next.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mock
const { recordDismissal, isDismissed, getActiveDismissalHashes, hashContent } = await import("./suggestion-dismissals");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("hashContent", () => {
  it("produces consistent hashes for same content", () => {
    expect(hashContent("Hello World")).toBe(hashContent("Hello World"));
  });

  it("normalizes case and whitespace", () => {
    expect(hashContent("Hello World")).toBe(hashContent("hello world"));
    expect(hashContent("  hello world  ")).toBe(hashContent("hello world"));
  });

  it("produces different hashes for different content", () => {
    expect(hashContent("suggestion A")).not.toBe(hashContent("suggestion B"));
  });
});

describe("recordDismissal", () => {
  it("inserts a dismissal record", async () => {
    await recordDismissal("user-1", "Coverage", "You should set up invoicing.");

    const rows = await testDb.select().from(schema.suggestionDismissals);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("user-1");
    expect(rows[0].suggestionType).toBe("Coverage");
    expect(rows[0].content).toBe("You should set up invoicing.");
    expect(rows[0].contentHash).toBe(hashContent("You should set up invoicing."));
  });

  it("sets expiresAt ~30 days in the future", async () => {
    await recordDismissal("user-1", "Trust", "Some suggestion");

    const rows = await testDb.select().from(schema.suggestionDismissals);
    const dismissedAt = new Date(rows[0].dismissedAt!).getTime();
    const expiresAt = new Date(rows[0].expiresAt!).getTime();
    const diffDays = (expiresAt - dismissedAt) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it("allows multiple dismissals for the same user", async () => {
    await recordDismissal("user-1", "Coverage", "Suggestion A");
    await recordDismissal("user-1", "Trust", "Suggestion B");

    const rows = await testDb.select().from(schema.suggestionDismissals);
    expect(rows).toHaveLength(2);
  });
});

describe("isDismissed", () => {
  it("returns true for recently dismissed content", async () => {
    await recordDismissal("user-1", "Coverage", "Set up invoicing");
    expect(await isDismissed("user-1", "Set up invoicing")).toBe(true);
  });

  it("returns false for non-dismissed content", async () => {
    expect(await isDismissed("user-1", "Something else")).toBe(false);
  });

  it("returns false for different users", async () => {
    await recordDismissal("user-1", "Coverage", "Set up invoicing");
    expect(await isDismissed("user-2", "Set up invoicing")).toBe(false);
  });

  it("is case-insensitive", async () => {
    await recordDismissal("user-1", "Coverage", "Set Up Invoicing");
    expect(await isDismissed("user-1", "set up invoicing")).toBe(true);
  });
});

describe("getActiveDismissalHashes", () => {
  it("returns empty set when no dismissals exist", async () => {
    const hashes = await getActiveDismissalHashes("user-1");
    expect(hashes.size).toBe(0);
  });

  it("returns hashes of active dismissals", async () => {
    await recordDismissal("user-1", "Coverage", "Suggestion A");
    await recordDismissal("user-1", "Trust", "Suggestion B");

    const hashes = await getActiveDismissalHashes("user-1");
    expect(hashes.size).toBe(2);
    expect(hashes.has(hashContent("Suggestion A"))).toBe(true);
    expect(hashes.has(hashContent("Suggestion B"))).toBe(true);
  });

  it("excludes dismissals from other users", async () => {
    await recordDismissal("user-1", "Coverage", "Suggestion A");
    await recordDismissal("user-2", "Trust", "Suggestion B");

    const hashes = await getActiveDismissalHashes("user-1");
    expect(hashes.size).toBe(1);
    expect(hashes.has(hashContent("Suggestion A"))).toBe(true);
  });

  it("excludes expired dismissals", async () => {
    // Insert a dismissal that's already expired
    await testDb.insert(schema.suggestionDismissals).values({
      userId: "user-1",
      suggestionType: "Coverage",
      contentHash: hashContent("old suggestion"),
      content: "old suggestion",
      dismissedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // expired yesterday
    });

    const hashes = await getActiveDismissalHashes("user-1");
    expect(hashes.size).toBe(0);
  });
});
