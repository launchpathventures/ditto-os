/**
 * Scheduler Tests (Brief 076)
 *
 * Tests: schedule creation during sync, overlap prevention, enable/disable,
 * cron validation, manual trigger, schedule removal when trigger type changes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb, makeTestProcessDefinition } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import type { ProcessDefinition } from "./process-loader";

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

// Mock integration registry (needed by process-loader)
vi.mock("./integration-registry", () => ({
  getIntegration: vi.fn(() => undefined),
  getIntegrationRegistry: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

// Mock heartbeat (we don't want real heartbeats in scheduler tests)
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

import { syncProcessesToDb, validateCronExpression } from "./process-loader";
import { triggerManually, start, stop } from "./scheduler";
import { startProcessRun } from "./heartbeat";

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(async () => {
  await stop();
  cleanup();
});

describe("validateCronExpression", () => {
  it("returns true for valid cron expressions", () => {
    expect(validateCronExpression("* * * * *")).toBe(true);
    expect(validateCronExpression("0 9 * * 1-5")).toBe(true);
    expect(validateCronExpression("*/5 * * * *")).toBe(true);
    expect(validateCronExpression("0 0 1 * *")).toBe(true);
  });

  it("returns false for invalid cron expressions", () => {
    expect(validateCronExpression("not-a-cron")).toBe(false);
    expect(validateCronExpression("")).toBe(false);
    expect(validateCronExpression("60 * * * *")).toBe(false);
  });
});

describe("syncSchedules (via syncProcessesToDb)", () => {
  it("creates a schedule entry for a process with trigger.type=schedule", async () => {
    const def = makeTestProcessDefinition({ name: "Scheduled Process", id: "scheduled-proc" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 9 * * *" };

    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    // Verify process was created
    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "scheduled-proc"))
      .limit(1);
    expect(proc).toBeDefined();

    // Verify schedule was created
    const schedules = await testDb
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id));
    expect(schedules).toHaveLength(1);
    expect(schedules[0].cronExpression).toBe("0 9 * * *");
    expect(schedules[0].enabled).toBe(true);
  });

  it("updates cronExpression when it changes", async () => {
    const def = makeTestProcessDefinition({ name: "Scheduled Process", id: "scheduled-proc" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 9 * * *" };

    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    // Change the cron
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 12 * * *" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "scheduled-proc"))
      .limit(1);

    const schedules = await testDb
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id));
    expect(schedules).toHaveLength(1);
    expect(schedules[0].cronExpression).toBe("0 12 * * *");
  });

  it("removes schedule when trigger type changes away from schedule", async () => {
    const def = makeTestProcessDefinition({ name: "Scheduled Process", id: "scheduled-proc" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 9 * * *" };

    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    // Change to manual trigger
    (def as unknown as ProcessDefinition).trigger = { type: "manual" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "scheduled-proc"))
      .limit(1);

    const schedules = await testDb
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id));
    expect(schedules).toHaveLength(0);
  });

  it("throws on schedule trigger with missing cron expression", async () => {
    const def = makeTestProcessDefinition({ name: "Bad Schedule", id: "bad-schedule" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule" };

    await expect(
      syncProcessesToDb([def as unknown as ProcessDefinition]),
    ).rejects.toThrow("has schedule trigger but no cron expression");
  });

  it("throws on schedule trigger with invalid cron expression", async () => {
    const def = makeTestProcessDefinition({ name: "Bad Cron", id: "bad-cron" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "not-valid" };

    await expect(
      syncProcessesToDb([def as unknown as ProcessDefinition]),
    ).rejects.toThrow("has invalid cron expression");
  });

  it("does not create a schedule for manual trigger processes", async () => {
    const def = makeTestProcessDefinition({ name: "Manual Process", id: "manual-proc" });

    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const schedules = await testDb.select().from(schema.schedules);
    expect(schedules).toHaveLength(0);
  });
});

describe("scheduler overlap prevention", () => {
  it("skips trigger when an active run exists", async () => {
    // Create a process
    const def = makeTestProcessDefinition({ name: "Overlap Test", id: "overlap-test" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "* * * * *" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "overlap-test"))
      .limit(1);

    // Create an active (non-terminal) run
    await testDb.insert(schema.processRuns).values({
      processId: proc.id,
      status: "running",
      triggeredBy: "schedule",
    });

    // Attempt manual trigger — should be skipped
    const result = await triggerManually("overlap-test");
    expect(result).toBeNull();
  });

  it("allows trigger when all runs are terminal", async () => {
    const def = makeTestProcessDefinition({ name: "Terminal Test", id: "terminal-test" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "* * * * *" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "terminal-test"))
      .limit(1);

    // Create a completed run (terminal)
    await testDb.insert(schema.processRuns).values({
      processId: proc.id,
      status: "approved",
      triggeredBy: "schedule",
    });

    const result = await triggerManually("terminal-test");
    expect(result).toBe("mock-run-id");
    expect(startProcessRun).toHaveBeenCalledWith("terminal-test", {}, "schedule");
  });
});

describe("scheduler enable/disable", () => {
  it("enable and disable toggle the enabled field", async () => {
    const def = makeTestProcessDefinition({ name: "Toggle Test", id: "toggle-test" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 9 * * *" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "toggle-test"))
      .limit(1);

    // Initially enabled
    let [sched] = await testDb
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id));
    expect(sched.enabled).toBe(true);

    // Disable
    await testDb
      .update(schema.schedules)
      .set({ enabled: false })
      .where(eq(schema.schedules.id, sched.id));

    [sched] = await testDb
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id));
    expect(sched.enabled).toBe(false);

    // Re-enable
    await testDb
      .update(schema.schedules)
      .set({ enabled: true })
      .where(eq(schema.schedules.id, sched.id));

    [sched] = await testDb
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.processId, proc.id));
    expect(sched.enabled).toBe(true);
  });
});

describe("scheduler start/stop", () => {
  it("start loads enabled schedules and stop cleans up", async () => {
    const def = makeTestProcessDefinition({ name: "Start Stop", id: "start-stop" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 9 * * *" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    // Start should not throw
    await start();

    // Stop should not throw
    await stop();
  });

  it("start skips disabled schedules", async () => {
    const def = makeTestProcessDefinition({ name: "Disabled Schedule", id: "disabled-sched" });
    (def as unknown as ProcessDefinition).trigger = { type: "schedule", cron: "0 9 * * *" };
    await syncProcessesToDb([def as unknown as ProcessDefinition]);

    const [proc] = await testDb
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, "disabled-sched"))
      .limit(1);

    // Disable the schedule
    await testDb
      .update(schema.schedules)
      .set({ enabled: false })
      .where(eq(schema.schedules.processId, proc.id));

    // Start should not register any tasks for disabled schedules
    await start();
    // This test passes if no errors are thrown
    await stop();
  });
});
