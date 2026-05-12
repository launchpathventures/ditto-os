import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  manualAddKbFact: vi.fn(),
  updateKbFactWithAudit: vi.fn(),
  upsertAntiPersonaRule: vi.fn(),
  recordNetworkKbFeedback: vi.fn(),
  networkSelect: vi.fn(),
}));

vi.mock("../session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../src/engine/network-kb-extract", () => ({
  manualAddKbFact: mocks.manualAddKbFact,
  updateKbFactWithAudit: mocks.updateKbFactWithAudit,
}));

vi.mock("../../../../../../../../src/engine/network-kb-storage", () => ({
  upsertAntiPersonaRule: mocks.upsertAntiPersonaRule,
  isSafeKbEntityId: (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
}));

vi.mock("../../../../../../../../src/engine/network-kb-feedback", () => ({
  recordNetworkKbFeedback: mocks.recordNetworkKbFeedback,
}));

vi.mock("../../../../../../../../src/db/network-db", () => ({
  networkDb: {
    select: mocks.networkSelect,
  },
}));

const { GET, POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/kb/visibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "expert-session",
    userId: "user-1",
    actorId: "user-1",
    context: "expert",
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:visibility");
  mocks.manualAddKbFact.mockResolvedValue({
    id: "fact-1",
    factMd: "Manual fact.",
    visibility: "on-request",
    status: "active",
  });
  mocks.updateKbFactWithAudit.mockResolvedValue({
    id: "fact-1",
    factMd: "Edited fact.",
    visibility: "public",
    status: "active",
  });
  mocks.upsertAntiPersonaRule.mockResolvedValue({
    id: "rule-1",
    ruleMd: "Avoid pure copywriting projects.",
    status: "active",
  });
});

function selectResult<T>(result: T[]) {
  return {
    from: () => ({
      where: async () => result,
    }),
  };
}

describe("POST /api/v1/network/kb/visibility", () => {
  it("adds a manual fact with default on-request visibility and audit stepRunId", async () => {
    const response = await POST(request({
      action: "manual_fact",
      sessionId: "expert-session",
      factMd: "Manual fact.",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fact: { id: "fact-1" } });
    expect(mocks.manualAddKbFact).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        factMd: "Manual fact.",
        visibility: "on-request",
        stepRunId: "network-lane-step:visibility",
      }),
    );
  });

  it("updates fact visibility without touching coarse profile visibility", async () => {
    const response = await POST(request({
      action: "update_fact",
      sessionId: "expert-session",
      factId: "fact-1",
      visibility: "public",
    }));

    expect(response.status).toBe(200);
    expect(mocks.updateKbFactWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        factId: "fact-1",
        visibility: "public",
        eventType: "fact_visibility_changed",
      }),
    );
    expect(JSON.stringify(mocks.updateKbFactWithAudit.mock.calls)).not.toContain("wantsVisibility");
  });

  it("stores private anti-persona filters separately and audits the change", async () => {
    const response = await POST(request({
      action: "private_filter",
      sessionId: "expert-session",
      ruleMd: "Avoid pure copywriting projects.",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rule: { id: "rule-1" } });
    expect(mocks.upsertAntiPersonaRule).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        ruleMd: "Avoid pure copywriting projects.",
        metadata: { source: "kb_shelf" },
      }),
    );
    expect(mocks.recordNetworkKbFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "private_filter_upserted",
        targetId: "rule-1",
        stepRunId: "network-lane-step:visibility",
      }),
    );
  });

  it("lists active persisted facts and private filters for the shelf reload path", async () => {
    mocks.networkSelect
      .mockReturnValueOnce(selectResult([
        {
          id: "fact-1",
          factMd: "Persisted fact.",
          visibility: "on-request",
          status: "active",
        },
      ]))
      .mockReturnValueOnce(selectResult([
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          ruleMd: "Avoid pure copywriting projects.",
          status: "active",
        },
      ]));

    const response = await GET(new Request(
      "http://localhost/api/v1/network/kb/visibility?sessionId=expert-session",
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      facts: [
        {
          id: "fact-1",
          factMd: "Persisted fact.",
          visibility: "on-request",
          status: "active",
        },
      ],
      privateFilters: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          ruleMd: "Avoid pure copywriting projects.",
          status: "active",
        },
      ],
    });
  });

  it("rejects private filter ids that could be used as storage traversal paths", async () => {
    const response = await POST(request({
      action: "private_filter",
      sessionId: "expert-session",
      id: "../other-user/rule",
      ruleMd: "Avoid pure copywriting projects.",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_private_filter_id" });
    expect(mocks.upsertAntiPersonaRule).not.toHaveBeenCalled();
  });
});
