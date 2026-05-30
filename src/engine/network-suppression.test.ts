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
  hashSuppressionIdentifier,
  isSuppressed,
  normalizeSuppressionIdentifier,
  recordNetworkSuppression,
  type NetworkSuppressionIdentifierKind,
  type NetworkSuppressionReason,
} from "./network-suppression";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-suppression-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "suppression-test",
    rootDir,
    now: NOW,
  });
}

describe("network suppression", () => {
  it("records a guarded, audited opt-out suppression without storing raw email", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const result = await recordNetworkSuppression({
        db,
        rootDir,
        stepRunId,
        identifier: "Recipient <Person@Example.COM>",
        identifierKind: "email",
        reason: "opt-out",
        source: "unsubscribe-link",
        now: NOW,
      });

      expect(result.created).toBe(true);
      expect(result.row.identifierHash).toBe(
        hashSuppressionIdentifier("person@example.com", "email"),
      );
      expect(JSON.stringify(result.row).toLowerCase()).not.toContain("person@example.com");

      await expect(
        isSuppressed("person@example.com", { db, now: NOW }),
      ).resolves.toBe(true);

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.subjectId, result.row.id));
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        eventClass: "operator_suppressed",
        reasonCode: "opt-out",
        stepRunId,
      });
      expect(JSON.stringify(auditRows[0]).toLowerCase()).not.toContain("person@example.com");
    });
  }, 15_000);

  it("enforces global uniqueness even when scopeUserId is null", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const identifierHash = hashSuppressionIdentifier("dupe@example.com", "email");
      const baseRow = {
        identifierHash,
        identifierKind: "email" as const,
        scope: "global" as const,
        scopeUserId: null,
        reason: "opt-out" as const,
        source: "test",
        expiresAt: null,
        stepRunId,
        createdAt: NOW,
      };

      await db.insert(networkSchema.networkSuppressions).values({
        id: randomUUID(),
        ...baseRow,
      });
      await expect(
        db.insert(networkSchema.networkSuppressions).values({
          id: randomUUID(),
          ...baseRow,
        }),
      ).rejects.toThrow();
    });
  }, 15_000);

  it.each<[NetworkSuppressionReason, string, NetworkSuppressionIdentifierKind]>([
    ["complaint", "complaint@example.com", "email"],
    ["decline", "person:declined-1", "person-ref"],
    ["deleted-profile", "person:deleted-1", "person-ref"],
    ["blocked-domain", "blocked.example", "domain"],
    ["blocked-person", "person:blocked-1", "person-ref"],
    ["source-pause", "public-web", "source"],
    ["segment-pause", "public-web:founders", "segment"],
  ])("returns true for %s suppressions", async (reason, identifier, kind) => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      await recordNetworkSuppression({
        db,
        rootDir,
        stepRunId,
        identifier,
        identifierKind: kind,
        reason,
        source: "test",
        now: NOW,
      });

      await expect(
        isSuppressed(identifier, {
          db,
          identifierKind: kind,
          now: NOW,
        }),
      ).resolves.toBe(true);
    });
  }, 15_000);

  it("blocks an email when its domain is suppressed", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      await recordNetworkSuppression({
        db,
        rootDir,
        stepRunId,
        identifier: "Example.com",
        identifierKind: "domain",
        reason: "blocked-domain",
        source: "operator",
        now: NOW,
      });

      await expect(isSuppressed("person@example.com", { db, now: NOW })).resolves.toBe(true);
      expect(normalizeSuppressionIdentifier("https://www.Example.com/path", "domain")).toBe("example.com");
    });
  }, 15_000);

  it("honors per-user scope without leaking to other users", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      await recordNetworkSuppression({
        db,
        rootDir,
        stepRunId,
        identifier: "scoped@example.com",
        identifierKind: "email",
        scope: "per-user",
        scopeUserId: "user-1",
        reason: "decline",
        source: "intro-flow",
        now: NOW,
      });

      await expect(
        isSuppressed("scoped@example.com", {
          db,
          scope: "per-user",
          scopeUserId: "user-1",
          now: NOW,
        }),
      ).resolves.toBe(true);
      await expect(
        isSuppressed("scoped@example.com", {
          db,
          scope: "per-user",
          scopeUserId: "user-2",
          now: NOW,
        }),
      ).resolves.toBe(false);
    });
  }, 15_000);

  it.each([undefined, "", null, false, `network-lane-step:suppression:${randomUUID()}`])(
    "rejects absent, falsy, and spoofed stepRunId values before writing: %s",
    async (badStepRunId) => {
      await withNetworkDbTransaction(async (db) => {
        const rootDir = await tempRoot();
        await expect(
          recordNetworkSuppression({
            db,
            rootDir,
            stepRunId: badStepRunId,
            identifier: "bad@example.com",
            identifierKind: "email",
            reason: "opt-out",
            source: "test",
            now: NOW,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);

        expect(await db.select().from(networkSchema.networkSuppressions)).toHaveLength(0);
        expect(await db.select().from(networkSchema.networkAuditEvents)).toHaveLength(0);
      });
    },
    15_000,
  );

  it("fails closed when the suppression store is unavailable", async () => {
    const brokenDb = {
      select: () => {
        throw new Error("db down");
      },
    };

    await expect(
      isSuppressed("anyone@example.com", {
        db: brokenDb as never,
        failClosed: true,
        now: NOW,
      }),
    ).resolves.toBe(true);
  });
});
