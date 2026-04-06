/**
 * Ditto — Workspace Provisioner
 *
 * Provisions and deprovisions managed workspaces on Fly.io.
 * Uses the Fly Machines API for programmatic container lifecycle.
 * Full rollback on any failure — no orphaned infrastructure.
 *
 * The FlyClient interface is injected for testability. Production uses
 * the real Fly Machines API; tests use a mock implementation.
 *
 * Provenance: Brief 090, ADR-025 (centralized Network Service),
 * Fly.io Machines API patterns, saga/compensating transaction pattern.
 */

import { db as defaultDb, schema } from "../db";
import { eq, and, ne } from "drizzle-orm";
import { createToken, revokeToken } from "./network-api-auth";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// ============================================================
// Fly.io Machines API Client Interface
// ============================================================

export interface FlyVolume {
  id: string;
  name: string;
  region: string;
  size_gb: number;
  state: string;
}

export interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region: string;
  instance_id: string;
}

export interface FlyMachineConfig {
  image: string;
  env: Record<string, string>;
  guest: { cpu_kind: string; cpus: number; memory_mb: number };
  mounts: Array<{ volume: string; path: string }>;
  services: Array<{
    ports: Array<{ port: number; handlers: string[] }>;
    protocol: string;
    internal_port: number;
  }>;
  auto_destroy: boolean;
}

/**
 * Abstract Fly.io API client. Injected for testability.
 */
export interface FlyClient {
  createVolume(appName: string, name: string, region: string, sizeGb: number): Promise<FlyVolume>;
  destroyVolume(appName: string, volumeId: string): Promise<void>;
  createMachine(appName: string, name: string, config: FlyMachineConfig, region: string): Promise<FlyMachine>;
  startMachine(appName: string, machineId: string): Promise<void>;
  stopMachine(appName: string, machineId: string, signal?: string, timeoutSeconds?: number): Promise<void>;
  destroyMachine(appName: string, machineId: string, force?: boolean): Promise<void>;
  waitForMachine(appName: string, machineId: string, state: string, timeoutSeconds: number): Promise<void>;
}

// ============================================================
// Production Fly Client (real HTTP calls)
// ============================================================

