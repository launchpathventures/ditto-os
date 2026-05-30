import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  SourcePolicyError,
  assertSourcePolicy,
  sourcePolicyAllows,
} from "./discovery-source-policy";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "source-policy-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "source-policy-test",
    rootDir,
    now: NOW,
  });
}

describe("discovery source policy", () => {
  it("allows permitted collect/store/invite-use operations", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);

      await expect(
        assertSourcePolicy("public-web", "collect", { db, rootDir, stepRunId, now: NOW }),
      ).resolves.toMatchObject({ ok: true, sourceClass: "public-web" });
      expect(sourcePolicyAllows("user-provided", "invite-use")).toBe(true);

      const auditRows = await db.select().from(networkSchema.networkAuditEvents);
      expect(auditRows).toHaveLength(0);
    });
  }, 15_000);

  it("blocks forbidden storage before caller writes and audits the block", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      let wroteDiscoveryRow = false;

      await expect(
        (async () => {
          await assertSourcePolicy("linkedin-scrape", "store", {
            db,
            rootDir,
            stepRunId,
            subjectId: "candidate-source-1",
            now: NOW,
          });
          wroteDiscoveryRow = true;
        })(),
      ).rejects.toBeInstanceOf(SourcePolicyError);
      expect(wroteDiscoveryRow).toBe(false);

      const rows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.subjectId, "candidate-source-1"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventClass: "operator_suppressed",
        subjectType: "source_policy",
        reasonCode: "source_policy_block",
        stepRunId,
      });
      expect(rows[0].metadata).toMatchObject({
        sourceClass: "linkedin-scrape",
        operation: "store",
      });
    });
  }, 15_000);

  it.each(["collect", "store", "invite-use"] as const)(
    "blocks forbidden %s operations",
    async (operation) => {
      await withNetworkDbTransaction(async (db) => {
        const rootDir = await tempRoot();
        const stepRunId = await step(rootDir);

        await expect(
          assertSourcePolicy("linkedin-scrape", operation, {
            db,
            rootDir,
            stepRunId,
            now: NOW,
          }),
        ).rejects.toBeInstanceOf(SourcePolicyError);
      });
    },
    15_000,
  );

  it.each([undefined, "", null, false, `network-lane-step:policy:${randomUUID()}`])(
    "rejects absent, falsy, and spoofed stepRunId values on policy-block audit: %s",
    async (badStepRunId) => {
      await withNetworkDbTransaction(async (db) => {
        const rootDir = await tempRoot();
        await expect(
          assertSourcePolicy("private-dataset", "collect", {
            db,
            rootDir,
            stepRunId: badStepRunId,
            now: NOW,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);
        expect(await db.select().from(networkSchema.networkAuditEvents)).toHaveLength(0);
      });
    },
    15_000,
  );
});
