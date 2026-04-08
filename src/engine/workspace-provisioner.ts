/**
 * Ditto — Workspace Provisioner
 *
 * Provisions and deprovisions managed workspaces on Railway.
 * Uses the Railway GraphQL API for programmatic service lifecycle.
 * Full rollback on any failure — no orphaned infrastructure.
 *
 * The RailwayClient interface is injected for testability. Production uses
 * the real Railway GraphQL API; tests use a mock implementation.
 *
 * Provenance: Brief 090 (original provisioner), Brief 100 (Railway migration),
 * ADR-025 (centralized Network Service), saga/compensating transaction pattern.
 */

import { db as defaultDb, schema } from "../db";
import { eq, and, ne } from "drizzle-orm";
import { createToken, revokeToken } from "./network-api-auth";
import { randomBytes, createHash } from "crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// ============================================================
// Railway GraphQL API Client Interface
// ============================================================

export interface RailwayService {
  id: string;
  name: string;
}

export interface RailwayVolume {
  id: string;
  name: string;
}

export interface RailwayDomain {
  id: string;
  domain: string;
}

export interface RailwayDeployment {
  id: string;
  status: "BUILDING" | "DEPLOYING" | "ACTIVE" | "FAILED" | "CRASHED" | string;
}

/**
 * Abstract Railway API client. Injected for testability.
 */
export interface RailwayClient {
  createService(projectId: string, name: string): Promise<RailwayService>;
  deleteService(serviceId: string): Promise<void>;
  createVolume(serviceId: string, mountPath: string): Promise<RailwayVolume>;
  deleteVolume(volumeId: string): Promise<void>;
  upsertVariables(
    serviceId: string,
    environmentId: string,
    variables: Record<string, string>,
  ): Promise<void>;
  deployService(serviceId: string, environmentId: string): Promise<RailwayDeployment>;
  createDomain(serviceId: string, environmentId: string): Promise<RailwayDomain>;
  getDeploymentStatus(deploymentId: string): Promise<RailwayDeployment>;
  /** Get the default environment ID for a project */
  getEnvironmentId(projectId: string): Promise<string>;
}

// ============================================================
// Production Railway Client (real GraphQL calls)
// ============================================================

export function createRailwayClient(apiToken: string, projectId: string): RailwayClient {
  const endpoint = "https://backboard.railway.com/graphql/v2";

  async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Railway API error: ${response.status} ${response.statusText} — ${body}`);
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Railway GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`);
    }

    return json.data as T;
  }

  return {
    async createService(_projectId, name) {
      const data = await gql<{ serviceCreate: RailwayService }>(
        `mutation($input: ServiceCreateInput!) {
          serviceCreate(input: $input) { id name }
        }`,
        { input: { projectId, name } },
      );
      return data.serviceCreate;
    },

    async deleteService(serviceId) {
      await gql(
        `mutation($id: String!) {
          serviceDelete(id: $id)
        }`,
        { id: serviceId },
      );
    },

    async createVolume(serviceId, mountPath) {
      const data = await gql<{ volumeCreate: RailwayVolume }>(
        `mutation($input: VolumeCreateInput!) {
          volumeCreate(input: $input) { id name }
        }`,
        { input: { projectId, serviceId, mountPath } },
      );
      return data.volumeCreate;
    },

    async deleteVolume(volumeId) {
      await gql(
        `mutation($id: String!) {
          volumeDelete(volumeId: $id)
        }`,
        { id: volumeId },
      );
    },

    async upsertVariables(serviceId, environmentId, variables) {
      await gql(
        `mutation($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input)
        }`,
        {
          input: {
            projectId,
            serviceId,
            environmentId,
            variables,
            skipDeploys: true,
          },
        },
      );
    },

    async deployService(serviceId, environmentId) {
      const data = await gql<{ serviceInstanceDeploy: RailwayDeployment }>(
        `mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId) {
            id status
          }
        }`,
        { serviceId, environmentId },
      );
      return data.serviceInstanceDeploy;
    },

    async createDomain(serviceId, environmentId) {
      const data = await gql<{ serviceDomainCreate: { domain: string; id: string } }>(
        `mutation($serviceId: String!, $environmentId: String!) {
          serviceDomainCreate(serviceId: $serviceId, environmentId: $environmentId) {
            id domain
          }
        }`,
        { serviceId, environmentId },
      );
      return data.serviceDomainCreate;
    },

    async getDeploymentStatus(deploymentId) {
      const data = await gql<{ deployment: RailwayDeployment }>(
        `query($id: String!) {
          deployment(id: $id) { id status }
        }`,
        { id: deploymentId },
      );
      return data.deployment;
    },

    async getEnvironmentId(_projectId) {
      const data = await gql<{
        project: { environments: { edges: Array<{ node: { id: string; name: string } }> } };
      }>(
        `query($id: String!) {
          project(id: $id) {
            environments { edges { node { id name } } }
          }
        }`,
        { id: projectId },
      );
      const envs = data.project.environments.edges;
      const prod = envs.find((e) => e.node.name === "production") ?? envs[0];
      if (!prod) throw new Error("No environments found in Railway project");
      return prod.node.id;
    },
  };
}