export function createFlyClient(apiToken: string): FlyClient {
  const baseUrl = "https://api.machines.dev/v1";

  async function flyFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Fly API error: ${response.status} ${response.statusText} — ${body}`);
    }

    return response;
  }

  return {
    async createVolume(appName, name, region, sizeGb) {
      const res = await flyFetch(`/apps/${appName}/volumes`, {
        method: "POST",
        body: JSON.stringify({ name, region, size_gb: sizeGb }),
      });
      return res.json();
    },

    async destroyVolume(appName, volumeId) {
      await flyFetch(`/apps/${appName}/volumes/${volumeId}`, { method: "DELETE" });
    },

    async createMachine(appName, name, config, region) {
      const res = await flyFetch(`/apps/${appName}/machines`, {
        method: "POST",
        body: JSON.stringify({ name, config, region }),
      });
      return res.json();
    },

    async startMachine(appName, machineId) {
      await flyFetch(`/apps/${appName}/machines/${machineId}/start`, { method: "POST" });
    },

    async stopMachine(appName, machineId, signal = "SIGTERM", timeoutSeconds = 30) {
      await flyFetch(`/apps/${appName}/machines/${machineId}/stop`, {
        method: "POST",
        body: JSON.stringify({ signal, timeout: timeoutSeconds }),
      });
    },

    async destroyMachine(appName, machineId, force = false) {
      await flyFetch(`/apps/${appName}/machines/${machineId}?force=${force}`, { method: "DELETE" });
    },

    async waitForMachine(appName, machineId, state, timeoutSeconds) {
      await flyFetch(
        `/apps/${appName}/machines/${machineId}/wait?state=${state}&timeout=${timeoutSeconds}`,
      );
    },
  };
}

// ============================================================
// Provisioner Configuration
// ============================================================

/** Base config shared by provisioning and deprovisioning */
export interface ProvisionerConfigBase {
  flyClient: FlyClient;
  flyAppName: string;
  flyRegion: string;
  db?: typeof defaultDb;
  /** Progress callback — called at each step */
  onProgress?: (message: string) => void;
}

/** Full config for provisioning (imageRef and networkUrl required) */
export interface ProvisionerConfig extends ProvisionerConfigBase {
  imageRef: string;
  networkUrl: string;
  /** Health check timeout in ms (default: 120000) */
  healthCheckTimeoutMs?: number;
  /** Health check poll interval in ms (default: 5000) */
  healthCheckIntervalMs?: number;
}

// ============================================================
// Rate Limiting (in-memory, per-token, 10 req/min)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(tokenId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tokenId);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(tokenId, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 10) {
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================
// Provisioning
// ============================================================

export interface ProvisionResult {
  workspaceUrl: string;
  machineId: string;
  volumeId: string;
  tokenId: string;
  status: "created" | "existing";
}

/**
 * Provision a managed workspace for a user.
 *
 * Idempotent: if a healthy workspace exists, returns its URL.
 * Stale recovery: if a degraded/stale provisioning record exists, cleans up first.
 * Full rollback on any step failure — no orphaned resources.
 */
export async function provisionWorkspace(
  userId: string,
  config: ProvisionerConfig,
): Promise<ProvisionResult> {
  const database = config.db ?? defaultDb;

  // Step 1: Check idempotency
  const [existing] = await database
    .select()
    .from(schema.managedWorkspaces)
    .where(eq(schema.managedWorkspaces.userId, userId))
    .limit(1);

  if (existing) {
    if (existing.status === "healthy") {
      return {
        workspaceUrl: existing.workspaceUrl,
        machineId: existing.machineId,
        volumeId: existing.volumeId,
        tokenId: existing.tokenId,
        status: "existing",
      };
    }

    // Stale recovery: clean up degraded or stale provisioning records
    if (existing.status === "degraded" || existing.status === "provisioning") {
      await cleanupResources(config, existing, database);
    }
  }

  // Track created resources for rollback
  const created: {
    volumeId?: string;
    tokenId?: string;
    machineId?: string;
    dbRecordId?: string;
  } = {};

  const progress = config.onProgress ?? (() => {});

  try {
    // Step 2: Create Fly Volume
    progress("Creating volume...");
    const volumeName = `ditto-data-${userId.replace(/[^a-z0-9-]/gi, "-").slice(0, 30)}`;
    const volume = await config.flyClient.createVolume(
      config.flyAppName,
      volumeName,
      config.flyRegion,
      1,
    );
    created.volumeId = volume.id;
    progress("Creating volume... done");

    // Step 3: Generate network token for user
    progress("Creating token...");
    const { token, id: tokenId } = await createToken(userId, { isAdmin: false });
    created.tokenId = tokenId;
    progress("Creating token... done");

    // Step 4: Create Fly Machine
    progress("Creating machine...");
    const machineName = `ditto-ws-${userId.replace(/[^a-z0-9-]/gi, "-").slice(0, 30)}`;
    const workspaceUrl = `https://${machineName}.fly.dev`;

    const machineConfig: FlyMachineConfig = {
      image: config.imageRef,
      env: {
        DITTO_NETWORK_URL: config.networkUrl,
        DITTO_NETWORK_TOKEN: token,
        DATABASE_PATH: "/app/data/ditto.db",
      },
      guest: {
        cpu_kind: "shared",
        cpus: 1,
        memory_mb: 512,
      },
      mounts: [{ volume: volume.id, path: "/app/data" }],
      services: [
        {
          ports: [
            { port: 80, handlers: ["http"] },
            { port: 443, handlers: ["tls", "http"] },
          ],
          protocol: "tcp",
          internal_port: 3000,
        },
      ],
      auto_destroy: false,
    };

    const machine = await config.flyClient.createMachine(
      config.flyAppName,
      machineName,
      machineConfig,
      config.flyRegion,
    );
    created.machineId = machine.id;
    progress("Creating machine... done");

    // Step 5: Start machine and wait for deep health check
    progress("Waiting for health check...");
    await config.flyClient.startMachine(config.flyAppName, machine.id);

    const healthy = await waitForDeepHealth(
      workspaceUrl,
      config.healthCheckTimeoutMs ?? 120_000,
      config.healthCheckIntervalMs ?? 5_000,
    );
    if (!healthy) {
      const timeoutSec = Math.round((config.healthCheckTimeoutMs ?? 120_000) / 1000);
      throw new Error(`Health check failed after ${timeoutSec}s for workspace ${userId}`);
    }
    progress("Waiting for health check... ok (seed imported, network reachable)");

    // Verify DITTO_NETWORK_URL is present in machine config
    if (!machineConfig.env.DITTO_NETWORK_URL) {
      throw new Error("DITTO_NETWORK_URL not set in machine config — deep checks would degrade to shallow");
    }

    // Step 6: Record in managedWorkspaces table
    const [record] = await database
      .insert(schema.managedWorkspaces)
      .values({
        userId,
        machineId: machine.id,
        volumeId: volume.id,
        workspaceUrl,
        region: config.flyRegion,
        imageRef: config.imageRef,
        status: "healthy",
        lastHealthCheckAt: new Date(),
        lastHealthStatus: "ok",
        tokenId,
      })
      .returning({ id: schema.managedWorkspaces.id });
    created.dbRecordId = record.id;

    return {
      workspaceUrl,
      machineId: machine.id,
      volumeId: volume.id,
      tokenId,
      status: "created",
    };
  } catch (error) {
    // Rollback in reverse order
    await rollback(config, created, database);
    throw error;
  }
}

