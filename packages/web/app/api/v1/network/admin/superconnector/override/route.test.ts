import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  writeNetworkAuditEvent: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateAdminRequest: mocks.authenticateAdminRequest,
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/network-audit", () => ({
  writeNetworkAuditEvent: mocks.writeNetworkAuditEvent,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/override",
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
    "network-lane-step:admin-superconnector-override:abc",
  );
  mocks.writeNetworkAuditEvent.mockResolvedValue({
    id: "audit-override-1",
    createdAt: new Date("2026-05-19T11:00:00.000Z"),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/network/admin/superconnector/override", () => {
  it("rejects caller-supplied stepRunId before minting or auditing", async () => {
    const response = await POST(
      request({
        subjectType: "introduction",
        subjectId: "intro-1",
        reason: "source-policy-reviewed",
        stepRunId: "",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects unstructured reasons before minting the wrapper run", async () => {
    const response = await POST(
      request({
        subjectType: "introduction",
        subjectId: "intro-1",
        reason: "operator reviewed source warning",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "structured_reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("requires a reason before minting the wrapper run", async () => {
    const response = await POST(
      request({ subjectType: "introduction", subjectId: "intro-1" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "reason_required" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("mints a wrapper run and writes an admin_override audit row", async () => {
    const response = await POST(
      request({
        subjectType: "introduction",
        subjectId: "intro-1",
        reason: "source-policy-reviewed",
        metadata: { sourcePolicy: "reviewed" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, auditEventId: "audit-override-1" });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "admin-superconnector-override",
        actorId: "admin-user-1",
      }),
    );
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:admin-superconnector-override:abc",
        eventClass: "admin_override",
        subjectType: "introduction",
        subjectId: "intro-1",
        actorType: "admin",
        actorId: "admin-user-1",
        reasonCode: "source-policy-reviewed",
        metadata: { sourcePolicy: "reviewed" },
      }),
    );
  });
});
