import { createHmac, randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  txDb: { tx: "network-complaints-test" },
  networkTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ tx: "network-complaints-test" })),
  createNetworkLaneStepRun: vi.fn(async () => "network-lane-step:complaint:test"),
  hasActiveNetworkWebhookDelivery: vi.fn(async () => false),
  claimNetworkWebhookDelivery: vi.fn(async () => ({ claimed: true, duplicate: false })),
  handleNetworkComplaint: vi.fn(async () => ({
    recipientCount: 1,
    createdSuppressions: 1,
    sourceComplaintCount: 1,
    segmentComplaintCount: 1,
    sourcePaused: false,
    segmentPaused: false,
  })),
}));

vi.mock("../../../../../../../src/db/network-db", () => ({
  networkDb: {
    transaction: mocks.networkTransaction,
  },
}));

vi.mock("../../../../../../../src/engine/network-step-run", () => ({
  createNetworkLaneStepRun: mocks.createNetworkLaneStepRun,
}));

vi.mock("../../../../../../../src/engine/network-webhook-dedup", () => ({
  hasActiveNetworkWebhookDelivery: mocks.hasActiveNetworkWebhookDelivery,
  claimNetworkWebhookDelivery: mocks.claimNetworkWebhookDelivery,
}));

vi.mock("../../../../../../../src/engine/network-complaint-handler", () => ({
  handleNetworkComplaint: mocks.handleNetworkComplaint,
}));

import { POST } from "./route";

const SECRET = "whsec_" + Buffer.from("test-secret-key-1234567890ab").toString("base64");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    type: "event",
    event_type: "message.complained",
    event_id: "evt_1",
    complaint: {
      inbox_id: "inbox-1",
      thread_id: "thread-1",
      message_id: "message-1",
      timestamp: "2026-05-18T12:00:00.000Z",
      type: "abuse",
      sub_type: "spam",
      recipients: ["recipient@example.com"],
    },
    ...overrides,
  };
}

function signSvix(rawBody: string, svixId = `msg_${randomUUID()}`) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const toSign = `${svixId}.${timestamp}.${rawBody}`;
  const secretBytes = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  const sig = createHmac("sha256", secretBytes).update(toSign).digest("base64");
  return {
    "svix-id": svixId,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sig}`,
  };
}

function request(body: Record<string, unknown>, opts: { query?: string; validSignature?: boolean; svixId?: string } = {}) {
  const rawBody = JSON.stringify(body);
  const headers = opts.validSignature === false
    ? { "svix-id": "msg_bad", "svix-timestamp": "1", "svix-signature": "v1,bad" }
    : signSvix(rawBody, opts.svixId);
  return new Request(`http://localhost/api/v1/network/complaints${opts.query ?? ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.networkTransaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(mocks.txDb),
  );
  process.env.AGENTMAIL_WEBHOOK_SECRET = SECRET;
});

describe("/api/v1/network/complaints", () => {
  it("rejects invalid Svix signatures with zero writes", async () => {
    const response = await POST(request(payload(), { validSignature: false }));

    expect(response.status).toBe(401);
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.claimNetworkWebhookDelivery).not.toHaveBeenCalled();
    expect(mocks.handleNetworkComplaint).not.toHaveBeenCalled();
  });

  it("mints a wrapper run and handles valid message.complained payloads", async () => {
    const response = await POST(request(payload(), { svixId: "msg_valid" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "network-complaint",
        sessionId: "thread-1",
        actorId: "inbox-1",
      }),
    );
    expect(mocks.claimNetworkWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.txDb,
        svixId: "msg_valid",
        eventType: "message.complained",
        stepRunId: "network-lane-step:complaint:test",
      }),
    );
    expect(mocks.handleNetworkComplaint).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.txDb,
        stepRunId: "network-lane-step:complaint:test",
        complaint: expect.objectContaining({ recipients: ["recipient@example.com"] }),
      }),
    );
  });

  it("returns ok without writes for duplicate Svix deliveries", async () => {
    mocks.hasActiveNetworkWebhookDelivery.mockResolvedValueOnce(true);

    const response = await POST(request(payload(), { svixId: "msg_dupe" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(mocks.networkTransaction).not.toHaveBeenCalled();
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.claimNetworkWebhookDelivery).not.toHaveBeenCalled();
    expect(mocks.handleNetworkComplaint).not.toHaveBeenCalled();
  });

  it("handles a race-lost dedup claim without invoking the complaint handler", async () => {
    mocks.claimNetworkWebhookDelivery.mockResolvedValueOnce({ claimed: false, duplicate: true });

    const response = await POST(request(payload(), { svixId: "msg_race" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(mocks.networkTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.createNetworkLaneStepRun).toHaveBeenCalled();
    expect(mocks.handleNetworkComplaint).not.toHaveBeenCalled();
  });

  it("keeps the dedup claim and complaint writes in one transaction", async () => {
    const response = await POST(request(payload(), { svixId: "msg_atomic" }));

    expect(response.status).toBe(200);
    expect(mocks.networkTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.claimNetworkWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.txDb }),
    );
    expect(mocks.handleNetworkComplaint).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.txDb }),
    );
  });

  it("does not swallow complaint handler failures after claiming dedup", async () => {
    mocks.handleNetworkComplaint.mockRejectedValueOnce(new Error("complaint handler failed"));

    await expect(POST(request(payload(), { svixId: "msg_handler_failure" }))).rejects.toThrow(
      "complaint handler failed",
    );
    expect(mocks.networkTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.claimNetworkWebhookDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ db: mocks.txDb }),
    );
  });

  it.each([
    [{ stepRunId: false }, ""],
    [{}, "?stepRunId=network-lane-step%3Abad"],
  ])("rejects caller-supplied stepRunId before minting: %j %s", async (extra, query) => {
    const response = await POST(request(payload(extra), { query }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.handleNetworkComplaint).not.toHaveBeenCalled();
  });

  it("rejects non-complaint event types without writes", async () => {
    const response = await POST(request(payload({ event_type: "message.received" })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unsupported_event_type" });
    expect(mocks.createNetworkLaneStepRun).not.toHaveBeenCalled();
    expect(mocks.handleNetworkComplaint).not.toHaveBeenCalled();
  });
});
