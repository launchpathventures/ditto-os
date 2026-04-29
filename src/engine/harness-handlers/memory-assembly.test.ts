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
  it("returns compact cognitive core when no memories or run context exist", async () => {
    const context = makeContext();
    const result = await memoryAssemblyHandler.execute(context);
    // Brief 114: compact core is always prepended (trade-off heuristics + escalation)
    expect(result.memories).toContain("Trade-Off Heuristics");
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

  describe("project memory scope (Brief 227)", () => {
    async function seedProject(id: string, slug: string) {
      await testDb.insert(schema.projects).values({
        id,
        slug,
        name: slug,
        kind: "build",
        harnessType: "native",
        status: "active",
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
      content: string;
      appliedProjectIds?: string[] | null;
    }) {
      await testDb.insert(schema.memories).values({
        scopeType: opts.scopeType,
        scopeId: opts.scopeId,
        type: "correction",
        content: opts.content,
        source: "feedback",
        confidence: 0.8,
        reinforcementCount: 3,
        active: true,
        appliedProjectIds: opts.appliedProjectIds ?? null,
      });
    }

    it("loads process-scope memory tagged to a project-mate process (cross-process within same project)", async () => {
      await seedProject("p1", "proj-a");
      await seedProcess("proc-a1", "p1");
      await seedProcess("proc-a2", "p1");
      await seedMemory({
        scopeType: "process",
        scopeId: "proc-a1",
        content: "Always cite the source",
      });

      const context = makeContext({ processId: "proc-a2" });
      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memories).toContain("Always cite the source");
      expect(result.projectId).toBe("p1");
    });

    it("does NOT load process-scope memory from a different project (no bleed)", async () => {
      await seedProject("p1", "proj-a");
      await seedProject("p2", "proj-b");
      await seedProcess("proc-a", "p1");
      await seedProcess("proc-b", "p2");
      await seedMemory({
        scopeType: "process",
        scopeId: "proc-a",
        content: "Project A correction — should not bleed",
      });

      const context = makeContext({ processId: "proc-b" });
      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memories).not.toContain("Project A correction");
      expect(result.projectId).toBe("p2");
    });

    it("loads self-scope memory with appliedProjectIds=null (full self-scope) for any project run", async () => {
      await seedProject("p1", "proj-a");
      await seedProcess("proc-a", "p1");
      await seedMemory({
        scopeType: "self",
        scopeId: "user-1",
        content: "User prefers terse responses",
        appliedProjectIds: null,
      });

      const context = makeContext({ processId: "proc-a" });
      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memories).toContain("User prefers terse responses");
    });

    it("loads self-scope memory only when appliedProjectIds contains current projectId (hybrid)", async () => {
      await seedProject("p1", "proj-a");
      await seedProject("p2", "proj-b");
      await seedProject("p3", "proj-c");
      await seedProcess("proc-a", "p1");
      await seedProcess("proc-c", "p3");
      await seedMemory({
        scopeType: "self",
        scopeId: "user-1",
        content: "Brand voice rule for marketing repos",
        appliedProjectIds: ["p1", "p2"],
      });

      // Runs against project p1 — memory should load (p1 is in appliedProjectIds)
      const ctxP1 = makeContext({ processId: "proc-a" });
      const r1 = await memoryAssemblyHandler.execute(ctxP1);
      expect(r1.memories).toContain("Brand voice rule for marketing repos");

      // Runs against project p3 — memory should NOT load (p3 not in appliedProjectIds)
      const ctxP3 = makeContext({ processId: "proc-c" });
      const r3 = await memoryAssemblyHandler.execute(ctxP3);
      expect(r3.memories).not.toContain("Brand voice rule for marketing repos");
    });

    it("legacy fallback: pre-project-era process (projectId=null) uses single-process scope match", async () => {
      // Process has no projectId (pre-project-era). Memory tagged to it loads.
      await seedProcess("proc-legacy", null);
      await seedMemory({
        scopeType: "process",
        scopeId: "proc-legacy",
        content: "Legacy correction — single-process scope",
      });

      const context = makeContext({ processId: "proc-legacy" });
      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memories).toContain("Legacy correction — single-process scope");
      expect(result.projectId).toBeNull();
    });

    it("backfill discipline (AC #12): pre-project-era memory loads in any project run", async () => {
      // Pre-project-era memory: source process has no projectId
      await seedProcess("proc-legacy", null);
      await seedMemory({
        scopeType: "process",
        scopeId: "proc-legacy",
        content: "Pre-projects implicit-everywhere memory",
      });

      // Current run is in a real project
      await seedProject("p1", "proj-a");
      await seedProcess("proc-a", "p1");

      const context = makeContext({ processId: "proc-a" });
      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memories).toContain("Pre-projects implicit-everywhere memory");
    });

    it("performance tripwire: project-scope query stays under 50ms p95 with 1K memories", async () => {
      await seedProject("p1", "proj-a");
      // Seed 50 sibling processes belonging to p1
      const projectMateProcessIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const pid = `proc-mate-${i}`;
        await seedProcess(pid, "p1");
        projectMateProcessIds.push(pid);
      }

      // Seed 1000 process-scope memories spread across the project's processes
      for (let i = 0; i < 1000; i++) {
        const proc = projectMateProcessIds[i % projectMateProcessIds.length];
        await testDb.insert(schema.memories).values({
          scopeType: "process",
          scopeId: proc,
          type: "correction",
          content: `seed-memory-${i}`,
          source: "feedback",
          confidence: 0.5,
          reinforcementCount: 1,
          active: true,
        });
      }

      // Run multiple iterations and take p95
      const context = makeContext({ processId: projectMateProcessIds[0] });
      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await memoryAssemblyHandler.execute(context);
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(samples.length * 0.95)];
      // Tripwire: 50ms p95 — if we cross this, follow-on brief lifts to junction table
      expect(p95).toBeLessThan(50);
    });

    it("performance tripwire (Reviewer IMP-6): self-scope appliedProjectIds json_each lateral stays under 50ms p95 with 1K hybrid memories", async () => {
      // Seed 5 projects + 1 process per project so the hybrid memories have
      // a believable surface to filter against.
      const projectIds = ["p1", "p2", "p3", "p4", "p5"];
      for (const pid of projectIds) {
        await seedProject(pid, `proj-${pid}`);
        await seedProcess(`proc-${pid}`, pid);
      }

      // Seed 1000 self-scope memories with appliedProjectIds = 5-element arrays
      // including p1 — exercises the json_each lateral the brief committed to.
      for (let i = 0; i < 1000; i++) {
        const applied = [...projectIds]; // every memory targets p1 plus 4 others
        await testDb.insert(schema.memories).values({
          scopeType: "self",
          scopeId: `user-${i}`,
          type: "correction",
          content: `hybrid-memory-${i}`,
          source: "feedback",
          confidence: 0.5,
          reinforcementCount: 1,
          active: true,
          appliedProjectIds: applied,
        });
      }

      const context = makeContext({ processId: "proc-p1" });
      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await memoryAssemblyHandler.execute(context);
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.floor(samples.length * 0.95)];
      // Tripwire: same 50ms p95 — but the load-bearing slow path here is the
      // json_each lateral, NOT the inArray sub-query. If this fires, the
      // junction-table follow-up applies.
      expect(p95).toBeLessThan(50);
    });
  });

  describe("memoriesDropped (Brief 175)", () => {
    it("is zero when no memories exist", async () => {
      const context = makeContext();
      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memoriesDropped).toBe(0);
    });

    it("counts agent memories dropped when budget is tight", async () => {
      // Agent role 'pm' with 20 long memories, budget tight
      const context = makeContext({ agentRole: "pm" });
      const LONG_CONTENT = "x".repeat(400); // 400 chars per memory
      for (let i = 0; i < 20; i++) {
        await testDb.insert(schema.memories).values({
          scopeType: "agent",
          scopeId: "pm",
          type: "correction",
          content: `Memory ${i}: ${LONG_CONTENT}`,
          source: "feedback",
          confidence: 0.8,
          reinforcementCount: 1,
          active: true,
        });
      }

      // Use a tight budget (500 tokens ≈ 2000 chars)
      (context.stepDefinition.config as Record<string, unknown> | undefined) = {
        memory_token_budget: 500,
      };

      const result = await memoryAssemblyHandler.execute(context);
      expect(result.memoriesInjected).toBeLessThan(20);
      expect(result.memoriesDropped).toBeGreaterThan(0);
      expect(result.memoriesInjected + result.memoriesDropped).toBeGreaterThanOrEqual(
        Math.min(20, 20), // all 20 agent memories accounted for
      );
    });
  });
});
