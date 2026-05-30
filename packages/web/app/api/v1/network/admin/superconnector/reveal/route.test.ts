import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  checkRateLimit: vi.fn(),
  revealAdminRawText: vi.fn(),
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
  revealAdminRawText: mocks.revealAdminRawText,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request(
    "http://localhost/api/v1/network/admin/superconnector/reveal",
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
    "network-lane-step:admin-superconnector-raw-reveal:abc",
  );
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 60 });
  mocks.revealAdminRawText.mockResolvedValue({
    auditEventId: "reveal-audit-1",
    sourceEventId: "audit-1",
    field: "sealedRawText",
    rawText: "Private member text",
    revealedBy: "admin-user-1",
    revealedAt: "2026-05-19T11:00:00.000Z",
    annotation: "Revealed — this view is audited",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/v1/network/admin/superconnector/reveal", () => {
  it("404s in workspace deployments before admin auth", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    const response = await POST(
      request({ auditEventId: "audit-1", reason: "complaint-investigation" }),
    );
    expect(response.status).toBe(404);
    expect(mocks.authenticateAdminRequest).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.revealAdminRawText).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied stepRunId before minting or revealing", async () => {
    const response = await POST(
      request({ auditEventId: "audit-1", reason: "test", stepRunId: false }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.revealAdminRawText).not.toHaveBeenCalled();
  });

  it("requires a reveal reason", async () => {
    const response = await POST(request({ auditEventId: "audit-1" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "reason_required" });
    expect(mocks.revealAdminRawText).not.toHaveBeenCalled();
  });

  it("returns inline audited reveal payload on happy path", async () => {
    const response = await POST(
      request({ auditEventId: "audit-1", reason: "complaint-investigation" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.revealed).toMatchObject({
      rawText: "Private member text",
      annotation: "Revealed — this view is audited",
    });
    expect(mocks.revealAdminRawText).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:admin-superconnector-raw-reveal:abc",
        auditEventId: "audit-1",
        reason: "complaint-investigation",
        actorId: "admin-user-1",
      }),
    );
  });

  it("rejects unstructured reveal reasons", async () => {
    const response = await POST(
      request({ auditEventId: "audit-1", reason: "Investigate complaint" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "structured_reason_required" });
    expect(mocks.revealAdminRawText).not.toHaveBeenCalled();
  });
});
