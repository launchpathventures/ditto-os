/**
 * Route-level tests for GET/POST
 * /api/v1/network/admin/superconnector/pause-discovery.
 *
 * Engine-level coverage of latest-event-wins semantics + spoofed-stepRunId
 * rejection lives in src/engine/network-discovery-runtime.test.ts; here we
 * exercise the HTTP seam.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  setOutboundDiscoveryPaused: vi.fn(),
  getOutboundDiscoveryPauseState: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateAdminRequest: mocks.authenticateAdminRequest,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock(
  "../../../../../../../../../src/engine/network-discovery-runtime",
  () => ({
    setOutboundDiscoveryPaused: mocks.setOutboundDiscoveryPaused,
    getOutboundDiscoveryPauseState: mocks.getOutboundDiscoveryPauseState,
  }),
);

import { GET, POST } from "./route";

function postReq(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/pause-discovery",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function getReq() {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/pause-discovery",
    { method: "GET" },
  );
}

beforeEach(() => {
  vi.stubEnv("DITTO_DEPLOYMENT", "public");
  vi.clearAllMocks();
  mocks.authenticateAdminRequest.mockResolvedValue({
    authenticated: true,
    userId: "admin-user-1",
    isAdmin: true,
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue(
    "network-lane-step:admin-superconnector-pause-discovery-pause:abc",
  );
  mocks.setOutboundDiscoveryPaused.mockResolvedValue({
    paused: true,
    reason: "synthetic spike",
    actorId: "admin-user-1",
    changedAt: new Date("2026-05-18T12:00:00.000Z"),
  });
  mocks.getOutboundDiscoveryPauseState.mockResolvedValue({
    paused: false,
    reason: null,
    actorId: null,
    changedAt: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/v1/network/admin/superconnector/pause-discovery", () => {
  it("returns current pause state", async () => {
    const response = await GET(getReq());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, state: { paused: false } });
  });

  it("rejects non-admin requests", async () => {
    const { NextResponse } = await import("next/server");
    mocks.authenticateAdminRequest.mockResolvedValueOnce({
      authenticated: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const response = await GET(getReq());
    expect(response.status).toBe(403);
    expect(mocks.getOutboundDiscoveryPauseState).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/network/admin/superconnector/pause-discovery", () => {
  it("rejects caller-supplied stepRunId before mint/write", async () => {
    const response = await POST(
      postReq({ paused: true, reason: "operator-pause", stepRunId: false }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "step_run_bypass_rejected",
    });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.setOutboundDiscoveryPaused).not.toHaveBeenCalled();
  });

  it("rejects non-boolean paused", async () => {
    const response = await POST(postReq({ paused: "true", reason: "operator-pause" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "paused_boolean_required" });
    expect(mocks.setOutboundDiscoveryPaused).not.toHaveBeenCalled();
  });

  it("rejects unstructured reasons before mint/write", async () => {
    const response = await POST(postReq({ paused: true, reason: "synthetic spike" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "structured_reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.setOutboundDiscoveryPaused).not.toHaveBeenCalled();
  });

  it("rejects missing reason", async () => {
    const response = await POST(postReq({ paused: true }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "reason_required" });
    expect(mocks.setOutboundDiscoveryPaused).not.toHaveBeenCalled();
  });

  it("mints pause wrapper run and calls setOutboundDiscoveryPaused(true)", async () => {
    const response = await POST(
      postReq({ paused: true, reason: "operator-pause" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      state: { paused: true },
    });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "admin-superconnector-pause-discovery-pause",
        actorId: "admin-user-1",
      }),
    );
    expect(mocks.setOutboundDiscoveryPaused).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId:
          "network-lane-step:admin-superconnector-pause-discovery-pause:abc",
        paused: true,
        reason: "operator-pause",
        actorId: "admin-user-1",
      }),
    );
  });

  it("uses resume route name when paused=false", async () => {
    mocks.createNetworkLaneStepRun.mockResolvedValueOnce(
      "network-lane-step:admin-superconnector-pause-discovery-resume:abc",
    );
    mocks.setOutboundDiscoveryPaused.mockResolvedValueOnce({
      paused: false,
      reason: "operator-resume",
      actorId: "admin-user-1",
      changedAt: new Date("2026-05-18T12:00:00.000Z"),
    });
    const response = await POST(
      postReq({ paused: false, reason: "operator-resume" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "admin-superconnector-pause-discovery-resume",
      }),
    );
  });
});
