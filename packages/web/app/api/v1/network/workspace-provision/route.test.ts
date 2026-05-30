import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ManagedWorkspacePreflightError extends Error {
    constructor(
      public readonly reason: "missing_user" | "missing_email",
      message: string,
    ) {
      super(message);
      this.name = "ManagedWorkspacePreflightError";
    }
  }

  return {
    resolveNetworkLaneSession: vi.fn(),
    checkRateLimit: vi.fn(),
    createRailwayClient: vi.fn(),
    provisionWorkspace: vi.fn(),
    provisioningErrorMessage: vi.fn((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    ),
    ManagedWorkspacePreflightError,
  };
});

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../src/engine/workspace-provisioner", () => ({
  checkRateLimit: mocks.checkRateLimit,
  createRailwayClient: mocks.createRailwayClient,
  provisionWorkspace: mocks.provisionWorkspace,
  provisioningErrorMessage: mocks.provisioningErrorMessage,
  ManagedWorkspacePreflightError: mocks.ManagedWorkspacePreflightError,
}));

const { POST } = await import("./route");

const envSnapshot = { ...process.env };

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/workspace-provision", {
    method: "POST",
    headers: { "Content-Type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...envSnapshot };
  process.env.RAILWAY_API_TOKEN = "railway-token";
  process.env.RAILWAY_PROJECT_ID = "railway-project";
  process.env.DITTO_IMAGE_REF = "ghcr.io/ditto/workspace:test";
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "expert-session",
    userId: "user-1",
    actorId: "user-1",
    email: "user@example.com",
    context: "expert",
  });
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.createRailwayClient.mockReturnValue({ railway: true });
  mocks.provisionWorkspace.mockResolvedValue({
    workspaceUrl: "https://workspace.example",
    serviceId: "svc-1",
    volumeId: "vol-1",
    tokenId: "token-1",
    machineId: "svc-1",
    status: "created",
  });
});

afterEach(() => {
  process.env = { ...envSnapshot };
});

describe("POST /api/v1/network/workspace-provision", () => {
  it.each(["", null, false, 0])("rejects caller-supplied stepRunId fields: %s", async (stepRunId) => {
    const response = await POST(
      request({
        sessionId: "expert-session",
        context: "expert",
        stepRunId,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.resolveNetworkLaneSession).not.toHaveBeenCalled();
    expect(mocks.provisionWorkspace).not.toHaveBeenCalled();
  });

  it("requires a live network lane session", async () => {
    mocks.resolveNetworkLaneSession.mockResolvedValue(null);

    const response = await POST(request({ sessionId: "missing-session", context: "client" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "network_lane_session_required" });
    expect(mocks.provisionWorkspace).not.toHaveBeenCalled();
  });

  it("provisions the workspace for the resolved lane user", async () => {
    const response = await POST(request({ sessionId: "expert-session", context: "expert" }));

    expect(response.status).toBe(200);
    expect(mocks.resolveNetworkLaneSession).toHaveBeenCalledWith({
      sessionId: "expert-session",
      context: "expert",
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("user-1");
    expect(mocks.createRailwayClient).toHaveBeenCalledWith("railway-token", "railway-project");
    expect(mocks.provisionWorkspace).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        railwayClient: { railway: true },
        projectId: "railway-project",
        imageRef: "ghcr.io/ditto/workspace:test",
        networkUrl: "https://localhost",
        healthCheckTimeoutMs: 300_000,
      }),
    );
    expect(await response.json()).toMatchObject({
      success: true,
      workspaceUrl: "https://workspace.example",
      status: "created",
    });
  });
});
