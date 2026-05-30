import { describe, expect, it, vi } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { eq } from "drizzle-orm";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { runIntroFollowUpScheduler } from "./intro-followup-scheduler";

describe("runIntroFollowUpScheduler", () => {
  it("sends one follow-up per party at cadence and stamps feedbackRequestedAt", async () => {
    await withNetworkDbTransaction(async (db) => {
      await db.insert(networkSchema.networkUsers).values([
        {
          id: "scheduler-requester",
          email: "scheduler-rob@example.com",
          name: "Rob",
        },
        {
          id: "scheduler-recipient",
          email: "scheduler-priya@example.com",
          name: "Priya",
        },
      ]);
      await db.insert(networkSchema.introductions).values({
        id: "scheduler-intro",
        targetUserId: "scheduler-recipient",
        requesterUserId: "scheduler-requester",
        recipientUserId: "scheduler-recipient",
        recipientEmail: "scheduler-priya@example.com",
        originContext: "mira-proposed",
        intentSummary: "Intro Rob to Priya",
        state: "thread-sent",
        threadSentAt: new Date("2026-05-01T00:00:00.000Z"),
        followUpCadenceDays: 14,
      });

      const send = vi.fn().mockResolvedValue({ ok: true });
      const result = await runIntroFollowUpScheduler({
        db,
        stepRunId: "test-step-run",
        now: new Date("2026-05-16T00:00:00.000Z"),
        send,
      });

      expect(result).toEqual({ scanned: 1, sent: 2, blocked: 0 });
      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ introId: "scheduler-intro", party: "requester" }),
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ introId: "scheduler-intro", party: "recipient" }),
      );

      const [intro] = await db
        .select()
        .from(networkSchema.introductions)
        .where(eq(networkSchema.introductions.id, "scheduler-intro"));
      expect(intro.feedbackRequestedAt?.toISOString()).toBe(
        "2026-05-16T00:00:00.000Z",
      );
    });
  });
});
