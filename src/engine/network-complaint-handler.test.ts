import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import { handleNetworkComplaint, type AgentMailComplaint } from "./network-complaint-handler";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "complaint-handler-"));
}

async function step(rootDir: string, route = "complaint-handler-test"): Promise<string> {
  return createNetworkLaneStepRun({ route, rootDir, now: NOW });
}

function complaint(recipients: string[]): AgentMailComplaint {
  return {
    inboxId: "inbox-1",
    threadId: "thread-1",
    messageId: randomUUID(),
    timestamp: NOW.toISOString(),
    type: "abuse",
    subType: "spam",
    recipients,
  };
}

describe("network complaint handler", () => {
  it("records complaint suppressions and auto-pauses the source and segment at threshold", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const firstStep = await step(rootDir, "complaint-1");
      const first = await handleNetworkComplaint({
        db,
        rootDir,
        stepRunId: firstStep,
        complaint: complaint(["one@example.com"]),
        sourceClass: "public-web",
        segmentId: "founders",
        threshold: 2,
        now: NOW,
      });
      expect(first.createdSuppressions).toBe(1);
      expect(first.sourcePaused).toBe(false);
      expect(first.segmentPaused).toBe(false);

      const secondStep = await step(rootDir, "complaint-2");
      const second = await handleNetworkComplaint({
        db,
        rootDir,
        stepRunId: secondStep,
        complaint: complaint(["two@example.com"]),
        sourceClass: "public-web",
        segmentId: "founders",
        threshold: 2,
        now: new Date(NOW.getTime() + 1000),
      });

      expect(second.sourceComplaintCount).toBe(2);
      expect(second.segmentComplaintCount).toBe(2);
      expect(second.sourcePaused).toBe(true);
      expect(second.segmentPaused).toBe(true);

      const suppressions = await db.select().from(networkSchema.networkSuppressions);
      expect(suppressions.filter((row) => row.reason === "complaint")).toHaveLength(2);
      expect(suppressions.some((row) => row.reason === "source-pause")).toBe(true);
      expect(suppressions.some((row) => row.reason === "segment-pause")).toBe(true);
      expect(JSON.stringify(suppressions).toLowerCase()).not.toContain("one@example.com");

      const auditRows = await db.select().from(networkSchema.networkAuditEvents);
      expect(
        auditRows.filter((row) => row.subjectType === "agentmail_complaint_event"),
      ).toHaveLength(2);
      expect(auditRows.some((row) => row.reasonCode === "source-pause")).toBe(true);
      expect(auditRows.some((row) => row.reasonCode === "segment-pause")).toBe(true);
      expect(JSON.stringify(auditRows).toLowerCase()).not.toContain("one@example.com");
    });
  }, 15_000);

  it("increments counters for a new complaint event even when the recipient is already suppressed", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const payload = complaint(["repeat@example.com"]);

      const firstStepRunId = await step(rootDir, "repeat-complaint-1");
      const first = await handleNetworkComplaint({
        db,
        rootDir,
        stepRunId: firstStepRunId,
        svixId: "svix-1",
        complaint: payload,
        sourceClass: "agentmail",
        segmentId: "inbox-1",
        threshold: 2,
        now: NOW,
      });
      const secondStepRunId = await step(rootDir, "repeat-complaint-2");
      const second = await handleNetworkComplaint({
        db,
        rootDir,
        stepRunId: secondStepRunId,
        svixId: "svix-2",
        complaint: payload,
        sourceClass: "agentmail",
        segmentId: "inbox-1",
        threshold: 2,
        now: new Date(NOW.getTime() + 1000),
      });

      expect(first.createdSuppressions).toBe(1);
      expect(second.createdSuppressions).toBe(0);
      expect(second.sourceComplaintCount).toBe(2);
      expect(second.sourcePaused).toBe(true);
      const complaints = await db
        .select()
        .from(networkSchema.networkSuppressions)
        .where(eq(networkSchema.networkSuppressions.reason, "complaint"));
      expect(complaints).toHaveLength(1);
      const complaintEvents = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.subjectType, "agentmail_complaint_event"));
      expect(complaintEvents).toHaveLength(2);
    });
  }, 15_000);

  it.each([undefined, "", null, false, `network-lane-step:complaint:${randomUUID()}`])(
    "rejects absent, falsy, and spoofed stepRunId values before writing: %s",
    async (badStepRunId) => {
      await withNetworkDbTransaction(async (db) => {
        const rootDir = await tempRoot();
        await expect(
          handleNetworkComplaint({
            db,
            rootDir,
            stepRunId: badStepRunId,
            complaint: complaint(["bad@example.com"]),
            now: NOW,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);
        expect(await db.select().from(networkSchema.networkSuppressions)).toHaveLength(0);
        expect(await db.select().from(networkSchema.networkAuditEvents)).toHaveLength(0);
      });
    },
    15_000,
  );
});
