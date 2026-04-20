/**
 * Tests for the memory write chokepoint (Brief 198).
 *
 * Verifies the four exported helpers preserve the exact semantics of the
 * underlying Drizzle calls they replace:
 *  - writeMemory: inserts a row and returns the inserted row
 *  - updateMemory: patches an existing row by id
 *  - deactivateMemory: flips active=false and bumps updatedAt
 *  - deleteMemory: hard-deletes by id
 *
 * Uses a real SQLite test database via createTestDb() — no mocks, consistent
 * with Ditto conventions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  writeMemory,
  updateMemory,
  deactivateMemory,
  deleteMemory,
} from "./write-memory";

let testDb: TestDb;
let cleanup: () => void;

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("writeMemory", () => {
  it("inserts a new memory and returns the inserted row", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "self",
      scopeId: "user-1",
      type: "user_model",
      content: "problems: juggling too many tools",
      source: "conversation",
      confidence: 0.5,
      active: true,
    });

    expect(row).toBeDefined();
    expect(row.id).toBeTruthy();
    expect(row.scopeType).toBe("self");
    expect(row.scopeId).toBe("user-1");
    expect(row.type).toBe("user_model");
    expect(row.content).toBe("problems: juggling too many tools");
    expect(row.confidence).toBe(0.5);
    expect(row.active).toBe(true);
    // Timestamps should be populated by the DB default
    expect(row.createdAt).toBeDefined();
    expect(row.updatedAt).toBeDefined();
  });

  it("respects an explicit id supplied by the caller", async () => {
    const row = await writeMemory(testDb, {
      id: "memory-explicit-id",
      scopeType: "process",
      scopeId: "proc-1",
      type: "solution",
      content: "Always check units before calculating",
      source: "system",
      confidence: 0.5,
    });

    expect(row.id).toBe("memory-explicit-id");

    // Verify we can read it back
    const [fetched] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, "memory-explicit-id"));
    expect(fetched).toBeDefined();
    expect(fetched.content).toBe("Always check units before calculating");
  });

  it("persists metadata as JSON", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "person",
      scopeId: "person-1",
      type: "user_model",
      content: "Business: Acme Plumbing",
      source: "conversation",
      metadata: { collectedFrom: "inbound_email", confidence_source: "test" },
    });

    const [fetched] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, row.id));

    expect(fetched.metadata).toEqual({
      collectedFrom: "inbound_email",
      confidence_source: "test",
    });
  });

  it("accepts a dormant skipProjection option without affecting behaviour", async () => {
    // Brief 198 defines the option but does NOT consume it — 199 wires it.
    // The test pins the signature so future consumers can't break it silently.
    const row = await writeMemory(
      testDb,
      {
        scopeType: "self",
        scopeId: "user-2",
        type: "context",
        content: "working_patterns:{}",
        source: "system",
      },
      { skipProjection: true },
    );

    expect(row).toBeDefined();
    expect(row.scopeId).toBe("user-2");
  });
});

describe("updateMemory", () => {
  it("patches the specified fields and leaves others untouched", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "process",
      scopeId: "proc-1",
      type: "correction",
      content: "Original content",
      source: "feedback",
      confidence: 0.3,
    });

    await updateMemory(testDb, row.id, {
      content: "Reinforced content",
      reinforcementCount: 2,
      confidence: 0.6,
    });

    const [fetched] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, row.id));

    expect(fetched.content).toBe("Reinforced content");
    expect(fetched.reinforcementCount).toBe(2);
    expect(fetched.confidence).toBe(0.6);
    // scopeType and type untouched
    expect(fetched.scopeType).toBe("process");
    expect(fetched.type).toBe("correction");
  });

  it("accepts an explicit updatedAt stamp (behaviour-preserving — does not auto-stamp)", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "self",
      scopeId: "user-3",
      type: "user_model",
      content: "goals: ship Ditto",
      source: "conversation",
    });

    const explicitDate = new Date("2026-01-01T00:00:00Z");
    await updateMemory(testDb, row.id, { updatedAt: explicitDate });

    const [fetched] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, row.id));

    const fetchedUpdatedAt =
      fetched.updatedAt instanceof Date
        ? fetched.updatedAt
        : new Date(Number(fetched.updatedAt));
    expect(fetchedUpdatedAt.getTime()).toBe(explicitDate.getTime());
  });
});

describe("deactivateMemory", () => {
  it("flips active to false and bumps updatedAt", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "process",
      scopeId: "proc-1",
      type: "solution",
      content: "Stale solution",
      source: "system",
      confidence: 0.1,
      active: true,
    });

    const beforeDeactivateMs = Date.now();
    // Small delay so updatedAt can meaningfully differ from createdAt
    await new Promise((r) => setTimeout(r, 5));

    await deactivateMemory(testDb, row.id);

    const [fetched] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, row.id));

    expect(fetched.active).toBe(false);
    const fetchedUpdatedAt =
      fetched.updatedAt instanceof Date
        ? fetched.updatedAt
        : new Date(Number(fetched.updatedAt));
    expect(fetchedUpdatedAt.getTime()).toBeGreaterThanOrEqual(beforeDeactivateMs);
  });

  it("is idempotent — deactivating an already-inactive row is a no-op semantically", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "process",
      scopeId: "proc-1",
      type: "solution",
      content: "Already inactive",
      source: "system",
      active: false,
    });

    await deactivateMemory(testDb, row.id);
    await deactivateMemory(testDb, row.id); // second call should not throw

    const [fetched] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, row.id));
    expect(fetched.active).toBe(false);
  });
});

describe("deleteMemory", () => {
  it("hard-removes the row", async () => {
    const row = await writeMemory(testDb, {
      scopeType: "person",
      scopeId: "person-1",
      type: "user_model",
      content: "To be deleted",
      source: "conversation",
    });

    await deleteMemory(testDb, row.id);

    const rows = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, row.id));

    expect(rows).toHaveLength(0);
  });

  it("leaves other memories untouched", async () => {
    const keep = await writeMemory(testDb, {
      scopeType: "self",
      scopeId: "user-1",
      type: "context",
      content: "Keep me",
      source: "system",
    });

    const remove = await writeMemory(testDb, {
      scopeType: "self",
      scopeId: "user-1",
      type: "context",
      content: "Remove me",
      source: "system",
    });

    await deleteMemory(testDb, remove.id);

    const keepRows = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, keep.id));
    expect(keepRows).toHaveLength(1);

    const removeRows = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, remove.id));
    expect(removeRows).toHaveLength(0);
  });
});
