import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";
import { matchOnNetwork } from "../../../../../../../src/engine/network-match";
import { POST } from "./route";

vi.mock("../../../../../../../src/engine/network-match", () => ({
  matchOnNetwork: vi.fn(),
}));

const mockedMatchOnNetwork = vi.mocked(matchOnNetwork);

function card(overrides: Partial<JobRequestCardBlock> = {}): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: "Ramp outbound",
    referenceShape: "Jake built sequences and fixed HubSpot",
    antiPersonaMd: "pure copywriters",
    successCriteria: "5 booked calls per week",
    budgetShape: {
      ballpark: "$8-12k/month",
      cadence: "monthly",
    },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/network/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockedMatchOnNetwork.mockReset();
});

describe("POST /api/v1/network/match", () => {
  it("returns SuggestedCandidate[] for a valid JobRequestCardBlock", async () => {
    const candidates: SuggestedCandidate[] = [
      {
        handle: "operator",
        name: "Operator",
        oneLineRole: "Outbound systems operator",
        rationaleMd: "Mira: has the CRM-touch shape.",
        fitConfidence: "high",
        source: "on-network",
        computedAt: "2026-05-10T12:00:00.000Z",
      },
    ];
    mockedMatchOnNetwork.mockResolvedValueOnce(candidates);

    const response = await POST(request({ jobRequestCard: card() }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(candidates);
    expect(mockedMatchOnNetwork).toHaveBeenCalledWith(card(), { sampleLimit: 200 });
  });

  it("rejects invalid card payloads", async () => {
    const response = await POST(request({ jobRequestCard: { type: "text" } }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_job_request_card" });
    expect(mockedMatchOnNetwork).not.toHaveBeenCalled();
  });

  it("rejects oversized card fields before the LLM call", async () => {
    const response = await POST(request({
      jobRequestCard: card({ jtbd: "x".repeat(2_001) }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_job_request_card" });
    expect(mockedMatchOnNetwork).not.toHaveBeenCalled();
  });

  it("requires bot verification when no trusted client session is supplied", async () => {
    const previousSecret = process.env.TURNSTILE_SECRET_KEY;
    process.env.TURNSTILE_SECRET_KEY = "real-secret";
    try {
      const response = await POST(request({ jobRequestCard: card() }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "bot_verification_failed" });
      expect(mockedMatchOnNetwork).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) {
        delete process.env.TURNSTILE_SECRET_KEY;
      } else {
        process.env.TURNSTILE_SECRET_KEY = previousSecret;
      }
    }
  });

  it("does not spend match quota on failed bot verification", async () => {
    const previousSecret = process.env.TURNSTILE_SECRET_KEY;
    process.env.TURNSTILE_SECRET_KEY = "real-secret";
    try {
      for (let i = 0; i < 25; i += 1) {
        const response = await POST(request(
          { jobRequestCard: card() },
          { "x-forwarded-for": "198.51.100.42" },
        ));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "bot_verification_failed" });
      }
      expect(mockedMatchOnNetwork).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) {
        delete process.env.TURNSTILE_SECRET_KEY;
      } else {
        process.env.TURNSTILE_SECRET_KEY = previousSecret;
      }
    }
  });

  it("returns the structured 503 response for network DB outages", async () => {
    mockedMatchOnNetwork.mockRejectedValueOnce(
      Object.assign(new Error("network down"), { code: "ECONNREFUSED" }),
    );

    const response = await POST(request({ jobRequestCard: card() }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "network_db_unavailable",
      message: "The network tier is temporarily unavailable. Please retry in a moment.",
    });
  });
});
