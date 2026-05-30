/**
 * Intro Flow — End-to-End Two-Sided Consent Integration (Brief 288 AC #19 / B3)
 *
 * Drives the full consent state machine through the *real* engine recorders
 * against a live PGlite network DB. No mocked DB, and crucially no injected
 * compliance on the requester→recipient hop: `recordRequesterApproval` calls
 * `sendRecipientApprovalEmail` internally with the real `classifyAndPrepare`,
 * so this proves the hop survives the actual email-compliance gate on a clean
 * store. The matrix:
 *
 *   proposed → requester-approved → recipient-asked → recipient-approved
 *   proposed → declined (requester decline is terminal; recipient never asked)
 *
 * and across the whole flow that:
 *   - exactly one audit row is written per transition — the defensive
 *     idempotent delivery re-write inside `recordRequesterApproval` does NOT
 *     double-write audit events,
 *   - exactly two workspace deliveries survive (requester + recipient) even
 *     though `proposeIntroduction` AND `ensureDeliveriesForIntro` both queue
 *     them — first-writer-wins dedupe holds end to end,
 *   - the terminal columns (`requesterApprovedAt` / `recipientApprovedAt` /
 *     `declineCategory`) land on the introductions row.
 *
 * Audit-step-run coupling: the engine recorders call `writeNetworkAuditEvent`
 * WITHOUT a rootDir, so the server-minted-stepRunId lookup resolves through
 * `process.env.NETWORK_KB_ROOT`. We point that at a temp dir and mint the run
 * via `createNetworkLaneStepRun` (also rootDir-less → same env path) so the
 * JSONL append and the audit lookup share one directory.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  type NetworkDbTransaction,
  withNetworkDbTransaction,
} from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";

process.env.DITTO_TEST_MODE = "true";

const { proposeIntroduction } = await import("./intro-proposal");
const { recordRequesterApproval, recordRecipientApproval } = await import(
  "./intro-approval"
);

const NOW = new Date("2026-05-19T12:00:00.000Z");

let savedKbRoot: string | undefined;
let savedTestMode: string | undefined;
let tempRoot: string;
let stepRunId: string;

beforeAll(async () => {
  savedKbRoot = process.env.NETWORK_KB_ROOT;
  savedTestMode = process.env.DITTO_TEST_MODE;
  process.env.DITTO_TEST_MODE = "true";
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "intro-flow-"));
  process.env.NETWORK_KB_ROOT = tempRoot;
  // rootDir-less mint → appends to auditRoot(undefined) = NETWORK_KB_ROOT,
  // the same path the engine recorders' audit guard reads from.
  stepRunId = await createNetworkLaneStepRun({
    route: "intro-flow-integration",
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

async function seedParties(db: NetworkDbTransaction): Promise<void> {
  await db.insert(networkSchema.networkUsers).values([
    {
      id: "intro-requester",
      email: "rob@example.com",
      name: "Rob Requester",
      handle: "rob-requester",
    },
    {
      id: "intro-recipient",
      email: "priya@example.com",
      name: "Priya Rao",
      handle: "priya-rao",
    },
  ]);
}

function proposeInput(db: NetworkDbTransaction) {
  return {
    db,
    stepRunId,
    requesterUserId: "intro-requester",
    requesterDisplayName: "Rob Requester",
    recipientUserId: "intro-recipient",
    recipientEmail: "priya@example.com",
    recipientDisplayName: "Priya Rao",
    whyThisFits: "Strong operator fit for the founding GTM hire.",
    whyNow: "She just wrapped her last engagement and is taking calls.",
    evidence: [],
    whatStaysPrivate: ["Your pipeline notes"],
    confidence: 0.8,
    intentSummary: "Intro Rob to Priya for the founding GTM hire.",
    recipientPreviewHeader: "Rob would like an intro",
    recipientPreviewDraft:
      "Rob is hiring a founding GTM lead and thought you two should talk.",
    now: NOW,
  };
}

describe("intro flow end-to-end consent (Brief 288 AC #19 / B3)", () => {
  it("drives proposed → requester-approved → recipient-asked → recipient-approved with one audit row per transition and durable deliveries", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedParties(db);

      // 1. proposeIntroduction → proposed, both deliveries queued.
      const proposed = await proposeIntroduction(proposeInput(db));
      const introId = proposed.introduction.id;
      expect(proposed.introduction.state).toBe("proposed");
      expect(proposed.requesterDelivery).not.toBeNull();
      expect(proposed.recipientDelivery).not.toBeNull();
      expect(proposed.auditEventId).toBeTruthy();

      // 2. recordRequesterApproval(approve) → requester-approved, then the
      //    real classifyAndPrepare runs on a clean DB (no suppression rows)
      //    so the internal sendRecipientApprovalEmail advances the row to
      //    recipient-asked. The returned row is the pre-send snapshot.
      const requesterApproved = await recordRequesterApproval({
        db,
        stepRunId,
        introId,
        action: "approve",
        now: NOW,
      });
      expect(requesterApproved.ok).toBe(true);
      expect(requesterApproved.recipientEmailQueued).toBe(true);
      expect(requesterApproved.introduction?.state).toBe("requester-approved");

      const [afterAsk] = await db
        .select()
        .from(networkSchema.introductions)
        .where(eq(networkSchema.introductions.id, introId));
      expect(afterAsk.state).toBe("recipient-asked");
      expect(afterAsk.requesterApprovedAt).not.toBeNull();

      // 3. recordRecipientApproval(approve) → recipient-approved. The warm
      //    thread sender is injected so the assertion stays on the consent
      //    state machine, not the email-thread side-effect.
      const recipientApproved = await recordRecipientApproval({
        db,
        stepRunId,
        introId,
        action: "approve",
        createIntroThread: async () => ({ ok: true }),
        now: NOW,
      });
      expect(recipientApproved.ok).toBe(true);
      expect(recipientApproved.threadQueued).toBe(true);
      expect(recipientApproved.introduction?.state).toBe("recipient-approved");
      expect(recipientApproved.introduction?.recipientApprovedAt).not.toBeNull();

      // Audit-row uniqueness: exactly one row per transition, no double-writes
      // from the defensive ensureDeliveriesForIntro re-queue.
      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.subjectId, introId));
      expect(auditRows).toHaveLength(4);
      expect(auditRows.map((r) => r.eventClass).sort()).toEqual([
        "intro_proposed",
        "intro_recipient_approved",
        "intro_recipient_asked",
        "intro_requester_approved",
      ]);
      // Every audit row carries the server-minted run id.
      for (const row of auditRows) expect(row.stepRunId).toBe(stepRunId);

      // Delivery durability: proposeIntroduction queued both, then
      // ensureDeliveriesForIntro (inside recordRequesterApproval) re-queued
      // both with the same dedupeKeys — first-writer-wins keeps it at two.
      const deliveries = await db
        .select()
        .from(networkSchema.networkWorkspaceDeliveries)
        .where(
          inArray(networkSchema.networkWorkspaceDeliveries.dedupeKey, [
            `intro:${introId}:requester`,
            `intro:${introId}:recipient`,
          ]),
        );
      expect(deliveries).toHaveLength(2);
      expect(deliveries.every((d) => d.kind === "intro-proposal-card")).toBe(
        true,
      );
      expect(new Set(deliveries.map((d) => d.dedupeKey))).toEqual(
        new Set([
          `intro:${introId}:requester`,
          `intro:${introId}:recipient`,
        ]),
      );

      // AC #16: each delivery is addressed to the right party's workspace
      // and stamped with the server-minted run id — the cross-deployment
      // hop is auditable end to end, not just queued.
      const byKey = new Map(deliveries.map((d) => [d.dedupeKey, d]));
      const requesterDelivery = byKey.get(`intro:${introId}:requester`);
      const recipientDelivery = byKey.get(`intro:${introId}:recipient`);
      expect(requesterDelivery).toBeDefined();
      expect(recipientDelivery).toBeDefined();
      expect(requesterDelivery?.userId).toBe("intro-requester");
      expect(recipientDelivery?.userId).toBe("intro-recipient");
      expect(requesterDelivery?.sourceStepRunId).toBe(stepRunId);
      expect(recipientDelivery?.sourceStepRunId).toBe(stepRunId);

      // AC #16: the introductions row points back at both delivery rows.
      // The defensive ensureDeliveriesForIntro re-queue is first-writer-wins,
      // so the linkage minted at propose time survives the whole flow.
      expect(afterAsk.requesterDeliveryId).toBe(requesterDelivery?.id);
      expect(afterAsk.recipientDeliveryId).toBe(recipientDelivery?.id);
    });
  }, 30_000);

  it("treats requester decline as terminal and never asks the recipient", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedParties(db);
      const proposed = await proposeIntroduction(proposeInput(db));
      const introId = proposed.introduction.id;

      const declined = await recordRequesterApproval({
        db,
        stepRunId,
        introId,
        action: "decline",
        declineCategory: "not-a-fit",
        now: NOW,
      });
      expect(declined.ok).toBe(true);
      expect(declined.introduction?.state).toBe("declined");
      expect(declined.introduction?.declineCategory).toBe("not-a-fit");
      expect(declined.recipientEmailQueued).toBe(false);

      // A terminal state rejects any further transition — the recipient is
      // never asked for a declined intro.
      const reAttempt = await recordRecipientApproval({
        db,
        stepRunId,
        introId,
        action: "approve",
        createIntroThread: async () => ({ ok: true }),
        now: NOW,
      });
      expect(reAttempt.ok).toBe(false);
      expect(reAttempt.blockedReason).toMatch(/not in 'recipient-asked'/);

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.subjectId, introId));
      expect(auditRows.map((r) => r.eventClass).sort()).toEqual([
        "intro_declined",
        "intro_proposed",
      ]);
    });
  }, 30_000);
});
