import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import { classifyAndPrepare } from "./network-email-compliance";

const NOW = new Date("2026-05-18T12:00:00.000Z");
const CONFIG = {
  defaultFrom: "network@ditto.partners",
  defaultReplyTo: "reply@ditto.partners",
  allowedMailboxes: ["network@ditto.partners", "reply@ditto.partners"],
  unsubscribeMailto: "mailto:unsubscribe@ditto.partners",
  unsubscribeUrl: "https://ditto.partners/api/v1/network/unsubscribe",
  canSpamFooterEnabled: true,
  physicalAddress: "2261 Market Street #4814, San Francisco, CA 94114",
};

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "email-compliance-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "email-compliance-test",
    rootDir,
    now: NOW,
  });
}

describe("network email compliance", () => {
  it("resolves sender identity to the configured network mailbox", async () => {
    const result = await classifyAndPrepare({
      kind: "claim-invite",
      to: "recipient@example.com",
      subject: "A possible fit",
      body: "Hello.",
      config: CONFIG,
      suppressionCheck: async () => false,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.headers.From).toBe("network@ditto.partners");
    expect(result.headers["Reply-To"]).toBe("reply@ditto.partners");
  });

  it("rejects sender overrides that are not configured network mailboxes", async () => {
    const result = await classifyAndPrepare({
      kind: "claim-invite",
      to: "recipient@example.com",
      subject: "A possible fit",
      body: "Hello.",
      fromOverride: "ceo@example.com",
      config: CONFIG,
      suppressionCheck: async () => false,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockedReason).toBe("sender-identity");
  });

  it("accepts configured sender overrides", async () => {
    const result = await classifyAndPrepare({
      kind: "intro",
      to: "recipient@example.com",
      subject: "Intro to Sam",
      body: "Hello.",
      fromOverride: "reply@ditto.partners",
      config: CONFIG,
      suppressionCheck: async () => false,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.headers.From).toBe("reply@ditto.partners");
  });

  it.each(["claim-invite", "intro"] as const)(
    "adds RFC 8058 one-click headers for %s",
    async (kind) => {
      const result = await classifyAndPrepare({
        kind,
        to: "recipient@example.com",
        subject: "A possible fit",
        body: "Hello.",
        config: CONFIG,
        suppressionCheck: async () => false,
        now: NOW,
      });

      expect(result.ok).toBe(true);
      expect(result.headers["List-Unsubscribe"]).toContain("mailto:unsubscribe@ditto.partners");
      expect(result.headers["List-Unsubscribe"]).toContain("https://ditto.partners/api/v1/network/unsubscribe");
      expect(result.headers["List-Unsubscribe"]).not.toContain("recipient@example.com");
      expect(result.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    },
  );

  it("blocks suppressed recipients and writes an audited refusal row", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const result = await classifyAndPrepare({
        db,
        rootDir,
        stepRunId,
        kind: "intro",
        to: "suppressed@example.com",
        subject: "Intro to Sam",
        body: "Hello.",
        config: CONFIG,
        suppressionCheck: async () => true,
        now: NOW,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.blockedReason).toBe("suppression");

      const rows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.reasonCode, "suppression"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventClass: "operator_suppressed",
        subjectType: "outbound_email",
        stepRunId,
      });
      expect(JSON.stringify(rows[0]).toLowerCase()).not.toContain("suppressed@example.com");
    });
  }, 15_000);

  it("fails closed when the suppression store is unavailable", async () => {
    const result = await classifyAndPrepare({
      kind: "claim-invite",
      to: "recipient@example.com",
      subject: "A possible fit",
      body: "Hello.",
      config: CONFIG,
      suppressionCheck: async () => {
        throw new Error("db unavailable");
      },
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockedReason).toBe("suppression-store-unavailable");
  });

  it("adds CAN-SPAM footer with configured physical address when enabled", async () => {
    const result = await classifyAndPrepare({
      kind: "claim-invite",
      to: "recipient@example.com",
      subject: "A possible fit",
      body: "Hello.",
      config: CONFIG,
      suppressionCheck: async () => false,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.footer).toContain(CONFIG.physicalAddress);
    if (result.ok) expect(result.body).toContain(CONFIG.physicalAddress);
  });

  it("omits CAN-SPAM footer when the config flag is off", async () => {
    const result = await classifyAndPrepare({
      kind: "claim-invite",
      to: "recipient@example.com",
      subject: "A possible fit",
      body: "Hello.",
      config: { ...CONFIG, canSpamFooterEnabled: false },
      suppressionCheck: async () => false,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.footer).toBeNull();
    if (result.ok) expect(result.body).toBe("Hello.");
  });

  it.each([
    "Acting as your assistant on this",
    "Re: ticket #18472",
    "Urgent action required today",
  ])("blocks misleading subject category: %s", async (subject) => {
    const result = await classifyAndPrepare({
      kind: "claim-invite",
      to: "recipient@example.com",
      subject,
      body: "Hello.",
      config: CONFIG,
      suppressionCheck: async () => false,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockedReason).toBe("misleading-subject");
  });
});
