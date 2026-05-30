import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { createTestDb, type TestDb } from "../../../../../../../src/test-utils";
import * as schema from "../../../../../../../src/db/schema";
import {
  withNetworkDbTransaction,
  type NetworkDbTransaction,
} from "../../../../../../../src/db/network-db-test-helpers";
import * as networkSchema from "@ditto/core/db/network";

let testDb: TestDb;
let cleanup: () => void;
let currentTx: NetworkDbTransaction | null = null;

vi.mock("../../../../../../../src/db", async () => {
  const realSchema = await vi.importActual<typeof import("../../../../../../../src/db/schema")>(
    "../../../../../../../src/db/schema",
  );
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

vi.mock("../../../../../../../src/db/network-db", () => ({
  get networkDb() {
    if (!currentTx) {
      throw new Error(
        "[handle/route.test] networkDb accessed outside withNetworkDbTransaction.",
      );
    }
    return currentTx;
  },
  ensureNetworkSchema: vi.fn(async () => {}),
}));

const { POST } = await import("./route");

function card(overrides: Partial<NetworkProfileCardBlock> = {}): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "Turns founder networks into warm pipeline",
    signalDots: [
      { id: "uvp", label: "Value", filled: true, color: "petal" },
      { id: "fit", label: "Fit", filled: true, color: "mint" },
    ],
    badges: [{ label: "Introductions", color: "canary" }],
    narrativeMd: "I help founders turn latent trust into warm commercial paths.",
    antiPersonaMd: null,
    greeterCuratedBy: "alex",
    lastUpdatedAt: new Date().toISOString(),
    visibility: "on-request",
    shareUrl: "/people/timhgreen",
    ogImageUrl: "/api/v1/network/og/timhgreen",
    ...overrides,
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/network/handle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function insertExpertSession(
  sessionId: string,
  authenticatedEmail: string | null = null,
  context: "expert" | "client" = "expert",
) {
  await testDb.insert(schema.chatSessions).values({
    sessionId,
    messages: [],
    context,
    ipHash: `hash-${sessionId}`,
    authenticatedEmail,
    expiresAt: new Date(Date.now() + 60_000),
  });
}

/** Wrap a test body in a network-db transaction so writes roll back. */
function net(fn: (tx: NetworkDbTransaction) => Promise<void>): () => Promise<void> {
  return () =>
    withNetworkDbTransaction(async (tx) => {
      currentTx = tx;
      try {
        await fn(tx);
      } finally {
        currentTx = null;
      }
    });
}

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
  currentTx = null;
});

