import { describe, expect, it, vi } from "vitest";
import type {
  IntroProposalCardBlock,
  NetworkProfileCardBlock,
} from "./content-blocks";
import type { ClassifyAndPrepareEmailResult } from "./network-email-compliance";

process.env.DITTO_TEST_MODE = "true";

const { recordRequesterApproval, recordRecipientApproval, sendRecipientApprovalEmail } =
  await import("./intro-approval");

type FakeIntroRow = {
  id: string;
  state: string;
  requesterApprovedAt: Date | null;
  recipientApprovedAt: Date | null;
  recipientEmail: string | null;
  recipientUserId: string | null;
  requesterUserId: string | null;
  requesterDisplayName: string | null;
  declineCategory: string | null;
  transcript: unknown[] | null;
  metadata: Record<string, unknown> | null;
};

function fakeDb(row: FakeIntroRow | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (row ? [row] : []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => [row] }),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "audit-event-1" }] }),
    }),
  } as unknown as Parameters<typeof recordRequesterApproval>[0]["db"];
}

describe("recordRequesterApproval state-machine guard (Brief 288 AC #18)", () => {
  it("rejects re-click when state has already moved past 'proposed'", async () => {
    // Double-click idempotency: a second "approve" finds the row already at
    // requester-approved and returns ok:false with a blockedReason instead
    // of double-writing the audit row.
    const row: FakeIntroRow = {
      id: "intro-already-approved",
      state: "requester-approved",
      requesterApprovedAt: new Date("2026-05-19T00:00:00.000Z"),
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [],
      metadata: null,
    };
    const result = await recordRequesterApproval({
      db: fakeDb(row),
      stepRunId: "test-step",
      introId: "intro-already-approved",
      action: "approve",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'proposed'/);
  });

  it("rejects approve when state is 'thread-sent' (re-clicked stale link)", async () => {
    const row: FakeIntroRow = {
      id: "intro-thread-sent",
      state: "thread-sent",
      requesterApprovedAt: new Date(),
      recipientApprovedAt: new Date(),
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [],
      metadata: null,
    };
    const result = await recordRequesterApproval({
      db: fakeDb(row),
      stepRunId: "test-step",
      introId: "intro-thread-sent",
      action: "approve",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'proposed'/);
  });

  it("throws when the introduction row does not exist", async () => {
    await expect(
      recordRequesterApproval({
        db: fakeDb(null),
        stepRunId: "test-step",
        introId: "intro-missing",
        action: "approve",
      }),
    ).rejects.toThrow(/introduction intro-missing not found/);
  });
});

describe("recordRecipientApproval state-machine guard (Brief 288 AC #18)", () => {
  it("rejects decline when state is still 'proposed' (requester has not approved yet)", async () => {
    const row: FakeIntroRow = {
      id: "intro-proposed",
      state: "proposed",
      requesterApprovedAt: null,
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [],
      metadata: null,
    };
    const result = await recordRecipientApproval({
      db: fakeDb(row),
      stepRunId: "test-step",
      introId: "intro-proposed",
      action: "decline",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'recipient-asked'/);
  });

  it("rejects re-click when state is already 'recipient-approved'", async () => {
    const row: FakeIntroRow = {
      id: "intro-recipient-approved",
      state: "recipient-approved",
      requesterApprovedAt: new Date(),
      recipientApprovedAt: new Date(),
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [],
      metadata: null,
    };
    const result = await recordRecipientApproval({
      db: fakeDb(row),
      stepRunId: "test-step",
      introId: "intro-recipient-approved",
      action: "approve",
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/not in 'recipient-asked'/);
  });
});

// ============================================================
// Brief 288 AC #11 / D11 — recipient-privacy scrub + edit-draft
// injection refusal. These exercise the security boundary the Dev
// Reviewer flagged (B4): the recipient email must pass the central
// scrubber, antiPersonaMd must be null on every non-owner render
// path, and a "Notes for Ditto" edit that copies owner-private claim
// text must be refused before any state write or downstream send.
// ============================================================

const SECRET_OFF_CLAIM = "Series A term sheet at 22 post no signal";
const ANTI_PERSONA_SECRET = "internal: never pitch this person on agency retainers";

function networkProfileCard(
  over: Partial<NetworkProfileCardBlock> = {},
): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "priya-rao",
    name: "Priya Rao",
    portraitUrl: null,
    cityLabel: null,
    oneLineRole: "Founder, infra startup",
    signalDots: [],
    badges: [],
    narrativeMd: "Public bio sentence.",
    antiPersonaMd: null,
    greeterCuratedBy: "mira",
    lastUpdatedAt: "2026-05-19T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/p/priya-rao",
    ogImageUrl: "https://ditto.partners/og/priya-rao.png",
    ...over,
  };
}

function introProposalCard(
  over: Partial<IntroProposalCardBlock> = {},
): IntroProposalCardBlock {
  return {
    type: "intro-proposal-card",
    state: "requester-approved",
    introId: "intro-priv-1",
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
      authorizationId: "intro-priv-1-recipient",
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

function spyDb(row: FakeIntroRow | null) {
  const update = vi.fn(() => ({
    set: () => ({ where: () => ({ returning: async () => [row] }) }),
  }));
  const insert = vi.fn(() => ({
    values: () => ({ returning: async () => [{ id: "audit-event-1" }] }),
  }));
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (row ? [row] : []) }),
      }),
    }),
    update,
    insert,
  } as unknown as Parameters<typeof recordRequesterApproval>[0]["db"];
  return { db, update, insert };
}

