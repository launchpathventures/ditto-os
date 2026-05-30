import { randomUUID } from "crypto";
import fs from "fs/promises";
import { readFileSync } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  NETWORK_AUDIT_EVENT_CLASSES,
  isValidNetworkAuditStepRunId,
  writeNetworkAuditEvent,
} from "./network-audit";

const NOW = new Date("2026-05-18T00:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-audit-"));
}

async function stepRun(route = "network-audit-test"): Promise<{
  rootDir: string;
  stepRunId: string;
}> {
  const rootDir = await tempRoot();
  const stepRunId = await createNetworkLaneStepRun({ route, rootDir, now: NOW });
  return { rootDir, stepRunId };
}

describe("writeNetworkAuditEvent", () => {
  it("writes append-only decision audit rows linked to a network lane step run", async () => {
    await withNetworkDbTransaction(async (db) => {
      const run = await stepRun();
      const row = await writeNetworkAuditEvent({
        db,
        rootDir: run.rootDir,
        stepRunId: run.stepRunId,
        eventClass: "search_feedback",
        subjectType: "possible_connection",
        subjectId: "pc_1",
        actorType: "visitor",
        actorId: "visitor-1",
        reasonCode: "not_a_fit",
        metadata: { scrubDecision: { withheldTotal: 2 } },
        now: NOW,
      });

      const rows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.id, row.id));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventClass: "search_feedback",
        subjectType: "possible_connection",
        subjectId: "pc_1",
        actorType: "visitor",
        actorId: "visitor-1",
        reasonCode: "not_a_fit",
        stepRunId: run.stepRunId,
        prevHash: null,
      });
      expect(rows[0].metadata).toEqual({ scrubDecision: { withheldTotal: 2 } });
      expect(Object.keys(rows[0])).not.toContain("stepOutput");
      expect(Object.keys(rows[0])).not.toContain("route");
    });
  }, 15_000);

  it.each([
    undefined,
    "",
    0,
    null,
    false,
    "fake-step-run",
    "web-direct-action:bad",
    "network-lane-step:search:not-a-uuid",
    `network-lane-step:search:${randomUUID()}`,
  ])(
    "rejects absent, falsy, and spoofed stepRunId values before writing: %s",
    async (badStepRunId) => {
      await withNetworkDbTransaction(async (db) => {
        const rootDir = await tempRoot();
        await expect(
          writeNetworkAuditEvent({
            db,
            rootDir,
            stepRunId: badStepRunId,
            eventClass: "delete",
            subjectType: "member_signal",
            subjectId: "signal-1",
            actorType: "system",
            now: NOW,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);

        const rows = await db.select().from(networkSchema.networkAuditEvents);
        expect(rows).toHaveLength(0);
      });
    },
    15_000,
  );

  it("supports every parent AC #9 event class", async () => {
    expect(NETWORK_AUDIT_EVENT_CLASSES).toEqual([
      "source_added",
      "source_removed",
      "source_policy_blocked",
      "claim_edited",
      "claim_visibility_changed",
      "profile_visibility_changed",
      "watch_lifecycle_changed",
      "user_block_added",
      "user_block_removed",
      "request_edited",
      "search_feedback",
      "invitation_candidate_scored",
      "operator_approved",
      "operator_suppressed",
      "operator_paused_discovery",
      "operator_resumed_discovery",
      "invite_sent",
      "claim",
      "decline",
      "complaint",
      "delete",
      "privacy_export",
      "system_retention",
      "watch_feedback",
      // Brief 293 — Background Watch runs, proposals, and auto-pause events.
      "watch_run",
      "watch_proposal",
      "watch_paused_auto",
      "intro_approved",
      "intro_declined",
      "share_generated",
      // Brief 290 — per-channel Share Studio variant generation.
      "share_studio_variant_generated",
      // Brief 291 — visitor conversion attribution.
      "share_attribution_recorded",
      // Brief 288 — outbound (Mira-proposed) intro state transitions.
      "intro_proposed",
      "intro_requester_approved",
      "intro_recipient_asked",
      "intro_recipient_approved",
      "intro_thread_sent",
      "intro_not_now",
      "intro_feedback_recorded",
      "profile_deleted",
      "dry_run_replay",
      "admin_override",
      "operator_revealed_raw_text",
    ]);

    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      for (const eventClass of NETWORK_AUDIT_EVENT_CLASSES) {
        const stepRunId = await createNetworkLaneStepRun({
          route: eventClass,
          rootDir,
          now: NOW,
        });
        await writeNetworkAuditEvent({
          db,
          rootDir,
          stepRunId,
          eventClass,
          subjectType: "coverage",
          subjectId: eventClass,
          actorType: "system",
          now: NOW,
        });
      }

      const rows = await db.select().from(networkSchema.networkAuditEvents);
      expect(rows.map((row) => row.eventClass).sort()).toEqual(
        [...NETWORK_AUDIT_EVENT_CLASSES].sort(),
      );
    });
  }, 15_000);

  it("keeps networkAuditEvents insert-only in the audit module", () => {
    const source = readFileSync(new URL("./network-audit.ts", import.meta.url), "utf-8");
    expect(source).toContain(".insert(networkSchema.networkAuditEvents)");
    expect(source).not.toMatch(/\.update\(networkSchema\.networkAuditEvents\)/);
    expect(source).not.toMatch(/\.delete\(networkSchema\.networkAuditEvents\)/);
  });

  it("exposes the reserved nullable prevHash column", () => {
    expect(networkSchema.networkAuditEvents.prevHash).toBeDefined();
  });

  it("recognizes only server-minted Network lane audit origins", async () => {
    const run = await stepRun();

    await expect(
      isValidNetworkAuditStepRunId(run.stepRunId, { rootDir: run.rootDir }),
    ).resolves.toBe(true);
    await expect(
      isValidNetworkAuditStepRunId(`network-lane-step:test:${randomUUID()}`, {
        rootDir: run.rootDir,
      }),
    ).resolves.toBe(false);
    await expect(
      isValidNetworkAuditStepRunId(randomUUID(), { rootDir: run.rootDir }),
    ).resolves.toBe(false);
    await expect(
      isValidNetworkAuditStepRunId("network-lane-step:share", {
        rootDir: run.rootDir,
      }),
    ).resolves.toBe(false);
  });
});
