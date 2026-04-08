/**
 * Pulse + Chain Executor Tests (Brief 098a)
 *
 * Tests: pulse idempotency, chain variable substitution, delayed run lifecycle,
 * chain processing on completion, schedule creation, event deferral.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import type { RunStatus } from "../db/schema";
import { eq, and } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

// Mock the db module
vi.mock("../db", async () => {
  const actualSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: actualSchema,
  };
});

// Mock heartbeat (we don't want real heartbeats in pulse tests)
vi.mock("./heartbeat", () => ({
  startProcessRun: vi.fn(async (_slug: string, _inputs: unknown, _triggeredBy: string) => {
    return "mock-run-id";
  }),
  fullHeartbeat: vi.fn(async () => ({
    processRunId: "mock-run-id",
    stepsExecuted: 1,
    status: "completed",
    message: "mock completed",
  })),
}));

// Mock integration registry (needed by process-loader if pulled in transitively)
vi.mock("./integration-registry", () => ({
  getIntegration: vi.fn(() => undefined),
  getIntegrationRegistry: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

import { pulseTick } from "./pulse";
import { processChains, substituteVariables, parseDuration } from "./chain-executor";
import { startProcessRun } from "./heartbeat";
import { randomUUID } from "crypto";

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Helper: create a process + run with chains
// ============================================================

async function createProcessWithChains(chains: unknown[], opts: {
  runStatus?: string;
  chainsProcessed?: boolean;
  inputs?: Record<string, unknown>;
} = {}) {
  const processId = randomUUID();
  const runId = randomUUID();

  await testDb.insert(schema.processes).values({
    id: processId,
    name: "Test Process",
    slug: "test-process",
    description: "test",
    definition: {
      name: "Test Process",
      id: "test-process",
      version: 1,
      status: "active",
      description: "test",
      trigger: { type: "manual" },
      inputs: [],
      steps: [],
      outputs: [],
      quality_criteria: [],
      feedback: { metrics: [], capture: [] },
      trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
      chain: chains,
    },
    status: "active",
    trustTier: "supervised",
  });

  await testDb.insert(schema.processRuns).values({
    id: runId,
    processId,
    status: (opts.runStatus ?? "approved") as RunStatus,
    triggeredBy: "manual",
    inputs: opts.inputs ?? { personId: "person-123", email: "test@example.com" },
    chainsProcessed: opts.chainsProcessed ?? false,
    completedAt: new Date(),
  });

  return { processId, runId };
}

// ============================================================
// substituteVariables
// ============================================================

describe("substituteVariables", () => {
  it("substitutes simple variables", () => {
    const result = substituteVariables(
      { userId: "{personId}", email: "{email}" },
      { personId: "p-123", email: "test@example.com" },
    );
    expect(result).toEqual({ userId: "p-123", email: "test@example.com" });
  });

  it("substitutes dotted path variables", () => {
    const result = substituteVariables(
      { targetId: "{target.personId}" },
      { target: { personId: "t-456" } },
    );
    expect(result).toEqual({ targetId: "t-456" });
  });

  it("leaves unresolved variables as-is", () => {
    const result = substituteVariables(
      { userId: "{unknownVar}" },
      { personId: "p-123" },
    );
    expect(result).toEqual({ userId: "{unknownVar}" });
  });

  it("handles mixed text and variables", () => {
    const result = substituteVariables(
      { msg: "Hello {name}, your ID is {id}" },
      { name: "Alice", id: "42" },
    );
    expect(result).toEqual({ msg: "Hello Alice, your ID is 42" });
  });

  it("stringifies non-string values", () => {
    const result = substituteVariables(
      { data: "{obj}" },
      { obj: { a: 1 } },
    );
    expect(result).toEqual({ data: '{"a":1}' });
  });
});

// ============================================================
// parseDuration
// ============================================================

describe("parseDuration", () => {
  it("parses days", () => {
    expect(parseDuration("5d")).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it("parses hours", () => {
    expect(parseDuration("24h")).toBe(24 * 60 * 60 * 1000);
  });

  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("abc")).toThrow("Invalid duration format");
  });
});

// ============================================================
// processChains
// ============================================================

describe("processChains", () => {
  it("creates delayed run for delay-type chain", async () => {
    const { runId } = await createProcessWithChains([
      { trigger: "no-reply-timeout", delay: "5d", process: "follow-up-sequences", inputs: { personId: "{personId}" } },
    ]);

    await processChains(runId);

    const delayed = await testDb.select().from(schema.delayedRuns);
    expect(delayed).toHaveLength(1);
    expect(delayed[0].processSlug).toBe("follow-up-sequences");
    expect(delayed[0].status).toBe("pending");
    expect(delayed[0].inputs).toEqual({ personId: "person-123" });
    expect(delayed[0].createdByRunId).toBe(runId);
    expect(delayed[0].parentTrustTier).toBe("supervised"); // AC9: inherits parent trust

    // executeAt should be roughly now + 5 days
    const expectedMs = 5 * 24 * 60 * 60 * 1000;
    const diff = delayed[0].executeAt!.getTime() - Date.now();
    expect(diff).toBeGreaterThan(expectedMs - 5000);
    expect(diff).toBeLessThan(expectedMs + 5000);
  });

  it("creates schedule for schedule-type chain", async () => {
    // Need to create the target process first
    const targetId = randomUUID();
    await testDb.insert(schema.processes).values({
      id: targetId,
      name: "Pipeline Tracking",
      slug: "pipeline-tracking",
      description: "test",
      definition: {},
      status: "active",
      trustTier: "supervised",
    });

    const { runId } = await createProcessWithChains([
      { trigger: "schedule", interval: "7d", process: "pipeline-tracking", inputs: { userId: "{personId}" } },
    ]);

    await processChains(runId);

    const schedules = await testDb.select().from(schema.schedules)
      .where(eq(schema.schedules.processId, targetId));
    expect(schedules).toHaveLength(1);
    expect(schedules[0].cronExpression).toBe("0 0 */7 * *");
    expect(schedules[0].enabled).toBe(true);
  });

  it("logs event-type chain as registered (not active)", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { runId } = await createProcessWithChains([
      { trigger: "positive-reply", process: "connecting-introduction", inputs: { personId: "{personId}" } },
    ]);

    await processChains(runId);

    // Should have logged the event handler registration
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Event handler registered (not yet active)"),
    );

    consoleSpy.mockRestore();
  });

  it("is idempotent — second call does nothing (AC8)", async () => {
    const { runId } = await createProcessWithChains([
      { trigger: "no-reply-timeout", delay: "5d", process: "follow-up-sequences", inputs: { personId: "{personId}" } },
    ]);

    await processChains(runId);
    await processChains(runId);

    const delayed = await testDb.select().from(schema.delayedRuns);
    expect(delayed).toHaveLength(1); // Only one, not two
  });

  it("skips already-processed runs", async () => {
    const { runId } = await createProcessWithChains(
      [{ trigger: "delay", delay: "1d", process: "test", inputs: {} }],
      { chainsProcessed: true },
    );

    await processChains(runId);

    const delayed = await testDb.select().from(schema.delayedRuns);
    expect(delayed).toHaveLength(0);
  });

  it("handles runs with no chains gracefully", async () => {
    const { runId } = await createProcessWithChains([]);

    await processChains(runId);

    // Should mark as processed even with no chains
    const [run] = await testDb.select().from(schema.processRuns)
      .where(eq(schema.processRuns.id, runId));
    expect(run.chainsProcessed).toBe(true);
  });
});

