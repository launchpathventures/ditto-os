import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationRequestBlock, JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  emitIntroRequest: vi.fn(),
  updateIntroductionStateForAuthorization: vi.fn(),
  writeNetworkAuditEvent: vi.fn(),
  checkRateLimit: vi.fn(),
  isNetworkOperationPaused: vi.fn(),
  authenticateRequest: vi.fn(),
  recordRequesterApproval: vi.fn(),
  recordRecipientApproval: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../src/engine/emit-intro-request", () => ({
  emitIntroRequest: mocks.emitIntroRequest,
  updateIntroductionStateForAuthorization: mocks.updateIntroductionStateForAuthorization,
}));
vi.mock("../../../../../../../src/engine/network-audit", () => ({
  writeNetworkAuditEvent: mocks.writeNetworkAuditEvent,
}));
vi.mock("../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: mocks.checkRateLimit,
  isNetworkOperationPaused: mocks.isNetworkOperationPaused,
}));
vi.mock("../../../../../../../src/engine/intro-approval", () => ({
  recordRequesterApproval: mocks.recordRequesterApproval,
  recordRecipientApproval: mocks.recordRecipientApproval,
}));

vi.mock("../../../../../../../src/db/network-db", () => ({
  networkDb: { select: mocks.select },
}));

const { PATCH, POST } = await import("./route");

function card(): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Find a CRM-touch outbound operator",
    referenceShape: "Jake built this before",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 booked calls",
    budgetShape: { ballpark: "$8k/mo", cadence: "monthly" },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-13T00:00:00.000Z",
  };
}

function candidate(): SuggestedCandidate {
  return {
    handle: "tim-green",
    name: "Tim Green",
    oneLineRole: "Revenue operator",
    rationaleMd: "Strong CRM-touch fit.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: "2026-05-13T00:00:00.000Z",
  };
}

function authBlock(): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: "Intro request for Tim Green",
    preview: null,
    recipientLabel: "Tim Green",
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
    authorizationId: "intro-auth-1",
    costLabel: "1st of 2 free intros (1 left after this)",
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/intros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "client-session",
    userId: "requester-user",
    actorId: "requester-user",
    email: "requester@example.com",
    context: "client",
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:intro");
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSec: 60 });
  mocks.isNetworkOperationPaused.mockResolvedValue({ paused: false });
  mocks.authenticateRequest.mockResolvedValue({
    authenticated: true,
    userId: "target-user",
    isAdmin: false,
  });
  mocks.emitIntroRequest.mockResolvedValue({
    block: authBlock(),
    introduction: { id: "intro-1", state: "queued" },
    delivery: { id: "delivery-1" },
  });
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "target-user", name: "Tim Green", handle: "tim-green" }]),
      }),
    }),
  });
});

describe("POST /api/v1/network/intros", () => {
  it("rejects caller-supplied stepRunId before invoking emit_intro_request", async () => {
    const response = await POST(
      request({
        sessionId: "client-session",
        stepRunId: "fake",
        jobRequestCard: card(),
        selectedCandidate: candidate(),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
  });

  it.each(["", null, false, 0])(
    "rejects falsy caller-supplied stepRunId fields before invoking emit_intro_request: %s",
    async (stepRunId) => {
      const response = await POST(
        request({
          sessionId: "client-session",
          stepRunId,
          jobRequestCard: card(),
          selectedCandidate: candidate(),
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
    },
  );

  it("creates an audited wrapper step run before emitting the intro request", async () => {
    const response = await POST(
      request({
        sessionId: "client-session",
        jobRequestCard: card(),
        selectedCandidate: candidate(),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-client-intro-request",
        sessionId: "client-session",
        actorId: "requester-user",
      }),
    );
    expect(mocks.emitIntroRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:intro",
        originContext: "client",
        requesterUserId: "requester-user",
        targetUserId: "target-user",
      }),
    );
  });

  it("rate-limits client intro requests before minting a wrapper run", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSec: 180 });
    const response = await POST(
      request({
        sessionId: "client-session",
        jobRequestCard: card(),
        selectedCandidate: candidate(),
      }),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too_many_requests", retryAfterSec: 180 });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
  });

  it("honors a paused target member before emitting the intro request", async () => {
    mocks.isNetworkOperationPaused.mockResolvedValueOnce({
      paused: true,
      reason: "person-ref_paused",
    });
    const response = await POST(
      request({
        sessionId: "client-session",
        jobRequestCard: card(),
        selectedCandidate: candidate(),
      }),
    );

    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({
      error: "network_operation_paused",
      reason: "person-ref_paused",
    });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.emitIntroRequest).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/network/intros", () => {
  function patchRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/v1/network/intros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ targetUserId: "target-user" }]),
        }),
      }),
    });
    mocks.updateIntroductionStateForAuthorization.mockResolvedValue({
      id: "intro-1",
      targetUserId: "target-user",
      requesterUserId: "requester-user",
      visitorSessionId: null,
      state: "approved",
    });
  });

  it("rejects caller-supplied stepRunId before updating intro state", async () => {
    const response = await PATCH(
      patchRequest({ authorizationId: "intro-auth-1", event: "send-it", stepRunId: "fake" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.updateIntroductionStateForAuthorization).not.toHaveBeenCalled();
    expect(mocks.writeNetworkAuditEvent).not.toHaveBeenCalled();
  });

  it("writes an intro_approved audit event when the target approves", async () => {
    const response = await PATCH(
      patchRequest({ authorizationId: "intro-auth-1", event: "send-it" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({ route: "network-intro-state-update", actorId: "target-user" }),
    );
    expect(mocks.updateIntroductionStateForAuthorization).toHaveBeenCalledWith({
      authorizationId: "intro-auth-1",
      event: "send-it",
    });
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:intro",
        eventClass: "intro_approved",
        subjectType: "introduction",
        subjectId: "intro-1",
        actorType: "user",
        actorId: "target-user",
        reasonCode: "send-it",
      }),
    );
  });

  it("writes an intro_declined audit event when the target declines", async () => {
    mocks.updateIntroductionStateForAuthorization.mockResolvedValueOnce({
      id: "intro-1",
      targetUserId: "target-user",
      requesterUserId: "requester-user",
      visitorSessionId: "visitor-session",
      state: "rejected",
    });

    const response = await PATCH(
      patchRequest({ authorizationId: "intro-auth-1", event: "not-yet" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.writeNetworkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventClass: "intro_declined",
        subjectType: "introduction",
        subjectId: "intro-1",
        actorType: "user",
        actorId: "target-user",
        reasonCode: "not-yet",
      }),
    );
  });
});

