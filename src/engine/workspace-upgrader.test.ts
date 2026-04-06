/**
 * Ditto — Workspace Upgrader Tests
 *
 * Tests all safety-critical upgrade paths:
 * - Canary failure aborts entire upgrade
 * - Circuit breaker trips after N consecutive failures
 * - Each failed workspace is individually rolled back
 * - Rollback reverts ALL upgraded workspaces including canary
 * - Single-workspace fleet = canary-only
 * - Concurrent upgrade requests return 409-equivalent error
 * - Idempotent resume skips already-upgraded workspaces
 * - Deprovisioned workspaces excluded from upgrades
 *
 * All tests mock the Fly API — no real HTTP calls.
 *
 * Provenance: Brief 091 acceptance criteria.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import {
  createWorkspaceUpgrader,
  _resetUpgradeLock,
  UpgradeConflictError,
  type FlyMachinesClient,
  type HealthChecker,
  type HealthCheckResult,
  type WorkspaceUpgraderDeps,
} from "./workspace-upgrader";
import type { AlertPayload, AlertSender } from "./workspace-alerts";

// ============================================================
// Test Helpers
// ============================================================

let testDb: ReturnType<typeof createTestDb>;
let db: TestDb;
let alerts: AlertPayload[];
let mockAlertSender: AlertSender;

function createMockFlyClient(overrides?: Partial<FlyMachinesClient>): FlyMachinesClient {
  return {
    getMachine: async (id) => ({
      id,
      config: { image: "old-image", env: { DITTO_NETWORK_URL: "https://network.test" } },
      state: "started",
    }),
    updateMachine: async () => {},
    restartMachine: async () => {},
    waitForMachineState: async () => {},
    ...overrides,
  };
}

function createMockHealthChecker(
  resultFn?: (url: string) => HealthCheckResult,
): HealthChecker {
  return {
    checkHealth: async (url) => {
      if (resultFn) return resultFn(url);
      return { ok: true, status: "ok", version: "0.2.0" };
    },
  };
}

async function insertWorkspace(
  db: TestDb,
  opts: { userId: string } & Partial<Omit<typeof schema.managedWorkspaces.$inferInsert, "userId">>,
) {
  const [ws] = await db
    .insert(schema.managedWorkspaces)
    .values({
      userId: opts.userId,
      machineId: opts.machineId ?? `machine-${opts.userId}`,
      volumeId: opts.volumeId ?? `volume-${opts.userId}`,
      workspaceUrl: opts.workspaceUrl ?? `https://${opts.userId}.fly.dev`,
      imageRef: opts.imageRef ?? "ditto:v0.1.0",
      status: opts.status ?? "healthy",
      tokenId: opts.tokenId ?? `token-${opts.userId}`,
      region: opts.region ?? "syd",
    })
    .returning();
  return ws;
}

function createUpgrader(
  flyClient?: FlyMachinesClient,
  healthChecker?: HealthChecker,
): ReturnType<typeof createWorkspaceUpgrader> {
  return createWorkspaceUpgrader({
    db: db as unknown as WorkspaceUpgraderDeps["db"],
    schema,
    flyClient: flyClient ?? createMockFlyClient(),
    healthChecker: healthChecker ?? createMockHealthChecker(),
    alertSender: mockAlertSender,
  });
}

beforeEach(() => {
  testDb = createTestDb();
  db = testDb.db;
  alerts = [];
  mockAlertSender = {
    sendAlert: async (payload) => { alerts.push(payload); },
  };
  _resetUpgradeLock();
});

afterEach(() => {
  testDb.cleanup();
});

// ============================================================
// Canary Phase Tests
// ============================================================

describe("canary phase", () => {
  test("canary failure aborts entire upgrade — no other workspaces touched", async () => {
    const ws1 = await insertWorkspace(db, { userId: "founder" });
    const ws2 = await insertWorkspace(db, { userId: "user1" });
    const ws3 = await insertWorkspace(db, { userId: "user2" });

    const updateCalls: string[] = [];
    const flyClient = createMockFlyClient({
      updateMachine: async (id) => { updateCalls.push(id); },
    });

    // Canary (first workspace) fails health check
    let callCount = 0;
    const healthChecker = createMockHealthChecker((url) => {
      callCount++;
      return { ok: false, status: "readiness_failed", error: "DB migration failed" };
    });

    const upgrader = createUpgrader(flyClient, healthChecker);
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    expect(result.status).toBe("failed");
    expect(result.upgraded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(2);

    // Only the canary machine was touched (update + restart + rollback update + rollback restart)
    // Other machines' IDs should NOT appear
    expect(updateCalls).toContain(ws1.machineId);
    expect(updateCalls).not.toContain(ws2.machineId);
    expect(updateCalls).not.toContain(ws3.machineId);

    // Canary was rolled back — check upgrade history
    const [upgrade] = await db.select().from(schema.upgradeHistory);
    expect(upgrade.status).toBe("failed");
    expect(upgrade.canaryResult).toBe("failed");
    expect(upgrade.failedCount).toBe(1);

    // Alert was sent
    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("upgrade_failure");
  });

  test("canary passes — fleet phase proceeds", async () => {
    await insertWorkspace(db, { userId: "founder" });
    await insertWorkspace(db, { userId: "user1" });

    const upgrader = createUpgrader();
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    expect(result.status).toBe("completed");
    expect(result.upgraded).toBe(2);
    expect(result.failed).toBe(0);

    const [upgrade] = await db.select().from(schema.upgradeHistory);
    expect(upgrade.canaryResult).toBe("passed");
  });

  test("single-workspace fleet is canary-only — no fleet phase", async () => {
    await insertWorkspace(db, { userId: "solo-user" });

    const upgrader = createUpgrader();
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    // Single workspace = canary only, completes successfully
    expect(result.status).toBe("completed");
    expect(result.upgraded).toBe(1);
    expect(result.total).toBe(1);
    expect(result.remaining).toBe(0);
  });
});

// ============================================================
// Circuit Breaker Tests
// ============================================================

describe("circuit breaker", () => {
  test("trips after 2 consecutive failures (default)", async () => {
    await insertWorkspace(db, { userId: "founder" }); // canary — passes
    await insertWorkspace(db, { userId: "user1" });
    await insertWorkspace(db, { userId: "user2" });
    await insertWorkspace(db, { userId: "user3" });
    await insertWorkspace(db, { userId: "user4" });

    let healthCallCount = 0;
    const healthChecker = createMockHealthChecker((url) => {
      healthCallCount++;
      // Canary passes, all fleet workspaces fail
      if (healthCallCount === 1) {
        return { ok: true, status: "ok", version: "0.2.0" };
      }
      return { ok: false, status: "timeout", error: "health check timeout" };
    });

    const upgrader = createUpgrader(undefined, healthChecker);
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.3.0-bad",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    expect(result.status).toBe("circuit_breaker_tripped");
    expect(result.upgraded).toBe(1); // canary only
    expect(result.failed).toBe(2); // 2 consecutive failures triggered breaker
    expect(result.remaining).toBe(2); // user3, user4 untouched

    // Circuit breaker alert sent
    const cbAlert = alerts.find((a) => a.type === "circuit_breaker_tripped");
    expect(cbAlert).toBeDefined();
  });

  test("configurable --max-failures threshold", async () => {
    await insertWorkspace(db, { userId: "founder" }); // canary passes
    await insertWorkspace(db, { userId: "user1" }); // fails
    await insertWorkspace(db, { userId: "user2" }); // fails
    await insertWorkspace(db, { userId: "user3" }); // fails — would trip at 3
    await insertWorkspace(db, { userId: "user4" }); // untouched

    let healthCallCount = 0;
    const healthChecker = createMockHealthChecker(() => {
      healthCallCount++;
      if (healthCallCount === 1) return { ok: true, status: "ok", version: "0.2.0" };
      return { ok: false, status: "timeout", error: "timeout" };
    });

    const upgrader = createUpgrader(undefined, healthChecker);
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.3.0",
      triggeredBy: "cli",
      maxFailures: 3,
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    expect(result.status).toBe("circuit_breaker_tripped");
    expect(result.failed).toBe(3);
    expect(result.remaining).toBe(1); // user4 untouched
  });

  test("consecutive counter resets on success", async () => {
    await insertWorkspace(db, { userId: "founder" }); // canary passes
    await insertWorkspace(db, { userId: "user1" }); // fails
    await insertWorkspace(db, { userId: "user2" }); // passes (resets counter)
    await insertWorkspace(db, { userId: "user3" }); // fails
    await insertWorkspace(db, { userId: "user4" }); // passes

    let healthCallCount = 0;
    const healthChecker = createMockHealthChecker(() => {
      healthCallCount++;
      // Canary: pass, user1: fail, user2: pass, user3: fail, user4: pass
      if ([1, 3, 5].includes(healthCallCount)) {
        return { ok: true, status: "ok", version: "0.2.0" };
      }
      return { ok: false, status: "timeout", error: "timeout" };
    });

    const upgrader = createUpgrader(undefined, healthChecker);
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    // No circuit breaker because failures are non-consecutive
    expect(result.status).toBe("partial");
    expect(result.upgraded).toBe(3); // founder, user2, user4
    expect(result.failed).toBe(2); // user1, user3
  });
});

// ============================================================
// Per-Workspace Rollback Tests
// ============================================================

describe("per-workspace rollback on failure", () => {
  test("each failed workspace is rolled back to its own previous image", async () => {
    // Workspaces at different versions (e.g., after a partial upgrade)
    await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.1.0" });
    await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.1.5" });

    const rollbackCalls: Array<{ machineId: string; image: string }> = [];
    const flyClient = createMockFlyClient({
      updateMachine: async (id, config) => {
        rollbackCalls.push({ machineId: id, image: config.image });
      },
    });

    // Both fail health check
    const healthChecker = createMockHealthChecker(() => ({
      ok: false,
      status: "readiness_failed",
      error: "migration failed",
    }));

    const upgrader = createUpgrader(flyClient, healthChecker);
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    // Canary fails, upgrade aborts
    expect(result.failed).toBe(1);

    // The rollback call should use the ORIGINAL image, not a global one
    // First call: update to v0.2.0, second call: rollback to v0.1.0
    const founderRollback = rollbackCalls.find(
      (c) => c.machineId === "machine-founder" && c.image === "ditto:v0.1.0",
    );
    expect(founderRollback).toBeDefined();
  });
});

// ============================================================
// Rollback Fleet Tests
// ============================================================

describe("rollbackFleet", () => {
  test("reverts ALL upgraded workspaces including the canary", async () => {
    const ws1 = await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.1.0" });
    const ws2 = await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.1.0" });
    await insertWorkspace(db, { userId: "user2", imageRef: "ditto:v0.1.0" });

    // First do a successful upgrade
    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    // Verify workspaces are now at v0.2.0
    const wsAfterUpgrade = await db.select().from(schema.managedWorkspaces);
    for (const ws of wsAfterUpgrade) {
      expect(ws.imageRef).toBe("ditto:v0.2.0");
    }

    // Now rollback
    _resetUpgradeLock();
    const rollbackResult = await upgrader.rollbackFleet({
      triggeredBy: "cli",
    });

    expect(rollbackResult.reverted).toBe(3); // All 3 including canary
    expect(rollbackResult.failed).toBe(0);

    // Verify workspaces are back to v0.1.0
    const wsAfterRollback = await db.select().from(schema.managedWorkspaces);
    for (const ws of wsAfterRollback) {
      expect(ws.imageRef).toBe("ditto:v0.1.0");
    }

    // Upgrade history marked as rolled_back
    const [upgrade] = await db.select().from(schema.upgradeHistory);
    expect(upgrade.status).toBe("rolled_back");
  });

  test("rollback uses per-workspace previous image, not global", async () => {
    // Different starting versions
    await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.1.0" });
    await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.1.5" });

    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    // Track what images are set during rollback
    const rollbackImages: Array<{ machineId: string; image: string }> = [];
    const flyClient = createMockFlyClient({
      updateMachine: async (id, config) => {
        rollbackImages.push({ machineId: id, image: config.image });
      },
    });

    _resetUpgradeLock();
    const rollbackUpgrader = createWorkspaceUpgrader({
      db: db as unknown as WorkspaceUpgraderDeps["db"],
      schema,
      flyClient,
      healthChecker: createMockHealthChecker(),
      alertSender: mockAlertSender,
    });

    await rollbackUpgrader.rollbackFleet({ triggeredBy: "cli" });

    // Each workspace rolled back to its OWN previous version
    const founderRollback = rollbackImages.find((r) => r.machineId === "machine-founder");
    const user1Rollback = rollbackImages.find((r) => r.machineId === "machine-user1");
    expect(founderRollback?.image).toBe("ditto:v0.1.0");
    expect(user1Rollback?.image).toBe("ditto:v0.1.5");
  });

  test("rollback has circuit breaker protection", async () => {
    await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.1.0" });
    await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.1.0" });
    await insertWorkspace(db, { userId: "user2", imageRef: "ditto:v0.1.0" });

    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    // Rollback with failing health checks
    const healthChecker = createMockHealthChecker(() => ({
      ok: false,
      status: "timeout",
      error: "timeout",
    }));

    _resetUpgradeLock();
    const rollbackUpgrader = createWorkspaceUpgrader({
      db: db as unknown as WorkspaceUpgraderDeps["db"],
      schema,
      flyClient: createMockFlyClient(),
      healthChecker,
      alertSender: mockAlertSender,
    });

    const result = await rollbackUpgrader.rollbackFleet({
      triggeredBy: "cli",
      maxFailures: 2,
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    // Circuit breaker should trip after 2 consecutive failures
    expect(result.failed).toBe(2);
    expect(result.reverted).toBe(0);
  });
});

// ============================================================
// Idempotent Resume Tests
// ============================================================

describe("idempotent resume", () => {
  test("skips workspaces already at target image", async () => {
    // Some already at target, some not
    await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.2.0" }); // already at target
    await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.1.0" });

    const upgrader = createUpgrader();
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    expect(result.skipped).toBe(1); // founder skipped
    expect(result.upgraded).toBe(1); // user1 upgraded
    expect(result.status).toBe("completed");

    // Check workspace results
    const results = await db.select().from(schema.upgradeWorkspaceResults);
    const skipped = results.find((r) => r.result === "skipped");
    const upgraded = results.find((r) => r.result === "upgraded");
    expect(skipped).toBeDefined();
    expect(upgraded).toBeDefined();
  });

  test("all workspaces already at target — completes immediately", async () => {
    await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.2.0" });
    await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.2.0" });

    const upgrader = createUpgrader();
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    expect(result.status).toBe("completed");
    expect(result.skipped).toBe(2);
    expect(result.upgraded).toBe(0);
  });
});

// ============================================================
// Concurrency Guard Tests
// ============================================================

describe("concurrency guard", () => {
  test("concurrent upgrade requests throw UpgradeConflictError", async () => {
    await insertWorkspace(db, { userId: "founder" });

    // Start a slow upgrade
    let resolveHealth: () => void;
    const healthPromise = new Promise<void>((resolve) => {
      resolveHealth = resolve;
    });

    const slowHealthChecker: HealthChecker = {
      checkHealth: async () => {
        await healthPromise;
        return { ok: true, status: "ok", version: "0.2.0" };
      },
    };

    const upgrader = createUpgrader(undefined, slowHealthChecker);

    // Start first upgrade (won't complete yet)
    const upgrade1 = upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    // Try second upgrade immediately
    await expect(
      upgrader.upgradeFleet({
        imageRef: "ditto:v0.3.0",
        triggeredBy: "api",
      }),
    ).rejects.toThrow(UpgradeConflictError);

    // Let the first one finish
    resolveHealth!();
    await upgrade1;
  });
});

// ============================================================
// Deprovisioned Workspace Exclusion Tests
// ============================================================

describe("deprovisioned workspace exclusion", () => {
  test("deprovisioned workspaces are excluded from upgrades", async () => {
    await insertWorkspace(db, { userId: "active-user", status: "healthy" });
    await insertWorkspace(db, { userId: "gone-user", status: "deprovisioned" });

    const upgrader = createUpgrader();
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    // Only the healthy workspace should be in the fleet
    expect(result.total).toBe(1);
    expect(result.upgraded).toBe(1);
  });

  test("degraded workspaces ARE included in upgrades", async () => {
    await insertWorkspace(db, { userId: "healthy-user", status: "healthy" });
    await insertWorkspace(db, { userId: "degraded-user", status: "degraded" });

    const upgrader = createUpgrader();
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    expect(result.total).toBe(2);
    expect(result.upgraded).toBe(2);
  });
});

// ============================================================
// DITTO_NETWORK_URL Verification
// ============================================================

describe("DITTO_NETWORK_URL verification", () => {
  test("workspace without DITTO_NETWORK_URL is rejected before machine update", async () => {
    await insertWorkspace(db, { userId: "misconfigured" });

    const updateCalls: string[] = [];
    const flyClient = createMockFlyClient({
      getMachine: async (id) => ({
        id,
        config: { image: "ditto:v0.1.0", env: {} }, // Missing DITTO_NETWORK_URL
        state: "started",
      }),
      updateMachine: async (id) => { updateCalls.push(id); },
    });

    const upgrader = createUpgrader(flyClient);
    const result = await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    // Should fail because DITTO_NETWORK_URL not set
    expect(result.failed).toBe(1);
    expect(result.upgraded).toBe(0);

    // Machine should NOT have been updated — we bail before touching it
    expect(updateCalls).toHaveLength(0);
  });
});

// ============================================================
// Upgrade History Tests
// ============================================================

describe("upgrade history", () => {
  test("records full upgrade audit trail", async () => {
    await insertWorkspace(db, { userId: "founder" });
    await insertWorkspace(db, { userId: "user1" });

    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "api",
    });

    const history = await upgrader.getUpgradeHistory();
    expect(history.length).toBe(1);
    expect(history[0].imageRef).toBe("ditto:v0.2.0");
    expect(history[0].status).toBe("completed");
    expect(history[0].totalWorkspaces).toBe(2);
    expect(history[0].upgradedCount).toBe(2);
    expect(history[0].triggeredBy).toBe("api");
    expect(history[0].canaryResult).toBe("passed");
    expect(history[0].completedAt).toBeDefined();

    const results = await upgrader.getUpgradeResults(history[0].id);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.result === "upgraded")).toBe(true);
    expect(results.every((r) => r.previousImageRef === "ditto:v0.1.0")).toBe(true);
  });

  test("records per-workspace previous image for rollback", async () => {
    await insertWorkspace(db, { userId: "founder", imageRef: "ditto:v0.1.0" });
    await insertWorkspace(db, { userId: "user1", imageRef: "ditto:v0.1.5" });

    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    const history = await upgrader.getUpgradeHistory();
    const results = await upgrader.getUpgradeResults(history[0].id);

    const founderResult = results.find((r) => r.previousImageRef === "ditto:v0.1.0");
    const user1Result = results.find((r) => r.previousImageRef === "ditto:v0.1.5");
    expect(founderResult).toBeDefined();
    expect(user1Result).toBeDefined();
  });
});

// ============================================================
// Progress Reporting Tests
// ============================================================

describe("real-time progress", () => {
  test("reports each workspace result as it completes", async () => {
    await insertWorkspace(db, { userId: "founder" });
    await insertWorkspace(db, { userId: "user1" });
    await insertWorkspace(db, { userId: "user2" });

    const messages: string[] = [];
    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
      onProgress: (msg) => messages.push(msg),
    });

    expect(messages.some((m) => m.includes("Starting upgrade"))).toBe(true);
    expect(messages.some((m) => m.includes("Canary phase"))).toBe(true);
    expect(messages.some((m) => m.includes("Canary passed"))).toBe(true);
    expect(messages.some((m) => m.includes("Fleet upgrade complete"))).toBe(true);
    // Each workspace should have a progress line
    expect(messages.some((m) => m.includes("founder"))).toBe(true);
    expect(messages.some((m) => m.includes("user1"))).toBe(true);
    expect(messages.some((m) => m.includes("user2"))).toBe(true);
  });
});

// ============================================================
// Alerting Tests
// ============================================================

describe("alerting", () => {
  test("sends alert on canary failure", async () => {
    await insertWorkspace(db, { userId: "founder" });

    const healthChecker = createMockHealthChecker(() => ({
      ok: false,
      status: "readiness_failed",
      error: "schema migration failed",
    }));

    const upgrader = createUpgrader(undefined, healthChecker);
    await upgrader.upgradeFleet({
      imageRef: "ditto:broken",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    expect(alerts.length).toBe(1);
    expect(alerts[0].type).toBe("upgrade_failure");
    expect(alerts[0].failedWorkspaces?.[0].userId).toBe("founder");
  });

  test("sends alert on circuit breaker trip", async () => {
    await insertWorkspace(db, { userId: "founder" }); // canary passes
    await insertWorkspace(db, { userId: "user1" });
    await insertWorkspace(db, { userId: "user2" });

    let callCount = 0;
    const healthChecker = createMockHealthChecker(() => {
      callCount++;
      if (callCount === 1) return { ok: true, status: "ok", version: "0.2.0" };
      return { ok: false, status: "timeout", error: "timeout" };
    });

    const upgrader = createUpgrader(undefined, healthChecker);
    await upgrader.upgradeFleet({
      imageRef: "ditto:bad",
      triggeredBy: "cli",
      healthCheckTimeoutMs: 100,
      healthCheckPollIntervalMs: 10,
    });

    const cbAlert = alerts.find((a) => a.type === "circuit_breaker_tripped");
    expect(cbAlert).toBeDefined();
    expect(cbAlert!.summary).toContain("Circuit breaker");
  });

  test("sends completion alert on successful upgrade", async () => {
    await insertWorkspace(db, { userId: "founder" });

    const upgrader = createUpgrader();
    await upgrader.upgradeFleet({
      imageRef: "ditto:v0.2.0",
      triggeredBy: "cli",
    });

    const completeAlert = alerts.find((a) => a.type === "upgrade_complete");
    expect(completeAlert).toBeDefined();
  });
});

// ============================================================
// No Eligible Workspaces
// ============================================================

describe("edge cases", () => {
  test("throws when no eligible workspaces exist", async () => {
    const upgrader = createUpgrader();
    await expect(
      upgrader.upgradeFleet({ imageRef: "ditto:v0.2.0", triggeredBy: "cli" }),
    ).rejects.toThrow("No eligible workspaces");
  });

  test("provisioning workspaces are excluded", async () => {
    await insertWorkspace(db, { userId: "provisioning-user", status: "provisioning" });

    const upgrader = createUpgrader();
    await expect(
      upgrader.upgradeFleet({ imageRef: "ditto:v0.2.0", triggeredBy: "cli" }),
    ).rejects.toThrow("No eligible workspaces");
  });
});
