/**
 * Tests for heartbeat.ts
 * AC-7: Script step executes and produces step run with status approved
 * AC-8: Human step suspends run to waiting_human and creates action work item
 * AC-9: resumeHumanStep with input data marks step approved and continues execution
 *
 * These tests use a real SQLite database (not mocks).
 * The Anthropic SDK is mocked at the module level (test-setup.ts)
 * to prevent import-time failures without API keys.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

// We need to override the db module to use our test database.
// The heartbeat module imports from "../db" which creates a singleton.
// We'll mock the db module to inject our test database.
let testDb: TestDb;
let dbPath: string;
let cleanup: () => void;

vi.mock("../db", async () => {
  // Dynamic import to get the real schema
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mock setup
const { heartbeat, fullHeartbeat, resumeHumanStep, orchestratorHeartbeat } = await import("./heartbeat");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  dbPath = result.dbPath;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

/**
 * Helper: insert a test process and return its ID
 */
async function insertTestProcess(
  db: TestDb,
  definition: ReturnType<typeof makeTestProcessDefinition>,
  trustTier: string = "autonomous",
): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.processes).values({
    id,
    name: definition.name,
    slug: definition.id,
    definition: definition as unknown as Record<string, unknown>,
    status: "active",
    trustTier: trustTier as schema.TrustTier,
  });
  return id;
}

/**
 * Helper: insert a process run and return its ID
 */
async function insertRun(db: TestDb, processId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.processRuns).values({
    id,
    processId,
    status: "queued",
    triggeredBy: "test",
    inputs: {},
  });
  return id;
}

describe("heartbeat", () => {
  it("AC-7: script step executes and produces step run with approved status", async () => {
    const def = makeTestProcessDefinition({
      steps: [
        { id: "step-1", name: "Echo test", executor: "script", commands: ["echo hello"] },
      ],
    });
    const processId = await insertTestProcess(testDb, def);
    const runId = await insertRun(testDb, processId);

    // Run heartbeat — autonomous tier should auto-advance script steps
    const result = await heartbeat(runId);

    expect(result.stepsExecuted).toBe(1);
    expect(result.status).toBe("advanced");

    // Verify the step run was created and approved
    const stepRuns = await testDb
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, runId));

    expect(stepRuns).toHaveLength(1);
    expect(stepRuns[0].status).toBe("approved");
    expect(stepRuns[0].stepId).toBe("step-1");
  });

  it("AC-8: human step suspends run to waiting_human and creates action work item", async () => {
    const def = makeTestProcessDefinition({
      steps: [
        {
          id: "human-confirm",
          name: "Confirm target",
          executor: "human",
          instructions: "Please confirm the deployment target.",
          input_fields: [
            { name: "env", type: "select", options: ["staging", "prod"], required: true },
          ],
        },
      ],
    });
    const processId = await insertTestProcess(testDb, def);
    const runId = await insertRun(testDb, processId);

    const result = await heartbeat(runId);

    // Run should be waiting for human
    expect(result.status).toBe("waiting_human");
    expect(result.message).toContain("Waiting for human");

    // Process run status should be waiting_human
    const [run] = await testDb
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId));
    expect(run.status).toBe("waiting_human");

    // Suspend state should be serialized
    expect(run.suspendState).not.toBeNull();
    const suspendState = run.suspendState as Record<string, unknown>;
    expect(suspendState.suspendedAtStep).toBe("human-confirm");

    // An action work item should exist
    const workItems = await testDb
      .select()
      .from(schema.workItems)
      .where(eq(schema.workItems.status, "waiting_human"));
    expect(workItems.length).toBeGreaterThanOrEqual(1);

    const wi = workItems.find((w) => {
      const ctx = w.context as Record<string, unknown>;
      return ctx?.processRunId === runId;
    });
    expect(wi).toBeDefined();
    expect(wi!.type).toBe("task");
    expect(wi!.source).toBe("process_spawned");
  });

  it("AC-9: resumeHumanStep marks step approved and continues execution", async () => {
    // Process: human step → script step
    const def = makeTestProcessDefinition({
      steps: [
        {
          id: "human-step",
          name: "Get input",
          executor: "human",
          instructions: "Provide input.",
          input_fields: [
            { name: "value", type: "text", required: true },
          ],
        },
        { id: "final-step", name: "Finish", executor: "script", commands: ["echo done"] },
      ],
    });
    const processId = await insertTestProcess(testDb, def);
    const runId = await insertRun(testDb, processId);

    // First heartbeat: hits human step, suspends
    await heartbeat(runId);
    const [runBefore] = await testDb
      .select()
      .from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId));
    expect(runBefore.status).toBe("waiting_human");

    // Resume with human input
    const resumeResult = await resumeHumanStep(runId, { value: "test-input" });

    // The human step should be approved
    const stepRuns = await testDb
      .select()
      .from(schema.stepRuns)
      .where(eq(schema.stepRuns.processRunId, runId));

    const humanStep = stepRuns.find((s) => s.stepId === "human-step");
    expect(humanStep).toBeDefined();
    expect(humanStep!.status).toBe("approved");
    expect(humanStep!.outputs).toEqual({ value: "test-input" });

    // The final step should have also executed (autonomous tier auto-advances)
    const finalStep = stepRuns.find((s) => s.stepId === "final-step");
    expect(finalStep).toBeDefined();
    expect(finalStep!.status).toBe("approved");

    // The process run should be completed
    expect(resumeResult.status).toBe("completed");
  });

  it("returns error for nonexistent run", async () => {
    const result = await heartbeat("nonexistent-id");
    expect(result.status).toBe("failed");
    expect(result.message).toContain("not found");
  });
});

