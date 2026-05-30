import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNetworkLaneStepRun: vi.fn(),
  parseIntroMagicLinkToken: vi.fn(),
  recordRequesterApproval: vi.fn(),
  recordRecipientApproval: vi.fn(),
}));

vi.mock("../../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../../src/engine/intro-proposal", () => ({
  parseIntroMagicLinkToken: mocks.parseIntroMagicLinkToken,
}));

vi.mock("../../../../../../../../../src/engine/intro-approval", () => ({
  recordRequesterApproval: mocks.recordRequesterApproval,
  recordRecipientApproval: mocks.recordRecipientApproval,
}));

vi.mock("../../../../../../../../../src/db/network-db", () => ({
  networkDb: {},
  withNetworkDbAvailability: (h: unknown) => h,
}));

const { POST } = await import("./route");

const INTRO_ID = "intro-abc";

function request(body: unknown) {
  return new Request(`http://localhost/api/v1/network/intros/${INTRO_ID}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: INTRO_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createNetworkLaneStepRun.mockResolvedValue("step-run-server-minted");
  mocks.parseIntroMagicLinkToken.mockReturnValue({
    typ: "intro-approval",
    v: 1,
    introId: INTRO_ID,
    party: "requester",
    email: "rob@example.com",
    exp: Date.now() + 60_000,
    iat: Date.now(),
    jti: "jti-1",
  });
  mocks.recordRequesterApproval.mockResolvedValue({
    ok: true,
    introduction: { state: "requester-approved" },
    recipientEmailQueued: true,
  });
  mocks.recordRecipientApproval.mockResolvedValue({
    ok: true,
    introduction: { state: "thread-sent" },
    threadQueued: true,
  });
});

describe("POST /api/v1/network/intros/[id]/approve — stepRunId bypass guard (Insight-232)", () => {
  for (const value of [null, "", 0, false, "client-supplied-step-run"]) {
    it(`rejects caller-supplied stepRunId (${JSON.stringify(value)})`, async () => {
      const res = await POST(
        request({
          token: "imlt_x",
          party: "requester",
          action: "approve",
          stepRunId: value,
        }),
        ctx(),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.recordRequesterApproval).not.toHaveBeenCalled();
    });
  }
});

describe("POST /api/v1/network/intros/[id]/approve — validate-before-mint (Insight-239)", () => {
  it("returns 400 with no wrapper-run write when action is missing", async () => {
    const res = await POST(
      request({ token: "imlt_x", party: "requester" }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_action" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("returns 400 with no wrapper-run write when action is malformed for requester", async () => {
    const res = await POST(
      request({ token: "imlt_x", party: "requester", action: "delete" }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_action" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("rejects 'edit-and-approve' on the recipient party (not in the recipient action set)", async () => {
    mocks.parseIntroMagicLinkToken.mockReturnValue({
      typ: "intro-approval",
      v: 1,
      introId: INTRO_ID,
      party: "recipient",
      email: "priya@example.com",
      exp: Date.now() + 60_000,
      iat: Date.now(),
      jti: "jti-2",
    });
    const res = await POST(
      request({
        token: "imlt_x",
        party: "recipient",
        action: "edit-and-approve",
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_action" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("returns 400 with no wrapper-run write when party is invalid", async () => {
    const res = await POST(
      request({ token: "imlt_x", party: "stranger", action: "approve" }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_party" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/network/intros/[id]/approve — token verification (AC #13)", () => {
  it("returns 401 when the magic link token is invalid", async () => {
    mocks.parseIntroMagicLinkToken.mockReturnValueOnce(null);
    const res = await POST(
      request({ token: "imlt_bad", party: "requester", action: "approve" }),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_token" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("returns 401 when token introId does not match the route id", async () => {
    mocks.parseIntroMagicLinkToken.mockReturnValueOnce({
      typ: "intro-approval",
      v: 1,
      introId: "wrong-intro",
      party: "requester",
      email: "rob@example.com",
      exp: Date.now() + 60_000,
      iat: Date.now(),
      jti: "jti-3",
    });
    const res = await POST(
      request({ token: "imlt_x", party: "requester", action: "approve" }),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "intro_mismatch" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });

  it("returns 401 when token party does not match the requested party", async () => {
    mocks.parseIntroMagicLinkToken.mockReturnValueOnce({
      typ: "intro-approval",
      v: 1,
      introId: INTRO_ID,
      party: "recipient",
      email: "rob@example.com",
      exp: Date.now() + 60_000,
      iat: Date.now(),
      jti: "jti-4",
    });
    const res = await POST(
      request({ token: "imlt_x", party: "requester", action: "approve" }),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "party_mismatch" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/network/intros/[id]/approve — happy paths", () => {
  it("records a requester approval and forwards the server-minted stepRunId", async () => {
    const res = await POST(
      request({
        token: "imlt_x",
        party: "requester",
        action: "edit-and-approve",
        edit: "make it warmer",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      state: "requester-approved",
      recipientEmailQueued: true,
    });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith({
      route: "network-intro-approve",
      sessionId: INTRO_ID,
      actorId: "rob@example.com",
    });
    expect(mocks.recordRequesterApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "step-run-server-minted",
        introId: INTRO_ID,
        action: "edit-and-approve",
        edit: "make it warmer",
      }),
    );
  });

  it("records a recipient approval and forwards the server-minted stepRunId", async () => {
    mocks.parseIntroMagicLinkToken.mockReturnValueOnce({
      typ: "intro-approval",
      v: 1,
      introId: INTRO_ID,
      party: "recipient",
      email: "priya@example.com",
      exp: Date.now() + 60_000,
      iat: Date.now(),
      jti: "jti-5",
    });
    const res = await POST(
      request({
        token: "imlt_x",
        party: "recipient",
        action: "approve",
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      state: "thread-sent",
      threadQueued: true,
    });
    expect(mocks.recordRecipientApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "step-run-server-minted",
        introId: INTRO_ID,
        action: "approve",
      }),
    );
  });

  it("returns 409 when the engine reports the intro is not in the expected state", async () => {
    mocks.recordRequesterApproval.mockResolvedValueOnce({
      ok: false,
      blockedReason: "intro not in 'proposed' state (was thread-sent)",
    });
    const res = await POST(
      request({ token: "imlt_x", party: "requester", action: "approve" }),
      ctx(),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.success).toBe(false);
    expect(json.blockedReason).toMatch(/not in 'proposed'/);
  });
});
