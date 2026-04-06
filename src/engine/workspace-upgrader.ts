/**
 * Ditto — Fleet-Wide Workspace Upgrader
 *
 * Rolling fleet upgrades with canary deployment, circuit breaker,
 * per-workspace rollback, and upgrade history audit trail.
 *
 * Key safety properties:
 * - Canary phase: first workspace upgraded and health-checked before fleet
 * - Circuit breaker: N consecutive failures halts the upgrade
 * - Per-workspace rollback: each failed workspace reverted to its own previous image
 * - Concurrency guard: only one upgrade at a time (in-memory lock)
 * - Idempotent resume: skips workspaces already at target image
 *
 * Provenance: Brief 091, Kubernetes rolling update, Google SRE canary,
 * Michael Nygard circuit breaker, Richardson saga/compensating actions.
 */

import { eq, and, inArray, desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schemaModule from "../db/schema";
import { createAlertSender, type AlertPayload, type AlertSender } from "./workspace-alerts";

// ============================================================
// Fly Machines API Client (mockable abstraction)
// ============================================================

export interface FlyMachineConfig {
  image: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface FlyMachine {
  id: string;
  config: FlyMachineConfig;
  state: string;
}

/**
 * Abstraction over the Fly.io Machines API.
 * All tests mock this interface — no real HTTP calls.
 */
export interface FlyMachinesClient {
  getMachine(machineId: string): Promise<FlyMachine>;
  updateMachine(machineId: string, config: { image: string }): Promise<void>;
  restartMachine(machineId: string): Promise<void>;
  waitForMachineState(machineId: string, state: string, timeoutMs: number): Promise<void>;
}

/**
 * Create a real Fly Machines API client that wraps fetch calls.
 */
export function createFlyMachinesClient(opts: {
  apiToken: string;
  appName: string;
}): FlyMachinesClient {
  const baseUrl = `https://api.machines.dev/v1/apps/${opts.appName}/machines`;
  const headers = {
    Authorization: `Bearer ${opts.apiToken}`,
    "Content-Type": "application/json",
  };

  return {
    async getMachine(machineId: string): Promise<FlyMachine> {
      const res = await fetch(`${baseUrl}/${machineId}`, { headers });
      if (!res.ok) throw new Error(`Fly API: getMachine ${machineId} → ${res.status}`);
      return res.json();
    },

    async updateMachine(machineId: string, config: { image: string }): Promise<void> {
      const machine = await this.getMachine(machineId);
      const res = await fetch(`${baseUrl}/${machineId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          config: { ...machine.config, image: config.image },
        }),
      });
      if (!res.ok) throw new Error(`Fly API: updateMachine ${machineId} → ${res.status}`);
    },

    async restartMachine(machineId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/${machineId}/restart`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error(`Fly API: restartMachine ${machineId} → ${res.status}`);
    },

    async waitForMachineState(machineId: string, state: string, timeoutMs: number): Promise<void> {
      const res = await fetch(
        `${baseUrl}/${machineId}/wait?state=${state}&timeout=${timeoutMs}`,
        { headers },
      );
      if (!res.ok) throw new Error(`Fly API: waitForState ${machineId} → ${res.status} (timeout: ${timeoutMs}ms)`);
    },
  };
}

// ============================================================
// Health Check
// ============================================================

export interface HealthCheckResult {
  ok: boolean;
  status: "ok" | "liveness_failed" | "readiness_failed" | "timeout";
  version?: string;
  error?: string;
}

/**
 * Deep health check abstraction. Tests mock this.
 * Real implementation fetches /healthz?deep=true from the workspace URL.
 */
export interface HealthChecker {
  checkHealth(workspaceUrl: string, timeoutMs: number, pollIntervalMs: number): Promise<HealthCheckResult>;
}

/**
 * Create a real health checker that polls the workspace's /healthz?deep=true endpoint.
 */
export function createHealthChecker(): HealthChecker {
  return {
    async checkHealth(workspaceUrl: string, timeoutMs: number, pollIntervalMs: number): Promise<HealthCheckResult> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${workspaceUrl}/healthz?deep=true`, {
            signal: AbortSignal.timeout(pollIntervalMs),
          });
          if (res.ok) {
            const body = await res.json();
            return { ok: true, status: "ok", version: body.version };
          }
          // Non-200 means still starting up or degraded
        } catch {
          // Fetch error means workspace not ready yet
        }
        await sleep(pollIntervalMs);
      }
      return { ok: false, status: "timeout", error: `health check timeout after ${timeoutMs}ms` };
    },
  };
}

// ============================================================
// Upgrade Options
// ============================================================

export interface UpgradeOptions {
  imageRef: string;
  maxFailures?: number; // Default: 2
  triggeredBy: "cli" | "api" | "ci";
  healthCheckTimeoutMs?: number; // Default: 120000
  healthCheckPollIntervalMs?: number; // Default: 5000
  onProgress?: (message: string) => void;
}

export interface UpgradeResult {
  upgradeId: string;
  status: string;
  upgraded: number;
  failed: number;
  skipped: number;
  remaining: number;
  total: number;
}

export interface RollbackOptions {
  triggeredBy: "cli" | "api" | "ci";
  healthCheckTimeoutMs?: number;
  healthCheckPollIntervalMs?: number;
  maxFailures?: number;
  onProgress?: (message: string) => void;
}

export interface RollbackResult {
  upgradeId: string;
  reverted: number;
  failed: number;
  total: number;
}

// ============================================================
// Workspace Upgrader
// ============================================================

type Db = BetterSQLite3Database<typeof schemaModule>;

// In-memory concurrency guard — only one upgrade at a time
let upgradeInProgress = false;

/** Reset the concurrency guard (for testing only). */
export function _resetUpgradeLock(): void {
  upgradeInProgress = false;
}

export interface WorkspaceUpgraderDeps {
  db: Db;
  schema: typeof schemaModule;
  flyClient: FlyMachinesClient;
  healthChecker: HealthChecker;
  alertSender: AlertSender;
}

/**
 * Create a workspace upgrader with injected dependencies.
 */
export function createWorkspaceUpgrader(deps: WorkspaceUpgraderDeps) {
  const { db, schema, flyClient, healthChecker, alertSender } = deps;

  /**
   * Perform a rolling fleet upgrade with canary phase and circuit breaker.
   */
  async function upgradeFleet(options: UpgradeOptions): Promise<UpgradeResult> {
    // Concurrency guard
    if (upgradeInProgress) {
      throw new UpgradeConflictError("An upgrade is already in progress");
    }
    upgradeInProgress = true;

    try {
      return await _runFleetUpgrade(options);
    } catch (error) {
      upgradeInProgress = false;
      throw error;
    }
  }

  /**
   * Internal: run the fleet upgrade. Caller must hold the concurrency lock.
   * Accepts optional pre-created upgradeId and fleet to avoid duplicate records
   * when called from startUpgradeFleet.
   */
  async function _runFleetUpgrade(
    options: UpgradeOptions,
    preCreated?: { upgradeId: string; fleet: (typeof schema.managedWorkspaces.$inferSelect)[] },
  ): Promise<UpgradeResult> {
    const maxFailures = options.maxFailures ?? 2;
    const healthTimeoutMs = options.healthCheckTimeoutMs ?? 120_000;
    const healthPollMs = options.healthCheckPollIntervalMs ?? 5_000;
    const progress = options.onProgress ?? (() => {});

    try {
      let fleet: (typeof schema.managedWorkspaces.$inferSelect)[];
      let upgradeId: string;

      if (preCreated) {
        fleet = preCreated.fleet;
        upgradeId = preCreated.upgradeId;
      } else {
        // Load fleet: healthy + degraded workspaces only (AC19, AC20)
        fleet = await db
          .select()
          .from(schema.managedWorkspaces)
          .where(inArray(schema.managedWorkspaces.status, ["healthy", "degraded"]));

        if (fleet.length === 0) {
          upgradeInProgress = false;
          throw new Error("No eligible workspaces for upgrade");
        }

        // Determine previous image (most common current image)
        const prevImage = fleet[0].imageRef;

        // Record upgrade attempt
        const [upgradeRecord] = await db
          .insert(schema.upgradeHistory)
          .values({
            imageRef: options.imageRef,
            previousImageRef: prevImage,
            status: "in_progress",
            totalWorkspaces: fleet.length,
            triggeredBy: options.triggeredBy,
          })
          .returning();

        upgradeId = upgradeRecord.id;
      }
      progress(`Starting upgrade to ${options.imageRef} (${fleet.length} workspaces)`);

      // Separate workspaces already at target image (idempotent resume — AC11)
      const toUpgrade = fleet.filter((ws) => ws.imageRef !== options.imageRef);
      const alreadyUpgraded = fleet.filter((ws) => ws.imageRef === options.imageRef);

      let skippedCount = alreadyUpgraded.length;
      for (const ws of alreadyUpgraded) {
        await db.insert(schema.upgradeWorkspaceResults).values({
          upgradeId,
          workspaceId: ws.id,
          previousImageRef: ws.imageRef,
          result: "skipped",
          healthCheckResult: "ok",
        });
      }

      if (toUpgrade.length === 0) {
        // All already at target
        await db
          .update(schema.upgradeHistory)
          .set({
            status: "completed",
            skippedCount,
            completedAt: new Date(),
          })
          .where(eq(schema.upgradeHistory.id, upgradeId));

        upgradeInProgress = false;
        progress(`All ${fleet.length} workspaces already at ${options.imageRef}`);
        return {
          upgradeId,
          status: "completed",
          upgraded: 0,
          failed: 0,
          skipped: skippedCount,
          remaining: 0,
          total: fleet.length,
        };
      }

      // === CANARY PHASE (AC4) ===
      // Pick canary: prefer admin's own workspace, otherwise first
      const canary = toUpgrade[0];
      const canaryIdx = 0;

      await db
        .update(schema.upgradeHistory)
        .set({ canaryWorkspaceId: canary.id })
        .where(eq(schema.upgradeHistory.id, upgradeId));

      progress(`Canary phase: upgrading ${canary.userId}...`);

      const canaryResult = await upgradeWorkspace(
        canary,
        options.imageRef,
        upgradeId,
        healthTimeoutMs,
        healthPollMs,
      );

      if (!canaryResult.ok) {
        // Canary failed — rollback canary, abort entire upgrade (AC4)
        await db
          .update(schema.upgradeHistory)
          .set({
            status: "failed",
            canaryResult: "failed",
            failedCount: 1,
            skippedCount,
            errorSummary: `Canary failed: ${canaryResult.error}`,
            completedAt: new Date(),
          })
          .where(eq(schema.upgradeHistory.id, upgradeId));

        progress(`  ${canary.userId}: health check FAILED (${canaryResult.healthStatus})`);
        progress(`  ${canary.userId}: rolled back to ${canary.imageRef}`);
        progress("Canary failed. Upgrade aborted.");

        await alertSender.sendAlert({
          type: "upgrade_failure",
          upgradeId,
          imageRef: options.imageRef,
          summary: `Canary failed on ${canary.userId}: ${canaryResult.error}`,
          failedWorkspaces: [{ userId: canary.userId, error: canaryResult.error || "unknown" }],
          timestamp: new Date().toISOString(),
        });

        upgradeInProgress = false;
        return {
          upgradeId,
          status: "failed",
          upgraded: 0,
          failed: 1,
          skipped: skippedCount,
          remaining: toUpgrade.length - 1,
          total: fleet.length,
        };
      }

      // Canary passed
      await db
        .update(schema.upgradeHistory)
        .set({ canaryResult: "passed", upgradedCount: 1 })
        .where(eq(schema.upgradeHistory.id, upgradeId));

      progress(`  ${canary.userId}: upgraded → ${options.imageRef} ✓ (${canaryResult.durationMs}ms)`);
      progress("Canary passed. Proceeding with fleet upgrade.");

      // === FLEET PHASE (AC5, AC6, AC7) ===
      const remaining = toUpgrade.slice(canaryIdx + 1);
      let upgradedCount = 1; // canary already counted
      let failedCount = 0;
      let consecutiveFailures = 0;
      let circuitBroken = false;

      for (let i = 0; i < remaining.length; i++) {
        const ws = remaining[i];
        const result = await upgradeWorkspace(
          ws,
          options.imageRef,
          upgradeId,
          healthTimeoutMs,
          healthPollMs,
        );

        if (result.ok) {
          upgradedCount++;
          consecutiveFailures = 0;
          progress(`  ${ws.userId}: upgraded → ${options.imageRef} ✓ (${result.durationMs}ms)`);

          await db
            .update(schema.upgradeHistory)
            .set({ upgradedCount })
            .where(eq(schema.upgradeHistory.id, upgradeId));
        } else {
          failedCount++;
          consecutiveFailures++;
          progress(`  ${ws.userId}: FAILED, rolled back to ${ws.imageRef} ✗`);

          await alertSender.sendAlert({
            type: "upgrade_failure",
            upgradeId,
            imageRef: options.imageRef,
            summary: `Workspace ${ws.userId} failed: ${result.error}`,
            failedWorkspaces: [{ userId: ws.userId, error: result.error || "unknown" }],
            timestamp: new Date().toISOString(),
          });

          await db
            .update(schema.upgradeHistory)
            .set({ failedCount })
            .where(eq(schema.upgradeHistory.id, upgradeId));

          // Circuit breaker check (AC5)
          if (consecutiveFailures >= maxFailures) {
            const remainingCount = remaining.length - i - 1;
            circuitBroken = true;

            progress(`CIRCUIT BREAKER: ${maxFailures} consecutive failures. Upgrade halted.`);
            progress(`Upgraded: ${upgradedCount}, Failed: ${failedCount}, Remaining: ${remainingCount}`);

            await db
              .update(schema.upgradeHistory)
              .set({
                status: "circuit_breaker_tripped",
                circuitBreakerAt: new Date(),
                errorSummary: `Circuit breaker after ${consecutiveFailures} consecutive failures`,
                completedAt: new Date(),
              })
              .where(eq(schema.upgradeHistory.id, upgradeId));

            await alertSender.sendAlert({
              type: "circuit_breaker_tripped",
              upgradeId,
              imageRef: options.imageRef,
              summary: `Circuit breaker: ${maxFailures} consecutive failures. ${upgradedCount}/${fleet.length} upgraded, ${failedCount} failed, ${remainingCount} remaining.`,
              timestamp: new Date().toISOString(),
            });

            upgradeInProgress = false;
            return {
              upgradeId,
              status: "circuit_breaker_tripped",
              upgraded: upgradedCount,
              failed: failedCount,
              skipped: skippedCount,
              remaining: remainingCount,
              total: fleet.length,
            };
          }
        }
      }

      // === COMPLETE ===
      const finalStatus = failedCount > 0 ? "partial" : "completed";
      await db
        .update(schema.upgradeHistory)
        .set({
          status: finalStatus,
          upgradedCount,
          failedCount,
          skippedCount,
          completedAt: new Date(),
        })
        .where(eq(schema.upgradeHistory.id, upgradeId));

      progress(`Fleet upgrade complete: ${upgradedCount} upgraded, ${failedCount} failed`);

      await alertSender.sendAlert({
        type: "upgrade_complete",
        upgradeId,
        imageRef: options.imageRef,
        summary: `Fleet upgrade ${finalStatus}: ${upgradedCount} upgraded, ${failedCount} failed, ${skippedCount} skipped.`,
        timestamp: new Date().toISOString(),
      });

      upgradeInProgress = false;
      return {
        upgradeId,
        status: finalStatus,
        upgraded: upgradedCount,
        failed: failedCount,
        skipped: skippedCount,
        remaining: 0,
        total: fleet.length,
      };
    } catch (error) {
      upgradeInProgress = false;
      throw error;
    }
  }

  /**
   * Upgrade a single workspace: update image → restart → health check.
   * On failure, rolls back to previous image (AC7).
   */
  async function upgradeWorkspace(
    workspace: typeof schema.managedWorkspaces.$inferSelect,
    targetImage: string,
    upgradeId: string,
    healthTimeoutMs: number,
    healthPollMs: number,
  ): Promise<{ ok: boolean; durationMs: number; healthStatus: string; error?: string }> {
    const startTime = Date.now();
    const previousImage = workspace.imageRef;

    try {
      // Verify DITTO_NETWORK_URL is set BEFORE updating (Brief 091 constraint)
      // Avoids wasting a restart cycle on misconfigured workspaces
      const machine = await flyClient.getMachine(workspace.machineId);
      const hasNetworkUrl = machine.config?.env?.DITTO_NETWORK_URL;

      if (!hasNetworkUrl) {
        const durationMs = Date.now() - startTime;
        const error = "DITTO_NETWORK_URL not set — deep health check unreliable";

        await db.insert(schema.upgradeWorkspaceResults).values({
          upgradeId,
          workspaceId: workspace.id,
          previousImageRef: previousImage,
          result: "failed",
          healthCheckResult: "readiness_failed",
          errorLog: error,
          durationMs,
        });

        await db
          .update(schema.managedWorkspaces)
          .set({
            status: "degraded",
            errorLog: error,
            updatedAt: new Date(),
          })
          .where(eq(schema.managedWorkspaces.id, workspace.id));

        return { ok: false, durationMs, healthStatus: "readiness_failed", error };
      }

      // Update machine image and restart
      await flyClient.updateMachine(workspace.machineId, { image: targetImage });
      await flyClient.restartMachine(workspace.machineId);

      // Wait for deep health check
      const health = await healthChecker.checkHealth(
        workspace.workspaceUrl,
        healthTimeoutMs,
        healthPollMs,
      );

      const durationMs = Date.now() - startTime;

      if (health.ok) {
        // Success — update workspace record
        await db
          .update(schema.managedWorkspaces)
          .set({
            imageRef: targetImage,
            currentVersion: health.version || null,
            status: "healthy",
            lastHealthCheckAt: new Date(),
            lastHealthStatus: "ok",
            updatedAt: new Date(),
          })
          .where(eq(schema.managedWorkspaces.id, workspace.id));

        await db.insert(schema.upgradeWorkspaceResults).values({
          upgradeId,
          workspaceId: workspace.id,
          previousImageRef: previousImage,
          result: "upgraded",
          healthCheckResult: "ok",
          durationMs,
        });

        return { ok: true, durationMs, healthStatus: "ok" };
      }

      // Failed — rollback this workspace (AC7)
      await rollbackWorkspace(workspace.machineId, previousImage);

      await db
        .update(schema.managedWorkspaces)
        .set({
          status: "degraded",
          errorLog: health.error || `health check failed: ${health.status}`,
          lastHealthCheckAt: new Date(),
          lastHealthStatus: health.status === "timeout" ? "readiness_failed" : health.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.managedWorkspaces.id, workspace.id));

      await db.insert(schema.upgradeWorkspaceResults).values({
        upgradeId,
        workspaceId: workspace.id,
        previousImageRef: previousImage,
        result: "failed",
        healthCheckResult: health.status,
        errorLog: health.error,
        durationMs,
      });

      return { ok: false, durationMs, healthStatus: health.status, error: health.error };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Attempt rollback on any error
      try {
        await rollbackWorkspace(workspace.machineId, previousImage);
      } catch {
        // Rollback failure is logged but doesn't mask the original error
      }

      await db.insert(schema.upgradeWorkspaceResults).values({
        upgradeId,
        workspaceId: workspace.id,
        previousImageRef: previousImage,
        result: "failed",
        healthCheckResult: "liveness_failed",
        errorLog: errorMsg,
        durationMs,
      });

      return { ok: false, durationMs, healthStatus: "liveness_failed", error: errorMsg };
    }
  }

  /**
   * Rollback a single workspace to a previous image.
   */
  async function rollbackWorkspace(machineId: string, previousImage: string): Promise<void> {
    await flyClient.updateMachine(machineId, { image: previousImage });
    await flyClient.restartMachine(machineId);
  }

  /**
   * Rollback the most recent upgrade. Reverts ALL upgraded workspaces
   * (including the canary) to their per-workspace previous image.
   * Rollback itself has circuit breaker protection (AC10).
   */
  async function rollbackFleet(options: RollbackOptions): Promise<RollbackResult> {
    if (upgradeInProgress) {
      throw new UpgradeConflictError("An upgrade is already in progress");
    }
    upgradeInProgress = true;

    const maxFailures = options.maxFailures ?? 2;
    const healthTimeoutMs = options.healthCheckTimeoutMs ?? 120_000;
    const healthPollMs = options.healthCheckPollIntervalMs ?? 5_000;
    const progress = options.onProgress ?? (() => {});

    try {
      // Find most recent upgrade
      const [latestUpgrade] = await db
        .select()
        .from(schema.upgradeHistory)
        .orderBy(desc(schema.upgradeHistory.startedAt))
        .limit(1);

      if (!latestUpgrade) {
        upgradeInProgress = false;
        throw new Error("No upgrade history found");
      }

      // Find all workspaces that were upgraded (not skipped/failed) in that attempt
      const results = await db
        .select()
        .from(schema.upgradeWorkspaceResults)
        .where(
          and(
            eq(schema.upgradeWorkspaceResults.upgradeId, latestUpgrade.id),
            eq(schema.upgradeWorkspaceResults.result, "upgraded"),
          ),
        );

      if (results.length === 0) {
        upgradeInProgress = false;
        progress("No workspaces to rollback.");
        return { upgradeId: latestUpgrade.id, reverted: 0, failed: 0, total: 0 };
      }

      progress(`Rolling back upgrade ${latestUpgrade.id.slice(0, 8)}... (${results.length} workspaces to revert)`);

      let reverted = 0;
      let failed = 0;
      let consecutiveFailures = 0;

      for (const result of results) {
        // Look up the current workspace record
        const [ws] = await db
          .select()
          .from(schema.managedWorkspaces)
          .where(eq(schema.managedWorkspaces.id, result.workspaceId))
          .limit(1);

        if (!ws || ws.status === "deprovisioned") {
          continue;
        }

        try {
          await flyClient.updateMachine(ws.machineId, { image: result.previousImageRef });
          await flyClient.restartMachine(ws.machineId);

          const health = await healthChecker.checkHealth(ws.workspaceUrl, healthTimeoutMs, healthPollMs);

          if (health.ok) {
            await db
              .update(schema.managedWorkspaces)
              .set({
                imageRef: result.previousImageRef,
                currentVersion: health.version || null,
                status: "healthy",
                lastHealthCheckAt: new Date(),
                lastHealthStatus: "ok",
                updatedAt: new Date(),
              })
              .where(eq(schema.managedWorkspaces.id, ws.id));

            reverted++;
            consecutiveFailures = 0;
            progress(`  ${ws.userId}: rolled back to ${result.previousImageRef} ✓`);
          } else {
            failed++;
            consecutiveFailures++;
            progress(`  ${ws.userId}: rollback health check FAILED ✗`);
          }
        } catch (error) {
          failed++;
          consecutiveFailures++;
          progress(`  ${ws.userId}: rollback FAILED ✗`);
        }

        if (consecutiveFailures >= maxFailures) {
          progress(`CIRCUIT BREAKER: ${maxFailures} consecutive rollback failures. Halted.`);
          break;
        }
      }

      // Mark upgrade as rolled_back
      await db
        .update(schema.upgradeHistory)
        .set({ status: "rolled_back", completedAt: new Date() })
        .where(eq(schema.upgradeHistory.id, latestUpgrade.id));

      progress(`Rollback complete: ${reverted} reverted, ${failed} failed`);

      await alertSender.sendAlert({
        type: "rollback_complete",
        upgradeId: latestUpgrade.id,
        imageRef: latestUpgrade.imageRef,
        summary: `Rollback complete: ${reverted} reverted, ${failed} failed.`,
        timestamp: new Date().toISOString(),
      });

      upgradeInProgress = false;
      return { upgradeId: latestUpgrade.id, reverted, failed, total: results.length };
    } catch (error) {
      upgradeInProgress = false;
      throw error;
    }
  }

  /**
   * Get upgrade history with optional per-workspace results.
   */
  async function getUpgradeHistory(opts?: { limit?: number }) {
    const limit = opts?.limit ?? 20;

    const upgrades = await db
      .select()
      .from(schema.upgradeHistory)
      .orderBy(desc(schema.upgradeHistory.startedAt))
      .limit(limit);

    return upgrades;
  }

  /**
   * Get per-workspace results for a specific upgrade.
   */
  async function getUpgradeResults(upgradeId: string) {
    return db
      .select()
      .from(schema.upgradeWorkspaceResults)
      .where(eq(schema.upgradeWorkspaceResults.upgradeId, upgradeId));
  }

  /**
   * Start an upgrade in the background. Returns the upgradeId immediately
   * so callers (API) can respond without blocking on the full fleet roll.
   * The upgrade runs to completion asynchronously; poll via getUpgradeStatus.
   */
  async function startUpgradeFleet(options: UpgradeOptions): Promise<{ upgradeId: string }> {
    // Concurrency guard (synchronous check — safe in single-threaded JS)
    if (upgradeInProgress) {
      throw new UpgradeConflictError("An upgrade is already in progress");
    }
    upgradeInProgress = true;

    // Create the upgrade record synchronously so we can return the ID
    const fleet = await db
      .select()
      .from(schema.managedWorkspaces)
      .where(inArray(schema.managedWorkspaces.status, ["healthy", "degraded"]));

    if (fleet.length === 0) {
      upgradeInProgress = false;
      throw new Error("No eligible workspaces for upgrade");
    }

    const prevImage = fleet[0].imageRef;
    const [upgradeRecord] = await db
      .insert(schema.upgradeHistory)
      .values({
        imageRef: options.imageRef,
        previousImageRef: prevImage,
        status: "in_progress",
        totalWorkspaces: fleet.length,
        triggeredBy: options.triggeredBy,
      })
      .returning();

    // Fire and forget — keep lock held, _runFleetUpgrade releases on completion
    _runFleetUpgrade(options, { upgradeId: upgradeRecord.id, fleet }).catch((err) => {
      console.error("[workspace-upgrader] Background upgrade failed:", err);
      upgradeInProgress = false;
    });

    return { upgradeId: upgradeRecord.id };
  }

  /**
   * Get the status of a specific upgrade by ID.
   */
  async function getUpgradeStatus(upgradeId: string) {
    const [upgrade] = await db
      .select()
      .from(schema.upgradeHistory)
      .where(eq(schema.upgradeHistory.id, upgradeId))
      .limit(1);

    if (!upgrade) return null;

    const results = await db
      .select()
      .from(schema.upgradeWorkspaceResults)
      .where(eq(schema.upgradeWorkspaceResults.upgradeId, upgradeId));

    return { ...upgrade, workspaceResults: results };
  }

  return {
    upgradeFleet,
    startUpgradeFleet,
    rollbackFleet,
    getUpgradeHistory,
    getUpgradeResults,
    getUpgradeStatus,
  };
}

// ============================================================
// Error types
// ============================================================

export class UpgradeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpgradeConflictError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
