/**
 * Tests for workspace provisioner (Railway).
 * Uses a mock RailwayClient and an in-process Network-tier Postgres test DB.
 *
 * Provenance: Brief 090/100 provisioning saga; Brief 267 auto-env hardening.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  withNetworkDbTransaction,
  type NetworkDbTransaction,
} from "../db/network-db-test-helpers";
import type {
  ProvisionerConfig,
  RailwayClient,
  RailwayDeployment,
  RailwayDomain,
  RailwayService,
  RailwayVolume,
} from "./workspace-provisioner";

function createMockRailwayClient(overrides: Partial<RailwayClient> = {}): RailwayClient & {
  services: Map<string, RailwayService>;
  volumes: Map<string, RailwayVolume>;
  calls: string[];
  lastUpsertedVariables: Record<string, string> | null;
  lastMountPath: string | null;
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
    lastUpsertedVariables: null,
    lastMountPath: null,

    async getEnvironmentId() {
      calls.push("getEnvironmentId");
      return "env_prod_1";
    },

    async createService(_projectId, name) {
      calls.push("createService");
      const svc = { id: `svc_${++serviceCounter}`, name };
      services.set(svc.id, svc);
      return svc;
    },

    async deleteService(serviceId) {
      calls.push("deleteService");
      services.delete(serviceId);
    },

    async createVolume(serviceId, mountPath) {
      calls.push("createVolume");
      this.lastMountPath = mountPath;
      const vol = { id: `vol_${++volumeCounter}`, name: `volume-${serviceId}` };
      volumes.set(vol.id, vol);
      return vol;
    },

    async deleteVolume(volumeId) {
      calls.push("deleteVolume");
      volumes.delete(volumeId);
    },

    async upsertVariables(_serviceId, _environmentId, variables) {
      calls.push("upsertVariables");
      this.lastUpsertedVariables = variables;
    },

    async deployService() {
      calls.push("deployService");
      return { id: "deploy_1", status: "SUCCESS" } as RailwayDeployment;
    },

    async createDomain(serviceId) {
      calls.push("createDomain");
      const name = services.get(serviceId)?.name ?? serviceId;
      return { id: "dom_1", domain: `${name}.up.railway.app` } as RailwayDomain;
    },

    async getDeploymentStatus(deploymentId) {
      calls.push("getDeploymentStatus");
      return { id: deploymentId, status: "SUCCESS" } as RailwayDeployment;
    },

    ...overrides,
  };
}

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "ok",
      mode: "provisioning",
      schema: { workspace: { status: "ok", applied: 1, expected: 1 } },
      seed: "attempted",
      network: "unreachable",
    }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeConfig(
  railwayClient: RailwayClient,
  networkDb: NetworkDbTransaction,
  overrides: Partial<ProvisionerConfig> = {},
): ProvisionerConfig {
  return {
    railwayClient,
    projectId: "proj_test_1",
    imageRef: "ghcr.io/ditto/workspace:latest",
    networkUrl: "https://ditto-network.up.railway.app",
    networkDb,
    healthCheckTimeoutMs: 500,
    healthCheckIntervalMs: 50,
    deployPollIntervalMs: 50,
    ...overrides,
  };
}

async function seedNetworkUser(
  tx: NetworkDbTransaction,
  id = "user-1",
  email = "owner@example.com",
) {
  await tx.insert(networkSchema.networkUsers).values({
    id,
    email,
    name: "Owner",
    status: "active",
  });
}

describe("buildManagedWorkspaceEnv", () => {
  it("builds the complete managed workspace env from one helper", async () => {
    const {
      buildManagedWorkspaceEnv,
      MANAGED_WORKSPACE_DATABASE_PATH,
      MANAGED_WORKSPACE_VOLUME_MOUNT_PATH,
    } = await import("./workspace-provisioner");

    const env = buildManagedWorkspaceEnv({
      userId: "user-1",
      ownerEmail: "Owner@Example.com",
      networkUrl: "https://ditto-network.up.railway.app",
      networkToken: "dnt_secret",
      workspaceUrl: "https://workspace.example.com",
      sessionSecret: "session-secret",
    });

    expect(env).toMatchObject({
      DITTO_DEPLOYMENT: "workspace",
      DITTO_WORKSPACE_USER_ID: "user-1",
      WORKSPACE_OWNER_EMAIL: "owner@example.com",
      SESSION_SECRET: "session-secret",
      NETWORK_AUTH_SECRET: "session-secret",
      DITTO_NETWORK_URL: "https://ditto-network.up.railway.app",
      DITTO_NETWORK_TOKEN: "dnt_secret",
      DATABASE_PATH: "/data/ditto.db",
      NEXT_PUBLIC_APP_URL: "https://workspace.example.com",
    });
    expect(MANAGED_WORKSPACE_VOLUME_MOUNT_PATH).toBe("/data");
    expect(MANAGED_WORKSPACE_DATABASE_PATH).toBe("/data/ditto.db");
  });

  it("rejects a database path outside the Railway volume", async () => {
    const { assertManagedWorkspaceVolumePath } = await import("./workspace-provisioner");
    expect(() => assertManagedWorkspaceVolumePath("/data", "/app/data/ditto.db")).toThrow(
      /must live under Railway volume/,
    );
  });

  it("redacts managed workspace secrets from provisioning errors", async () => {
    const { provisioningErrorMessage, redactSecretText } = await import("./workspace-provisioner");
    const secret = "a".repeat(64);
    const message = provisioningErrorMessage(
      new Error(
        `Railway body DITTO_NETWORK_TOKEN=dnt_supersecret SESSION_SECRET=${secret} NETWORK_AUTH_SECRET="${secret}" bootstrap=https://workspace.example.com/login/auth?token=wbt_payload.signature`,
      ),
    );

    expect(message).not.toContain("dnt_supersecret");
    expect(message).not.toContain(secret);
    expect(message).not.toContain("wbt_payload.signature");
    expect(message).toContain("[redacted]");
    expect(redactSecretText(`GraphQL error SESSION_SECRET:${secret}`)).not.toContain(secret);
  });
});

describe("provisionWorkspace", () => {
  it("fails before Railway side effects when the network user is missing", async () => {
    const { provisionWorkspace, ManagedWorkspacePreflightError } = await import(
      "./workspace-provisioner"
    );

    const railwayClient = createMockRailwayClient();
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    } as unknown as NetworkDbTransaction;

    await expect(
      provisionWorkspace("missing-user", makeConfig(railwayClient, fakeDb)),
    ).rejects.toBeInstanceOf(ManagedWorkspacePreflightError);
    expect(railwayClient.calls).toHaveLength(0);
  });

  it("fails before Railway side effects when the network user has no email", async () => {
    const { provisionWorkspace, ManagedWorkspacePreflightError } = await import(
      "./workspace-provisioner"
    );

    const railwayClient = createMockRailwayClient();
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "user-1", email: null }],
          }),
        }),
      }),
    } as unknown as NetworkDbTransaction;

    await expect(
      provisionWorkspace("user-1", makeConfig(railwayClient, fakeDb)),
    ).rejects.toBeInstanceOf(ManagedWorkspacePreflightError);
    expect(railwayClient.calls).toHaveLength(0);
  });

  it("provisions a new workspace end-to-end with Network-tier records", () =>
    withNetworkDbTransaction(async (tx) => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      await seedNetworkUser(tx);

      const railwayClient = createMockRailwayClient();
      const result = await provisionWorkspace("user-1", makeConfig(railwayClient, tx));

      expect(result.status).toBe("created");
      expect(result.workspaceUrl).toBe("https://ditto-ws-user-1.up.railway.app");
      expect(result.bootstrapLoginUrl).toContain("https://ditto-ws-user-1.up.railway.app/login/auth?token=wbt_");
      expect(railwayClient.lastMountPath).toBe("/data");
      expect(railwayClient.lastUpsertedVariables).toMatchObject({
        DITTO_DEPLOYMENT: "workspace",
        DITTO_WORKSPACE_USER_ID: "user-1",
        WORKSPACE_OWNER_EMAIL: "owner@example.com",
        DATABASE_PATH: "/data/ditto.db",
        NEXT_PUBLIC_APP_URL: "https://ditto-ws-user-1.up.railway.app",
      });
      expect(railwayClient.lastUpsertedVariables?.SESSION_SECRET).toMatch(/^[a-f0-9]{64}$/);
      expect(railwayClient.lastUpsertedVariables?.DITTO_NETWORK_TOKEN).toMatch(/^dnt_/);
      expect(railwayClient.calls).toEqual([
        "getEnvironmentId",
        "createService",
        "createVolume",
        "createDomain",
        "upsertVariables",
        "deployService",
        "getDeploymentStatus",
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://ditto-ws-user-1.up.railway.app/api/healthz?deep=true&mode=provisioning",
        expect.any(Object),
      );

      const [workspace] = await tx
        .select()
        .from(networkSchema.managedWorkspaces)
        .where(eq(networkSchema.managedWorkspaces.userId, "user-1"));
      expect(workspace.status).toBe("healthy");
      expect(workspace.authSecretHash).toHaveLength(64);

      const [user] = await tx
        .select()
        .from(networkSchema.networkUsers)
        .where(eq(networkSchema.networkUsers.id, "user-1"));
      expect(user.status).toBe("workspace");
      expect(user.workspaceId).toBe(workspace.id);
      expect(user.workspaceAcceptedAt).toBeInstanceOf(Date);
    }));

  it("returns an existing healthy workspace without Railway side effects", () =>
    withNetworkDbTransaction(async (tx) => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      await seedNetworkUser(tx);
      await tx.insert(networkSchema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "svc-existing",
        serviceId: "svc-existing",
        volumeId: "vol-existing",
        workspaceUrl: "https://existing.up.railway.app",
        region: "railway",
        imageRef: "img:1",
        status: "healthy",
        tokenId: "tok-existing",
      });

      const railwayClient = createMockRailwayClient();
      const result = await provisionWorkspace("user-1", makeConfig(railwayClient, tx));

      expect(result).toMatchObject({
        status: "existing",
        workspaceUrl: "https://existing.up.railway.app",
        serviceId: "svc-existing",
      });
      expect(railwayClient.calls).toHaveLength(0);
    }));

  it("rolls back resources and revokes token on health failure", () =>
    withNetworkDbTransaction(async (tx) => {
      const { provisionWorkspace } = await import("./workspace-provisioner");
      await seedNetworkUser(tx);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok", mode: "strict" }),
      });

      const railwayClient = createMockRailwayClient();
      await expect(
        provisionWorkspace("user-1", makeConfig(railwayClient, tx)),
      ).rejects.toThrow("Health check failed after");

      expect(railwayClient.services.size).toBe(0);
      expect(railwayClient.calls).toContain("deleteService");

      const workspaces = await tx
        .select()
        .from(networkSchema.managedWorkspaces)
        .where(eq(networkSchema.managedWorkspaces.userId, "user-1"));
      expect(workspaces).toHaveLength(0);

      const [token] = await tx
        .select()
        .from(networkSchema.networkTokens)
        .where(eq(networkSchema.networkTokens.userId, "user-1"));
      expect(token.revokedAt).toBeInstanceOf(Date);
    }), 15_000);
});

describe("deprovisioning and fleet status", () => {
  it("deprovisions an existing workspace", () =>
    withNetworkDbTransaction(async (tx) => {
      const { deprovisionWorkspace } = await import("./workspace-provisioner");
      await seedNetworkUser(tx);
      await tx.insert(networkSchema.networkTokens).values({
        id: "tok-1",
        userId: "user-1",
        tokenHash: "hash",
      });
      await tx.insert(networkSchema.managedWorkspaces).values({
        userId: "user-1",
        machineId: "svc-1",
        serviceId: "svc-1",
        volumeId: "vol-1",
        workspaceUrl: "https://test.up.railway.app",
        region: "railway",
        imageRef: "test-image",
        status: "healthy",
        tokenId: "tok-1",
      });

      const railwayClient = createMockRailwayClient();
      const result = await deprovisionWorkspace("user-1", {
        railwayClient,
        projectId: "proj",
        networkDb: tx,
      });

      expect(result).toEqual({ userId: "user-1", status: "deprovisioned" });
      expect(railwayClient.calls).toContain("deleteService");

      const [workspace] = await tx
        .select()
        .from(networkSchema.managedWorkspaces)
        .where(eq(networkSchema.managedWorkspaces.userId, "user-1"));
      expect(workspace.status).toBe("deprovisioned");
      expect(workspace.deprovisionedAt).toBeInstanceOf(Date);

      const [token] = await tx
        .select()
        .from(networkSchema.networkTokens)
        .where(eq(networkSchema.networkTokens.id, "tok-1"));
      expect(token.revokedAt).toBeInstanceOf(Date);
    }));

  it("returns fleet status from the Network tier", () =>
    withNetworkDbTransaction(async (tx) => {
      const { getFleetStatus } = await import("./workspace-provisioner");
      await seedNetworkUser(tx, "user-1", "one@example.com");
      await seedNetworkUser(tx, "user-2", "two@example.com");
      await tx.insert(networkSchema.managedWorkspaces).values([
        {
          userId: "user-1",
          machineId: "svc-1",
          serviceId: "svc-1",
          volumeId: "vol-1",
          workspaceUrl: "https://one.up.railway.app",
          region: "railway",
          imageRef: "img:1",
          status: "healthy",
          tokenId: "tok-1",
        },
        {
          userId: "user-2",
          machineId: "svc-2",
          serviceId: "svc-2",
          volumeId: "vol-2",
          workspaceUrl: "https://two.up.railway.app",
          region: "railway",
          imageRef: "img:1",
          status: "deprovisioned",
          tokenId: "tok-2",
          deprovisionedAt: new Date(),
        },
      ]);

      const fleet = await getFleetStatus(tx);
      expect(fleet).toHaveLength(1);
      expect(fleet[0].userId).toBe("user-1");
      expect(fleet[0].workspaceUrl).toBe("https://one.up.railway.app");
    }));
});

describe("checkRateLimit", () => {
  it("allows up to 10 requests per minute per token", async () => {
    const { checkRateLimit } = await import("./workspace-provisioner");

    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("admin-a")).toBe(true);
    }
    expect(checkRateLimit("admin-a")).toBe(false);
    expect(checkRateLimit("admin-b")).toBe(true);
  });
});