// ============================================================
// Deprovisioning
// ============================================================

export interface DeprovisionResult {
  userId: string;
  status: "deprovisioned";
}

/**
 * Deprovision a managed workspace. Destructive — deletes all workspace data.
 */
export async function deprovisionWorkspace(
  userId: string,
  config: ProvisionerConfigBase,
): Promise<DeprovisionResult> {
  const database = config.db ?? defaultDb;

  const [workspace] = await database
    .select()
    .from(schema.managedWorkspaces)
    .where(eq(schema.managedWorkspaces.userId, userId))
    .limit(1);

  if (!workspace) {
    throw new Error(`No managed workspace found for user: ${userId}`);
  }

  if (workspace.status === "deprovisioned") {
    throw new Error(`Workspace for user ${userId} is already deprovisioned`);
  }

  const progress = config.onProgress ?? (() => {});

  // Step 2: Stop Machine (graceful: SIGTERM, 30s timeout)
  progress("Stopping machine...");
  try {
    await config.flyClient.stopMachine(config.flyAppName, workspace.machineId, "SIGTERM", 30);
  } catch (error) {
    console.warn(`[provisioner] Failed to stop machine ${workspace.machineId}:`, error);
  }
  progress("Stopping machine... done");

  // Step 3: Destroy Machine
  progress("Destroying machine...");
  try {
    await config.flyClient.destroyMachine(config.flyAppName, workspace.machineId, true);
  } catch (error) {
    console.warn(`[provisioner] Failed to destroy machine ${workspace.machineId}:`, error);
  }
  progress("Destroying machine... done");

  // Step 4: Destroy Volume
  progress("Destroying volume...");
  try {
    await config.flyClient.destroyVolume(config.flyAppName, workspace.volumeId);
  } catch (error) {
    console.warn(`[provisioner] Failed to destroy volume ${workspace.volumeId}:`, error);
  }
  progress("Destroying volume... done");

  // Step 5: Revoke network token
  progress("Revoking token...");
  try {
    await revokeToken(workspace.tokenId);
  } catch (error) {
    console.warn(`[provisioner] Failed to revoke token ${workspace.tokenId}:`, error);
  }
  progress("Revoking token... done");

  // Step 6: Update record
  await database
    .update(schema.managedWorkspaces)
    .set({
      status: "deprovisioned",
      deprovisionedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.managedWorkspaces.id, workspace.id));

  return { userId, status: "deprovisioned" };
}

// ============================================================
// Fleet Status
// ============================================================

export interface FleetWorkspace {
  id: string;
  userId: string;
  workspaceUrl: string;
  status: string;
  currentVersion: string | null;
  region: string;
  imageRef: string;
  lastHealthCheckAt: Date | null;
  lastHealthStatus: string | null;
  createdAt: Date;
}

/**
 * Get fleet status — all managed workspaces.
 */
