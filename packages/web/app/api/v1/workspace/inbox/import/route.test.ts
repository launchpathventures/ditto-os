import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizationRequestBlock } from "@/lib/engine";
import { createTestDb, type TestDb } from "../../../../../../../../src/test-utils";

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
});