// Brief 288 AC #18 / AC #19 — cross-deployment terminal-state propagation.
// PATCH { introId, consentAction } is the workspace→network write path. The
// acting party is resolved from the bearer-token identity (never trusted from
// the body), the action is validated against that party's allowed set BEFORE
// the wrapper run is minted (Insight-239), and the engine recorders own the
// state write. authUserId defaults to "target-user" (authenticateRequest mock).
describe("PATCH /api/v1/network/intros — outbound consent (Brief 288 AC #18)", () => {
  function patchRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/v1/network/intros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify(body),
    });
  }

  function selectIntro(row: Record<string, unknown> | null) {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(row ? [row] : []),
        }),
      }),
    });
  }

  beforeEach(() => {
    mocks.recordRequesterApproval.mockResolvedValue({
      ok: true,
      introduction: { state: "requester-approved" },
    });
    mocks.recordRecipientApproval.mockResolvedValue({
      ok: true,
      introduction: { state: "recipient-approved" },
    });
  });

  it("resolves the requester party from the token and records the approval", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "target-user",
      recipientUserId: "someone-else",
    });

    const response = await PATCH(
      patchRequest({ introId: "intro-1", consentAction: "approve" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updated: true,
      party: "requester",
      state: "requester-approved",
    });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-intro-consent",
        sessionId: "intro-1",
        actorId: "target-user",
      }),
    );
    expect(mocks.recordRequesterApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:intro",
        introId: "intro-1",
        action: "approve",
        edit: null,
        declineCategory: null,
      }),
    );
    expect(mocks.recordRecipientApproval).not.toHaveBeenCalled();
  });

  it("resolves the recipient party from the token and records the approval", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "someone-else",
      recipientUserId: "target-user",
    });

    const response = await PATCH(
      patchRequest({ introId: "intro-1", consentAction: "approve" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updated: true,
      party: "recipient",
      state: "recipient-approved",
    });
    expect(mocks.recordRecipientApproval).toHaveBeenCalledWith(
      expect.objectContaining({ introId: "intro-1", action: "approve" }),
    );
    expect(mocks.recordRequesterApproval).not.toHaveBeenCalled();
  });

  it("forwards the edit + declineCategory to the requester recorder", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "target-user",
      recipientUserId: "someone-else",
    });

    await PATCH(
      patchRequest({
        introId: "intro-1",
        consentAction: "edit-and-approve",
        edit: "Tighten the opening line.",
        declineCategory: null,
      }),
    );

    expect(mocks.recordRequesterApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "edit-and-approve",
        edit: "Tighten the opening line.",
      }),
    );
  });

  it("returns 404 when the introduction row does not exist", async () => {
    selectIntro(null);

    const response = await PATCH(
      patchRequest({ introId: "intro-missing", consentAction: "approve" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "intro_not_found" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordRequesterApproval).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is neither the requester nor the recipient", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "alice",
      recipientUserId: "bob",
    });

    const response = await PATCH(
      patchRequest({ introId: "intro-1", consentAction: "approve" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_an_intro_party" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordRequesterApproval).not.toHaveBeenCalled();
  });

  it("rejects a malformed action BEFORE minting the wrapper run (Insight-239)", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "target-user",
      recipientUserId: "someone-else",
    });

    const response = await PATCH(
      patchRequest({ introId: "intro-1", consentAction: "delete-everything" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_consent_action" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordRequesterApproval).not.toHaveBeenCalled();
  });

  it("rejects edit-and-approve from the recipient party (not in the recipient set)", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "someone-else",
      recipientUserId: "target-user",
    });

    const response = await PATCH(
      patchRequest({ introId: "intro-1", consentAction: "edit-and-approve" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_consent_action" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordRecipientApproval).not.toHaveBeenCalled();
  });

  it("returns 409 with the blockedReason when the recorder rejects the action", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "target-user",
      recipientUserId: "someone-else",
    });
    mocks.recordRequesterApproval.mockResolvedValueOnce({
      ok: false,
      blockedReason: "state not in 'proposed'",
    });

    const response = await PATCH(
      patchRequest({ introId: "intro-1", consentAction: "approve" }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      updated: false,
      blockedReason: "state not in 'proposed'",
    });
  });

  it("rejects a caller-supplied stepRunId before any party resolution", async () => {
    selectIntro({
      id: "intro-1",
      requesterUserId: "target-user",
      recipientUserId: "someone-else",
    });

    const response = await PATCH(
      patchRequest({
        introId: "intro-1",
        consentAction: "approve",
        stepRunId: "fake",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.recordRequesterApproval).not.toHaveBeenCalled();
  });
});
