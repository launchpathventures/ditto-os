import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { IntroProposalCardBlock } from "@/lib/engine";
import { createTestDb, type TestDb } from "../../../../../../../../src/test-utils";
import * as schema from "../../../../../../../../src/db/schema";

let testDb: TestDb;
let cleanup: () => void;
let savedNetworkUrl: string | undefined;
let savedNetworkToken: string | undefined;

vi.mock("../../../../../../../../src/db", async () => {
  const realSchema = await vi.importActual<
    typeof import("../../../../../../../../src/db/schema")
  >("../../../../../../../../src/db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

const { POST } = await import("./route");

function introCard(
  over: Partial<IntroProposalCardBlock> = {},
): IntroProposalCardBlock {
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
    ...over,
  };
}

async function seedDelivery(
  id: string,
  block: IntroProposalCardBlock,
): Promise<void> {
  await testDb.insert(schema.activities).values({
    id,
    action: "workspace_inbox_delivery",
    description: block.header,
    actorType: "network",
    actorId: "user-1",
    entityType: "network_workspace_delivery",
    entityId: `delivery-${id}`,
    metadata: {
      kind: "intro-proposal-card",
      blocks: [block],
    },
    contentBlock: block as unknown as Record<string, unknown>,
  });
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/workspace/inbox/intro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  // notifyNetworkIntroConsent must no-op so the test never makes a real
  // cross-deployment fetch; the route returns early when these are unset.
  savedNetworkUrl = process.env.DITTO_NETWORK_URL;
  savedNetworkToken = process.env.DITTO_NETWORK_TOKEN;
  delete process.env.DITTO_NETWORK_URL;
  delete process.env.DITTO_NETWORK_TOKEN;
});

afterEach(() => {
  cleanup();
  if (savedNetworkUrl === undefined) delete process.env.DITTO_NETWORK_URL;
  else process.env.DITTO_NETWORK_URL = savedNetworkUrl;
  if (savedNetworkToken === undefined) delete process.env.DITTO_NETWORK_TOKEN;
  else process.env.DITTO_NETWORK_TOKEN = savedNetworkToken;
});

describe("POST /api/v1/workspace/inbox/intro (Brief 288 AC #18)", () => {
  it("advances a 'proposed' card to 'requester-approved' on approve and persists it locally", async () => {
    await seedDelivery("activity-1", introCard({ state: "proposed" }));

    const response = await POST(
      request({ introId: "intro-ws-1", consentAction: "approve" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      updated: true,
      state: "requester-approved",
    });

    const [row] = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, "activity-1"));
    const metadata = row.metadata as {
      blocks?: IntroProposalCardBlock[];
      introState?: string;
      introResolvedAt?: string;
    };
    expect(metadata.blocks?.[0]).toMatchObject({
      type: "intro-proposal-card",
      introId: "intro-ws-1",
      state: "requester-approved",
    });
    expect(metadata.introState).toBe("requester-approved");
    expect(typeof metadata.introResolvedAt).toBe("string");
    expect(row.contentBlock).toMatchObject({
      type: "intro-proposal-card",
      introId: "intro-ws-1",
      state: "requester-approved",
    });
    expect(row.description).toBe("Mira: intro to Priya Rao? (requester-approved)");
  });

  it("advances a 'recipient-asked' card to 'recipient-approved' on approve", async () => {
    await seedDelivery("activity-2", introCard({ state: "recipient-asked" }));

    const response = await POST(
      request({ introId: "intro-ws-1", consentAction: "approve" }),
    );

    expect(await response.json()).toEqual({
      updated: true,
      state: "recipient-approved",
    });
  });

  it("treats decline as terminal regardless of the card's current state", async () => {
    await seedDelivery("activity-3", introCard({ state: "recipient-asked" }));

    const response = await POST(
      request({ introId: "intro-ws-1", consentAction: "decline" }),
    );

    expect(await response.json()).toEqual({
      updated: true,
      state: "declined",
    });
    const [row] = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, "activity-3"));
    expect(row.contentBlock).toMatchObject({ state: "declined" });
  });

  it("is idempotent — re-applying approve never regresses the resolved state", async () => {
    await seedDelivery("activity-4", introCard({ state: "proposed" }));

    const first = await POST(
      request({ introId: "intro-ws-1", consentAction: "approve" }),
    );
    expect(await first.json()).toEqual({
      updated: true,
      state: "requester-approved",
    });

    // Second click: the stored card is already at requester-approved, which
    // is neither 'proposed' nor 'recipient-asked', so the resolved state is
    // unchanged — it must not regress or double-advance.
    const second = await POST(
      request({ introId: "intro-ws-1", consentAction: "approve" }),
    );
    expect(await second.json()).toEqual({
      updated: true,
      state: "requester-approved",
    });
  });

  it("returns updated:false with a null state when no imported card matches", async () => {
    await seedDelivery("activity-5", introCard({ introId: "some-other-intro" }));

    const response = await POST(
      request({ introId: "intro-ws-1", consentAction: "approve" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: false, state: null });
  });

  it("rejects a malformed consent action before any local mutation (400)", async () => {
    await seedDelivery("activity-6", introCard({ state: "proposed" }));

    const response = await POST(
      request({ introId: "intro-ws-1", consentAction: "delete-everything" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_intro_consent_action",
    });
    // The stored card is untouched.
    const [row] = await testDb
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, "activity-6"));
    expect(row.contentBlock).toMatchObject({ state: "proposed" });
  });

  it("rejects a missing introId (400)", async () => {
    const response = await POST(request({ consentAction: "approve" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_intro_consent_action",
    });
  });
});
