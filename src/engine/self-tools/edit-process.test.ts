/**
 * Tests for Brief 164 — Process Editing & Versioning
 *
 * Tests: edit_process (permanent edit), process_history (version listing),
 * rollback_process (restore prior version).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mocks
const { handleEditProcess, handleProcessHistory, handleRollbackProcess } = await import("./edit-process");

const BASE_DEFINITION = {
  name: "Quoting Process",
  id: "quoting",
  version: 1,
  status: "active",
  trigger: { type: "manual", description: "Run quoting" },
  inputs: [{ name: "task", type: "string", description: "What to quote" }],
  governance: { trust_tier: "supervised", quality_criteria: "Output matches task", feedback: "implicit" },
  steps: [
    { id: "research", name: "Research", executor: "ai-agent", description: "Research the topic" },
    { id: "draft", name: "Draft Quote", executor: "ai-agent", description: "Draft the quote" },
    { id: "follow-up", name: "Follow Up", executor: "ai-agent", description: "Send follow-up" },
  ],
};

describe("Brief 164 — Process Editing & Versioning", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;

    // Seed a process
    testDb.insert(schema.processes).values({
      id: "proc-1",
      name: "Quoting Process",
      slug: "quoting",
      version: 1,
      status: "active",
      description: "Handles quoting workflow",
      trustTier: "supervised",
      definition: BASE_DEFINITION,
    }).run();
  });

  afterEach(() => {
    cleanup();
  });

  // ============================================================
  // MP-9.1 — Permanent Process Edit
  // ============================================================

  describe("edit_process (MP-9.1)", () => {
    it("should permanently edit a process and increment version", async () => {
      const updatedDef = {
        ...BASE_DEFINITION,
        steps: [
          { id: "research", name: "Research", executor: "ai-agent", description: "Research the topic" },
          { id: "draft", name: "Draft Quote", executor: "ai-agent", description: "Draft the quote" },
          // follow-up step removed
        ],
      };

      const result = await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: updatedDef,
        changeSummary: "Removed follow-up step",
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("v1 → v2");
      expect(result.output).toContain("Removed follow-up step");

      // Verify DB state
      const [proc] = testDb.select().from(schema.processes).where(eq(schema.processes.slug, "quoting")).all();
      expect(proc.version).toBe(2);
      const def = proc.definition as Record<string, unknown>;
      expect((def.steps as unknown[]).length).toBe(2);
    });

    it("should store previous version in process_versions", async () => {
      const updatedDef = {
        ...BASE_DEFINITION,
        steps: [
          { id: "research", name: "Research", executor: "ai-agent", description: "Research the topic" },
          { id: "draft", name: "Draft Quote", executor: "ai-agent", description: "Draft the quote" },
        ],
      };

      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: updatedDef,
        changeSummary: "Removed follow-up step",
      });

      // Check version history
      const versions = testDb.select().from(schema.processVersions).where(eq(schema.processVersions.processId, "proc-1")).all();
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      const snapDef = versions[0].definition as Record<string, unknown>;
      expect((snapDef.steps as unknown[]).length).toBe(3); // original had 3 steps
    });

    it("should reject edit with missing required fields", async () => {
      const result = await handleEditProcess({
        processSlug: "",
        updatedDefinition: {},
        changeSummary: "",
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Required");
    });

    it("should reject edit for non-existent process", async () => {
      const result = await handleEditProcess({
        processSlug: "nonexistent",
        updatedDefinition: { steps: [{ id: "a", name: "A", executor: "ai-agent" }] },
        changeSummary: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should reject definition with invalid executor", async () => {
      const result = await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [{ id: "bad", name: "Bad", executor: "invalid-type" }],
        },
        changeSummary: "Bad executor",
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("invalid executor");
    });

    it("should log the edit as an activity", async () => {
      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [
            { id: "research", name: "Research", executor: "ai-agent" },
            { id: "draft", name: "Draft Quote", executor: "ai-agent" },
          ],
        },
        changeSummary: "Removed follow-up step",
      });

      const activities = testDb.select().from(schema.activities).all();
      const editActivity = activities.find((a) => a.action === "process.edited");
      expect(editActivity).toBeDefined();
      const meta = editActivity!.metadata as Record<string, unknown>;
      expect(meta.changeSummary).toBe("Removed follow-up step");
      expect(meta.previousVersion).toBe(1);
      expect(meta.newVersion).toBe(2);
    });
  });

  // ============================================================
  // MP-9.2 — Version History
  // ============================================================

  describe("process_history (MP-9.2)", () => {
    it("should return empty history for process with no edits", async () => {
      const result = await handleProcessHistory({ processSlug: "quoting" });
      expect(result.success).toBe(true);

      const data = JSON.parse(result.output);
      expect(data.currentVersion).toBe(1);
      expect(data.history).toHaveLength(0);
    });

    it("should return version history after edits", async () => {
      // Make two edits
      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [
            { id: "research", name: "Research", executor: "ai-agent" },
            { id: "draft", name: "Draft Quote", executor: "ai-agent" },
          ],
        },
        changeSummary: "Removed follow-up step",
      });

      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [
            { id: "research", name: "Research", executor: "ai-agent" },
            { id: "draft", name: "Draft Quote", executor: "ai-agent" },
            { id: "review", name: "Review", executor: "human" },
          ],
        },
        changeSummary: "Added review step",
      });

      const result = await handleProcessHistory({ processSlug: "quoting" });
      expect(result.success).toBe(true);

      const data = JSON.parse(result.output);
      expect(data.currentVersion).toBe(3);
      expect(data.history).toHaveLength(2);
      // Most recent first
      expect(data.history[0].version).toBe(2);
      expect(data.history[1].version).toBe(1);
    });

    it("should reject history for non-existent process", async () => {
      const result = await handleProcessHistory({ processSlug: "nonexistent" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });
  });

  // ============================================================
  // MP-9.2 — Rollback
  // ============================================================

  describe("rollback_process (MP-9.2)", () => {
    it("should rollback to a prior version", async () => {
      // Edit once
      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [
            { id: "research", name: "Research", executor: "ai-agent" },
            { id: "draft", name: "Draft Quote", executor: "ai-agent" },
          ],
        },
        changeSummary: "Removed follow-up step",
      });

      // Rollback to v1
      const result = await handleRollbackProcess({
        processSlug: "quoting",
        targetVersion: 1,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Rolled back");
      expect(result.output).toContain("v1");

      // Verify: process now at v3, but with original 3 steps restored
      const [proc] = testDb.select().from(schema.processes).where(eq(schema.processes.slug, "quoting")).all();
      expect(proc.version).toBe(3);
      const def = proc.definition as Record<string, unknown>;
      expect((def.steps as unknown[]).length).toBe(3); // original had 3 steps
    });

    it("should snapshot current version before rollback", async () => {
      // Edit once
      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [{ id: "research", name: "Research", executor: "ai-agent" }],
        },
        changeSummary: "Simplified to one step",
      });

      // Rollback to v1
      await handleRollbackProcess({ processSlug: "quoting", targetVersion: 1 });

      // Should have 2 version snapshots: v1 (from edit) and v2 (from rollback)
      const versions = testDb.select().from(schema.processVersions).where(eq(schema.processVersions.processId, "proc-1")).all();
      expect(versions.length).toBe(2);
    });

    it("should reject rollback to version >= current", async () => {
      const result = await handleRollbackProcess({
        processSlug: "quoting",
        targetVersion: 1,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("must be less than");
    });

    it("should reject rollback to version >= current", async () => {
      // Edit once to create v2, then try to rollback to v99
      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [{ id: "research", name: "Research", executor: "ai-agent" }],
        },
        changeSummary: "Simplified",
      });

      const result = await handleRollbackProcess({
        processSlug: "quoting",
        targetVersion: 99,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("must be less than");
    });

    it("should log rollback as an activity", async () => {
      // Edit, then rollback
      await handleEditProcess({
        processSlug: "quoting",
        updatedDefinition: {
          ...BASE_DEFINITION,
          steps: [{ id: "research", name: "Research", executor: "ai-agent" }],
        },
        changeSummary: "Simplified",
      });

      await handleRollbackProcess({ processSlug: "quoting", targetVersion: 1 });

      const activities = testDb.select().from(schema.activities).all();
      const rollbackActivity = activities.find((a) => a.action === "process.rollback");
      expect(rollbackActivity).toBeDefined();
      const meta = rollbackActivity!.metadata as Record<string, unknown>;
      expect(meta.rolledBackFrom).toBe(2);
      expect(meta.restoredVersion).toBe(1);
      expect(meta.newVersion).toBe(3);
    });
  });
});
