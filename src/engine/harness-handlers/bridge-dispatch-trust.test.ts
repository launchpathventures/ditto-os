/**
 * Brief 212 AC #12 — Trust-tier semantics (4 tiers).
 *
 * Per the constraints table:
 *   supervised        → trustAction='pause' → wire send waits for /review approval
 *   spot_checked-in   → trustAction='sample_pause' → same wait-for-approval
 *   spot_checked-out  → trustAction='sample_advance' → wire send happens
 *   autonomous        → trustAction='advance' → wire send happens
 *   critical          → rejected at tool-resolver BEFORE this function (covered
 *                       by AC #4's bridge-cli.test.ts; not exercised here).
 *
 * Each non-critical tier produces a `harness_decisions` row whose `trustAction`
 * matches the input; advanced tiers result in `wireSent: true` IFF the
 * `sendOverWire` deps callback returns true.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const actualSchema = await vi.importActual<typeof import("../../db/schema")>(
    "../../db/schema",
  );
  return {
    get db() {
      return testDb;
    },
    schema: actualSchema,
  };
});

async function seed(db: TestDb) {
  const { processes, processRuns, stepRuns, bridgeDevices } = await import(
    "../../db/schema"
  );
  const proc = await db
    .insert(processes)
    .values({
      name: "trust-test",
      slug: `t-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      version: 1,
      trustTier: "supervised",
      definition: {},
    })
    .returning();
  const run = await db
    .insert(processRuns)
    .values({ processId: proc[0].id, triggeredBy: "test" })
    .returning();
  const step = await db
    .insert(stepRuns)
    .values({ processRunId: run[0].id, stepId: "s", executorType: "ai-agent" })
    .returning();
  const dev = await db
    .insert(bridgeDevices)
    .values({
      workspaceId: "default",
      deviceName: "Test",
      jwtTokenHash: "h",
      protocolVersion: "1.0.0",
      pairedAt: new Date(),
      lastDialAt: new Date(),
      status: "active",
    })
    .returning();
  return { processRunId: run[0].id, stepRunId: step[0].id, deviceId: dev[0].id };
}

describe("AC #12 — trust-tier dispatcher behavior", () => {
  const ORIGINAL_SECRET = process.env.REVIEW_PAGE_SECRET;
  beforeEach(() => {
    process.env.REVIEW_PAGE_SECRET = "test-secret-for-review-tokens-only";
    const r = createTestDb();
    testDb = r.db;
    cleanup = r.cleanup;
  });
  afterEach(() => {
    cleanup();
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.REVIEW_PAGE_SECRET;
    } else {
      process.env.REVIEW_PAGE_SECRET = ORIGINAL_SECRET;
    }
  });

  it("supervised → trustAction=pause; wire NOT sent; review token minted", async () => {
    const { dispatchBridgeJob } = await import("./bridge-dispatch.js");
    const { harnessDecisions, bridgeJobs } = await import("../../db/schema");
    const fx = await seed(testDb);

    let wireCalled = false;
    const outcome = await dispatchBridgeJob(
      {
        stepRunId: fx.stepRunId,
        processRunId: fx.processRunId,
        trustTier: "supervised",
        trustAction: "pause",
        deviceId: fx.deviceId,
        payload: { kind: "exec", command: "echo", args: ["hi"] },
      },
      {
        sendOverWire: async () => {
          wireCalled = true;
          return true;
        },
        isDeviceOnline: () => true,
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.wireSent).toBe(false);
      expect(outcome.reviewToken).not.toBeNull();
    }
    expect(wireCalled).toBe(false);

    const decisions = await testDb.select().from(harnessDecisions);
    expect(decisions[0].trustAction).toBe("pause");
    expect(decisions[0].trustTier).toBe("supervised");

    const jobs = await testDb.select().from(bridgeJobs);
    expect(jobs[0].state).toBe("queued"); // never advanced past queued
  });

  it("autonomous → trustAction=advance; wire IS sent; no review token", async () => {
    const { dispatchBridgeJob } = await import("./bridge-dispatch.js");
    const { harnessDecisions, bridgeJobs } = await import("../../db/schema");
    const fx = await seed(testDb);

    let wireCalled = false;
    const outcome = await dispatchBridgeJob(
      {
        stepRunId: fx.stepRunId,
        processRunId: fx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
        deviceId: fx.deviceId,
        payload: { kind: "exec", command: "echo", args: ["hi"] },
      },
      {
        sendOverWire: async () => {
          wireCalled = true;
          return true;
        },
        isDeviceOnline: () => true,
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.wireSent).toBe(true);
      expect(outcome.reviewToken).toBeNull();
    }
    expect(wireCalled).toBe(true);

    const decisions = await testDb.select().from(harnessDecisions);
    expect(decisions[0].trustAction).toBe("advance");

    const jobs = await testDb.select().from(bridgeJobs);
    expect(jobs[0].state).toBe("dispatched"); // wire send transitioned it
  });

  it("spot_checked sample_advance → wire sent; no review token", async () => {
    const { dispatchBridgeJob } = await import("./bridge-dispatch.js");
    const { harnessDecisions } = await import("../../db/schema");
    const fx = await seed(testDb);

    let wireCalled = false;
    const outcome = await dispatchBridgeJob(
      {
        stepRunId: fx.stepRunId,
        processRunId: fx.processRunId,
        trustTier: "spot_checked",
        trustAction: "sample_advance",
        deviceId: fx.deviceId,
        payload: { kind: "exec", command: "echo", args: ["hi"] },
      },
      {
        sendOverWire: async () => {
          wireCalled = true;
          return true;
        },
        isDeviceOnline: () => true,
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.wireSent).toBe(true);
      expect(outcome.reviewToken).toBeNull();
    }
    expect(wireCalled).toBe(true);

    const decisions = await testDb.select().from(harnessDecisions);
    expect(decisions[0].trustAction).toBe("sample_advance");
  });

  it("spot_checked sample_pause → wire NOT sent; review token minted", async () => {
    const { dispatchBridgeJob } = await import("./bridge-dispatch.js");
    const { harnessDecisions } = await import("../../db/schema");
    const fx = await seed(testDb);

    let wireCalled = false;
    const outcome = await dispatchBridgeJob(
      {
        stepRunId: fx.stepRunId,
        processRunId: fx.processRunId,
        trustTier: "spot_checked",
        trustAction: "sample_pause",
        deviceId: fx.deviceId,
        payload: { kind: "exec", command: "echo", args: ["hi"] },
      },
      {
        sendOverWire: async () => {
          wireCalled = true;
          return true;
        },
        isDeviceOnline: () => true,
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.wireSent).toBe(false);
      expect(outcome.reviewToken).not.toBeNull();
    }
    expect(wireCalled).toBe(false);

    const decisions = await testDb.select().from(harnessDecisions);
    expect(decisions[0].trustAction).toBe("sample_pause");
  });

  it("autonomous + offline device → trustAction=advance, wireSent=false (queue replay)", async () => {
    const { dispatchBridgeJob } = await import("./bridge-dispatch.js");
    const { bridgeJobs } = await import("../../db/schema");
    const fx = await seed(testDb);

    const outcome = await dispatchBridgeJob(
      {
        stepRunId: fx.stepRunId,
        processRunId: fx.processRunId,
        trustTier: "autonomous",
        trustAction: "advance",
        deviceId: fx.deviceId,
        payload: { kind: "exec", command: "echo", args: ["hi"] },
      },
      {
        // Device offline — sendOverWire returns false.
        sendOverWire: async () => false,
        isDeviceOnline: () => false,
      },
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.wireSent).toBe(false);

    const jobs = await testDb.select().from(bridgeJobs);
    // Routing recognised offline — job parked under primary's queue.
    expect(jobs[0].state).toBe("queued");
    expect(jobs[0].routedAs).toBe("queued_for_primary");
  });
});
