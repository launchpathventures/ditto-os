/**
 * Tests for workspace provisioner (Railway).
 * Uses a mock RailwayClient — no real Railway API calls.
 *
 * Provenance: Brief 090 AC 5-8, 12, 16. Brief 100 (Railway migration).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import type {
  RailwayClient,
  RailwayService,
  RailwayVolume,
  RailwayDomain,
  RailwayDeployment,
  ProvisionerConfig,
} from "./workspace-provisioner";

// ============================================================
// Mock Railway Client
// ============================================================

function createMockRailwayClient(overrides: Partial<RailwayClient> = {}): RailwayClient & {
  services: Map<string, RailwayService>;
  volumes: Map<string, RailwayVolume>;
  calls: string[];
  lastUpsertedVariables: Record<string, string> | null;
} {
  const services = new Map<string, RailwayService>();
  const volumes = new Map<string, RailwayVolume>();
  const calls: string[] = [];
  let serviceCounter = 0;
  let volumeCounter = 0;

  return {
    services,
    volumes,
    calls,
    lastUpsertedVariables: null as Record<string, string> | null,

    async getEnvironmentId() {
      calls.push("getEnvironmentId");
      return "env_prod_1";
    },

    async createService(_projectId, name) {
      calls.push("createService");
      const svc: RailwayService = {
        id: `svc_${++serviceCounter}`,
        name,
      };
      services.set(svc.id, svc);
      return svc;
    },

    async deleteService(serviceId) {
      calls.push("deleteService");
      services.delete(serviceId);
    },

    async createVolume(serviceId, mountPath) {
      calls.push("createVolume");
      const vol: RailwayVolume = {
        id: `vol_${++volumeCounter}`,
        name: `volume-${serviceId}`,
      };
      volumes.set(vol.id, vol);
      return vol;
    },

    async deleteVolume(volumeId) {
      calls.push("deleteVolume");
      volumes.delete(volumeId);
    },

    async upsertVariables(_serviceId: string, _envId: string, variables: Record<string, string>) {
      calls.push("upsertVariables");
      this.lastUpsertedVariables = variables;
    },

    async deployService(serviceId, environmentId) {
      calls.push("deployService");
      return { id: `deploy_1`, status: "ACTIVE" } as RailwayDeployment;
    },

    async createDomain(serviceId, environmentId) {
      calls.push("createDomain");
      const name = Array.from(services.values()).find((s) => s.id === serviceId)?.name ?? serviceId;
      return { id: `dom_1`, domain: `${name}.up.railway.app` } as RailwayDomain;
    },

    async getDeploymentStatus(deploymentId) {
      calls.push("getDeploymentStatus");
      return { id: deploymentId, status: "ACTIVE" } as RailwayDeployment;
    },

    ...overrides,
  };
}

// ============================================================
// Mock network-api-auth
// ============================================================

let tokenCounter = 0;
const mockTokens = new Map<string, { userId: string; isAdmin: boolean; revoked: boolean }>();

vi.mock("./network-api-auth", () => ({
  createToken: async (userId: string, options?: { isAdmin?: boolean }) => {
    const id = `tok_${++tokenCounter}`;
    const token = `dnt_test_${tokenCounter}`;
    mockTokens.set(id, { userId, isAdmin: options?.isAdmin ?? false, revoked: false });
    return { token, id };
  },
  revokeToken: async (tokenId: string) => {
    const t = mockTokens.get(tokenId);
    if (t) {
      t.revoked = true;
      return true;
    }
    return false;
  },
}));

// Mock global fetch for health checks
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("workspace-provisioner", () => {
  let db: TestDb;
  let cleanup: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;

    // Reset mocks
    mockFetch.mockReset();
    tokenCounter = 0;
    mockTokens.clear();

    // Default: health check succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", db: "connected", seed: "imported", network: "reachable" }),
    });
  });

  afterEach(() => {
    cleanup();
  });

  function makeConfig(railwayClient: RailwayClient, overrides: Partial<ProvisionerConfig> = {}): ProvisionerConfig {
    return {
      railwayClient,
      projectId: "proj_test_1",
      imageRef: "ghcr.io/ditto/workspace:latest",
      networkUrl: "https://ditto-network.up.railway.app",
      db: db as unknown as typeof import("../db").db,
      healthCheckTimeoutMs: 500,
      healthCheckIntervalMs: 50,
      deployPollIntervalMs: 50,
      ...overrides,
    };
  }

  // ============================================================
  // Provisioning
  // ============================================================

  describe("provisionWorkspace", () => {
    it("provisions a new workspace end-to-end", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      const result = await provisionWorkspace("user-1", config);

      expect(result.status).toBe("created");
      expect(result.workspaceUrl).toBe("https://ditto-ws-user-1.up.railway.app");
      expect(result.serviceId).toBe("svc_1");
      expect(result.volumeId).toBe("vol_1");
      expect(result.tokenId).toBe("tok_1");

      // Verify DB record
      const [record] = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"))
        .limit(1);

      expect(record).toBeDefined();
      expect(record.status).toBe("healthy");
      expect(record.serviceId).toBe("svc_1");
      expect(record.machineId).toBe("svc_1"); // backward compat
      expect(record.volumeId).toBe("vol_1");
      expect(record.railwayEnvironmentId).toBe("env_prod_1");
      expect(record.authSecretHash).toBeDefined();
      expect(record.authSecretHash!.length).toBe(64); // SHA-256 hex
      expect(record.imageRef).toBe("ghcr.io/ditto/workspace:latest");

      // Verify Railway API call order
      expect(railwayClient.calls).toEqual([
        "getEnvironmentId",
        "createService",
        "createVolume",
        "upsertVariables",
        "deployService",
        "createDomain",
        "getDeploymentStatus",
      ]);
    });

    it("returns existing workspace if healthy (idempotent)", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      // First provision
      const first = await provisionWorkspace("user-1", config);
      expect(first.status).toBe("created");

      // Reset calls
      railwayClient.calls.length = 0;

      // Second provision — should be idempotent
      const second = await provisionWorkspace("user-1", config);
      expect(second.status).toBe("existing");
      expect(second.workspaceUrl).toBe(first.workspaceUrl);

      // No Railway API calls should have been made
      expect(railwayClient.calls).toHaveLength(0);
    });

    it("cleans up stale provisioning record before re-provisioning", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      // Insert a degraded record
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "old-svc",
        serviceId: "old-svc",
        volumeId: "old-vol",
        workspaceUrl: "https://old.up.railway.app",
        region: "railway",
        imageRef: "old-image",
        status: "degraded",
        tokenId: "old-tok",
      });

      const result = await provisionWorkspace("user-1", config);

      expect(result.status).toBe("created");

      // Old record should be deleted and new one created
      const records = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"));

      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("healthy");
      expect(records[0].serviceId).toBe("svc_1");
    });

    it("cleans up stale 'provisioning' record before re-provisioning", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      // Insert a stale provisioning record (e.g. previous attempt crashed)
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "stale-svc",
        serviceId: "stale-svc",
        volumeId: "stale-vol",
        workspaceUrl: "https://stale.up.railway.app",
        region: "railway",
        imageRef: "stale-image",
        status: "provisioning",
        tokenId: "stale-tok",
      });

      const result = await provisionWorkspace("user-1", config);

      expect(result.status).toBe("created");

      // Stale record should be replaced with new healthy one
      const records = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"));

      expect(records).toHaveLength(1);
      expect(records[0].status).toBe("healthy");
      expect(records[0].serviceId).toBe("svc_1");

      // Cleanup calls should include stale resource teardown
      expect(railwayClient.calls).toContain("deleteService");
    });

    it("rolls back all resources on health check failure", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");

      // Make health check always fail
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ status: "error" }),
      });

      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      await expect(provisionWorkspace("user-1", config)).rejects.toThrow(
        "Health check failed after",
      );

      // Verify rollback happened — service deleted (cascades volume)
      expect(railwayClient.calls).toContain("deleteService");

      // Service should be cleaned up
      expect(railwayClient.services.size).toBe(0);

      // Token should be revoked
      const tokenEntry = Array.from(mockTokens.values())[0];
      expect(tokenEntry?.revoked).toBe(true);

      // No DB record should remain
      const records = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"));
      expect(records).toHaveLength(0);
    }, 15_000);

    it("rolls back on service creation failure", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");

      const railwayClient = createMockRailwayClient({
        createService: async () => {
          throw new Error("Service creation failed");
        },
      });
      const config = makeConfig(railwayClient);

      await expect(provisionWorkspace("user-1", config)).rejects.toThrow(
        "Service creation failed",
      );

      // Nothing should have been created
      const records = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"));
      expect(records).toHaveLength(0);
    });

    it("rolls back on volume creation failure", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");

      const railwayClient = createMockRailwayClient({
        createVolume: async () => {
          throw new Error("Volume creation failed");
        },
      });
      const config = makeConfig(railwayClient);

      await expect(provisionWorkspace("user-1", config)).rejects.toThrow(
        "Volume creation failed",
      );

      // Service should be cleaned up by rollback
      expect(railwayClient.services.size).toBe(0);
    });
  });

  // ============================================================
  // Deprovisioning
  // ============================================================

  describe("deprovisionWorkspace", () => {
    it("deprovisions an existing workspace", async () => {
      const { provisionWorkspace, deprovisionWorkspace } = await import(
        "./workspace-provisioner"
      );
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      // Provision first
      await provisionWorkspace("user-1", config);
      railwayClient.calls.length = 0;

      // Deprovision
      const result = await deprovisionWorkspace("user-1", config);

      expect(result.status).toBe("deprovisioned");
      expect(result.userId).toBe("user-1");

      // Verify Railway calls — service delete cascades volume
      expect(railwayClient.calls).toContain("deleteService");

      // Verify DB record updated
      const [record] = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"))
        .limit(1);

      expect(record.status).toBe("deprovisioned");
      expect(record.deprovisionedAt).toBeTruthy();
    });

    it("throws for non-existent workspace", async () => {
      const { deprovisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      await expect(deprovisionWorkspace("nonexistent", config)).rejects.toThrow(
        "No managed workspace found",
      );
    });

    it("throws for already deprovisioned workspace", async () => {
      const { deprovisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      // Insert a deprovisioned record
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "svc-1",
        serviceId: "svc-1",
        volumeId: "vol-1",
        workspaceUrl: "https://test.up.railway.app",
        region: "railway",
        imageRef: "test-image",
        status: "deprovisioned",
        tokenId: "tok-1",
        deprovisionedAt: new Date(),
      });

      await expect(deprovisionWorkspace("user-1", config)).rejects.toThrow(
        "already deprovisioned",
      );
    });
  });

  // ============================================================
  // Fleet Status
  // ============================================================

  describe("getFleetStatus", () => {
    it("returns all non-deprovisioned workspaces with serviceId", async () => {
      const { getFleetStatus } = await import("./workspace-provisioner");

      // Insert workspaces
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "svc-1",
        serviceId: "svc-1",
        volumeId: "vol-1",
        workspaceUrl: "https://ws1.up.railway.app",
        region: "railway",
        imageRef: "img:1",
        status: "healthy",
        tokenId: "tok-1",
      });

      await db.insert(schema.managedWorkspaces).values({
        userId: "user-2",
        machineId: "svc-2",
        serviceId: "svc-2",
        volumeId: "vol-2",
        workspaceUrl: "https://ws2.up.railway.app",
        region: "railway",
        imageRef: "img:1",
        status: "deprovisioned",
        tokenId: "tok-2",
        deprovisionedAt: new Date(),
      });

      const fleet = await getFleetStatus(db as unknown as typeof import("../db").db);

      expect(fleet).toHaveLength(1);
      expect(fleet[0].userId).toBe("user-1");
      expect(fleet[0].status).toBe("healthy");
      expect(fleet[0].serviceId).toBe("svc-1");
    });
  });

  // ============================================================
  // Rate Limiting
  // ============================================================

  describe("checkRateLimit", () => {
    it("allows up to 10 requests per minute", async () => {
      const { checkRateLimit } = await import("./workspace-provisioner");

      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit("admin-1")).toBe(true);
      }

      // 11th should be rejected
      expect(checkRateLimit("admin-1")).toBe(false);
    });

    it("different tokens have independent limits", async () => {
      const { checkRateLimit } = await import("./workspace-provisioner");

      for (let i = 0; i < 10; i++) {
        checkRateLimit("admin-a");
      }

      // admin-b should still work
      expect(checkRateLimit("admin-b")).toBe(true);
    });
  });

  // ============================================================
  // Self-hosted unaffected
  // ============================================================

  describe("self-hosted unaffected", () => {
    it("getWorkspaceStatus returns null for non-managed users", async () => {
      const { getWorkspaceStatus } = await import("./workspace-provisioner");

      const status = await getWorkspaceStatus(
        "self-hosted-user",
        db as unknown as typeof import("../db").db,
      );

      expect(status).toBeNull();
    });
  });

  // ============================================================
  // Brief 153: WORKSPACE_OWNER_EMAIL env var + status update
  // ============================================================

  describe("Brief 153 wiring", () => {
    it("includes WORKSPACE_OWNER_EMAIL in env vars when ownerEmail is provided", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient, { ownerEmail: "alice@example.com" });

      await provisionWorkspace("user-owner-1", config);

      expect(railwayClient.lastUpsertedVariables).toBeDefined();
      expect(railwayClient.lastUpsertedVariables!.WORKSPACE_OWNER_EMAIL).toBe("alice@example.com");
      expect(railwayClient.lastUpsertedVariables!.DITTO_NETWORK_URL).toBe("https://ditto-network.up.railway.app");
    });

    it("omits WORKSPACE_OWNER_EMAIL when ownerEmail is not provided", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient);

      await provisionWorkspace("user-no-owner-1", config);

      expect(railwayClient.lastUpsertedVariables).toBeDefined();
      expect(railwayClient.lastUpsertedVariables!.WORKSPACE_OWNER_EMAIL).toBeUndefined();
    });

    it("updates networkUsers.status to 'workspace' after successful provisioning", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const railwayClient = createMockRailwayClient();
      const config = makeConfig(railwayClient, { ownerEmail: "status-test@example.com" });

      // Create a network user first
      const userId = "user-status-update-1";
      await db.insert(schema.networkUsers).values({
        id: userId,
        email: "status-test@example.com",
        name: "Status Test User",
        status: "active",
      });

      const result = await provisionWorkspace(userId, config);
      expect(result.status).toBe("created");

      // Verify the user status was updated
      const [updatedUser] = await db
        .select()
        .from(schema.networkUsers)
        .where(eq(schema.networkUsers.id, userId))
        .limit(1);

      expect(updatedUser.status).toBe("workspace");
      expect(updatedUser.workspaceId).toBeDefined();
      expect(updatedUser.workspaceAcceptedAt).toBeDefined();
    });
  });
});
