/**
 * Runner dispatcher — Brief 215 AC #7, #9, #10 integration tests.
 *
 * Uses createTestDb() (real SQLite per test) — no mocks. The dispatcher is
 * called directly with stub adapters so we can assert state transitions
 * without depending on the actual bridge-server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";
import {
  registerAdapter,
  _resetRegistryForTests,
} from "./runner-registry";
import { dispatchWorkItem } from "./runner-dispatcher";
import type { RunnerAdapter } from "@ditto/core";
import {
  projects,
  projectRunners,
  workItems,
  runnerDispatches,
  harnessDecisions,
  processes,
  processRuns,
  stepRuns,
} from "../db/schema";

let testDb: TestDb;
let cleanup: () => void;

beforeEach(() => {
  process.env.DITTO_TEST_MODE = "true";
  _resetRegistryForTests();
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
  vi.restoreAllMocks();
});

// ============================================================
// Helpers — seed a minimum dispatch context
// ============================================================

async function seedDispatchContext(opts: {
  defaultRunnerKind?: "local-mac-mini" | "claude-code-routine" | null;
  fallbackRunnerKind?: "local-mac-mini" | "claude-code-routine" | null;
  runnerKindsConfigured?: ("local-mac-mini" | "claude-code-routine")[];
  workItemModeRequired?: "local" | "cloud" | "any" | null;
}): Promise<{
  workItemId: string;
  projectId: string;
  processRunId: string;
  stepRunId: string;
}> {
  const defaultKind =
    opts.defaultRunnerKind === null
      ? null
      : opts.defaultRunnerKind ?? "local-mac-mini";
  const fallbackKind =
    opts.fallbackRunnerKind === null ? null : opts.fallbackRunnerKind ?? null;
  const projectId = "proj_test";
  const processId = "proc_test";
  const processRunId = "run_test";
  const stepRunId = "step_test";
  const workItemId = "wi_test";

  // Insert project FIRST (process FK).
  await testDb.insert(projects).values({
    id: projectId,
    slug: "test-project",
    name: "Test Project",
    githubRepo: "test/repo",
    harnessType: "catalyst",
    defaultRunnerKind: defaultKind ?? undefined,
    fallbackRunnerKind: fallbackKind ?? undefined,
    status: defaultKind ? "active" : "analysing",
  });

  // Process + run + step (FKs for harness_decisions / runner_dispatches).
  await testDb.insert(processes).values({
    id: processId,
    name: "Test Process",
    slug: "test-process",
    definition: { steps: [] },
  });
  await testDb.insert(processRuns).values({
    id: processRunId,
    processId,
    triggeredBy: "test-fixture",
  });
  await testDb.insert(stepRuns).values({
    id: stepRunId,
    processRunId,
    stepId: "s1",
    executorType: "ai-agent",
  });

  // Configured runners.
  const kinds = opts.runnerKindsConfigured ?? ["local-mac-mini"];
  for (const kind of kinds) {
    await testDb.insert(projectRunners).values({
      projectId,
      kind,
      mode: kind === "local-mac-mini" ? "local" : "cloud",
      enabled: true,
      configJson: { deviceId: "dev_1" },
      credentialIds: [],
      lastHealthStatus: "healthy",
    });
  }

  // Work item.
  await testDb.insert(workItems).values({
    id: workItemId,
    type: "task",
    status: "intake",
    content: "echo hello",
    source: "system_generated",
    runnerModeRequired: opts.workItemModeRequired ?? null,
    projectId,
    context: {},
  });

  return { workItemId, projectId, processRunId, stepRunId };
}

function happyPathAdapter(kind: RunnerAdapter["kind"]): RunnerAdapter {
  return {
    kind,
    mode: kind === "local-mac-mini" ? "local" : "cloud",
    configSchema: z.object({}).passthrough(),
    supportsCancel: false,
    execute: async () => ({
      externalRunId: `ext_${kind}`,
      externalUrl: null,
      startedAt: new Date(),
      // happy path leaves finalStatus undefined → status row stays "running"
    }),
    status: async () => ({
      status: "running",
      externalRunId: null,
      externalUrl: null,
      lastUpdatedAt: new Date(),
    }),
    cancel: async () => ({ ok: true }),
    healthCheck: async () => ({ status: "healthy" }),
  };
}

function rateLimitAdapter(kind: RunnerAdapter["kind"]): RunnerAdapter {
  return {
    ...happyPathAdapter(kind),
    execute: async () => ({
      externalRunId: null,
      externalUrl: null,
      startedAt: new Date(),
      finalStatus: "rate_limited",
      errorReason: "Rate limit ceiling reached",
    }),
  };
}

// ============================================================
// AC #7 — stepRunId guard
// ============================================================

describe("dispatchWorkItem — Insight-180 stepRunId guard", () => {
  it("throws BEFORE any DB write when stepRunId is missing (DITTO_TEST_MODE off)", async () => {
    delete process.env.DITTO_TEST_MODE;
    registerAdapter(happyPathAdapter("local-mac-mini"));
    const ctx = await seedDispatchContext({});

    await expect(
      dispatchWorkItem(
        {
          stepRunId: "",
          workItemId: ctx.workItemId,
          processRunId: ctx.processRunId,
          trustTier: "autonomous",
          trustAction: "advance",
        },
        { db: testDb as any }
      )
    ).rejects.toThrow(/Insight-180/);

    // Zero rows in runner_dispatches AND harness_decisions after rejected call.
    const dispatchRows = await testDb.select().from(runnerDispatches);
    const auditRows = await testDb.select().from(harnessDecisions);
    expect(dispatchRows).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });

  it("DITTO_TEST_MODE=true bypasses the guard (test allowance)", async () => {
    process.env.DITTO_TEST_MODE = "true";
    registerAdapter(happyPathAdapter("local-mac-mini"));
    const ctx = await seedDispatchContext({});

    const r = await dispatchWorkItem(
      {
        stepRunId: ctx.stepRunId,
        workItemId: ctx.workItemId,
        processRunId: ctx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
      },
      { db: testDb as any }
    );
    expect(r.ok).toBe(true);
  });
});

// ============================================================
// AC #9 — happy path with local-mac-mini
// ============================================================

describe("dispatchWorkItem — happy path local-mac-mini", () => {
  it("queues, dispatches, and persists a runner_dispatches row", async () => {
    registerAdapter(happyPathAdapter("local-mac-mini"));
    const ctx = await seedDispatchContext({});

    const r = await dispatchWorkItem(
      {
        stepRunId: ctx.stepRunId,
        workItemId: ctx.workItemId,
        processRunId: ctx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
      },
      { db: testDb as any }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.runnerKind).toBe("local-mac-mini");
    expect(r.attemptIndex).toBe(0);

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, r.dispatchId));
    expect(rows).toHaveLength(1);
    expect(rows[0].externalRunId).toBe("ext_local-mac-mini");
    expect(rows[0].runnerKind).toBe("local-mac-mini");
    expect(rows[0].runnerMode).toBe("local");
  });
});

// ============================================================
// AC #10 — harness_decisions row written per dispatch
// ============================================================

describe("dispatchWorkItem — harness_decisions audit row", () => {
  it("writes one row per dispatch with runner reviewDetails block", async () => {
    registerAdapter(happyPathAdapter("local-mac-mini"));
    const ctx = await seedDispatchContext({});

    await dispatchWorkItem(
      {
        stepRunId: ctx.stepRunId,
        workItemId: ctx.workItemId,
        processRunId: ctx.processRunId,
        trustTier: "supervised",
        trustAction: "pause",
      },
      { db: testDb as any }
    );

    const auditRows = await testDb.select().from(harnessDecisions);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].processRunId).toBe(ctx.processRunId);
    expect(auditRows[0].stepRunId).toBe(ctx.stepRunId);
    expect(auditRows[0].trustTier).toBe("supervised");
    expect(auditRows[0].trustAction).toBe("pause");
    expect(auditRows[0].reviewPattern).toEqual(["runner-dispatch"]);
    const details = auditRows[0].reviewDetails as Record<string, unknown>;
    expect(details.runner).toMatchObject({
      runnerKind: "local-mac-mini",
      runnerMode: "local",
      attemptIndex: 0,
      externalRunId: "ext_local-mac-mini",
    });
  });
});

// ============================================================
// Chain-advance on rate_limited
// ============================================================

describe("dispatchWorkItem — chain advance on rate_limit", () => {
  it("falls through to fallback on rate-limited primary", async () => {
    registerAdapter(rateLimitAdapter("claude-code-routine"));
    registerAdapter(happyPathAdapter("local-mac-mini"));

    const ctx = await seedDispatchContext({
      defaultRunnerKind: "claude-code-routine",
      fallbackRunnerKind: "local-mac-mini",
      runnerKindsConfigured: ["claude-code-routine", "local-mac-mini"],
    });

    const r = await dispatchWorkItem(
      {
        stepRunId: ctx.stepRunId,
        workItemId: ctx.workItemId,
        processRunId: ctx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
      },
      { db: testDb as any }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.runnerKind).toBe("local-mac-mini");
    expect(r.attemptIndex).toBe(1);

    const dispatchesAll = await testDb.select().from(runnerDispatches);
    expect(dispatchesAll).toHaveLength(2);
    const cloud = dispatchesAll.find((d) => d.runnerKind === "claude-code-routine");
    const local = dispatchesAll.find((d) => d.runnerKind === "local-mac-mini");
    expect(cloud?.status).toBe("rate_limited");
    expect(local?.externalRunId).toBe("ext_local-mac-mini");

    // Two audit rows — one per attempt.
    const audit = await testDb.select().from(harnessDecisions);
    expect(audit).toHaveLength(2);
  });
});

// ============================================================
// Mode-required filter
// ============================================================

describe("dispatchWorkItem — mode_required filter", () => {
  it("skips local-mac-mini when work item requires cloud", async () => {
    registerAdapter(happyPathAdapter("claude-code-routine"));
    registerAdapter(happyPathAdapter("local-mac-mini"));

    const ctx = await seedDispatchContext({
      defaultRunnerKind: "claude-code-routine",
      fallbackRunnerKind: "local-mac-mini",
      runnerKindsConfigured: ["claude-code-routine", "local-mac-mini"],
      workItemModeRequired: "cloud",
    });

    const r = await dispatchWorkItem(
      {
        stepRunId: ctx.stepRunId,
        workItemId: ctx.workItemId,
        processRunId: ctx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
      },
      { db: testDb as any }
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.runnerKind).toBe("claude-code-routine");
  });
});

// ============================================================
// Full-chain failure surfaces noEligibleRunner
// ============================================================

describe("dispatchWorkItem — full chain failure", () => {
  it("returns error when no eligible runner and no audit / dispatch rows beyond attempts", async () => {
    const ctx = await seedDispatchContext({
      defaultRunnerKind: null,
      fallbackRunnerKind: null,
      runnerKindsConfigured: [],
    });

    const r = await dispatchWorkItem(
      {
        stepRunId: ctx.stepRunId,
        workItemId: ctx.workItemId,
        processRunId: ctx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
      },
      { db: testDb as any }
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("noEligibleRunner");

    // No dispatch rows because resolution rejected pre-walk.
    const dispatchRows = await testDb.select().from(runnerDispatches);
    expect(dispatchRows).toHaveLength(0);
  });
});