describe("sendRecipientApprovalEmail recipient-privacy scrub (Brief 288 AC #11)", () => {
  it("strips owner-private claim + anti-persona from the rendered email and counts the withhold", async () => {
    // Leak attempt: an `off`-visibility profile card embedded in the
    // recipient preview carries the secret in `narrativeMd`, and the
    // requester's `whyThisFits` copies that same secret string (as if a
    // prompt-injected draft tried to surface it). The send-time scrub must
    // collect the off-record content and redact it everywhere before the
    // email is composed.
    const card = introProposalCard({
      whyThisFits: `Great timing — ${SECRET_OFF_CLAIM} so the round is fresh.`,
      recipientPreview: {
        ...introProposalCard().recipientPreview,
        preview: [
          networkProfileCard({
            visibility: "off",
            narrativeMd: SECRET_OFF_CLAIM,
            antiPersonaMd: ANTI_PERSONA_SECRET,
          }) as unknown as NetworkProfileCardBlock,
        ],
      },
    });
    const row: FakeIntroRow = {
      id: "intro-priv-1",
      state: "requester-approved",
      requesterApprovedAt: new Date(),
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [card],
      metadata: null,
    };
    const { db, insert } = spyDb(row);

    let captured: { subject: string; body: string } | null = null;
    const compliance = (async (input: {
      subject: string;
      body: string;
    }): Promise<ClassifyAndPrepareEmailResult> => {
      captured = { subject: input.subject, body: input.body };
      // Simulate a suppression hit so the call returns before the audit
      // write (which would require a server-minted step run) — this also
      // covers the AC #19 "compliance/suppression hit" matrix entry.
      return {
        ok: false,
        kind: "intro",
        blockedReason: "suppression",
        footer: null,
        headers: {},
      };
    }) as unknown as Parameters<
      typeof sendRecipientApprovalEmail
    >[0]["compliance"];

    const result = await sendRecipientApprovalEmail({
      db,
      stepRunId: "test-step",
      introId: "intro-priv-1",
      compliance,
    });

    expect(captured).not.toBeNull();
    const seen = `${captured!.subject}\n${captured!.body}`;
    expect(seen).not.toContain(SECRET_OFF_CLAIM);
    expect(seen).not.toContain(ANTI_PERSONA_SECRET);
    expect(seen).toContain("[private]");
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("suppression");
    expect(result.scrubWithheld ?? 0).toBeGreaterThan(0);
    // Returned before any audit write — no server-minted run was needed.
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("recordRequesterApproval edit-draft injection refusal (Brief 288 D11 / AC #19)", () => {
  it("refuses an edit that copies owner anti-persona text — before any state write or send", async () => {
    const card = introProposalCard({
      state: "proposed",
      recipientPreview: {
        ...introProposalCard().recipientPreview,
        preview: [
          networkProfileCard({
            antiPersonaMd: ANTI_PERSONA_SECRET,
          }) as unknown as NetworkProfileCardBlock,
        ],
      },
    });
    const row: FakeIntroRow = {
      id: "intro-priv-1",
      state: "proposed",
      requesterApprovedAt: null,
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [card],
      metadata: null,
    };
    const { db, update, insert } = spyDb(row);

    const result = await recordRequesterApproval({
      db,
      stepRunId: "test-step",
      introId: "intro-priv-1",
      action: "edit-and-approve",
      edit: `Please also mention — ${ANTI_PERSONA_SECRET} — when you reach out.`,
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toMatch(/injects private-claim data/);
    // The refusal is before the row update and the audit insert.
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not refuse a benign edit that contains no owner-private text", async () => {
    // A clean edit must pass the injection guard. With the fakeDb pattern
    // it then reaches `writeNetworkAuditEvent`, which rejects the non
    // server-minted "test-step" id — proving the guard did NOT
    // short-circuit. (The full clean edit-and-approve happy path is
    // covered end-to-end in intro-flow.integration.test.ts.)
    const card = introProposalCard({
      state: "proposed",
      recipientPreview: {
        ...introProposalCard().recipientPreview,
        preview: [
          networkProfileCard({
            antiPersonaMd: ANTI_PERSONA_SECRET,
          }) as unknown as NetworkProfileCardBlock,
        ],
      },
    });
    const row: FakeIntroRow = {
      id: "intro-priv-1",
      state: "proposed",
      requesterApprovedAt: null,
      recipientApprovedAt: null,
      recipientEmail: "priya@example.com",
      recipientUserId: null,
      requesterUserId: "user-rob",
      requesterDisplayName: "Rob",
      declineCategory: null,
      transcript: [card],
      metadata: null,
    };
    const { db } = spyDb(row);

    await expect(
      recordRequesterApproval({
        db,
        stepRunId: "test-step",
        introId: "intro-priv-1",
        action: "edit-and-approve",
        edit: "Looks great — happy for you to send this as is.",
      }),
    ).rejects.toThrow(/server-minted network-lane stepRunId/);
  });
});
