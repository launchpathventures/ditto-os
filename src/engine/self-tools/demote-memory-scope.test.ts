/**
 * Brief 227 — `demote_memory_scope` Self tool tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq, desc } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

const { handleDemoteMemoryScope, DEMOTE_MEMORY_SCOPE_TOOL_NAME } = await import(
  "./demote-memory-scope"
);

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  process.env.DITTO_TEST_MODE = "true";
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
});

async function seedProject(id: string, slug: string, status: "active" | "archived" = "active") {
  await testDb.insert(schema.projects).values({
    id,
    slug,
    name: slug,
    kind: "build",
    harnessType: "native",
    status,
  } as any);
}

async function seedProcess(id: string, projectId: string | null) {
  await testDb.insert(schema.processes).values({
    id,
    name: id,
    slug: id,
    definition: {} as any,
    projectId,
  });
}

async function seedMemory(opts: {
  scopeType: "process" | "self";
  scopeId: string;
  type?: string;
  appliedProjectIds?: string[] | null;
}) {
  const [m] = await testDb
    .insert(schema.memories)
    .values({
      scopeType: opts.scopeType,
      scopeId: opts.scopeId,
      type: (opts.type ?? "correction") as any,
      content: "test memory content",
      source: "feedback",
      confidence: 0.8,
      reinforcementCount: 3,
      active: true,
      appliedProjectIds: opts.appliedProjectIds ?? null,
    })
    .returning();
  return m;
}

describe("handleDemoteMemoryScope", () => {
  it("rejects calls without stepRunId outside of test mode", async () => {
    delete process.env.DITTO_TEST_MODE;
    await seedProject("p1", "proj-a");
    await seedProcess("proc-a", "p1");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: null,
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p1",
    });

    expect(result.success).toBe(false);
    expect(result.toolName).toBe(DEMOTE_MEMORY_SCOPE_TOOL_NAME);
    expect(result.output).toContain("Insight-180");

    const [unchanged] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    expect(unchanged.scopeType).toBe("self"); // unchanged
  });

  it("rejects user_model memory type with structured error", async () => {
    await seedProject("p1", "proj-a");
    await seedProcess("proc-a", "p1");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      type: "user_model",
      appliedProjectIds: null,
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p1",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.metadata?.reason).toBe(
      "user-model-or-preference-cannot-be-project-scoped",
    );
    expect(result.metadata?.memoryType).toBe("user_model");
  });

  it("rejects preference memory type with structured error", async () => {
    await seedProject("p1", "proj-a");
    await seedProcess("proc-a", "p1");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      type: "preference",
      appliedProjectIds: null,
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p1",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.metadata?.reason).toBe(
      "user-model-or-preference-cannot-be-project-scoped",
    );
    expect(result.metadata?.memoryType).toBe("preference");
  });

  it("rejects target project not in appliedProjectIds for hybrid memory", async () => {
    await seedProject("p1", "proj-a");
    await seedProject("p2", "proj-b");
    await seedProject("p3", "proj-c");
    await seedProcess("proc-a", "p1");
    await seedProcess("proc-b", "p2");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: ["p1", "p2"],
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p3", // not in [p1, p2]
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("appliedProjectIds");
  });

  it("rejects archived target project for fully-self-scoped memory", async () => {
    await seedProject("p-archived", "archived-proj", "archived");
    await seedProcess("proc-archived", "p-archived");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: null,
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p-archived",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("active");
  });

  it("successfully demotes hybrid memory to a listed project", async () => {
    await seedProject("p1", "proj-a");
    await seedProject("p2", "proj-b");
    await seedProcess("proc-a", "p1");
    await seedProcess("proc-b", "p2");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: ["p1", "p2"],
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p1",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    expect(updated.scopeType).toBe("process");
    expect(updated.scopeId).toBe("proc-a"); // a process belonging to p1
    expect(updated.appliedProjectIds).toBeNull();
  });

  it("picks highest-reinforcement source process WITHIN the target project (Reviewer Crit-1 regression)", async () => {
    // Two projects: target p1 (with two processes), other p2 (with the highest-reinforcement memory)
    await seedProject("p1", "proj-a");
    await seedProject("p2", "proj-b");
    await seedProcess("proc-a-low", "p1");
    await seedProcess("proc-a-high", "p1");
    await seedProcess("proc-b-overall-top", "p2");

    // Highest-reinforcement memory anywhere is in p2 (should NOT be picked)
    await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: "proc-b-overall-top",
      type: "correction",
      content: "p2 memory — should not be picked as p1 demote target",
      source: "feedback",
      confidence: 0.9,
      reinforcementCount: 99,
      active: true,
    });

    // Within p1: proc-a-high has higher reinforcement than proc-a-low
    await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: "proc-a-low",
      type: "correction",
      content: "p1 low",
      source: "feedback",
      confidence: 0.5,
      reinforcementCount: 1,
      active: true,
    });
    await testDb.insert(schema.memories).values({
      scopeType: "process",
      scopeId: "proc-a-high",
      type: "correction",
      content: "p1 high",
      source: "feedback",
      confidence: 0.7,
      reinforcementCount: 5,
      active: true,
    });

    // The memory we're demoting: fully self-scoped
    const target = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: null,
    });

    const result = await handleDemoteMemoryScope({
      memoryId: target.id,
      targetProjectId: "p1",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, target.id));
    // Must pick proc-a-high (highest WITHIN p1) — NOT proc-b-overall-top
    expect(updated.scopeId).toBe("proc-a-high");
  });

  it("falls back to first project-mate process when target project has no prior memories", async () => {
    await seedProject("p1", "proj-a");
    await seedProcess("proc-a-1", "p1");
    await seedProcess("proc-a-2", "p1");

    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: null,
    });

    const result = await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p1",
      stepRunId: "step-run-1",
    });
    expect(result.success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    // No prior memories in p1 — fall back to one of its processes
    expect(["proc-a-1", "proc-a-2"]).toContain(updated.scopeId);
  });

  it("logs activities row with action='memory_demote'", async () => {
    await seedProject("p1", "proj-a");
    await seedProcess("proc-a", "p1");
    const memory = await seedMemory({
      scopeType: "self",
      scopeId: "user-1",
      appliedProjectIds: null,
    });

    await handleDemoteMemoryScope({
      memoryId: memory.id,
      targetProjectId: "p1",
      stepRunId: "step-run-1",
    });

    const activities = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.entityId, memory.id))
      .orderBy(desc(schema.activities.createdAt));

    expect(activities).toHaveLength(1);
    expect(activities[0].action).toBe("memory_demote");
    expect(activities[0].entityType).toBe("memory");
    expect(activities[0].actorType).toBe("user");
  });
});
