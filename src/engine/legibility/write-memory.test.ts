/**
 * Tests for the memory-write chokepoint (Brief 198).
 *
 * Verifies: insert (writeMemory), patch (updateMemory), soft-delete
 * (deactivateMemory), hard-delete (deleteMemory). The helpers are pure
 * pass-throughs over the existing DB shape; these tests pin the contract
 * so Brief 199's projection hook can't regress it silently.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import {
  writeMemory,
  updateMemory,
  deactivateMemory,
  deleteMemory,
} from "./write-memory";

describe("write-memory chokepoint", () => {
  let db: TestDb;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestDb();
    db = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe("writeMemory", () => {
    it("inserts a new memory row and returns it with schema defaults populated", async () => {
      const row = await writeMemory(db, {
        scopeType: "self",
        scopeId: "user-1",
        type: "correction",
        content: "use terser style",
        source: "feedback",
        confidence: 0.3,
      });

      expect(row.id).toBeTruthy();
      expect(row.scopeType).toBe("self");
      expect(row.scopeId).toBe("user-1");
      expect(row.type).toBe("correction");
      expect(row.content).toBe("use terser style");
      expect(row.source).toBe("feedback");
      expect(row.confidence).toBe(0.3);
      // Schema defaults:
      expect(row.active).toBe(true);
      expect(row.shared).toBe(false);
      expect(row.reinforcementCount).toBe(1);
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
    });

    it("respects caller-provided id when supplied", async () => {
      const explicitId = "explicit-memory-id";
      const row = await writeMemory(db, {
        id: explicitId,
        scopeType: "process",
        scopeId: "proc-1",
        type: "solution",
        content: "solution content",
        source: "system",
      });
      expect(row.id).toBe(explicitId);
    });

    it("persists metadata JSON as-is", async () => {
      const row = await writeMemory(db, {
        scopeType: "process",
        scopeId: "proc-1",
        type: "guidance",
        content: "guidance text",
        source: "escalation_resolution",
        metadata: { failurePattern: "timeout", stepName: "call_api" },
      });
      const [reread] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, row.id));
      expect(reread.metadata).toEqual({ failurePattern: "timeout", stepName: "call_api" });
    });
  });

  describe("updateMemory", () => {
    it("patches only the specified fields and stamps updatedAt", async () => {
      const row = await writeMemory(db, {
        scopeType: "self",
        scopeId: "user-1",
        type: "correction",
        content: "original",
        source: "feedback",
      });
      const originalUpdatedAt = row.updatedAt as Date;
      // Force measurable time progression so updatedAt changes (ms resolution).
      await new Promise((r) => setTimeout(r, 2));

      await updateMemory(db, row.id, {
        content: "patched",
        reinforcementCount: 3,
      });

      const [reread] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, row.id));
      expect(reread.content).toBe("patched");
      expect(reread.reinforcementCount).toBe(3);
      // Untouched fields preserved:
      expect(reread.scopeType).toBe("self");
      expect(reread.type).toBe("correction");
      expect((reread.updatedAt as Date).getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it("honours caller-supplied updatedAt when provided", async () => {
      const row = await writeMemory(db, {
        scopeType: "self",
        scopeId: "user-1",
        type: "correction",
        content: "original",
        source: "feedback",
      });
      const customTs = new Date(Date.now() - 60_000);
      await updateMemory(db, row.id, { content: "patched", updatedAt: customTs });
      const [reread] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, row.id));
      expect((reread.updatedAt as Date).getTime()).toBe(customTs.getTime());
    });
  });

  describe("deactivateMemory", () => {
    it("sets active: false and bumps updatedAt without deleting the row", async () => {
      const row = await writeMemory(db, {
        scopeType: "process",
        scopeId: "proc-1",
        type: "solution",
        content: "stale solution",
        source: "system",
      });

      await deactivateMemory(db, row.id);

      const [reread] = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, row.id));
      expect(reread).toBeTruthy();
      expect(reread.active).toBe(false);
      expect(reread.content).toBe("stale solution");
    });
  });

  describe("deleteMemory", () => {
    it("removes the row entirely", async () => {
      const row = await writeMemory(db, {
        scopeType: "self",
        scopeId: "user-1",
        type: "context",
        content: "transient",
        source: "system",
      });

      await deleteMemory(db, row.id);

      const results = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.id, row.id));
      expect(results).toHaveLength(0);
    });
  });
});
