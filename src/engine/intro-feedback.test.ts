import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  type NetworkDbTransaction,
  withNetworkDbTransaction,
} from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import { recordIntroFeedback } from "./intro-feedback";

const NOW = new Date("2026-05-19T12:00:00.000Z");

let savedKbRoot: string | undefined;
let savedTestMode: string | undefined;
let tempRoot: string;
let stepRunId: string;

beforeAll(async () => {
  savedKbRoot = process.env.NETWORK_KB_ROOT;
  savedTestMode = process.env.DITTO_TEST_MODE;
  process.env.DITTO_TEST_MODE = "true";
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "intro-feedback-"));
  process.env.NETWORK_KB_ROOT = tempRoot;
  stepRunId = await createNetworkLaneStepRun({
    route: "intro-feedback-test",
    now: NOW,
  });
});

afterAll(async () => {
  if (savedKbRoot === undefined) delete process.env.NETWORK_KB_ROOT;
  else process.env.NETWORK_KB_ROOT = savedKbRoot;
  if (savedTestMode === undefined) delete process.env.DITTO_TEST_MODE;
  else process.env.DITTO_TEST_MODE = savedTestMode;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedIntro(db: NetworkDbTransaction) {
  await db.insert(networkSchema.networkUsers).values([
    {
      id: "requester-289",
      email: "rob-289@example.com",
      name: "Rob Requester",
      handle: "rob-289",
    },
    {
      id: "recipient-289",
      email: "priya-289@example.com",
      name: "Priya Recipient",
      handle: "priya-289",
    },
  ]);
  const [intro] = await db
    .insert(networkSchema.introductions)
    .values({
      id: "intro-289",
      targetUserId: "recipient-289",
      requesterUserId: "requester-289",
      recipientUserId: "recipient-289",
      recipientEmail: "priya-289@example.com",
      requesterDisplayName: "Rob Requester",
      originContext: "mira-proposed",
      intentSummary: "Intro Rob to Priya for advisory help.",
      state: "thread-sent",
      threadSentAt: new Date("2026-05-01T12:00:00.000Z"),
      threadMessageId: "thread-intro-289",
      followUpCadenceDays: 14,
    })
    .returning();
  return intro;
}

describe("recordIntroFeedback", () => {
  it("writes feedback, audit, terminal state, additive member signal, and outcome metrics", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedIntro(db);
      const [signal] = await db
        .insert(networkSchema.networkMemberSignals)
        .values({
          id: "signal-existing",
          userId: "requester-289",
          status: "draft",
        })
        .returning();
      const [source] = await db
        .insert(networkSchema.networkSignalSources)
        .values({
          memberSignalId: signal.id,
          userId: "requester-289",
          sourceType: "inference",
          sourceLabel: "Existing source",
          status: "found",
          evidenceSnippet: "Existing evidence",
        })
        .returning();
      await db.insert(networkSchema.networkSignalClaims).values({
        id: "claim-existing",
        memberSignalId: signal.id,
        userId: "requester-289",
        sourceId: source.id,
        section: "canHelpWith",
        claimText: "Existing additive claim",
        sourceType: "inference",
        sourceLabel: "Existing source",
        evidenceSnippet: "Existing evidence",
        visibility: "private",
        approvalState: "suggested",
      });

      const result = await recordIntroFeedback({
        db,
        stepRunId,
        introId: "intro-289",
        party: "requester",
        payload: {
          eventType: "reply",
          classifiedCategory: "outcome:useful",
          outcomeClass: "advisory",
          freeText: "Great intro, advisory engagement signed last week.",
          sourceMessageId: "msg-feedback-1",
        },
        now: NOW,
      });

      expect(result.feedback.classifiedCategory).toBe("outcome:useful");
      expect(result.introduction.state).toBe("feedback-collected");
      expect(result.introduction.feedbackCollectedAt?.toISOString()).toBe(
        NOW.toISOString(),
      );

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.subjectId, "intro-289"));
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].eventClass).toBe("intro_feedback_recorded");
      expect((auditRows[0].metadata as Record<string, unknown>).byParty).toBe(
        "requester",
      );

      const claims = await db
        .select()
        .from(networkSchema.networkSignalClaims)
        .where(eq(networkSchema.networkSignalClaims.userId, "requester-289"));
      expect(claims.map((claim) => claim.claimText)).toContain(
        "Existing additive claim",
      );
      expect(claims.some((claim) => claim.claimText.includes("advisory"))).toBe(
        true,
      );

      const metrics = await db.select().from(networkSchema.networkOutcomeMetrics);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].workspaceId).toBe("requester-289");
      expect(metrics[0].usefulCount).toBe(1);
      expect(metrics[0].advisoryCount).toBe(1);
    });
  });

  it("adds anti-persona feedback and caps no-outcome retry at one", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedIntro(db);
      await recordIntroFeedback({
        db,
        stepRunId,
        introId: "intro-289",
        party: "recipient",
        payload: {
          eventType: "chat-disambiguator-submit",
          classifiedCategory: "decline:too-junior",
          freeText: "Looking for someone who has run a Series A.",
        },
        now: NOW,
      });

      const antiPersonaRows = await db
        .select()
        .from(networkSchema.networkUserAntiPersona)
        .where(eq(networkSchema.networkUserAntiPersona.userId, "recipient-289"));
      expect(antiPersonaRows).toHaveLength(1);
      expect(antiPersonaRows[0].ruleMd).toContain("decline:too-junior");

      await recordIntroFeedback({
        db,
        stepRunId,
        introId: "intro-289",
        party: "requester",
        payload: {
          eventType: "button-click",
          classifiedCategory: "outcome:no-outcome-yet",
          outcomeClass: "no-outcome",
        },
        now: NOW,
      });
      await recordIntroFeedback({
        db,
        stepRunId,
        introId: "intro-289",
        party: "requester",
        payload: {
          eventType: "button-click",
          classifiedCategory: "outcome:no-outcome-yet",
          outcomeClass: "no-outcome",
        },
        now: new Date(NOW.getTime() + 60_000),
      });

      const [intro] = await db
        .select()
        .from(networkSchema.introductions)
        .where(eq(networkSchema.introductions.id, "intro-289"));
      const metadata = intro.metadata as Record<string, unknown>;
      expect(metadata.followUpRetryCount).toBe(1);
      expect(intro.state).toBe("thread-sent");
    });
  });

  it("rejects non-server-minted step ids before writing feedback", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedIntro(db);
      await expect(
        recordIntroFeedback({
          db,
          stepRunId: "network-lane-step:forged:11111111-1111-4111-8111-111111111111",
          introId: "intro-289",
          party: "requester",
          payload: {
            eventType: "reply",
            classifiedCategory: "outcome:useful",
            outcomeClass: "advisory",
          },
          now: NOW,
        }),
      ).rejects.toThrow(/server-minted network-lane stepRunId/);

      const rows = await db.select().from(networkSchema.networkIntroFeedback);
      expect(rows).toHaveLength(0);
    });
  });
});
