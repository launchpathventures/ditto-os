/**
 * runner-poll-cron tests — Brief 217 AC #6.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTestDb, type TestDb } from "../test-utils";
import { runRunnerPollTick } from "./runner-poll-cron";
import {
  processes,
  processRuns,
  stepRuns,
  projects,
  workItems,
  runnerDispatches,
} from "../db/schema";
import type {
  CancelResult,
  DispatchExecuteContext,
  DispatchResult,
  DispatchStatusSnapshot,
  HealthCheckResult,
  ProjectRef,
  ProjectRunnerRef,
  RunnerAdapter,
  RunnerKind,
  RunnerMode,
  WorkItemRef,
} from "@ditto/core";

let testDb: TestDb;
let cleanup: () => void;

beforeEach(() => {
  process.env.DITTO_TEST_MODE = "true";
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
});

async function seedFixtures() {
  await testDb.insert(processes).values({
    id: "p_01",
    name: "test",
    slug: "p_01",
    description: "test",
    definition: {},
  });
  await testDb.insert(processRuns).values({
    id: "pr_01",
    processId: "p_01",
    status: "running",
    triggeredBy: "test",
  });
  await testDb.insert(stepRuns).values({
    id: "sr_01",
    processRunId: "pr_01",
    stepId: "dispatch",
    status: "running",
    executorType: "rules",
  });
  await testDb.insert(projects).values({
    id: "proj_01",
    name: "p",
    slug: "p",
    harnessType: "catalyst",
    status: "active",
  });
  await testDb.insert(workItems).values({
    id: "wi_01",
    projectId: "proj_01",
    type: "feature",
    title: "T",
    body: "B",
    content: "B",
    source: "system_generated",
    status: "intake",
    briefState: "active",
  });
}

async function seedDispatch(opts: {
  runnerKind: RunnerKind;
  status: "queued" | "dispatched" | "running" | "succeeded";
  externalRunId?: string | null;
  startedAt?: Date | null;
  createdAt?: Date | null;
}): Promise<string> {
  const inserted = await testDb
    .insert(runnerDispatches)
    .values({
      workItemId: "wi_01",
      projectId: "proj_01",
      runnerKind: opts.runnerKind,
      runnerMode: "cloud",
      attemptIndex: 0,
      stepRunId: "sr_01",
      status: opts.status,
      externalRunId: opts.externalRunId ?? null,
      startedAt: opts.startedAt ?? null,
      createdAt: opts.createdAt ?? new Date(),
    })
    .returning({ id: runnerDispatches.id });
  return inserted[0].id;
}

interface FakeAdapterDeps {
  kind: RunnerKind;
  statusFn: (
    dispatchId: string,
    externalRunId: string,
  ) => Promise<DispatchStatusSnapshot>;
}

function fakeAdapter(deps: FakeAdapterDeps): RunnerAdapter {
  const mode: RunnerMode = "cloud";
  return {
    kind: deps.kind,
    mode,
    configSchema: z.object({}),
    supportsCancel: true,
    async execute(
      _ctx: DispatchExecuteContext,
      _wi: WorkItemRef,
      _p: ProjectRef,
      _pr: ProjectRunnerRef,
    ): Promise<DispatchResult> {
      return {
        externalRunId: null,
        externalUrl: null,
        startedAt: new Date(),
        finalStatus: "failed",
      };
    },
    async status(dispatchId: string, externalRunId: string) {
      return deps.statusFn(dispatchId, externalRunId);
    },
    async cancel(): Promise<CancelResult> {
      return { ok: true };
    },
    async healthCheck(): Promise<HealthCheckResult> {
      return { status: "healthy" };
    },
  };
}

describe("runRunnerPollTick — AC #6", () => {
  it("polls a non-terminal claude-managed-agent dispatch and applies a transition", async () => {
    await seedFixtures();
    const dispatchedAt = new Date(Date.now() - 60_000);
    const dispatchId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_x",
      startedAt: dispatchedAt,
      createdAt: dispatchedAt,
    });

    const adapter = fakeAdapter({
      kind: "claude-managed-agent",
      statusFn: async () => ({
        status: "succeeded",
        externalRunId: "session_x",
        externalUrl: "https://platform.claude.com/sessions/session_x",
        lastUpdatedAt: new Date(),
      }),
    });

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => (k === "claude-managed-agent" ? adapter : null),
    });

    const o = outcomes.find((x) => x.dispatchId === dispatchId);
    expect(o).toBeDefined();
    expect(o!.result).toBe("polled");
    expect(o!.transitioned).toEqual({ from: "running", to: "succeeded" });

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].finishedAt).not.toBeNull();
  });

  it("skips a row whose cadence has not yet elapsed", async () => {
    await seedFixtures();
    const veryRecent = new Date(Date.now() - 5_000);
    const dispatchId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_y",
      startedAt: veryRecent,
      createdAt: veryRecent,
    });

    let statusCalls = 0;
    const adapter = fakeAdapter({
      kind: "claude-managed-agent",
      statusFn: async () => {
        statusCalls += 1;
        return {
          status: "running",
          externalRunId: "session_y",
          externalUrl: null,
          lastUpdatedAt: new Date(),
        };
      },
    });

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => (k === "claude-managed-agent" ? adapter : null),
    });
    const o = outcomes.find((x) => x.dispatchId === dispatchId);
    expect(o!.result).toBe("skipped");
    expect(statusCalls).toBe(0);
  });

  it("does NOT poll claude-code-routine rows (Brief 216 deviation — routines aren't in pollCadenceMs)", async () => {
    await seedFixtures();
    const dispatchedAt = new Date(Date.now() - 600_000);
    await seedDispatch({
      runnerKind: "claude-code-routine",
      status: "running",
      externalRunId: "routine_session",
      startedAt: dispatchedAt,
      createdAt: dispatchedAt,
    });
    let statusCalls = 0;
    const adapter = fakeAdapter({
      kind: "claude-code-routine",
      statusFn: async () => {
        statusCalls += 1;
        return {
          status: "succeeded",
          externalRunId: "routine_session",
          externalUrl: null,
          lastUpdatedAt: new Date(),
        };
      },
    });

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => (k === "claude-code-routine" ? adapter : null),
    });
    expect(outcomes.length).toBe(0);
    expect(statusCalls).toBe(0);
  });

  it("ignores terminal-state rows", async () => {
    await seedFixtures();
    const old = new Date(Date.now() - 600_000);
    await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "succeeded",
      externalRunId: "session_done",
      startedAt: old,
      createdAt: old,
    });
    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: () =>
        fakeAdapter({
          kind: "claude-managed-agent",
          statusFn: async () => {
            throw new Error("should not be called");
          },
        }),
    });
    expect(outcomes.length).toBe(0);
  });

  it("survives an adapter throw — emits 'error' outcome and continues with next row", async () => {
    await seedFixtures();
    const old = new Date(Date.now() - 60_000);
    const id1 = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_a",
      startedAt: old,
      createdAt: old,
    });
    const id2 = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_b",
      startedAt: old,
      createdAt: old,
    });

    let calls = 0;
    const adapter = fakeAdapter({
      kind: "claude-managed-agent",
      statusFn: async (dispatchId) => {
        calls += 1;
        if (dispatchId === id1) throw new Error("boom");
        return {
          status: "succeeded",
          externalRunId: "session_b",
          externalUrl: null,
          lastUpdatedAt: new Date(),
        };
      },
    });

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: () => adapter,
    });
    expect(calls).toBe(2);
    const o1 = outcomes.find((o) => o.dispatchId === id1);
    const o2 = outcomes.find((o) => o.dispatchId === id2);
    expect(o1!.result).toBe("error");
    expect(o2!.result).toBe("polled");
    expect(o2!.transitioned).toEqual({ from: "running", to: "succeeded" });
  });

  it("logs and skips when an illegal transition is inferred (idempotency safety)", async () => {
    await seedFixtures();
    const old = new Date(Date.now() - 60_000);
    const dispatchId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "queued",
      externalRunId: "session_c",
      startedAt: old,
      createdAt: old,
    });
    const adapter = fakeAdapter({
      kind: "claude-managed-agent",
      statusFn: async () => ({
        status: "succeeded",
        externalRunId: "session_c",
        externalUrl: null,
        lastUpdatedAt: new Date(),
      }),
    });
    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: () => adapter,
    });
    const o = outcomes.find((x) => x.dispatchId === dispatchId);
    expect(o!.result).toBe("polled");
    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("queued");
  });

  it("returns no-adapter when adapter not registered for the kind", async () => {
    await seedFixtures();
    const old = new Date(Date.now() - 60_000);
    const dispatchId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_d",
      startedAt: old,
      createdAt: old,
    });
    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: () => null,
    });
    const o = outcomes.find((x) => x.dispatchId === dispatchId);
    expect(o!.result).toBe("no-adapter");
  });
});

// ============================================================
// Brief 218 AC #8 — github-action polling (60s cadence)
// ============================================================

describe("runRunnerPollTick — github-action (Brief 218 §D11)", () => {
  it("polls a non-terminal github-action dispatch and applies a transition", async () => {
    await seedFixtures();
    // Cadence is 60s — set startedAt to 65s ago so it elapses.
    const dispatchedAt = new Date(Date.now() - 65_000);
    const dispatchId = await seedDispatch({
      runnerKind: "github-action",
      status: "running",
      externalRunId: "12345",
      startedAt: dispatchedAt,
      createdAt: dispatchedAt,
    });

    const adapter = fakeAdapter({
      kind: "github-action",
      statusFn: async () => ({
        status: "succeeded",
        externalRunId: "12345",
        externalUrl: "https://github.com/owner/agent-crm/actions/runs/12345",
        lastUpdatedAt: new Date(),
      }),
    });

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => (k === "github-action" ? adapter : null),
    });

    const o = outcomes.find((x) => x.dispatchId === dispatchId);
    expect(o).toBeDefined();
    expect(o!.result).toBe("polled");
    expect(o!.transitioned).toEqual({ from: "running", to: "succeeded" });

    const rows = await testDb
      .select()
      .from(runnerDispatches)
      .where(eq(runnerDispatches.id, dispatchId));
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].externalUrl).toBe(
      "https://github.com/owner/agent-crm/actions/runs/12345",
    );
  });

  it("skips a github-action row whose 60s cadence has not yet elapsed", async () => {
    await seedFixtures();
    const veryRecent = new Date(Date.now() - 5_000);
    const dispatchId = await seedDispatch({
      runnerKind: "github-action",
      status: "running",
      externalRunId: "12346",
      startedAt: veryRecent,
      createdAt: veryRecent,
    });

    let statusCalls = 0;
    const adapter = fakeAdapter({
      kind: "github-action",
      statusFn: async () => {
        statusCalls += 1;
        return {
          status: "running",
          externalRunId: "12346",
          externalUrl: null,
          lastUpdatedAt: new Date(),
        };
      },
    });

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => (k === "github-action" ? adapter : null),
    });
    const o = outcomes.find((x) => x.dispatchId === dispatchId);
    expect(o!.result).toBe("skipped");
    expect(statusCalls).toBe(0);
  });

  it("polls both managed-agent + github-action in the same tick (mixed kinds)", async () => {
    await seedFixtures();
    const old = new Date(Date.now() - 120_000);
    const maId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_x",
      startedAt: old,
      createdAt: old,
    });
    const gaId = await seedDispatch({
      runnerKind: "github-action",
      status: "running",
      externalRunId: "98765",
      startedAt: old,
      createdAt: old,
    });

    const adapters: Record<string, RunnerAdapter | null> = {
      "claude-managed-agent": fakeAdapter({
        kind: "claude-managed-agent",
        statusFn: async () => ({
          status: "succeeded",
          externalRunId: "session_x",
          externalUrl: "https://platform.claude.com/sessions/session_x",
          lastUpdatedAt: new Date(),
        }),
      }),
      "github-action": fakeAdapter({
        kind: "github-action",
        statusFn: async () => ({
          status: "succeeded",
          externalRunId: "98765",
          externalUrl: "https://github.com/owner/agent-crm/actions/runs/98765",
          lastUpdatedAt: new Date(),
        }),
      }),
    };

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => adapters[k] ?? null,
    });

    expect(outcomes.find((x) => x.dispatchId === maId)?.result).toBe("polled");
    expect(outcomes.find((x) => x.dispatchId === gaId)?.result).toBe("polled");

    const rows = await testDb.select().from(runnerDispatches);
    const ma = rows.find((r) => r.id === maId);
    const ga = rows.find((r) => r.id === gaId);
    expect(ma?.status).toBe("succeeded");
    expect(ga?.status).toBe("succeeded");
  });

  it("survives github-action adapter throwing — managed-agent rows continue to be polled", async () => {
    await seedFixtures();
    const old = new Date(Date.now() - 120_000);
    const maId = await seedDispatch({
      runnerKind: "claude-managed-agent",
      status: "running",
      externalRunId: "session_x",
      startedAt: old,
      createdAt: old,
    });
    const gaId = await seedDispatch({
      runnerKind: "github-action",
      status: "running",
      externalRunId: "98765",
      startedAt: old,
      createdAt: old,
    });

    const adapters: Record<string, RunnerAdapter | null> = {
      "claude-managed-agent": fakeAdapter({
        kind: "claude-managed-agent",
        statusFn: async () => ({
          status: "succeeded",
          externalRunId: "session_x",
          externalUrl: null,
          lastUpdatedAt: new Date(),
        }),
      }),
      "github-action": fakeAdapter({
        kind: "github-action",
        statusFn: async () => {
          throw new Error("octokit boom");
        },
      }),
    };

    const outcomes = await runRunnerPollTick({
      db: testDb,
      adapterFor: (k) => adapters[k] ?? null,
    });

    expect(outcomes.find((x) => x.dispatchId === maId)?.result).toBe("polled");
    expect(outcomes.find((x) => x.dispatchId === gaId)?.result).toBe("error");
  });
});
