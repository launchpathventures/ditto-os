/**
 * Tests for memory-assembly.ts
 * AC7 (Brief 027): Intra-run context — outputs from completed steps in same run
 * AC14 (Brief 027): Intra-run context respects separate token budget
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, makeTestProcessDefinition, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { randomUUID } from "crypto";
import type { HarnessContext } from "../harness";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mock
const { memoryAssemblyHandler, RUN_CONTEXT_TOKEN_BUDGET } = await import("./memory-assembly");
const { createHarnessContext } = await import("../harness");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

function makeContext(overrides: {
  processRunId?: string;
  processId?: string;
  stepId?: string;
  agentRole?: string;
} = {}): HarnessContext {
  const processId = overrides.processId ?? randomUUID();
  const processRunId = overrides.processRunId ?? randomUUID();
  const stepId = overrides.stepId ?? "step-2";

  return createHarnessContext({
    processRun: {
      id: processRunId,
      processId,
      inputs: {},
    },
    stepDefinition: {
      id: stepId,
      name: "Test Step 2",
      executor: "cli-agent" as const,
      agent_role: overrides.agentRole,
    },
    processDefinition: makeTestProcessDefinition() as any,
    trustTier: "supervised",
    stepRunId: randomUUID(),
  });
}

describe("memory-assembly handler", () => {
  it("returns empty memories when no memories or run context exist", async () => {
    const context = makeContext();
    const result = await memoryAssemblyHandler.execute(context);
    expect(result.memories).toBe("");
    expect(result.memoriesInjected).toBe(0);
  });

  it("loads agent-scoped memories", async () => {
    const context = makeContext({ agentRole: "pm" });

    // Insert a memory for the "pm" agent role
    await testDb.insert(schema.memories).values({
      scopeType: "agent",
      scopeId: "pm",
      type: "correction",
      content: "Always check the roadmap first",
      source: "feedback",
      confidence: 0.8,
      reinforcementCount: 3,
      active: true,
    });

    const result = await memoryAssemblyHandler.execute(context);
    expect(result.memories).toContain("Agent Memory");
    expect(result.memories).toContain("Always check the roadmap first");
    expect(result.memoriesInjected).toBeGreaterThan(0);
  });

  describe("intra-run context (Brief 027, AC7)", () => {
    it("includes outputs from completed steps in same run", async () => {
      const processId = randomUUID();
      const processRunId = randomUUID();

      // Insert a process
      await testDb.insert(schema.processes).values({
        id: processId,
        name: "Test Process",
        slug: "test-process",
        definition: {} as any,
      });

      // Insert a process run
      await testDb.insert(schema.processRuns).values({
        id: processRunId,
        processId,
        status: "running",
        triggeredBy: "manual",
      });

      // Insert a completed step run with outputs
      await testDb.insert(schema.stepRuns).values({
        processRunId,
        stepId: "pm-triage",
        status: "approved",
        executorType: "cli-agent",
        outputs: { recommendation: "research needed for Phase 7" } as any,
      });

      const context = makeContext({
        processRunId,
        processId,
        stepId: "researcher-scout",
      });

      const result = await memoryAssemblyHandler.execute(context);

      expect(result.memories).toContain("Run Context (prior steps in this run)");
      expect(result.memories).toContain("pm-triage");
      expect(result.memories).toContain("research needed for Phase 7");
    });

    it("does not include current step in run context", async () => {
      const processId = randomUUID();
      const processRunId = randomUUID();

      await testDb.insert(schema.processes).values({
        id: processId,
        name: "Test Process",
        slug: "test-process",
        definition: {} as any,
      });

      await testDb.insert(schema.processRuns).values({
        id: processRunId,
        processId,
        status: "running",
        triggeredBy: "manual",
      });

      // The step is "step-2" but we also have it as an approved step run
      await testDb.insert(schema.stepRuns).values({
        processRunId,
        stepId: "step-2",
        status: "approved",
        executorType: "cli-agent",
        outputs: { result: "should not appear" } as any,
      });

      const context = makeContext({
        processRunId,
        processId,
        stepId: "step-2",
      });

      const result = await memoryAssemblyHandler.execute(context);

      // Should NOT contain outputs from the current step
      expect(result.memories).not.toContain("should not appear");
    });

    it("does not include non-approved steps", async () => {
      const processId = randomUUID();
      const processRunId = randomUUID();

      await testDb.insert(schema.processes).values({
        id: processId,
        name: "Test Process",
        slug: "test-process",
        definition: {} as any,
      });

      await testDb.insert(schema.processRuns).values({
        id: processRunId,
        processId,
        status: "running",
        triggeredBy: "manual",
      });

      // Insert a failed step (should not be included)
      await testDb.insert(schema.stepRuns).values({
        processRunId,
        stepId: "failed-step",
        status: "failed",
        executorType: "cli-agent",
        outputs: { result: "failed output should not appear" } as any,
      });

      const context = makeContext({
        processRunId,
        processId,
        stepId: "next-step",
      });

      const result = await memoryAssemblyHandler.execute(context);

      expect(result.memories).not.toContain("failed output should not appear");
    });

    it("respects separate run context token budget", async () => {
      const processId = randomUUID();
      const processRunId = randomUUID();

      await testDb.insert(schema.processes).values({
        id: processId,
        name: "Test Process",
        slug: "test-process",
        definition: {} as any,
      });

      await testDb.insert(schema.processRuns).values({
        id: processRunId,
        processId,
        status: "running",
        triggeredBy: "manual",
      });

      // Insert a step with output that exceeds the run context budget
      const largeOutput = "x".repeat(RUN_CONTEXT_TOKEN_BUDGET * 4 * 2); // Way over budget
      await testDb.insert(schema.stepRuns).values({
        processRunId,
        stepId: "verbose-step",
        status: "approved",
        executorType: "cli-agent",
        outputs: { result: largeOutput } as any,
      });

      const context = makeContext({
        processRunId,
        processId,
        stepId: "next-step",
      });

      const result = await memoryAssemblyHandler.execute(context);

      // Should contain run context but truncated
      expect(result.memories).toContain("Run Context");
      expect(result.memories).toContain("(truncated)");
      // The run context portion should be within budget
      const runContextStart = result.memories.indexOf("## Run Context");
      if (runContextStart !== -1) {
        const runContextText = result.memories.slice(runContextStart);
        // Allow some overhead for headers, but should be within budget + header overhead
        expect(runContextText.length).toBeLessThan(RUN_CONTEXT_TOKEN_BUDGET * 4 + 200);
      }
    });
  });
});
