import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveNetworkLaneSession: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  persistKbDocument: vi.fn(),
  extractKbFacts: vi.fn(),
}));

vi.mock("../session", () => ({
  resolveNetworkLaneSession: mocks.resolveNetworkLaneSession,
}));

vi.mock("../../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../../src/engine/network-kb-storage", async () => {
  const actual = await vi.importActual<typeof import("../../../../../../../../src/engine/network-kb-storage")>(
    "../../../../../../../../src/engine/network-kb-storage",
  );
  return {
    ...actual,
    persistKbDocument: mocks.persistKbDocument,
  };
});

vi.mock("../../../../../../../../src/engine/network-kb-extract", () => ({
  extractKbFacts: mocks.extractKbFacts,
}));

const { POST } = await import("./route");

function request(formData: FormData) {
  return new Request("http://localhost/api/v1/network/kb/upload", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveNetworkLaneSession.mockResolvedValue({
    sessionId: "expert-session",
    userId: "user-1",
    actorId: "user-1",
    email: "user@example.com",
    context: "expert",
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:upload");
  mocks.persistKbDocument.mockResolvedValue({
    id: "doc-1",
    title: "Source",
    sourceLabel: "Source",
  });
  mocks.extractKbFacts.mockResolvedValue([
    {
      id: "fact-1",
      factMd: "Source-traced fact.",
      visibility: "on-request",
      status: "active",
      sourceLabel: "Source",
    },
  ]);
});

describe("POST /api/v1/network/kb/upload", () => {
  it("persists pasted source material and extracts on-request facts through an audited step run", async () => {
    const formData = new FormData();
    formData.set("sessionId", "expert-session");
    formData.set("title", "Source");
    formData.set("sourceText", "I build revenue systems for B2B service teams.");

    const response = await POST(request(formData));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      document: { id: "doc-1" },
      facts: [{ id: "fact-1", visibility: "on-request" }],
    });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-kb-upload",
        sessionId: "expert-session",
        actorId: "user-1",
      }),
    );
    expect(mocks.persistKbDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        kind: "upload",
        title: "Source",
        visibilityDefault: "on-request",
      }),
    );
    expect(mocks.extractKbFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        userId: "user-1",
        stepRunId: "network-lane-step:upload",
      }),
    );
  });

  it("rejects unsupported uploaded file types before persistence", async () => {
    const formData = new FormData();
    formData.set("sessionId", "expert-session");
    formData.set("file", new File(["secret"], "../secret.exe", { type: "application/octet-stream" }));

    const response = await POST(request(formData));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("kb_upload_rejected");
    expect(mocks.persistKbDocument).not.toHaveBeenCalled();
  });

  it("returns structured 503 when the network DB is unavailable", async () => {
    mocks.persistKbDocument.mockRejectedValueOnce(
      Object.assign(new Error("network down"), { code: "ECONNREFUSED" }),
    );
    const formData = new FormData();
    formData.set("sessionId", "expert-session");
    formData.set("sourceText", "Valid source text.");

    const response = await POST(request(formData));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "network_db_unavailable",
      message: "The network tier is temporarily unavailable. Please retry in a moment.",
    });
  });
});
