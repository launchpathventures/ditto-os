import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { _resetForTesting, getEventsAfter } from "./network-events";
import { forwardNoteToUser } from "./forward-note-to-user";

describe("forward_note_to_user", () => {
  const originalTestMode = process.env.DITTO_TEST_MODE;

  afterEach(() => {
    if (originalTestMode === undefined) delete process.env.DITTO_TEST_MODE;
    else process.env.DITTO_TEST_MODE = originalTestMode;
    _resetForTesting();
  });

  it("refuses without stepRunId outside DITTO_TEST_MODE", async () => {
    delete process.env.DITTO_TEST_MODE;

    await expect(
      forwardNoteToUser({
        db: {} as never,
        userId: "user-1",
        factQuestionMd: "Tell Tim this.",
      }),
    ).rejects.toThrow("forward_note_to_user requires stepRunId");
  });

  it("persists the forwarded note shape", async () => {
    await withNetworkDbTransaction(async (db) => {
      await db.insert(networkSchema.networkUsers).values({
        id: "user-forward-note",
        email: "forward-note@example.com",
      });

      const result = await forwardNoteToUser({
        db,
        userId: "user-forward-note",
        stepRunId: "network-lane-step:visitor",
        fromVisitor: {
          name: "Avery",
          org: "Acme",
          ip: "203.0.113.50",
          sessionId: "visitor-session-1",
        },
        factQuestionMd: "Could Tim help with Series B SDR hiring?",
        now: new Date("2026-05-12T00:00:00.000Z"),
      });

      const [row] = await db
        .select()
        .from(networkSchema.networkForwardedNotes)
        .where(eq(networkSchema.networkForwardedNotes.id, result.note.id));

      expect(row).toMatchObject({
        userId: "user-forward-note",
        fromVisitorName: "Avery",
        fromVisitorOrg: "Acme",
        visitorIp: "203.0.113.50",
        visitorSessionId: "visitor-session-1",
        factQuestionMd: "Could Tim help with Series B SDR hiring?",
        status: "pending",
      });
    });
  }, 20_000);

  it("emits a self-contained inbox drop to the workspace event stream", async () => {
    await withNetworkDbTransaction(async (db) => {
      await db.insert(networkSchema.networkUsers).values({
        id: "user-forward-event",
        email: "forward-event@example.com",
      });
      _resetForTesting();

      await forwardNoteToUser({
        db,
        userId: "user-forward-event",
        stepRunId: "network-lane-step:visitor",
        fromVisitor: { sessionId: "visitor-session-2" },
        factQuestionMd: "Tell Tim Acme is hiring 10 SDRs.",
      });

      const events = getEventsAfter("user-forward-event", 0);
      expect(events?.[0]).toMatchObject({
        type: "workspace_blocks_push",
        payload: {
          viewSlug: "inbox",
          mode: "append",
        },
      });
      expect(events?.[0].payload.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "record",
            subtitle: "Tell Tim Acme is hiring 10 SDRs.",
          }),
        ]),
      );
    });
  }, 20_000);
});