export async function getFleetStatus(
  database?: typeof defaultDb,
): Promise<FleetWorkspace[]> {
  const db = database ?? defaultDb;

  const workspaces = await db
    .select()
    .from(schema.managedWorkspaces)
    .where(ne(schema.managedWorkspaces.status, "deprovisioned"));

  return workspaces.map((w) => ({
    id: w.id,
    userId: w.userId,
    workspaceUrl: w.workspaceUrl,
    status: w.status,
    currentVersion: w.currentVersion,
    region: w.region,
    imageRef: w.imageRef,
    lastHealthCheckAt: w.lastHealthCheckAt,
    lastHealthStatus: w.lastHealthStatus,
    createdAt: w.createdAt,
  }));
}

/**
 * Get workspace status for a specific user.
 */
export async function getWorkspaceStatus(
  userId: string,
  database?: typeof defaultDb,
): Promise<FleetWorkspace | null> {
  const db = database ?? defaultDb;

  const [workspace] = await db
    .select()
    .from(schema.managedWorkspaces)
    .where(eq(schema.managedWorkspaces.userId, userId))
    .limit(1);

  if (!workspace) return null;

  return {
    id: workspace.id,
    userId: workspace.userId,
    workspaceUrl: workspace.workspaceUrl,
    status: workspace.status,
    currentVersion: workspace.currentVersion,
    region: workspace.region,
    imageRef: workspace.imageRef,
    lastHealthCheckAt: workspace.lastHealthCheckAt,
    lastHealthStatus: workspace.lastHealthStatus,
    createdAt: workspace.createdAt,
  };
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Wait for deep health check to pass.
 * Polls GET /healthz?deep=true every intervalMs until timeout.
 */
async function waitForDeepHealth(
  workspaceUrl: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${workspaceUrl}/healthz?deep=true`, {
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const body = await res.json();
        if (body.status === "ok") {
          return true;
        }
      }
    } catch {
      // Expected during startup — machine not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Clean up resources from a stale or degraded workspace record.
 */
async function cleanupResources(
  config: ProvisionerConfigBase,
  workspace: { machineId: string; volumeId: string; tokenId: string; id: string },
  database: typeof defaultDb,
): Promise<void> {
  try {
    await config.flyClient.stopMachine(config.flyAppName, workspace.machineId);
  } catch { /* may already be stopped */ }

  try {
    await config.flyClient.destroyMachine(config.flyAppName, workspace.machineId, true);
  } catch { /* may already be destroyed */ }

  try {
    await config.flyClient.destroyVolume(config.flyAppName, workspace.volumeId);
  } catch { /* may already be destroyed */ }

  try {
    await revokeToken(workspace.tokenId);
  } catch { /* may already be revoked */ }

  await database
    .delete(schema.managedWorkspaces)
    .where(eq(schema.managedWorkspaces.id, workspace.id));
}

/**
 * Rollback created resources in reverse order on provisioning failure.
 */
async function rollback(
  config: ProvisionerConfigBase,
  created: {
    volumeId?: string;
    tokenId?: string;
    machineId?: string;
    dbRecordId?: string;
  },
  database: typeof defaultDb,
): Promise<void> {
  // Reverse order: DB record → machine → token → volume
  if (created.dbRecordId) {
    try {
      await database
        .delete(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.id, created.dbRecordId));
    } catch (e) {
      console.error("[provisioner] Rollback: failed to delete DB record:", e);
    }
  }

  if (created.machineId) {
    try {
      await config.flyClient.stopMachine(config.flyAppName, created.machineId);
    } catch { /* may not be running */ }

    try {
      await config.flyClient.destroyMachine(config.flyAppName, created.machineId, true);
    } catch (e) {
      console.error("[provisioner] Rollback: failed to destroy machine:", e);
    }
  }

  if (created.tokenId) {
    try {
      await revokeToken(created.tokenId);
    } catch (e) {
      console.error("[provisioner] Rollback: failed to revoke token:", e);
    }
  }

  if (created.volumeId) {
    try {
      await config.flyClient.destroyVolume(config.flyAppName, created.volumeId);
    } catch (e) {
      console.error("[provisioner] Rollback: failed to destroy volume:", e);
    }
  }
}
