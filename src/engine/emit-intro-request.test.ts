import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  type NetworkDbTransaction,
  withNetworkDbTransaction,
} from "../db/network-db-test-helpers";
import { _resetForTesting, getEventsAfter } from "./network-events";
import {
  EMIT_INTRO_REQUEST_TOOL_NAME,
  INTRO_COST_LABELS,
  emitIntroRequest,
  insertNetworkUserBlockListEntry,
  isValidBlockListPattern,
  updateIntroductionStateForAuthorization,
} from "./emit-intro-request";

const originalTestMode = process.env.DITTO_TEST_MODE;

beforeEach(() => {
  _resetForTesting();
});

afterEach(() => {
  if (originalTestMode === undefined) delete process.env.DITTO_TEST_MODE;
  else process.env.DITTO_TEST_MODE = originalTestMode;
});

async function seedUsers(db: NetworkDbTransaction) {
  await db.insert(networkSchema.networkUsers).values([
    { id: "target-user", email: "target@example.com", name: "Tim Green", handle: "tim-green" },
    { id: "requester-user", email: "requester@example.com", name: "Casey Client", handle: "casey-client" },
    { id: "new-expert", email: "new-expert@example.com", name: "Avery Expert", handle: "avery-expert" },
  ]);
}

function baseInput(overrides: Partial<Parameters<typeof emitIntroRequest>[0]> = {}) {
  return {
    stepRunId: "network-lane-step:intro-test",
    originContext: "client" as const,
    targetUserId: "target-user",
    targetDisplayName: "Tim Green",
    requesterUserId: "requester-user",
    requesterDisplayName: "Casey Client",
    intentSummary: "I need a revenue operator who can build founder-led outbound.",
    transcript: [{ type: "text" as const, text: "Client transcript" }],
    ...overrides,
  };
}

