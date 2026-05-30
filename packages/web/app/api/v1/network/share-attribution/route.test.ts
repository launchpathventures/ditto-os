import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  checkRateLimit: vi.fn(),
  writeNetworkAuditEvent: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  signRefToken: vi.fn(),
  verifyRefToken: vi.fn(),
}));

vi.mock("../../../../../../../src/db/network-db", () => ({
  networkDb: { insert: mocks.insert },
  withNetworkDbAvailability: (handler: unknown) => handler,
}));

vi.mock("../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../../../../../../src/engine/network-audit", () => ({
  writeNetworkAuditEvent: mocks.writeNetworkAuditEvent,
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../lib/signed-cookie", () => ({
  SHARE_REF_COOKIE: "ditto_share_ref",
  signRefToken: mocks.signRefToken,
  verifyRefToken: mocks.verifyRefToken,
}));

const { POST } = await import("./route");

function request(body: Record<string, unknown>, ip = "203.0.113.10") {
  return new Request("http://localhost/api/v1/network/share-attribution", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      cookie: "ditto_share_ref=linkedin%7Ctimhgreen%7C1779180000000%7Csig",
    },
    body: JSON.stringify(body),
  });
}

function requestWithoutCookie(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/share-attribution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.values.mockResolvedValue([]);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 60 });
  mocks.createNetworkLaneStepRun.mockResolvedValue(
    "network-lane-step:network-share-attribution:00000000-0000-4000-8000-000000000001",
  );
  mocks.writeNetworkAuditEvent.mockResolvedValue({ id: "audit-1" });
  mocks.signRefToken.mockResolvedValue("linkedin|timhgreen|1779180000000|sig");
  mocks.verifyRefToken.mockResolvedValue({
    channel: "linkedin",
    ph: "timhgreen",
    ts: 1779180000000,
  });
});

describe("POST /api/v1/network/share-attribution", () => {
  it("writes one attribution row and one audit row for convert", async () => {
    const response = await POST(request({
      action: "convert",
      channel: "linkedin",
      ph: "timhgreen",
      ctaTarget: "build-signal",
      sessionId: "visitor-session",
      visitorSid: "visitor-session",
    }));

    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      limitName: "share-attribution",
      actor: expect.objectContaining({ kind: "ip" }),
    }));
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(expect.objectContaining({
      route: "network-share-attribution",
      sessionId: "visitor-session",
    }));
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
      profileHandle: "timhgreen",
      channel: "linkedin",
      action: "convert",
      visitorSidHash: expect.any(String),
    }));
    expect(JSON.stringify(mocks.values.mock.calls[0][0])).not.toContain("203.0.113.10");
    expect(JSON.stringify(mocks.values.mock.calls[0][0])).not.toContain("chat");
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventClass: "share_attribution_recorded",
      subjectType: "network_profile_share",
      subjectId: "timhgreen",
      actorType: "visitor",
      metadata: { channel: "linkedin", ctaTarget: "build-signal" },
    }));
    await expect(response.json()).resolves.toEqual({
      ok: true,
      dittoRef: "linkedin|timhgreen|1779180000000|sig",
    });
  });

  it("accepts land without writing attribution or audit rows", async () => {
    const response = await POST(request({
      action: "land",
      channel: "linkedin",
      ph: "timhgreen",
    }));

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid action and channel before minting a wrapper run", async () => {
    for (const body of [
      { action: "bad", channel: "linkedin", ph: "timhgreen" },
      { action: "convert", channel: "bad", ph: "timhgreen" },
    ]) {
      vi.clearAllMocks();
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(mocks.checkRateLimit).not.toHaveBeenCalled();
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.values).not.toHaveBeenCalled();
      expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
    }
  });

  it("rejects missing, tampered, or mismatched share-ref cookies before minting", async () => {
    const validBody = {
      action: "convert",
      channel: "linkedin",
      ph: "timhgreen",
    };
    mocks.verifyRefToken.mockResolvedValueOnce(null);
    const missing = await POST(requestWithoutCookie(validBody));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "share_ref_required" });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.verifyRefToken.mockResolvedValueOnce({
      channel: "x",
      ph: "timhgreen",
      ts: 1779180000000,
    });
    const mismatchedChannel = await POST(request(validBody));
    expect(mismatchedChannel.status).toBe(400);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.verifyRefToken.mockResolvedValueOnce({
      channel: "linkedin",
      ph: "other",
      ts: 1779180000000,
    });
    const mismatchedHandle = await POST(request(validBody));
    expect(mismatchedHandle.status).toBe(400);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("rejects any caller-supplied stepRunId key including falsy values", async () => {
    for (const stepRunId of ["", null, false, 0]) {
      vi.clearAllMocks();
      const response = await POST(request({
        action: "convert",
        channel: "linkedin",
        ph: "timhgreen",
        stepRunId,
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    }
  });

  it("returns 429 on rate-limit before minting a wrapper run", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 90 });
    const response = await POST(request({
      action: "convert",
      channel: "linkedin",
      ph: "timhgreen",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
