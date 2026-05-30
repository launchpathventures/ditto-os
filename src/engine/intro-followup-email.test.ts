import { describe, expect, it, vi } from "vitest";
import { renderFollowUpEmail } from "./intro-email-templates";
import { sendFollowUpEmail } from "./intro-followup-email";

process.env.DITTO_TEST_MODE = "true";

function fakeDb() {
  const intro = {
    id: "intro-followup",
    state: "thread-sent",
    requesterUserId: "requester-followup",
    recipientUserId: "recipient-followup",
    targetUserId: "recipient-followup",
    threadMessageId: "thread-followup",
    intentSummary: "Intro Rob to Priya",
  };
  const users = new Map([
    [
      "requester-followup",
      {
        id: "requester-followup",
        email: "rob@example.com",
        name: "Rob Requester",
        handle: "rob",
        workspaceId: "rob-workspace",
        personId: "person-rob",
      },
    ],
    [
      "recipient-followup",
      {
        id: "recipient-followup",
        email: "priya@example.com",
        name: "Priya Recipient",
        handle: "priya",
        workspaceId: "priya-workspace",
        personId: "person-priya",
      },
    ],
  ]);
  let selectLookup = 0;
  let userLookup = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            selectLookup += 1;
            if (selectLookup === 1) return [intro];
            if (selectLookup > 1) {
              userLookup += 1;
              return [
                users.get(
                  userLookup === 1 ? "requester-followup" : "recipient-followup",
                ),
              ];
            }
            return [];
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof sendFollowUpEmail>[0]["db"];
}

describe("renderFollowUpEmail", () => {
  it("stays under 200 words and has one primary outcome question with three links", () => {
    const rendered = renderFollowUpEmail({
      recipientFirstName: "Rob",
      introSubjectLabel: "Intro: Rob <> Priya",
      usefulUrl: "https://ditto.test/useful",
      notUsefulUrl: "https://ditto.test/not-useful",
      noOutcomeYetUrl: "https://ditto.test/no-outcome-yet",
    });
    expect(rendered.subject).toContain("was this intro useful");
    expect(rendered.body.split(/\s+/).filter(Boolean).length).toBeLessThan(200);
    expect(rendered.body).toContain("Useful:");
    expect(rendered.body).toContain("Not useful:");
    expect(rendered.body).toContain("No outcome yet:");
  });
});

describe("sendFollowUpEmail", () => {
  it("passes compliance and sends through notifyUser", async () => {
    const compliance = vi.fn().mockResolvedValue({
      ok: true,
      subject: "Mira: was this intro useful?",
      body: "body",
      headers: { From: "mira@rob.ditto.partners" },
      footer: null,
      kind: "intro",
      to: "rob@example.com",
    });
    const notify = vi.fn().mockResolvedValue({
      success: true,
      channel: "email",
      messageId: "msg-followup",
    });

    const result = await sendFollowUpEmail({
      db: fakeDb(),
      stepRunId: "test-step-run",
      introId: "intro-followup",
      party: "requester",
      compliance,
      notify,
    });

    expect(result.ok).toBe(true);
    expect(compliance).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "intro",
        to: "rob@example.com",
        fromOverride: "mira@rob.ditto.partners",
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "requester-followup",
        personId: "person-rob",
        personaId: "mira",
        headers: { From: "mira@rob.ditto.partners" },
      }),
    );
  });

  it("returns an audited compliance refusal without notifying", async () => {
    const compliance = vi.fn().mockResolvedValue({
      ok: false,
      blockedReason: "suppression",
      headers: {},
      footer: null,
      kind: "intro",
    });
    const notify = vi.fn();
    const result = await sendFollowUpEmail({
      db: fakeDb(),
      stepRunId: "test-step-run",
      introId: "intro-followup",
      party: "requester",
      compliance,
      notify,
    });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("suppression");
    expect(notify).not.toHaveBeenCalled();
  });
});
