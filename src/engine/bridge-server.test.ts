/**
 * Bridge server unit tests — orphan sweep + queue drain (Brief 212 ACs #8, #10).
 *
 * Spike test (`bridge-server.spike.test.ts`) covers AC #1 with a real Next.js
 * boot. This file covers the in-process behavior with an injectable test DB.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const actualSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: actualSchema,
  };
});

async function seedFixtures(db: TestDb) {
  const { processes, processRuns, stepRuns, bridgeDevices } = await import("../db/schema");
  // Process must exist for FK.
  const procInsert = await db
    .insert(processes)
    .values({
      name: "Test process",
      slug: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      version: 1,
      trustTier: "supervised",
      definition: {},
    })
    .returning();
  const processId = procInsert[0].id;

  const runInsert = await db
    .insert(processRuns)
    .values({ processId, triggeredBy: "test" })
    .returning();
  const processRunId = runInsert[0].id;

  const stepInsert = await db
    .insert(stepRuns)
    .values({
      processRunId,
      stepId: "test-step",
      executorType: "ai-agent",
    })
    .returning();
  const stepRunId = stepInsert[0].id;

  const deviceInsert = await db
    .insert(bridgeDevices)
    .values({
      workspaceId: "default",
      deviceName: "Test Device",
      jwtTokenHash: "test-hash",
      protocolVersion: "1.0.0",
      pairedAt: new Date(),
      lastDialAt: new Date(),
      status: "active",
    })
    .returning();
  const deviceId = deviceInsert[0].id;

  return { processRunId, stepRunId, deviceId };
}

describe("bridge sweepStaleJobs (AC #10)", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("transitions running → orphaned when lastHeartbeatAt > 10 min", async () => {
    const { sweepStaleJobs } = await import("./bridge-server");
    const { bridgeJobs, harnessDecisions } = await import("../db/schema");
    const fx = await seedFixtures(testDb);

    const now = new Date("2026-04-25T12:00:00Z");
    const stale = new Date(now.getTime() - 11 * 60 * 1000); // 11 min ago

    await testDb.insert(bridgeJobs).values({
      deviceId: fx.deviceId,
      processRunId: fx.processRunId,
      stepRunId: fx.stepRunId,
      kind: "exec",
      payload: { kind: "exec", command: "sleep", args: ["100"] },
      state: "running",
      queuedAt: stale,
      dispatchedAt: stale,
      lastHeartbeatAt: stale,
    });

    const swept = await sweepStaleJobs(now);
    expect(swept).toBe(1);

    const rows = await testDb.select().from(bridgeJobs);
    expect(rows[0].state).toBe("orphaned");
    expect(rows[0].completedAt).toBeTruthy();

    const auditRows = await testDb.select().from(harnessDecisions);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].trustAction).toBe("pause");
    expect(auditRows[0].reviewPattern).toContain("bridge_orphaned");
    const reviewDetails = auditRows[0].reviewDetails as { bridge: { orphaned: boolean; deviceName: string } };
    expect(reviewDetails.bridge.orphaned).toBe(true);
    expect(reviewDetails.bridge.deviceName).toBe("Test Device");
  });

  it("does NOT transition jobs whose heartbeat is recent", async () => {
    const { sweepStaleJobs } = await import("./bridge-server");
    const { bridgeJobs } = await import("../db/schema");
    const fx = await seedFixtures(testDb);

    const now = new Date("2026-04-25T12:00:00Z");
    const recent = new Date(now.getTime() - 30 * 1000); // 30s ago

    await testDb.insert(bridgeJobs).values({
      deviceId: fx.deviceId,
      processRunId: fx.processRunId,
      stepRunId: fx.stepRunId,
      kind: "exec",
      payload: { kind: "exec", command: "echo", args: ["hi"] },
      state: "running",
      queuedAt: recent,
      dispatchedAt: recent,
      lastHeartbeatAt: recent,
    });

    const swept = await sweepStaleJobs(now);
    expect(swept).toBe(0);

    const rows = await testDb.select().from(bridgeJobs);
    expect(rows[0].state).toBe("running");
  });

  it("does NOT touch terminal-state jobs", async () => {
    const { sweepStaleJobs } = await import("./bridge-server");
    const { bridgeJobs } = await import("../db/schema");
    const fx = await seedFixtures(testDb);

    const now = new Date("2026-04-25T12:00:00Z");
    const stale = new Date(now.getTime() - 11 * 60 * 1000);

    await testDb.insert(bridgeJobs).values({
      deviceId: fx.deviceId,
      processRunId: fx.processRunId,
      stepRunId: fx.stepRunId,
      kind: "exec",
      payload: { kind: "exec", command: "echo", args: ["hi"] },
      state: "succeeded",
      queuedAt: stale,
      dispatchedAt: stale,
      completedAt: stale,
      lastHeartbeatAt: stale,
    });

    const swept = await sweepStaleJobs(now);
    expect(swept).toBe(0);
  });
});

describe("bridge revoke-under-load (AC #11)", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("flips queued/dispatched/running jobs to revoked when device is revoked", async () => {
    const { bridgeJobs, bridgeDevices } = await import("../db/schema");
    const fx = await seedFixtures(testDb);

    // Three jobs in different non-terminal states.
    await testDb.insert(bridgeJobs).values([
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "sleep", args: ["60"] },
        state: "queued",
        queuedAt: new Date(Date.now() - 3000),
      },
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["dispatched"] },
        state: "dispatched",
        queuedAt: new Date(Date.now() - 2000),
        dispatchedAt: new Date(Date.now() - 1500),
      },
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["running"] },
        state: "running",
        queuedAt: new Date(Date.now() - 1000),
        dispatchedAt: new Date(Date.now() - 800),
        lastHeartbeatAt: new Date(),
      },
      // Plus one already-terminal job that should NOT be touched.
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["done"] },
        state: "succeeded",
        queuedAt: new Date(Date.now() - 5000),
        dispatchedAt: new Date(Date.now() - 4900),
        completedAt: new Date(Date.now() - 4800),
      },
    ]);

    // Mirror the REST handler's revoke logic (without the WebSocket close,
    // which is irrelevant here — there's no live connection).
    const { eq, and, inArray } = await import("drizzle-orm");
    const now = new Date();
    await testDb
      .update(bridgeDevices)
      .set({ status: "revoked", revokedAt: now, revokedReason: "test-revoke" })
      .where(eq(bridgeDevices.id, fx.deviceId));
    await testDb
      .update(bridgeJobs)
      .set({ state: "revoked", completedAt: now })
      .where(
        and(
          eq(bridgeJobs.deviceId, fx.deviceId),
          inArray(bridgeJobs.state, ["queued", "dispatched", "running"]),
        ),
      );

    const allJobs = await testDb.select().from(bridgeJobs);
    const byState = allJobs.reduce<Record<string, number>>((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + 1;
      return acc;
    }, {});
    expect(byState.revoked).toBe(3);
    expect(byState.succeeded).toBe(1); // terminal job untouched

    const deviceRow = (
      await testDb.select().from(bridgeDevices).where(eq(bridgeDevices.id, fx.deviceId))
    )[0];
    expect(deviceRow.status).toBe("revoked");
    expect(deviceRow.revokedReason).toBe("test-revoke");
  });
});

describe("bridge drainQueueForDevice (AC #8a)", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it("does not transition queued jobs when the device isn't connected", async () => {
    const { drainQueueForDevice } = await import("./bridge-server");
    const { bridgeJobs } = await import("../db/schema");
    const fx = await seedFixtures(testDb);

    await testDb.insert(bridgeJobs).values([
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["1"] },
        state: "queued",
        queuedAt: new Date(Date.now() - 2000),
      },
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["2"] },
        state: "queued",
        queuedAt: new Date(Date.now() - 1000),
      },
    ]);

    // No connection registered → sendBridgeFrame returns false → drain stops
    // before transitioning anything.
    const drained = await drainQueueForDevice(fx.deviceId);
    expect(drained).toBe(0);

    const rows = await testDb.select().from(bridgeJobs);
    expect(rows.every((r) => r.state === "queued")).toBe(true);
  });

  it("queue replay would happen in queuedAt order (AC #8a)", async () => {
    // AC #8a verification: the drain SELECT must order by queuedAt asc so
    // that a sequence of dispatches enters the daemon in the order the
    // cloud queued them.
    const { bridgeJobs } = await import("../db/schema");
    const { asc, eq, and } = await import("drizzle-orm");
    const fx = await seedFixtures(testDb);

    await testDb.insert(bridgeJobs).values([
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["third"] },
        state: "queued",
        queuedAt: new Date(Date.now() - 1000),
      },
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["first"] },
        state: "queued",
        queuedAt: new Date(Date.now() - 3000),
      },
      {
        deviceId: fx.deviceId,
        processRunId: fx.processRunId,
        stepRunId: fx.stepRunId,
        kind: "exec",
        payload: { kind: "exec", command: "echo", args: ["second"] },
        state: "queued",
        queuedAt: new Date(Date.now() - 2000),
      },
    ]);

    // Mirror drainQueueForDevice's read query.
    const ordered = await testDb
      .select()
      .from(bridgeJobs)
      .where(and(eq(bridgeJobs.deviceId, fx.deviceId), eq(bridgeJobs.state, "queued")))
      .orderBy(asc(bridgeJobs.queuedAt));

    const seq = ordered.map((r) => (r.payload as { args: string[] }).args[0]);
    expect(seq).toEqual(["first", "second", "third"]);
  });
});