// ============================================================
// Orchestrator Heartbeat (Brief 021)
// ============================================================

describe("orchestratorHeartbeat", () => {
  it("returns escalation when goal work item not found", async () => {
    const result = await orchestratorHeartbeat("nonexistent-id");
    expect(result.status).toBe("escalated");
    expect(result.confidence).toBe("low");
    expect(result.escalation?.type).toBe("error");
  });

  it("returns escalation when goal has no decomposition", async () => {
    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "in_progress",
      content: "test goal",
      source: "capture",
    }).returning();

    const result = await orchestratorHeartbeat(goalItem.id);
    expect(result.status).toBe("escalated");
    expect(result.confidence).toBe("low");
    expect(result.escalation?.type).toBe("blocked");
  });

  it("reports completed when all child tasks are done", async () => {
    // Create goal with 2 completed children
    const [child1] = await testDb.insert(schema.workItems).values({
      type: "task",
      status: "completed",
      content: "task 1",
      source: "system_generated",
    }).returning();
    const [child2] = await testDb.insert(schema.workItems).values({
      type: "task",
      status: "completed",
      content: "task 2",
      source: "system_generated",
    }).returning();

    const decomposition = [
      { taskId: child1.id, stepId: "step-1", dependsOn: [], status: "completed" },
      { taskId: child2.id, stepId: "step-2", dependsOn: [], status: "completed" },
    ];

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "in_progress",
      content: "test goal",
      source: "capture",
      spawnedItems: [child1.id, child2.id],
      decomposition: decomposition as unknown as typeof schema.workItems.$inferInsert["decomposition"],
    }).returning();

    const result = await orchestratorHeartbeat(goalItem.id);
    expect(result.status).toBe("completed");
    expect(result.tasksCompleted).toBe(2);
    expect(result.tasksRemaining).toBe(0);
    expect(result.confidence).toBe("high");
  });

  it("escalates with aggregate_uncertainty when all remaining tasks are blocked (AC 17)", async () => {
    // Create goal with 1 completed and 1 paused child (paused blocks the second)
    const [child1] = await testDb.insert(schema.workItems).values({
      type: "task",
      status: "waiting_human",
      content: "paused task",
      source: "system_generated",
    }).returning();
    const [child2] = await testDb.insert(schema.workItems).values({
      type: "task",
      status: "intake",
      content: "blocked task",
      source: "system_generated",
      context: { processSlug: "nonexistent", stepId: "step-2" },
    }).returning();

    const decomposition = [
      { taskId: child1.id, stepId: "step-1", dependsOn: [], status: "paused" },
      { taskId: child2.id, stepId: "step-2", dependsOn: [child1.id], status: "pending" },
    ];

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "in_progress",
      content: "test goal",
      source: "capture",
      spawnedItems: [child1.id, child2.id],
      decomposition: decomposition as unknown as typeof schema.workItems.$inferInsert["decomposition"],
    }).returning();

    const result = await orchestratorHeartbeat(goalItem.id);
    expect(result.status).toBe("escalated");
    expect(result.confidence).toBe("low");
    expect(result.escalation?.type).toBe("aggregate_uncertainty");
    expect(result.tasksPaused).toBe(1);
    expect(result.tasksRouteAround).toBeGreaterThanOrEqual(0);
  });

  it("routes around paused tasks to independent work (AC 16)", async () => {
    // Create: task 1 paused, task 2 independent (no dependency on task 1)
    const procDef = makeTestProcessDefinition({
      name: "Route Test",
      id: "route-test",
      steps: [
        { id: "step-1", name: "Step 1", executor: "script", commands: ["echo 1"] },
      ],
    });

    const [proc] = await testDb.insert(schema.processes).values({
      name: "Route Test",
      slug: "route-test",
      definition: procDef as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "autonomous",
    }).returning();

    const [child1] = await testDb.insert(schema.workItems).values({
      type: "task",
      status: "waiting_human", // paused
      content: "paused task",
      source: "system_generated",
    }).returning();

    const [child2] = await testDb.insert(schema.workItems).values({
      type: "task",
      status: "intake", // ready to run
      content: "independent task",
      source: "system_generated",
      context: { processSlug: "route-test", stepId: "step-1" },
    }).returning();

    const decomposition = [
      { taskId: child1.id, stepId: "step-1", dependsOn: [], status: "paused" },
      { taskId: child2.id, stepId: "step-2", dependsOn: [], status: "pending" }, // NO dependency on child1
    ];

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "in_progress",
      content: "test goal",
      source: "capture",
      spawnedItems: [child1.id, child2.id],
      decomposition: decomposition as unknown as typeof schema.workItems.$inferInsert["decomposition"],
    }).returning();

    const result = await orchestratorHeartbeat(goalItem.id);

    // Task 2 should have been picked up (task 1 skipped because paused)
    // The orchestrator should have advanced at least one task
    expect(result.tasksPaused).toBeGreaterThanOrEqual(1); // child1 still paused
    // child2 was independent — should have been attempted
    expect(result.status).not.toBe("escalated"); // Should NOT escalate because independent work exists
  });
});
