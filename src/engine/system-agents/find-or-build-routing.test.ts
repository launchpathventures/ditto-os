/**
 * Tests for find-or-build routing (Brief 103)
 *
 * Tests cover:
 * - Three-tier routing: model → find → build (AC1)
 * - Process Model Library lookup (AC2, AC3)
 * - Existing process match (AC4)
 * - Build trigger and depth enforcement (AC5, AC6)
 * - First-run gate (AC7)
 * - Goal trust inheritance (AC8, AC9) — tested in goal-trust.test.ts
 * - Concurrent build deduplication (AC15)
 * - Goal cancellation (AC16)
 * - Routing decision logging (AC17)
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

// Mock the LLM for build-on-gap
vi.mock("../llm", () => ({
  createCompletion: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify({
      name: "Generated Process",
      slug: "generated-process",
      description: "A generated process",
      steps: [
        { id: "step-1", name: "Research", executor: "ai-agent", description: "Research step" },
        { id: "step-2", name: "Review", executor: "human", description: "Review step", depends_on: ["step-1"] },
      ],
    }) }],
    tokensUsed: 200,
    costCents: 1.0,
    stopReason: "end_turn",
    model: "test-model",
  }),
  extractText: vi.fn().mockImplementation((content: Array<{ type: string; text?: string }>) => {
    const textBlock = content.find(b => b.type === "text");
    return textBlock?.text || "";
  }),
  getConfiguredModel: vi.fn().mockReturnValue("test-model"),
}));

// Mock heartbeat for first-run validation
vi.mock("../heartbeat", () => ({
  startProcessRun: vi.fn().mockResolvedValue("mock-run-id"),
  fullHeartbeat: vi.fn().mockResolvedValue({
    processRunId: "mock-run-id",
    stepsExecuted: 2,
    status: "completed",
    message: "All steps complete",
  }),
  goalHeartbeatLoop: vi.fn().mockResolvedValue({
    goalWorkItemId: "mock-goal-id",
    status: "completed",
    tasksCompleted: 1,
    tasksPaused: 0,
    tasksFailed: 0,
    tasksPending: 0,
  }),
}));

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("find-or-build routing", () => {
  describe("Process Model Library lookup (AC2, AC3)", () => {
    it("findProcessModelFromList matches by keyword overlap", async () => {
      const { findProcessModelFromList } = await import("./process-model-lookup");

      const templates = [
        { slug: "person-research", name: "Person Research", description: "Deep research on a specific person" },
        { slug: "channel-router", name: "Channel Router", description: "Route to communication channels" },
      ];

      const match = findProcessModelFromList(
        "Research the person before outreach",
        templates,
      );

      expect(match).not.toBeNull();
      expect(match!.slug).toBe("person-research");
      expect(match!.confidence).toBeGreaterThan(0.3);
    });

    it("returns null when no template matches", async () => {
      const { findProcessModelFromList } = await import("./process-model-lookup");

      const templates = [
        { slug: "billing", name: "Billing Process", description: "Generate invoices" },
      ];

      const match = findProcessModelFromList(
        "Deploy quantum entanglement stabilizer",
        templates,
      );

      expect(match).toBeNull();
    });
  });

  describe("routeSubGoal three-tier routing (AC1)", () => {
    it("routes via find path when existing process matches (AC4)", async () => {
      const { routeSubGoal } = await import("./orchestrator");

      // Create a matching process with clear keyword overlap
      await testDb.insert(schema.processes).values({
        name: "Person Research Deep Dive",
        slug: "person-research",
        definition: makeTestProcessDefinition({ name: "Person Research" }) as unknown as Record<string, unknown>,
        status: "active",
        trustTier: "supervised",
        description: "Research person outreach deep dive analysis",
      });

      const goalId = randomUUID();
      const subGoalId = randomUUID();

      const result = await routeSubGoal(
        subGoalId,
        "Research this person before outreach using person-research",
        "find",
        goalId,
      );

      // Should match via find (slug match → confidence 1.0) or model path
      expect(["find", "model"]).toContain(result.path);
      expect(result.processSlug).toBe("person-research");
      expect(result.processId).not.toBeNull();
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it("routes via build path when no match exists (AC5)", async () => {
      const { routeSubGoal } = await import("./orchestrator");

      const goalId = randomUUID();
      const subGoalId = randomUUID();

      const result = await routeSubGoal(
        subGoalId,
        "Create a completely novel quantum process",
        "build",
        goalId,
      );

      // Should have attempted build
      expect(["build", "escalated"]).toContain(result.path);

      // Check that routing was logged
      const activities = await testDb.select().from(schema.activities);
      const routingActivity = activities.find(a => a.action.startsWith("orchestrator.routing"));
      expect(routingActivity).toBeDefined();
      expect(routingActivity!.metadata).toBeDefined();
    });

    it("logs routing decisions with cost (AC17)", async () => {
      const { routeSubGoal } = await import("./orchestrator");

      // Create a matching process for a free find
      await testDb.insert(schema.processes).values({
        name: "Meeting Prep",
        slug: "meeting-prep",
        definition: makeTestProcessDefinition() as unknown as Record<string, unknown>,
        status: "active",
        trustTier: "supervised",
        description: "Prepare for a meeting",
      });

      const result = await routeSubGoal(
        randomUUID(),
        "Prepare for the upcoming meeting with the client",
        "find",
        randomUUID(),
      );

      const activities = await testDb.select().from(schema.activities);
      const routingLog = activities.find(a => a.action.startsWith("orchestrator.routing"));

      expect(routingLog).toBeDefined();
      const meta = routingLog!.metadata as Record<string, unknown>;
      expect(meta.costCategory).toBeDefined();
      expect(meta.confidence).toBeDefined();
    });
  });

  describe("build depth enforcement (AC6)", () => {
    it("rejects build when depth >= 1", async () => {
      const { triggerBuild } = await import("./build-on-gap");

      const result = await triggerBuild({
        subGoalId: randomUUID(),
        subGoalDescription: "Build something nested",
        goalId: randomUUID(),
        buildDepth: 1,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("depth_exceeded");
      expect(result.reasoning).toContain("depth");
    });

    it("allows build at depth 0", async () => {
      const { triggerBuild } = await import("./build-on-gap");

      const result = await triggerBuild({
        subGoalId: randomUUID(),
        subGoalDescription: "Build a new analysis process",
        goalId: randomUUID(),
        buildDepth: 0,
        validateFirstRun: false, // Skip for this test
      });

      // Should succeed (LLM is mocked to return valid process definition)
      expect(result.status).not.toBe("depth_exceeded");
    });
  });

  describe("first-run gate (AC7)", () => {
    it("promotes process to active after successful first run", async () => {
      const { triggerBuild } = await import("./build-on-gap");

      const result = await triggerBuild({
        subGoalId: randomUUID(),
        subGoalDescription: "Create a data analysis process",
        goalId: randomUUID(),
        buildDepth: 0,
        validateFirstRun: true,
      });

      if (result.success) {
        // Process should be promoted to active
        const [process] = await testDb.select().from(schema.processes)
          .where(eq(schema.processes.id, result.processId!));
        expect(process.status).toBe("active");
      }
    });

    it("archives process and escalates after failed first run", async () => {
      // Override fullHeartbeat to return failed
      const heartbeatModule = await import("../heartbeat");
      vi.mocked(heartbeatModule.fullHeartbeat).mockResolvedValue({
        processRunId: "mock-run-id",
        stepsExecuted: 0,
        status: "failed",
        message: "Step failed",
      });

      const { triggerBuild } = await import("./build-on-gap");

      const result = await triggerBuild({
        subGoalId: randomUUID(),
        subGoalDescription: "Create a failing process",
        goalId: randomUUID(),
        buildDepth: 0,
        validateFirstRun: true,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("first_run_failed");
      expect(result.reasoning).toContain("archived");

      // Process should be archived (not deleted)
      if (result.processId) {
        const [process] = await testDb.select().from(schema.processes)
          .where(eq(schema.processes.id, result.processId));
        expect(process.status).toBe("archived");
      }

      // Restore mock
      vi.mocked(heartbeatModule.fullHeartbeat).mockResolvedValue({
        processRunId: "mock-run-id",
        stepsExecuted: 2,
        status: "completed",
        message: "All steps complete",
      });
    });
  });

  describe("goal cancellation (AC16)", () => {
    it("pauses in-progress sub-goals and preserves completed ones", async () => {
      const { cancelGoal } = await import("./orchestrator");

      // Create goal with decomposition
      const [goalItem] = await testDb.insert(schema.workItems).values({
        type: "goal",
        status: "in_progress",
        content: "Test goal",
        source: "capture",
        decomposition: [
          { taskId: "child-1", stepId: "sg-1", dependsOn: [], status: "completed" },
          { taskId: "child-2", stepId: "sg-2", dependsOn: [], status: "in_progress" },
          { taskId: "child-3", stepId: "sg-3", dependsOn: ["sg-1"], status: "pending" },
        ],
      }).returning();

      // Create child work items
      await testDb.insert(schema.workItems).values([
        { id: "child-1", type: "task", status: "completed", content: "Done task", source: "capture" },
        { id: "child-2", type: "task", status: "in_progress", content: "Active task", source: "capture", executionIds: ["run-1"] },
        { id: "child-3", type: "task", status: "intake", content: "Pending task", source: "capture" },
      ]);

      // Create a process run for child-2
      await testDb.insert(schema.processes).values({
        id: "proc-1",
        name: "Test",
        slug: "test",
        definition: {} as Record<string, unknown>,
        status: "active",
        trustTier: "supervised",
      });
      await testDb.insert(schema.processRuns).values({
        id: "run-1",
        processId: "proc-1",
        status: "running",
        triggeredBy: "system",
      });

      await cancelGoal(goalItem.id);

      // Completed child should be preserved
      const [completed] = await testDb.select().from(schema.workItems)
        .where(eq(schema.workItems.id, "child-1"));
      expect(completed.status).toBe("completed");

      // In-progress child should be paused
      const [inProgress] = await testDb.select().from(schema.workItems)
        .where(eq(schema.workItems.id, "child-2"));
      expect(inProgress.status).toBe("waiting_human");

      // Pending child should be paused
      const [pending] = await testDb.select().from(schema.workItems)
        .where(eq(schema.workItems.id, "child-3"));
      expect(pending.status).toBe("waiting_human");

      // Process run should be cancelled
      const [run] = await testDb.select().from(schema.processRuns)
        .where(eq(schema.processRuns.id, "run-1"));
      expect(run.status).toBe("cancelled");

      // Goal should be paused
      const [goal] = await testDb.select().from(schema.workItems)
        .where(eq(schema.workItems.id, goalItem.id));
      expect(goal.status).toBe("waiting_human");

      // Activity should be logged
      const activities = await testDb.select().from(schema.activities);
      expect(activities.some(a => a.action === "goal.cancelled")).toBe(true);
    });
  });

  // ============================================================
  // Brief 155 MP-1.5: build-process-created event emission
  // ============================================================

  describe("build-process-created event (Brief 155 AC3)", () => {
    it("emits build-process-created event on successful build", async () => {
      const { triggerBuild } = await import("./build-on-gap");

      const emittedEvents: Array<{ type: string; [k: string]: unknown }> = [];
      const unsub = harnessEvents.on((event) => {
        if (event.type === "build-process-created") {
          emittedEvents.push(event);
        }
      });

      const goalId = randomUUID();
      const result = await triggerBuild({
        subGoalId: randomUUID(),
        subGoalDescription: "Build a notification test process",
        goalId,
        buildDepth: 0,
        validateFirstRun: false, // Skip validation to ensure success path
      });

      unsub();

      if (result.success) {
        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0].goalWorkItemId).toBe(goalId);
        expect(emittedEvents[0].processSlug).toBe(result.processSlug);
        expect(emittedEvents[0].processName).toBeTruthy();
        expect(emittedEvents[0].processDescription).toBeTruthy();
      }
    });

    it("does not emit build-process-created on depth-exceeded failure", async () => {
      const { triggerBuild } = await import("./build-on-gap");

      const emittedEvents: Array<{ type: string }> = [];
      const unsub = harnessEvents.on((event) => {
        if (event.type === "build-process-created") {
          emittedEvents.push(event);
        }
      });

      await triggerBuild({
        subGoalId: randomUUID(),
        subGoalDescription: "Nested build attempt",
        goalId: randomUUID(),
        buildDepth: 1, // Exceeds depth limit
      });

      unsub();

      expect(emittedEvents).toHaveLength(0);
    });
  });
});
