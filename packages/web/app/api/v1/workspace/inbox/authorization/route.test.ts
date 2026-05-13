import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { AuthorizationRequestBlock } from "@/lib/engine";
import { createTestDb, type TestDb } from "../../../../../../../../src/test-utils";
import * as schema from "../../../../../../../../src/db/schema";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../../../../../../../src/db", async () => {
  const realSchema = await vi.importActual<typeof import("../../../../../../../../src/db/schema")>(
    "../../../../../../../../src/db/schema",
  );
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

const { POST } = await import("./route");

function pendingBlock(): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: "Intro request for Tim",
    preview: [],
    recipientLabel: "Tim Green",
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
    authorizationId: "visitor-intro-auth-1",
    costLabel: null,
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/workspace/inbox/authorization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("POST /api/v1/workspace/inbox/authorization", () => {
  it("writes the terminal authorization block back onto the imported inbox activity", async () => {
    const block = pendingBlock();
    await testDb.insert(schema.activities).values({
      id: "activity-1",
      action: "workspace_inbox_delivery",
      description: "Intro request for Tim",
      actorType: "network",
      actorId: "user-1",
      entityType: "network_workspace_delivery",
      entityId: "delivery-1",
      metadata: {
        kind: "visitor_intro_request",
        blocks: [block],
      },
      contentBlock: block as unknown as Record<string, unknown>,
    });

    const response = await POST(request({
      authorizationAction: {
        authorizationId: "visitor-intro-auth-1",
        event: "not-yet",
        header: "Intro request for Tim",
        recipientLabel: "Tim Green",
        actionClass: "email-send",
        preview: [],
      },
    }));

    expect(response.status).toBe(200);
    const [row] = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, "activity-1"));
    const metadata = row.metadata as { authorizationState?: string; blocks?: AuthorizationRequestBlock[] };
    expect(metadata.authorizationState).toBe("rejected");
    expect(metadata.blocks?.[0]).toMatchObject({
      type: "authorization-request",
      authorizationId: "visitor-intro-auth-1",
      state: "rejected",
    });
    expect(row.contentBlock).toMatchObject({
      type: "authorization-request",
      authorizationId: "visitor-intro-auth-1",
      state: "rejected",
    });
  });
});