describe("POST /api/v1/network/handle", () => {
  it("claims a handle, persists the card, and fires the expert upsell once", net(async (tx) => {
    await insertExpertSession("lane-session", "tim@example.com");

    const first = await POST(request({
      sessionId: "lane-session",
      name: "Tim Green",
      handle: "timhgreen",
      card: card(),
      wantsVisibility: true,
      triggerUpsell: true,
    }));

    expect(first.status).toBe(200);
    const firstJson = await first.json() as {
      ok: boolean;
      handle: string;
      upsell: boolean;
      upsellCopy?: string | null;
    };
    expect(firstJson).toMatchObject({ ok: true, handle: "timhgreen", upsell: true });
    expect(firstJson.upsellCopy).toContain("Worth it if you do this kind of hunting more than twice a year");

    const second = await POST(request({
      sessionId: "lane-session",
      name: "Tim Green",
      handle: "timhgreen",
      card: card(),
      wantsVisibility: true,
      triggerUpsell: true,
    }));
    const secondJson = await second.json() as { ok: boolean; handle: string; upsell: boolean };
    expect(secondJson).toMatchObject({ ok: true, handle: "timhgreen", upsell: false });

    const upsellRows = await tx.select().from(networkSchema.networkSessionUpsellLog);
    expect(upsellRows).toHaveLength(1);
    expect(upsellRows[0]).toMatchObject({ trigger: "expert-q6" });

    const [stored] = await tx
      .select({
        email: networkSchema.networkUsers.email,
        handle: networkSchema.networkUsers.handle,
        wantsVisibility: networkSchema.networkUsers.wantsVisibility,
        card: networkSchema.networkUsers.card,
      })
      .from(networkSchema.networkUsers);
    expect(stored?.email).toBe("tim@example.com");
    expect(stored?.handle).toBe("timhgreen");
    expect(stored?.wantsVisibility).toBe(true);
    expect(stored?.card?.shareUrl).toBe("https://ditto.partners/people/timhgreen");
    expect(stored?.card?.visibility).toBe("public");
  }), 20_000);

  it("returns handle alternatives when the handle is already taken", net(async (tx) => {
    await insertExpertSession("other-session");
    await tx.insert(networkSchema.networkUsers).values({
      email: "existing@example.com",
      name: "Existing User",
      handle: "timhgreen",
    });

    const response = await POST(request({
      sessionId: "other-session",
      handle: "timhgreen",
      card: card(),
    }));

    expect(response.status).toBe(409);
    const json = await response.json() as {
      ok: boolean;
      reason: string;
      alternatives: string[];
    };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("taken");
    expect(json.alternatives).toHaveLength(2);
    expect(json.alternatives).not.toContain("timhgreen");
  }));

  it("rejects reserved handles", net(async () => {
    await insertExpertSession("reserved-session");
    const response = await POST(request({
      sessionId: "reserved-session",
      handle: "ditto",
      card: card({ handle: "ditto" }),
    }));

    expect(response.status).toBe(409);
    const json = await response.json() as { ok: boolean; reason: string; alternatives: string[] };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("reserved");
    expect(json.alternatives).toHaveLength(2);
  }));

  it("does not use body email as write authority", net(async (tx) => {
    await insertExpertSession("attacker-session");
    await tx.insert(networkSchema.networkUsers).values({
      email: "victim@example.com",
      name: "Victim",
      handle: "victim",
    });

    const response = await POST(request({
      sessionId: "attacker-session",
      email: "victim@example.com",
      name: "Attacker",
      handle: "attacker",
      card: card({ handle: "attacker", name: "Attacker" }),
    }));

    expect(response.status).toBe(200);
    const rows = await tx
      .select({
        email: networkSchema.networkUsers.email,
        handle: networkSchema.networkUsers.handle,
      })
      .from(networkSchema.networkUsers);
    expect(rows).toEqual(
      expect.arrayContaining([
        { email: "victim@example.com", handle: "victim" },
        { email: "network-attacker-session@ditto.local", handle: "attacker" },
      ]),
    );
  }));

  it("persists profile pause and resume from a verified lane session", net(async (tx) => {
    await insertExpertSession("client-session", "tim@example.com", "client");
    await tx.insert(networkSchema.networkUsers).values({
      email: "tim@example.com",
      name: "Tim Green",
      handle: "timhgreen",
      wantsVisibility: true,
      card: card({ visibility: "public" }),
    });

    const pause = await POST(request({
      action: "set_visibility",
      sessionId: "client-session",
      context: "client",
      wantsVisibility: false,
    }));

    expect(pause.status).toBe(200);
    expect(await pause.json()).toMatchObject({
      ok: true,
      wantsVisibility: false,
      paused: true,
    });

    const [paused] = await tx
      .select({
        wantsVisibility: networkSchema.networkUsers.wantsVisibility,
        pausedAt: networkSchema.networkUsers.pausedAt,
        card: networkSchema.networkUsers.card,
      })
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.email, "tim@example.com"));
    expect(paused?.wantsVisibility).toBe(false);
    expect(paused?.pausedAt).toBeTruthy();
    expect(paused?.card?.visibility).toBe("off");
    const auditRows = await tx
      .select({
        eventClass: networkSchema.networkAuditEvents.eventClass,
        subjectType: networkSchema.networkAuditEvents.subjectType,
        metadata: networkSchema.networkAuditEvents.metadata,
      })
      .from(networkSchema.networkAuditEvents)
      .where(eq(networkSchema.networkAuditEvents.subjectType, "public-profile"));
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventClass: "profile_visibility_changed",
          subjectType: "public-profile",
          metadata: expect.objectContaining({
            before: expect.objectContaining({
              wantsVisibility: true,
              cardVisibility: "public",
            }),
            after: expect.objectContaining({
              wantsVisibility: false,
              cardVisibility: "off",
            }),
            context: "client",
          }),
        }),
      ]),
    );

    const resume = await POST(request({
      action: "set_visibility",
      sessionId: "client-session",
      context: "client",
      wantsVisibility: true,
    }));

    expect(resume.status).toBe(200);
    const [resumed] = await tx
      .select({
        wantsVisibility: networkSchema.networkUsers.wantsVisibility,
        pausedAt: networkSchema.networkUsers.pausedAt,
        card: networkSchema.networkUsers.card,
      })
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.email, "tim@example.com"));
    expect(resumed?.wantsVisibility).toBe(true);
    expect(resumed?.pausedAt).toBeNull();
    expect(resumed?.card?.visibility).toBe("public");
  }));

  it.each([null, "", false, "network-lane-step:spoof"])(
    "rejects caller-supplied stepRunId before profile visibility writes: %s",
    async (stepRunId) =>
      net(async (tx) => {
        await insertExpertSession("guard-session", "tim@example.com", "client");
        await tx.insert(networkSchema.networkUsers).values({
          email: "tim@example.com",
          name: "Tim Green",
          handle: "timhgreen",
          wantsVisibility: true,
        });

        const response = await POST(request({
          action: "set_visibility",
          sessionId: "guard-session",
          context: "client",
          wantsVisibility: false,
          stepRunId,
        }));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "step_run_bypass_rejected" });
        const [user] = await tx
          .select({ wantsVisibility: networkSchema.networkUsers.wantsVisibility })
          .from(networkSchema.networkUsers)
          .where(eq(networkSchema.networkUsers.email, "tim@example.com"));
        expect(user?.wantsVisibility).toBe(true);
      })(),
  );

  it("rejects claims that are not attached to a live expert lane session", net(async (tx) => {
    const response = await POST(request({
      sessionId: "local-fallback-session",
      name: "Local User",
      handle: "localuser",
      card: card({ handle: "localuser", name: "Local User" }),
    }));

    expect(response.status).toBe(403);
    const rows = await tx.select().from(networkSchema.networkUsers);
    expect(rows).toHaveLength(0);
  }));

  it("rejects malformed card payloads at runtime", net(async () => {
    await insertExpertSession("malformed-session");
    const response = await POST(request({
      sessionId: "malformed-session",
      handle: "timhgreen",
      card: {
        type: "network-profile-card",
        handle: "timhgreen",
        name: "Tim Green",
      },
    }));

    expect(response.status).toBe(400);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("valid network profile card is required.");
  }));
});
