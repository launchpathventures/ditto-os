/**
 * Background Watch HTTP control surface tests (Brief 293).
 *
 * Focused on the brief's hard guarantees at the route layer (AC #15):
 *  - Action enum is validated BEFORE any step-run mint (Insight-239).
 *    A bad action returns 400 `invalid_action` and never touches the
 *    step-run audit log.
 *  - Any body containing a `stepRunId` key — including falsy values
 *    (`null`/`""`/`0`/`false`) — is rejected (Insight-232).
 *  - Body-parse errors and missing watchId/userId/request|signal return
 *    the documented 4xx codes (does not silently 500).
 *
 * Note: deeper integration tests (cooldown 429, watch list, audit rows)
 * are exercised by the runner test (`network-background-watch.test.ts`)
 * + the watches/run-now manual flow. This file targets ROUTE-LEVEL
 * invariants only — the kind of bug Insight-232/239 would re-introduce.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../../src/db/network-db", () => ({
  get networkDb() {
    throw new Error("[watches/route.test] networkDb must not be reached in these tests.");
  },
  ensureNetworkSchema: vi.fn(async () => {}),
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: vi.fn(async () => {
    throw new Error(
      "[watches/route.test] createNetworkLaneStepRun must not be reached when action or stepRunId guards fire.",
    );
  }),
}));

vi.mock("../../../../../../../src/engine/network-background-watch", () => ({
  runBackgroundWatch: vi.fn(async () => {
    throw new Error("[watches/route.test] runBackgroundWatch must not be reached.");
  }),
}));

vi.mock("../kb/session", () => ({
  resolveNetworkLaneSession: vi.fn(async () => ({ userId: "user-X" })),
}));

const { POST, PATCH } = await import("./route");

function postRequest(body: unknown) {
  return new Request("http://localhost/api/v1/network/watches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/v1/network/watches", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/network/watches — route invariants", () => {
  it("rejects invalid action BEFORE any step-run mint (Insight-239)", async () => {
    const res = await POST(postRequest({ action: "nope" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_action");
  });

  it("rejects malformed JSON as invalid_body", async () => {
    const req = new Request("http://localhost/api/v1/network/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_body");
  });

  for (const value of [null, "", 0, false]) {
    it(`rejects bodies carrying a stepRunId key with falsy value ${JSON.stringify(value)} (Insight-232)`, async () => {
      const res = await POST(
        postRequest({ action: "create", stepRunId: value, sessionId: "s-1", requestId: "r-1" }),
      );
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("step_run_bypass_rejected");
    });
  }

  it("rejects a body carrying a truthy caller-supplied stepRunId (Insight-232)", async () => {
    const res = await POST(
      postRequest({
        action: "create",
        stepRunId: "network-lane-step:network-watch-create:caller",
        sessionId: "s-1",
        requestId: "r-1",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("step_run_bypass_rejected");
  });
});

describe("PATCH /api/v1/network/watches — route invariants", () => {
  it("rejects invalid action BEFORE any step-run mint (Insight-239)", async () => {
    const res = await PATCH(patchRequest({ action: "delete", watchId: "w-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_action");
  });

  it("rejects missing action with invalid_action", async () => {
    const res = await PATCH(patchRequest({ watchId: "w-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_action");
  });

  for (const value of [null, "", 0, false]) {
    it(`rejects PATCH bodies carrying a stepRunId key with falsy value ${JSON.stringify(value)} (Insight-232)`, async () => {
      const res = await PATCH(
        patchRequest({ action: "pause", watchId: "w-1", stepRunId: value }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("step_run_bypass_rejected");
    });
  }
});
