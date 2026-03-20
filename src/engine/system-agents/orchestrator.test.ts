/**
 * Tests for goal-directed orchestrator (Brief 021)
 *
 * Tests cover:
 * - Goal decomposition into child work items (ACs 1-6)
 * - Pass-through for non-goal work items (backward compatibility)
 * - Confidence-based stopping / escalation (ACs 11-14)
 * - Decomposition with dependencies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("Orchestrator goal decomposition", () => {
  it("decomposes a goal into child work items from process steps (AC 1-6)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    // Create a 3-step process
    const processDef = makeTestProcessDefinition({
      name: "Test Pipeline",
      id: "test-pipeline",
      steps: [
        { id: "step-1", name: "Research", executor: "script", commands: ["echo research"] },
        { id: "step-2", name: "Build", executor: "script", depends_on: ["step-1"], commands: ["echo build"] },
        { id: "step-3", name: "Review", executor: "script", depends_on: ["step-2"], commands: ["echo review"] },
      ],
    });

    await testDb.insert(schema.processes).values({
      name: "Test Pipeline",
      slug: "test-pipeline",
      definition: processDef as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    // Create parent goal work item
    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "Build the feature",
      source: "capture",
    }).returning();

    // Execute orchestrator with goal type
    const result = await executeOrchestrator({
      processSlug: "test-pipeline",
      workItemId: goalItem.id,
      content: "Build the feature",
      workItemType: "goal",
    });

    // AC 1: Should decompose (not start)
    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      tasks: Array<{ taskId: string; stepId: string; dependsOn: string[]; status: string }>;
      goalWorkItemId: string;
    };
    expect(orchestration.action).toBe("decomposed");
    expect(result.confidence).toBe("high");

    // AC 5: 3 child tasks matching 3 process steps
    expect(orchestration.tasks).toHaveLength(3);
    expect(orchestration.tasks[0].stepId).toBe("step-1");
    expect(orchestration.tasks[1].stepId).toBe("step-2");
    expect(orchestration.tasks[2].stepId).toBe("step-3");

    // AC 3: Dependencies mirror process YAML
    expect(orchestration.tasks[0].dependsOn).toEqual([]);
    expect(orchestration.tasks[1].dependsOn).toEqual([orchestration.tasks[0].taskId]);
    expect(orchestration.tasks[2].dependsOn).toEqual([orchestration.tasks[1].taskId]);

    // AC 2: Child work items have goalAncestry
    const childItems = await testDb.select().from(schema.workItems)
      .where(eq(schema.workItems.spawnedFrom, goalItem.id));
    expect(childItems).toHaveLength(3);
    for (const child of childItems) {
      expect(child.goalAncestry).toEqual([goalItem.id]);
      expect(child.spawnedFrom).toBe(goalItem.id);
    }

    // AC 4: Parent has decomposition
    const [updatedGoal] = await testDb.select().from(schema.workItems)
      .where(eq(schema.workItems.id, goalItem.id));
    expect(updatedGoal.decomposition).toHaveLength(3);

    // AC 6: Parent has spawnedItems
    expect(updatedGoal.spawnedItems).toHaveLength(3);
    expect(updatedGoal.status).toBe("in_progress");
  });

  it("passes through for task-type work items (backward compatible)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-process",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const result = await executeOrchestrator({
      processSlug: "test-process",
      workItemId: randomUUID(),
      content: "a simple task",
      workItemType: "task",
    });

    const orchestration = result.outputs["orchestration-result"] as { action: string };
    expect(orchestration.action).toBe("started");
    expect(result.confidence).toBe("high");
  });

  it("passes through when no workItemType provided (backward compatible)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    await testDb.insert(schema.processes).values({
      name: "Test Process",
      slug: "test-process",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const result = await executeOrchestrator({
      processSlug: "test-process",
      workItemId: randomUUID(),
      content: "no type specified",
    });

    const orchestration = result.outputs["orchestration-result"] as { action: string };
    expect(orchestration.action).toBe("started");
  });
});

describe("Orchestrator confidence and escalation", () => {
  it("escalates with low confidence when no process slug (AC 11-14)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const result = await executeOrchestrator({
      content: "test",
      workItemType: "goal",
    });

    expect(result.confidence).toBe("low");
    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      escalation: { type: string; reason: string };
    };
    expect(orchestration.action).toBe("escalated");
    expect(orchestration.escalation.type).toBe("blocked");
    expect(orchestration.escalation.reason).toContain("No process assigned");
  });

  it("escalates when process not found (AC 12)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "test goal",
      source: "capture",
    }).returning();

    const result = await executeOrchestrator({
      processSlug: "nonexistent-process",
      workItemId: goalItem.id,
      content: "test goal",
      workItemType: "goal",
    });

    expect(result.confidence).toBe("low");
    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      escalation: { type: string };
    };
    expect(orchestration.action).toBe("escalated");
    expect(orchestration.escalation.type).toBe("blocked");
  });

  it("escalates when process has no steps (AC 12)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const emptyDef = makeTestProcessDefinition({ steps: [] });
    await testDb.insert(schema.processes).values({
      name: "Empty Process",
      slug: "empty-process",
      definition: emptyDef as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "test goal",
      source: "capture",
    }).returning();

    const result = await executeOrchestrator({
      processSlug: "empty-process",
      workItemId: goalItem.id,
      content: "test goal",
      workItemType: "goal",
    });

    expect(result.confidence).toBe("low");
    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      escalation: { type: string };
    };
    expect(orchestration.escalation.type).toBe("blocked");
  });
});
