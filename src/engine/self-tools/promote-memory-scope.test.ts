/**
 * Brief 227 — `promote_memory_scope` Self tool tests.
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

const { handlePromoteMemoryScope, PROMOTE_MEMORY_SCOPE_TOOL_NAME } = await import(
  "./promote-memory-scope"
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

async function seedMemory(scopeType: "process" | "self", scopeId: string, type: string = "correction") {
  const [m] = await testDb
    .insert(schema.memories)
    .values({
      scopeType,
      scopeId,
      type: type as any,
      content: "Always cite the source",
      source: "feedback",
      confidence: 0.8,
      reinforcementCount: 3,
      active: true,
    })
    .returning();
  return m;
}

describe("handlePromoteMemoryScope", () => {
  it("rejects calls without stepRunId outside of test mode", async () => {
    delete process.env.DITTO_TEST_MODE;
    const memory = await seedMemory("process", "proc-a");

    // DB-spy: count memories before; should not change on rejection
    const beforeCount = (await testDb.select().from(schema.memories)).length;

    const result = await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: "all",
    });

    const afterCount = (await testDb.select().from(schema.memories)).length;
    expect(result.success).toBe(false);
    expect(result.toolName).toBe(PROMOTE_MEMORY_SCOPE_TOOL_NAME);
    expect(result.output).toContain("Insight-180");
    expect(beforeCount).toBe(afterCount); // no DB write happened

    // verify memory was not changed
    const [unchanged] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    expect(unchanged.scopeType).toBe("process");
  });

  it("promotes to full self-scope (scope: 'all')", async () => {
    const memory = await seedMemory("process", "proc-a");

    const result = await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: "all",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    expect(updated.scopeType).toBe("self");
    expect(updated.appliedProjectIds).toBeNull();
  });

  it("promotes to hybrid scope (scope: { projectIds })", async () => {
    const memory = await seedMemory("process", "proc-a");

    const result = await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: { projectIds: ["p1", "p2"] },
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(true);

    const [updated] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    expect(updated.scopeType).toBe("self");
    expect(updated.appliedProjectIds).toEqual(["p1", "p2"]);
  });

  it("rejects empty projectIds array in hybrid scope", async () => {
    const memory = await seedMemory("process", "proc-a");

    const result = await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: { projectIds: [] },
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.output.toLowerCase()).toContain("non-empty");
  });

  it("rejects empty-string element in projectIds (dev-review CRIT defence)", async () => {
    const memory = await seedMemory("process", "proc-a");

    const result = await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: { projectIds: ["p1", ""] },
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.output.toLowerCase()).toContain("non-empty strings");

    // DB-spy: memory not changed
    const [unchanged] = await testDb
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memory.id));
    expect(unchanged.scopeType).toBe("process");
    expect(unchanged.appliedProjectIds).toBeNull();
  });

  it("returns failure on missing memory", async () => {
    const result = await handlePromoteMemoryScope({
      memoryId: "does-not-exist",
      scope: "all",
      stepRunId: "step-run-1",
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("not found");
  });

  it("logs an activities row with action='memory_promote'", async () => {
    const memory = await seedMemory("process", "proc-a");

    await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: { projectIds: ["p1", "p2", "p3"] },
      stepRunId: "step-run-1",
    });

    const activities = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.entityId, memory.id))
      .orderBy(desc(schema.activities.createdAt));

    expect(activities).toHaveLength(1);
    expect(activities[0].action).toBe("memory_promote");
    expect(activities[0].entityType).toBe("memory");
    expect(activities[0].actorType).toBe("user");
    const meta = activities[0].metadata as Record<string, unknown>;
    expect(meta.previousScopeType).toBe("process");
    expect(meta.newScopeType).toBe("self");
    expect(meta.newAppliedProjectIds).toEqual(["p1", "p2", "p3"]);
  });

  it("populates activities.actorId when passed (Reviewer IMP-2)", async () => {
    const memory = await seedMemory("process", "proc-a");

    await handlePromoteMemoryScope({
      memoryId: memory.id,
      scope: "all",
      stepRunId: "step-run-1",
      actorId: "user@example.com",
    });

    const [activity] = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.entityId, memory.id));
    expect(activity.actorId).toBe("user@example.com");
  });
});
