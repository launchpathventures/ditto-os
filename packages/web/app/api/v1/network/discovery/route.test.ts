import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdminRequest: vi.fn(),
  createNetworkLaneStepRun: vi.fn(),
  discoverPublicPeople: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/network-auth", () => ({
  authenticateAdminRequest: mocks.authenticateAdminRequest,
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../src/engine/public-people-discovery", () => ({
  discoverPublicPeople: mocks.discoverPublicPeople,
}));

vi.mock("../../../../../../../src/engine/network-abuse-controls", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateAdminRequest.mockResolvedValue({
    authenticated: true,
    userId: "admin-1",
    isAdmin: true,
  });
  mocks.createNetworkLaneStepRun.mockResolvedValue("network-lane-step:network-discovery:abc");
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.discoverPublicPeople.mockResolvedValue({
    webSearchAvailable: true,
    profileCount: 1,
    candidateCount: 1,
    candidates: [],
    notice: null,
  });
});

describe("/api/v1/network/discovery", () => {
  it.each([null, "", false, "network-lane-step:spoof"])(
    "rejects caller-supplied stepRunId before discovery: %s",
    async (stepRunId) => {
      const response = await POST(request({ query: "operator", stepRunId }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
      expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
      expect(mocks.discoverPublicPeople).not.toHaveBeenCalled();
    },
  );

  it("requires a query, request, or URL seed", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "discovery_seed_required" });
    expect(mocks.discoverPublicPeople).not.toHaveBeenCalled();
  });

  it("mints a wrapper step run and starts discovery", async () => {
    const response = await POST(
      request({
        query: "marketplace operator",
        userProvidedUrls: ["https://rina.example.com"],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({ route: "network-discovery", actorId: "admin-1" }),
    );
    expect(mocks.discoverPublicPeople).toHaveBeenCalledWith(
      expect.objectContaining({
        stepRunId: "network-lane-step:network-discovery:abc",
        actorId: "admin-1",
        query: "marketplace operator",
        userProvidedUrls: ["https://rina.example.com"],
      }),
    );
  });
});