// ============================================================
// pulseTick — delayed run lifecycle
// ============================================================

describe("pulseTick — delayed runs", () => {
  it("starts due delayed runs", async () => {
    // Create a delayed run that's already due
    await testDb.insert(schema.delayedRuns).values({
      processSlug: "test-process",
      inputs: { key: "value" },
      executeAt: new Date(Date.now() - 60000), // 1 minute ago
      status: "pending",
    });

    const result = await pulseTick();

    expect(result.delayedRunsStarted).toBe(1);
    expect(startProcessRun).toHaveBeenCalledWith("test-process", { key: "value" }, "chain", undefined);

    // Verify status changed to executed
    const delayed = await testDb.select().from(schema.delayedRuns);
    expect(delayed[0].status).toBe("executed");
  });

  it("passes parent trust tier when starting delayed runs (AC9)", async () => {
    await testDb.insert(schema.delayedRuns).values({
      processSlug: "test-process",
      inputs: {},
      executeAt: new Date(Date.now() - 60000),
      status: "pending",
      parentTrustTier: "supervised",
    });

    await pulseTick();

    expect(startProcessRun).toHaveBeenCalledWith(
      "test-process",
      {},
      "chain",
      { parentTrustTier: "supervised" },
    );
  });

  it("does not pass trust override when no parent tier", async () => {
    await testDb.insert(schema.delayedRuns).values({
      processSlug: "test-process",
      inputs: {},
      executeAt: new Date(Date.now() - 60000),
      status: "pending",
    });

    await pulseTick();

    expect(startProcessRun).toHaveBeenCalledWith(
      "test-process",
      {},
      "chain",
      undefined,
    );
  });

  it("does not start future delayed runs", async () => {
    await testDb.insert(schema.delayedRuns).values({
      processSlug: "test-process",
      inputs: {},
      executeAt: new Date(Date.now() + 3600000), // 1 hour from now
      status: "pending",
    });

    const result = await pulseTick();

    expect(result.delayedRunsStarted).toBe(0);
    expect(startProcessRun).not.toHaveBeenCalled();
  });

  it("does not re-execute already-executed delayed runs", async () => {
    await testDb.insert(schema.delayedRuns).values({
      processSlug: "test-process",
      inputs: {},
      executeAt: new Date(Date.now() - 60000),
      status: "executed",
    });

    const result = await pulseTick();

    expect(result.delayedRunsStarted).toBe(0);
  });
});

// ============================================================
// pulseTick — chain processing
// ============================================================

describe("pulseTick — chain processing", () => {
  it("processes chains for completed runs", async () => {
    await createProcessWithChains(
      [{ trigger: "delay", delay: "1d", process: "follow-up", inputs: {} }],
      { runStatus: "approved", chainsProcessed: false },
    );

    const result = await pulseTick();

    expect(result.chainsProcessed).toBe(1);

    // Verify delayed run was created
    const delayed = await testDb.select().from(schema.delayedRuns);
    expect(delayed).toHaveLength(1);
  });

  it("is idempotent — pulse tick does not re-process chains (AC8)", async () => {
    await createProcessWithChains(
      [{ trigger: "delay", delay: "1d", process: "follow-up", inputs: {} }],
      { runStatus: "approved", chainsProcessed: false },
    );

    await pulseTick();
    await pulseTick();

    // Should still only have 1 delayed run
    const delayed = await testDb.select().from(schema.delayedRuns);
    expect(delayed).toHaveLength(1);
  });
});
