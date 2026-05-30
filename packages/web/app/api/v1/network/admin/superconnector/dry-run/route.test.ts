import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  checkRateLimit: vi.fn(),
  runDryRunWatchReplay: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateAdminRequest: mocks.authenticateAdminRequest,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../../../../../../../../src/engine/network-admin-health", () => ({
  runDryRunWatchReplay: mocks.runDryRunWatchReplay,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/dry-run",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
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
    "network-lane-step:admin-superconnector-dry-run:abc",
  );
  mocks.checkRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSec: 60,
  });
  mocks.runDryRunWatchReplay.mockResolvedValue({
    auditEventId: "audit-1",
    watchId: "watch-1",
    label: "DRY RUN — no contact occurred",
    banner: "DRY RUN — no contact",
    assertions: {
      emailsSent: 0,
      notificationsSent: 0,
      userVisibleWrites: 0,
    },
    candidatesResolved: 0,
    completedAt: "2026-05-19T11:00:00.000Z",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/network/admin/superconnector/dry-run", () => {
  it("rejects caller-supplied stepRunId before rate-limit, mint, or replay", async () => {
    const response = await POST(
      request({ watchId: "watch-1", reason: "dry-run-safety-check", stepRunId: "" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.runDryRunWatchReplay).not.toHaveBeenCalled();
  });

  it("requires reason before minting the wrapper run", async () => {
    const response = await POST(request({ watchId: "watch-1" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("rejects unstructured reasons before minting the wrapper run", async () => {
    const response = await POST(
      request({ watchId: "watch-1", reason: "Validate scoring" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "structured_reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.runDryRunWatchReplay).not.toHaveBeenCalled();
  });

  it("returns an explicit zero-side-effect assertion on happy path", async () => {
    const response = await POST(
      request({ watchId: "watch-1", reason: "dry-run-safety-check" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toMatchObject({
      label: "DRY RUN — no contact occurred",
      assertions: {
        emailsSent: 0,
        notificationsSent: 0,
        userVisibleWrites: 0,
      },
    });
    expect(mocks.runDryRunWatchReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:admin-superconnector-dry-run:abc",
        watchId: "watch-1",
        reason: "dry-run-safety-check",
        actorId: "admin-user-1",
      }),
    );
  });
});
