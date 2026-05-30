import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type {
  AuthorizationRequestBlock,
  IntroProposalCardBlock,
} from "@/lib/engine";
import { createTestDb, type TestDb } from "../../../../../../../../src/test-utils";
import * as schema from "../../../../../../../../src/db/schema";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../../../../../../../src/db", async () => {
  const schema = await vi.importActual<typeof import("../../../../../../../../src/db/schema")>(
    "../../../../../../../../src/db/schema",
  );
  return {
    get db() {
      return testDb;
    },
    schema,
  };
});

const { POST } = await import("./route");

function authBlock(): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: "Intro request for Tim",
    preview: [],
    recipientLabel: "Tim Green",
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
    authorizationId: "auth-1",
    costLabel: null,
  };
}

function introProposalCard(): IntroProposalCardBlock {
  return {
    type: "intro-proposal-card",
    state: "proposed",
    introId: "intro-ws-1",
    header: "Mira: intro to Priya Rao?",
    whyThisFits: "Strong operator fit for the hire.",
    whyNow: "She just closed a round.",
    evidence: [],
    risks: null,
    recipientPreview: {
      type: "authorization-request",
      state: "pending",
      header: "Rob would like an intro",
      preview: [],
      recipientLabel: "Priya Rao",
      actionClass: "email-send",
      executionResult: null,
      expiresAt: null,
      authorizationId: "intro-ws-1-recipient",
      request: "intro",
      draft: "draft",
      requesterId: "user-rob",
      costLabel: null,
    },
    whatStaysPrivate: ["Your pipeline notes"],
    costLabel: null,
    confidence: 0.8,
    affordances: ["approve", "decline", "not-now", "edit-draft", "open-chat"],
  };
}

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  vi.stubEnv("DITTO_NETWORK_URL", "https://network.example.com");
  vi.stubEnv("DITTO_NETWORK_TOKEN", "network-token");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/v1/workspace/inbox/import", () => {
  it("acks already-imported deliveries so failed prior ACKs can retry", async () => {
    const delivery = {
      id: "delivery-1",
      kind: "visitor_intro_request",
      blocks: [authBlock()],
      createdAt: "2026-05-13T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = String(url);
      if (urlString.endsWith("/api/v1/network/workspace-deliveries?limit=50")) {
        return new Response(JSON.stringify({ deliveries: [delivery] }), { status: 200 });
      }
      if (urlString.endsWith("/api/v1/network/workspace-deliveries") && init?.method === "POST") {
        return new Response(JSON.stringify({ imported: 1 }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await POST();
    expect(await first.json()).toMatchObject({
      imported: 1,
      acknowledged: 1,
      deliveryIds: ["delivery-1"],
    });

    const second = await POST();
    expect(await second.json()).toMatchObject({
      imported: 0,
      acknowledged: 1,
      deliveryIds: ["delivery-1"],
    });

    const ackBodies = fetchMock.mock.calls
      .filter(([url, init]) => String(url).endsWith("/api/v1/network/workspace-deliveries") && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as { ids: string[] });
    expect(ackBodies).toEqual([{ ids: ["delivery-1"] }, { ids: ["delivery-1"] }]);
  });

  it("imports an intro-proposal-card delivery into a local activities row and re-ACKs it idempotently (Brief 288 AC #17)", async () => {
    const delivery = {
      id: "delivery-intro-1",
      kind: "intro-proposal-card",
      blocks: [introProposalCard()],
      createdAt: "2026-05-19T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlString = String(url);
      if (urlString.endsWith("/api/v1/network/workspace-deliveries?limit=50")) {
        return new Response(JSON.stringify({ deliveries: [delivery] }), { status: 200 });
      }
      if (urlString.endsWith("/api/v1/network/workspace-deliveries") && init?.method === "POST") {
        return new Response(JSON.stringify({ imported: 1 }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await POST();
    expect(await first.json()).toMatchObject({
      imported: 1,
      acknowledged: 1,
      deliveryIds: ["delivery-intro-1"],
    });

    // The proposal card lands in a local activities row carrying the full
    // block, so the workspace inbox can render and act on it offline.
    const afterFirst = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.entityId, "delivery-intro-1"));
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({
      action: "workspace_inbox_delivery",
      entityType: "network_workspace_delivery",
    });
    const metadata = afterFirst[0].metadata as {
      kind?: string;
      blocks?: IntroProposalCardBlock[];
    };
    expect(metadata.kind).toBe("intro-proposal-card");
    expect(metadata.blocks?.[0]).toMatchObject({
      type: "intro-proposal-card",
      introId: "intro-ws-1",
      state: "proposed",
    });
    expect(afterFirst[0].contentBlock).toMatchObject({
      type: "intro-proposal-card",
      introId: "intro-ws-1",
    });

    // Second pull: already imported, so imported:0 and no duplicate row —
    // but it is STILL ACKed. Insight-234 durable pull-and-ack: a failed
    // prior ACK must stay retryable, so re-ACK is the correct behavior.
    const second = await POST();
    expect(await second.json()).toMatchObject({
      imported: 0,
      acknowledged: 1,
      deliveryIds: ["delivery-intro-1"],
    });
    const afterSecond = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.entityId, "delivery-intro-1"));
    expect(afterSecond).toHaveLength(1);

    const ackBodies = fetchMock.mock.calls
      .filter(([url, init]) => String(url).endsWith("/api/v1/network/workspace-deliveries") && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as { ids: string[] });
    expect(ackBodies).toEqual([
      { ids: ["delivery-intro-1"] },
      { ids: ["delivery-intro-1"] },
    ]);
  });
});
