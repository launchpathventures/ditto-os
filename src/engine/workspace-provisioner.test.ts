/**
 * Tests for workspace provisioner.
 * Uses a mock FlyClient — no real Fly.io API calls.
 *
 * Provenance: Brief 090 AC 5-8, 12, 16.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import type {
  FlyClient,
  FlyVolume,
  FlyMachine,
  ProvisionerConfig,
} from "./workspace-provisioner";

// ============================================================
// Mock Fly Client
// ============================================================

function createMockFlyClient(overrides: Partial<FlyClient> = {}): FlyClient & {
  volumes: Map<string, FlyVolume>;
  machines: Map<string, FlyMachine>;
  calls: string[];
} {
  const volumes = new Map<string, FlyVolume>();
  const machines = new Map<string, FlyMachine>();
  const calls: string[] = [];
  let volumeCounter = 0;
  let machineCounter = 0;

  return {
    volumes,
    machines,
    calls,

    async createVolume(_appName, name, region, sizeGb) {
      calls.push("createVolume");
      const vol: FlyVolume = {
        id: `vol_${++volumeCounter}`,
        name,
        region,
        size_gb: sizeGb,
        state: "created",
      };
      volumes.set(vol.id, vol);
      return vol;
    },

    async destroyVolume(_appName, volumeId) {
      calls.push("destroyVolume");
      volumes.delete(volumeId);
    },

    async createMachine(_appName, name, _config, region) {
      calls.push("createMachine");
      const machine: FlyMachine = {
        id: `mach_${++machineCounter}`,
        name,
        state: "created",
        region,
        instance_id: `inst_${machineCounter}`,
      };
      machines.set(machine.id, machine);
      return machine;
    },

    async startMachine(_appName, machineId) {
      calls.push("startMachine");
      const m = machines.get(machineId);
      if (m) m.state = "started";
    },

    async stopMachine(_appName, machineId) {
      calls.push("stopMachine");
      const m = machines.get(machineId);
      if (m) m.state = "stopped";
    },

    async destroyMachine(_appName, machineId) {
      calls.push("destroyMachine");
      machines.delete(machineId);
    },

    async waitForMachine() {
      calls.push("waitForMachine");
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

  function makeConfig(flyClient: FlyClient, overrides: Partial<ProvisionerConfig> = {}): ProvisionerConfig {
    return {
      flyClient,
      flyAppName: "ditto-test",
      flyRegion: "syd",
      imageRef: "registry.fly.io/ditto:latest",
      networkUrl: "https://ditto-network.fly.dev",
      db: db as unknown as typeof import("../db").db,
      healthCheckTimeoutMs: 500,
      healthCheckIntervalMs: 50,
      ...overrides,
    };
  }

  // ============================================================
  // Provisioning
  // ============================================================

  describe("provisionWorkspace", () => {
    it("provisions a new workspace end-to-end", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      const result = await provisionWorkspace("user-1", config);

      expect(result.status).toBe("created");
      expect(result.workspaceUrl).toBe("https://ditto-ws-user-1.fly.dev");
      expect(result.machineId).toBe("mach_1");
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
      expect(record.machineId).toBe("mach_1");
      expect(record.volumeId).toBe("vol_1");
      expect(record.region).toBe("syd");
      expect(record.imageRef).toBe("registry.fly.io/ditto:latest");

      // Verify Fly API call order
      expect(flyClient.calls).toEqual([
        "createVolume",
        "createMachine",
        "startMachine",
      ]);
    });

    it("returns existing workspace if healthy (idempotent)", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      // First provision
      const first = await provisionWorkspace("user-1", config);
      expect(first.status).toBe("created");

      // Reset fly calls
      flyClient.calls.length = 0;

      // Second provision — should be idempotent
      const second = await provisionWorkspace("user-1", config);
      expect(second.status).toBe("existing");
      expect(second.workspaceUrl).toBe(first.workspaceUrl);

      // No Fly API calls should have been made
      expect(flyClient.calls).toHaveLength(0);
    });

    it("cleans up stale provisioning record before re-provisioning", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      // Insert a degraded record
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "old-mach",
        volumeId: "old-vol",
        workspaceUrl: "https://old.fly.dev",
        region: "syd",
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
      expect(records[0].machineId).toBe("mach_1");
    });

    it("cleans up stale 'provisioning' record before re-provisioning", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      // Insert a stale provisioning record (e.g. previous attempt crashed)
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "stale-mach",
        volumeId: "stale-vol",
        workspaceUrl: "https://stale.fly.dev",
        region: "syd",
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
      expect(records[0].machineId).toBe("mach_1");

      // Cleanup calls should include stale resource teardown
      expect(flyClient.calls).toContain("stopMachine");
      expect(flyClient.calls).toContain("destroyMachine");
      expect(flyClient.calls).toContain("destroyVolume");
    });

    it("rolls back all resources on health check failure", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");

      // Make health check always fail
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ status: "error" }),
      });

      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      await expect(provisionWorkspace("user-1", config)).rejects.toThrow(
        "Health check failed after",
      );

      // Verify rollback happened
      expect(flyClient.calls).toContain("stopMachine");
      expect(flyClient.calls).toContain("destroyMachine");
      expect(flyClient.calls).toContain("destroyVolume");

      // Volume and machine should be cleaned up
      expect(flyClient.volumes.size).toBe(0);
      expect(flyClient.machines.size).toBe(0);

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

    it("rolls back on volume creation failure", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");

      const flyClient = createMockFlyClient({
        createVolume: async () => {
          throw new Error("Volume creation failed");
        },
      });
      const config = makeConfig(flyClient);

      await expect(provisionWorkspace("user-1", config)).rejects.toThrow(
        "Volume creation failed",
      );

      // Nothing should have been created
      const records = await db
        .select()
        .from(schema.managedWorkspaces)
        .where(eq(schema.managedWorkspaces.userId, "user-1"));
      expect(records).toHaveLength(0);
    });

    it("rolls back on machine creation failure", async () => {
      const { provisionWorkspace } = await import("./workspace-provisioner");

      const flyClient = createMockFlyClient({
        createMachine: async () => {
          throw new Error("Machine creation failed");
        },
      });
      const config = makeConfig(flyClient);

      await expect(provisionWorkspace("user-1", config)).rejects.toThrow(
        "Machine creation failed",
      );

      // Volume should be cleaned up
      expect(flyClient.volumes.size).toBe(0);

      // Token should be revoked
      const tokenEntry = Array.from(mockTokens.values())[0];
      expect(tokenEntry?.revoked).toBe(true);
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
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      // Provision first
      await provisionWorkspace("user-1", config);
      flyClient.calls.length = 0;

      // Deprovision
      const result = await deprovisionWorkspace("user-1", config);

      expect(result.status).toBe("deprovisioned");
      expect(result.userId).toBe("user-1");

      // Verify Fly calls
      expect(flyClient.calls).toContain("stopMachine");
      expect(flyClient.calls).toContain("destroyMachine");
      expect(flyClient.calls).toContain("destroyVolume");

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
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      await expect(deprovisionWorkspace("nonexistent", config)).rejects.toThrow(
        "No managed workspace found",
      );
    });

    it("throws for already deprovisioned workspace", async () => {
      const { deprovisionWorkspace } = await import("./workspace-provisioner");
      const flyClient = createMockFlyClient();
      const config = makeConfig(flyClient);

      // Insert a deprovisioned record
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "mach-1",
        volumeId: "vol-1",
        workspaceUrl: "https://test.fly.dev",
        region: "syd",
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
    it("returns all non-deprovisioned workspaces", async () => {
      const { getFleetStatus } = await import("./workspace-provisioner");

      // Insert workspaces
      await db.insert(schema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "mach-1",
        volumeId: "vol-1",
        workspaceUrl: "https://ws1.fly.dev",
        region: "syd",
        imageRef: "img:1",
        status: "healthy",
        tokenId: "tok-1",
      });

      await db.insert(schema.managedWorkspaces).values({
        userId: "user-2",
        machineId: "mach-2",
        volumeId: "vol-2",
        workspaceUrl: "https://ws2.fly.dev",
        region: "syd",
        imageRef: "img:1",
        status: "deprovisioned",
        tokenId: "tok-2",
        deprovisionedAt: new Date(),
      });

      const fleet = await getFleetStatus(db as unknown as typeof import("../db").db);

      expect(fleet).toHaveLength(1);
      expect(fleet[0].userId).toBe("user-1");
      expect(fleet[0].status).toBe("healthy");
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
  // Self-hosted unaffected (AC16)
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
});