// ============================================================
// Provisioner Configuration
// ============================================================

/** Base config shared by provisioning and deprovisioning */
export interface ProvisionerConfigBase {
  railwayClient: RailwayClient;
  projectId: string;
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
  /** Deploy status poll interval in ms (default: 5000) */
  deployPollIntervalMs?: number;
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
  serviceId: string;
  volumeId: string;
  tokenId: string;
  status: "created" | "existing";
  /** @deprecated Use serviceId — kept for backward compat */
  machineId: string;
}

/**
 * Provision a managed workspace for a user on Railway.
 *
 * Idempotent: if a healthy workspace exists, returns its URL.
 * Stale recovery: if a degraded/stale provisioning record exists, cleans up first.
 * Full rollback on any step failure — no orphaned resources.
 *
 * Saga steps: create service → create volume → upsert env vars → deploy →
 * create domain → poll deployment status → deep health check → record in DB.
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
        serviceId: existing.serviceId ?? existing.machineId,
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
    serviceId?: string;
    volumeId?: string;
    tokenId?: string;
    domainId?: string;
    dbRecordId?: string;
  } = {};

  const progress = config.onProgress ?? (() => {});

  try {
    // Step 2: Get environment ID
    progress("Getting environment...");
    const environmentId = await config.railwayClient.getEnvironmentId(config.projectId);
    progress("Getting environment... done");

    // Step 3: Create Railway Service
    progress("Creating service...");
    const serviceName = `ditto-ws-${userId.replace(/[^a-z0-9-]/gi, "-").slice(0, 30)}`;
    const service = await config.railwayClient.createService(config.projectId, serviceName);
    created.serviceId = service.id;
    progress("Creating service... done");

    // Step 4: Create Volume (mount at /data)
    progress("Creating volume...");
    const volume = await config.railwayClient.createVolume(service.id, "/data");
    created.volumeId = volume.id;
    progress("Creating volume... done");

    // Step 5: Generate network token for user
    progress("Creating token...");
    const { token, id: tokenId } = await createToken(userId, { isAdmin: false });
    created.tokenId = tokenId;
    progress("Creating token... done");

    // Step 6: Generate NETWORK_AUTH_SECRET for magic link auth
    const authSecret = randomBytes(32).toString("hex");
    const authSecretHash = createHash("sha256").update(authSecret).digest("hex");

    // Step 7: Upsert env vars (skipDeploys-equivalent: we deploy separately)
    progress("Setting environment variables...");
    await config.railwayClient.upsertVariables(service.id, environmentId, {
      DITTO_NETWORK_URL: config.networkUrl,
      DITTO_NETWORK_TOKEN: token,
      DATABASE_PATH: "/app/data/ditto.db",
      NETWORK_AUTH_SECRET: authSecret,
    });
    progress("Setting environment variables... done");

    // Step 8: Deploy the service
    progress("Deploying service...");
    const deployment = await config.railwayClient.deployService(service.id, environmentId);
    progress("Deploying service... done");

    // Step 9: Create public domain
    progress("Creating domain...");
    const domain = await config.railwayClient.createDomain(service.id, environmentId);
    created.domainId = domain.id;
    const workspaceUrl = `https://${domain.domain}`;
    progress("Creating domain... done");

    // Step 10: Poll deployment status until ACTIVE
    progress("Waiting for deployment...");
    const deployed = await waitForDeployment(
      config.railwayClient,
      deployment.id,
      config.healthCheckTimeoutMs ?? 120_000,
      config.deployPollIntervalMs ?? 5_000,
    );
    if (!deployed) {
      const timeoutSec = Math.round((config.healthCheckTimeoutMs ?? 120_000) / 1000);
      throw new Error(`Deployment failed or timed out after ${timeoutSec}s for workspace ${userId}`);
    }
    progress("Waiting for deployment... active");

    // Step 11: Deep health check — verify application-level health
    progress("Waiting for health check...");
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

    // Step 12: Record in managedWorkspaces table
    const [record] = await database
      .insert(schema.managedWorkspaces)
      .values({
        userId,
        machineId: service.id, // backward compat — store serviceId in dead column
        serviceId: service.id,
        railwayEnvironmentId: environmentId,
        volumeId: volume.id,
        workspaceUrl,
        region: "railway", // Railway manages regions per-project
        imageRef: config.imageRef,
        status: "healthy",
        lastHealthCheckAt: new Date(),
        lastHealthStatus: "ok",
        tokenId,
        authSecretHash,
      })
      .returning({ id: schema.managedWorkspaces.id });
    created.dbRecordId = record.id;

    return {
      workspaceUrl,
      serviceId: service.id,
      machineId: service.id, // backward compat
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
 * Railway cascades volume deletion when the service is deleted.
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
  const serviceId = workspace.serviceId ?? workspace.machineId;

  // Step 2: Delete Service (Railway cascades volume deletion)
  progress("Deleting service...");
  try {
    await config.railwayClient.deleteService(serviceId);
  } catch (error) {
    console.warn(`[provisioner] Failed to delete service ${serviceId}:`, error);
  }
  progress("Deleting service... done");

  // Step 3: Revoke network token
  progress("Revoking token...");
  try {
    await revokeToken(workspace.tokenId);
  } catch (error) {
    console.warn(`[provisioner] Failed to revoke token ${workspace.tokenId}:`, error);
  }
  progress("Revoking token... done");

  // Step 4: Update record
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
  serviceId: string | null;
  region: string;
  imageRef: string;
  lastHealthCheckAt: Date | null;
  lastHealthStatus: string | null;
  createdAt: Date;
  /** @deprecated Use serviceId */
  machineId: string;
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
    serviceId: w.serviceId,
    machineId: w.machineId,
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
    serviceId: workspace.serviceId,
    machineId: workspace.machineId,
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
 * Wait for Railway deployment to reach ACTIVE status.
 * Polls getDeploymentStatus every intervalMs until timeout.
 */
