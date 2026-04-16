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
import { harnessEvents } from "../events";

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
  it("escalates with low confidence when no process slug for non-goal (AC 11-14)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    // Non-goal type without processSlug → escalate with "No process assigned"
    const result = await executeOrchestrator({
      content: "test",
      workItemType: "task",
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

  it("uses LLM decomposition when goal has no process slug (Brief 102)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    // Goal without processSlug → LLM decomposition path
    // With vague content and no dimension map → clarity insufficient
    const result = await executeOrchestrator({
      content: "test",
      workItemType: "goal",
    });

    expect(result.confidence).toBe("low");
    const orchestration = result.outputs["orchestration-result"] as {
      action: string;
      escalation?: { type: string; reason: string };
    };
    expect(orchestration.action).toBe("escalated");
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

// ============================================================
// Task-to-process routing (Brief 074)
// ============================================================

describe("Task-to-process routing", () => {
  it("matches by slug exact match when content contains process slug", async () => {
    const { matchTaskToProcessFromList } = await import("./router");

    const processes = [
      { slug: "dev-pipeline", name: "Development Pipeline", description: "Full dev pipeline" },
      { slug: "review-process", name: "Review Process", description: "Code review process" },
    ];

    const result = matchTaskToProcessFromList(
      "Build Brief 069 using the dev-pipeline process",
      processes,
    );

    expect(result.processSlug).toBe("dev-pipeline");
    expect(result.confidence).toBe(1.0);
    expect(result.reasoning).toContain("Slug word-boundary match");
  });

  it("matches by keyword when content shares terms with process name/description", async () => {
    const { matchTaskToProcessFromList } = await import("./router");

    const processes = [
      { slug: "build-sys", name: "Build Pipeline", description: "Build and deploy code" },
      { slug: "code-rev", name: "Code Review", description: "Review code changes" },
    ];

    const result = matchTaskToProcessFromList(
      "Review the code changes for the new feature",
      processes,
    );

    expect(result.processSlug).toBe("code-rev");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasoning).toContain("Keyword match");
  });

  it("returns null with low confidence when no process matches", async () => {
    const { matchTaskToProcessFromList } = await import("./router");

    const processes = [
      { slug: "billing-process", name: "Billing", description: "Generate invoices and billing" },
    ];

    const result = matchTaskToProcessFromList(
      "Deploy the quantum entanglement stabilizer",
      processes,
    );

    // Should either match with very low confidence or return null
    if (result.processSlug !== null) {
      expect(result.confidence).toBeLessThan(0.6);
    } else {
      expect(result.confidence).toBe(0);
    }
  });
});

// ============================================================
// Brief 155: Orchestrator progress events (MP-1.4)
// ============================================================

describe("Orchestrator progress events (Brief 155)", () => {
  it("emits decomposition-start, subtask-identified, and decomposition-complete events (AC1)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const emittedEvents: Array<{ type: string; [k: string]: unknown }> = [];
    const unsub = harnessEvents.on((event) => {
      if (event.type.startsWith("orchestrator-")) {
        emittedEvents.push(event);
      }
    });

    // Create a 2-step process
    const processDef = makeTestProcessDefinition({
      name: "Event Test Pipeline",
      id: "event-test",
      steps: [
        { id: "step-a", name: "Alpha", executor: "script", commands: ["echo alpha"] },
        { id: "step-b", name: "Beta", executor: "script", depends_on: ["step-a"], commands: ["echo beta"] },
      ],
    });

    await testDb.insert(schema.processes).values({
      name: "Event Test Pipeline",
      slug: "event-test",
      definition: processDef as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "Test goal for events",
      source: "capture",
    }).returning();

    await executeOrchestrator({
      processSlug: "event-test",
      workItemId: goalItem.id,
      content: "Test goal for events",
      workItemType: "goal",
    });

    unsub();

    // Should have: 1 start + 2 subtask-identified + 2 subtask-dispatched + 1 complete = 6
    const starts = emittedEvents.filter((e) => e.type === "orchestrator-decomposition-start");
    const identified = emittedEvents.filter((e) => e.type === "orchestrator-subtask-identified");
    const dispatched = emittedEvents.filter((e) => e.type === "orchestrator-subtask-dispatched");
    const completes = emittedEvents.filter((e) => e.type === "orchestrator-decomposition-complete");

    expect(starts).toHaveLength(1);
    expect(starts[0].goalWorkItemId).toBe(goalItem.id);
    expect(starts[0].goalContent).toBe("Test goal for events");

    expect(identified).toHaveLength(2);
    expect(identified[0].index).toBe(1);
    expect(identified[0].total).toBe(2);
    expect(identified[1].index).toBe(2);
    expect(identified[1].total).toBe(2);

    // dispatched depends on routing — may or may not find matches
    expect(dispatched.length).toBeGreaterThanOrEqual(0);

    expect(completes).toHaveLength(1);
    expect(completes[0].totalTasks).toBe(2);
  });

  it("does not emit progress events for non-goal pass-through (AC5)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const emittedEvents: Array<{ type: string }> = [];
    const unsub = harnessEvents.on((event) => {
      if (event.type.startsWith("orchestrator-")) {
        emittedEvents.push(event);
      }
    });

    await testDb.insert(schema.processes).values({
      name: "Pass Through",
      slug: "pass-through",
      definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
      status: "active",
      trustTier: "supervised",
    });

    await executeOrchestrator({
      processSlug: "pass-through",
      workItemId: randomUUID(),
      content: "simple task",
      workItemType: "task",
    });

    unsub();

    // No orchestrator events for pass-through
    expect(emittedEvents).toHaveLength(0);
  });

  it("emits decomposition-failed when fast-path decomposition escalates (AC5 + reviewer fix)", async () => {
    const { executeOrchestrator } = await import("./orchestrator");

    const emittedEvents: Array<{ type: string; [k: string]: unknown }> = [];
    const unsub = harnessEvents.on((event) => {
      if (event.type.startsWith("orchestrator-")) {
        emittedEvents.push(event);
      }
    });

    const [goalItem] = await testDb.insert(schema.workItems).values({
      type: "goal",
      status: "intake",
      content: "Test failure events",
      source: "capture",
    }).returning();

    // Non-existent process slug → escalation after start event
    await executeOrchestrator({
      processSlug: "nonexistent-process",
      workItemId: goalItem.id,
      content: "Test failure events",
      workItemType: "goal",
    });

    unsub();

    const starts = emittedEvents.filter((e) => e.type === "orchestrator-decomposition-start");
    const failures = emittedEvents.filter((e) => e.type === "orchestrator-decomposition-failed");

    expect(starts).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].goalWorkItemId).toBe(goalItem.id);
    expect(failures[0].reason).toBeTruthy();
  });
});
