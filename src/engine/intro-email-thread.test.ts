import { describe, expect, it } from "vitest";

process.env.DITTO_TEST_MODE = "true";

const { createIntroThread } = await import("./intro-email-thread");

type FakeIntroRow = {
  id: string;
  state: string;
  requesterApprovedAt: Date | null;
  recipientApprovedAt: Date | null;
  recipientEmail: string | null;
  recipientUserId: string | null;
  requesterUserId: string | null;
  requesterDisplayName: string | null;
  transcript: unknown[] | null;
  threadSentAt: Date | null;
  threadMessageId: string | null;
  metadata: Record<string, unknown> | null;
};

function fakeDb(row: FakeIntroRow | null, requesterEmail: string | null = null) {
  return {
    select: (proj?: Record<string, unknown>) => ({
      from: (_t: unknown) => ({
        where: () => ({
          limit: async () => {
            // `db.select({email: ...}).from(networkUsers)` is the requester
            // lookup; bare `db.select().from(introductions)` is the intro
            // lookup. We discriminate by whether a projection was supplied.
            if (proj && "email" in proj) {
              return requesterEmail ? [{ email: requesterEmail }] : [];
            }
            return row ? [row] : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: async () => undefined }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "audit-event-1" }] }),
    }),
  } as unknown as Parameters<typeof createIntroThread>[0]["db"];
}

describe("createIntroThread two-sided consent gate (Brief 288 AC #10)", () => {
  it("rejects when state is 'requester-approved' but not yet 'recipient-approved'", async () => {
    const row: FakeIntroRow = {
      id: "intro-1",
      state: "requester-approved",
      requesterApprovedAt: new Date(),
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      transcript: [],
      threadSentAt: null,
      threadMessageId: null,
      metadata: null,
    };
    const result = await createIntroThread({
      db: fakeDb(row, "rob@example.com"),
      stepRunId: "test-step",
      introId: "intro-1",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'recipient-approved'/);
  });

  it("rejects when state is 'proposed' (neither party has approved)", async () => {
    const row: FakeIntroRow = {
      id: "intro-2",
      state: "proposed",
      requesterApprovedAt: null,
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      transcript: [],
      threadSentAt: null,
      threadMessageId: null,
      metadata: null,
    };
    const result = await createIntroThread({
      db: fakeDb(row, "rob@example.com"),
      stepRunId: "test-step",
      introId: "intro-2",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'recipient-approved'/);
  });

  it("rejects when both timestamps are missing even if state has been corrupted to 'recipient-approved'", async () => {
    // Defense in depth: even if state matches, missing approval timestamps
    // mean we never actually got both parties' consent.
    const row: FakeIntroRow = {
      id: "intro-3",
      state: "recipient-approved",
      requesterApprovedAt: null,
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      transcript: [],
      threadSentAt: null,
      threadMessageId: null,
      metadata: null,
    };
    const result = await createIntroThread({
      db: fakeDb(row, "rob@example.com"),
      stepRunId: "test-step",
      introId: "intro-3",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/requires both .*ApprovedAt/);
  });

  it("rejects when state is already 'thread-sent' (re-clicked stale completion)", async () => {
    const row: FakeIntroRow = {
      id: "intro-4",
      state: "thread-sent",
      requesterApprovedAt: new Date(),
      recipientApprovedAt: new Date(),
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      transcript: [],
      threadSentAt: new Date(),
      threadMessageId: "msg-existing",
      metadata: null,
    };
    const result = await createIntroThread({
      db: fakeDb(row, "rob@example.com"),
      stepRunId: "test-step",
      introId: "intro-4",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'recipient-approved'/);
  });

  it("rejects when recipientEmail is missing", async () => {
    const row: FakeIntroRow = {
      id: "intro-5",
      state: "recipient-approved",
      requesterApprovedAt: new Date(),
      recipientApprovedAt: new Date(),
      recipientEmail: null,
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      transcript: [],
      threadSentAt: null,
      threadMessageId: null,
      metadata: null,
    };
    const result = await createIntroThread({
      db: fakeDb(row, "rob@example.com"),
      stepRunId: "test-step",
      introId: "intro-5",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/recipientEmail/);
  });

  it("throws when the introduction row does not exist", async () => {
    await expect(
      createIntroThread({
        db: fakeDb(null),
        stepRunId: "test-step",
        introId: "intro-missing",
      }),
    ).rejects.toThrow(/introduction intro-missing not found/);
  });
});