async function waitForDeployment(
  client: RailwayClient,
  deploymentId: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const deployment = await client.getDeploymentStatus(deploymentId);
      if (deployment.status === "ACTIVE") return true;
      if (deployment.status === "FAILED" || deployment.status === "CRASHED") return false;
    } catch {
      // Expected during early deploy — API may not have the deployment yet
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

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
      // Expected during startup — service not ready yet
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
  workspace: { machineId: string; serviceId: string | null; volumeId: string; tokenId: string; id: string },
  database: typeof defaultDb,
): Promise<void> {
  const serviceId = workspace.serviceId ?? workspace.machineId;

  try {
    await config.railwayClient.deleteService(serviceId);
  } catch { /* may already be deleted */ }

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
    serviceId?: string;
    volumeId?: string;
    tokenId?: string;
    domainId?: string;
    dbRecordId?: string;
  },
  database: typeof defaultDb,
): Promise<void> {
  // Reverse order: DB record → service (cascades volume + domain) → token
  if (created.dbRecordId) {
    try {
      await database
        .delete(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.id, created.dbRecordId));
    } catch (e) {
      console.error("[provisioner] Rollback: failed to delete DB record:", e);
    }
  }

  if (created.serviceId) {
    try {
      // Deleting the service cascades volume and domain deletion on Railway
      await config.railwayClient.deleteService(created.serviceId);
    } catch (e) {
      console.error("[provisioner] Rollback: failed to delete service:", e);
    }
  }

  if (created.tokenId) {
    try {
      await revokeToken(created.tokenId);
    } catch (e) {
      console.error("[provisioner] Rollback: failed to revoke token:", e);
    }
  }
}