describe("emit_intro_request", () => {
  it("refuses without stepRunId outside DITTO_TEST_MODE", async () => {
    delete process.env.DITTO_TEST_MODE;
    await expect(
      emitIntroRequest(baseInput({ stepRunId: null })),
    ).rejects.toThrow(`${EMIT_INTRO_REQUEST_TOOL_NAME} requires stepRunId`);
  });

  it("computes first, second, and review labels and persists workspace delivery", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUsers(db);

      const first = await emitIntroRequest({ db, ...baseInput({ intentSummary: "first intro" }) });
      const second = await emitIntroRequest({ db, ...baseInput({ intentSummary: "second intro" }) });
      const third = await emitIntroRequest({ db, ...baseInput({ intentSummary: "third intro" }) });

      expect(first.block.costLabel).toBe(INTRO_COST_LABELS.first);
      expect(first.introduction.state).toBe("queued");
      expect(second.block.costLabel).toBe(INTRO_COST_LABELS.second);
      expect(second.introduction.state).toBe("queued");
      expect(third.block.costLabel).toBe(INTRO_COST_LABELS.review);
      expect(third.introduction.state).toBe("queued-for-review");
      expect(third.delivery?.kind).toBe("visitor_intro_request");
      expect(getEventsAfter("target-user", 0)?.at(-1)?.payload).toMatchObject({
        viewSlug: "inbox",
        mode: "append",
      });
    });
  }, 20_000);

  it.each([
    ["anti-persona", "client"],
    ["anti-persona", "visitor"],
    ["low-fit", "client"],
    ["low-fit", "visitor"],
    ["user-block", "client"],
    ["user-block", "visitor"],
    ["rate-limit", "client"],
    ["rate-limit", "visitor"],
  ] as const)("applies %s refusal in %s lane", async (reason, lane) => {
    await withNetworkDbTransaction(async (db) => {
      await seedUsers(db);
      const now = new Date("2026-05-13T00:00:00.000Z");
      const visitorSessionId = lane === "visitor" ? `visitor-${reason}` : null;
      const input = baseInput({
        originContext: lane,
        requesterUserId: lane === "client" ? "requester-user" : null,
        visitorSessionId,
        intentSummary:
          reason === "anti-persona"
            ? "I am a pure strategy consultant who only drafts strategy."
            : "I need a revenue operator.",
        matchConfidence: reason === "low-fit" ? 0.2 : 0.8,
        now,
      });

      if (reason === "anti-persona") {
        await db.insert(networkSchema.networkUserAntiPersona).values({
          userId: "target-user",
          ruleMd: "Don't intro consultants who only draft strategy.",
          storagePath: "anti-persona.md",
          status: "active",
        });
      }
      if (reason === "user-block") {
        await insertNetworkUserBlockListEntry({
          db,
          targetUserId: "target-user",
          kind: lane === "client" ? "workspace-user" : "visitor-session",
          blockedRequesterIdentifier: lane === "client" ? "requester-user" : visitorSessionId!,
          now,
        });
      }
      if (reason === "rate-limit") {
        await db.insert(networkSchema.introductions).values(
          Array.from({ length: 5 }, (_, index) => ({
            id: `rate-${lane}-${index}`,
            targetUserId: "target-user",
            requesterUserId: lane === "client" ? "requester-user" : null,
            visitorSessionId: lane === "visitor" ? visitorSessionId : null,
            originContext: lane,
            intentSummary: `previous ${index}`,
            state: "refused-by-greeter" as const,
            refusalReason: "low-fit" as const,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      const result = await emitIntroRequest({ db, ...input });

      expect(result.delivery).toBeNull();
      expect(result.block.state).toBe("rejected");
      expect(result.introduction).toMatchObject({
        state: "refused-by-greeter",
        refusalReason: reason,
      });
      expect(result.block.executionResult?.reasonForVisitor).toBeTruthy();
      if (reason === "anti-persona") {
        expect(result.block.executionResult?.reasonForVisitor?.toLowerCase()).not.toContain(
          "consultants who only draft strategy",
        );
      }
    });
  }, 20_000);

  it("keeps crossover counters scoped to the originating requester identity", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUsers(db);

      const expertToClient = await emitIntroRequest({
        db,
        ...baseInput({
          originContext: "expert-crossover",
          requesterUserId: "requester-user",
          intentSummary: "Find me clients like this target.",
        }),
      });
      expect(expertToClient.introduction.requesterUserId).toBe("requester-user");

      const visitor = await emitIntroRequest({
        db,
        ...baseInput({
          originContext: "visitor",
          requesterUserId: null,
          visitorSessionId: "visitor-session-1",
          intentSummary: "Visitor wants an intro.",
        }),
      });
      expect(visitor.introduction.visitorSessionId).toBe("visitor-session-1");

      const newExpert = await emitIntroRequest({
        db,
        ...baseInput({
          requesterUserId: "new-expert",
          visitorSessionId: null,
          intentSummary: "New expert starts with a fresh counter.",
        }),
      });
      expect(newExpert.block.costLabel).toBe(INTRO_COST_LABELS.first);
    });
  }, 20_000);

  it("updates introduction state from authorization events", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUsers(db);
      const result = await emitIntroRequest({ db, ...baseInput() });

      const approved = await updateIntroductionStateForAuthorization({
        db,
        authorizationId: result.block.authorizationId!,
        event: "send-it",
      });
      expect(approved?.state).toBe("approved");

      const [row] = await db
        .select()
        .from(networkSchema.introductions)
        .where(eq(networkSchema.introductions.id, result.introduction.id));
      expect(row.state).toBe("approved");
    });
  }, 20_000);

  it("bounds block-list patterns to simple wildcards", async () => {
    expect(isValidBlockListPattern("*@spam.test")).toBe(true);
    expect(isValidBlockListPattern("bad(domain).*")).toBe(false);
    expect(isValidBlockListPattern("x".repeat(255))).toBe(false);

    await withNetworkDbTransaction(async (db) => {
      await seedUsers(db);
      await expect(
        insertNetworkUserBlockListEntry({
          db,
          targetUserId: "target-user",
          kind: "pattern",
          blockedRequesterIdentifier: "bad(domain).*",
        }),
      ).rejects.toThrow("simple wildcard");
    });
  }, 20_000);

  it("emits a self-contained block body without network-tier references", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUsers(db);
      const result = await emitIntroRequest({ db, ...baseInput() });

      expect(result.block.request).toContain("Intro request");
      expect(result.block.draft).toContain("Casey Client");
      expect(result.block.preview).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "text" })]),
      );
      expect(JSON.stringify(result.block)).not.toContain("networkDb");
      expect(JSON.parse(JSON.stringify(result.block))).toMatchObject({
        type: "authorization-request",
        costLabel: INTRO_COST_LABELS.first,
      });
    });
  }, 20_000);
});
