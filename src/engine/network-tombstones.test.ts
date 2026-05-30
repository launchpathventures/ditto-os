/**
 * Tests for the Network Tombstones helpers (Brief 284).
 *
 * Validates:
 *   - `hashTombstoneSubjectId` is deterministic and de-correlates across types
 *   - `recordPrivacyDeletion` writes soft-delete + tombstone + audit + optional
 *     suppression in a single atomic transaction (hybrid-delete R-Q9)
 *   - `findActiveTombstone` / `isSubjectTombstoned` behave correctly
 *   - Default retention timings match the ratified Brief 278 defaults
 */

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
  RETENTION_SOFT_DELETE_DAYS,
  RETENTION_TOMBSTONE_PERMANENT_STUB_DAYS,
  computeTombstoneTimings,
  findActiveTombstone,
  hashTombstoneSubjectId,
  isSubjectTombstoned,
  recordPrivacyDeletion,
} from "./network-tombstones";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-tombstones-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "tombstones-test",
    rootDir,
    now: NOW,
  });
}

async function insertSignalWithUser(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
): Promise<{ userId: string; signalId: string }> {
  const [user] = await db
    .insert(networkSchema.networkUsers)
    .values({
      email: `owner-${randomUUID().slice(0, 8)}@example.com`,
      name: "Owner",
      handle: `o-${randomUUID().slice(0, 8)}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkUsers.id });
  const [signal] = await db
    .insert(networkSchema.networkMemberSignals)
    .values({
      userId: user.id,
      status: "draft",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkMemberSignals.id });
  return { userId: user.id, signalId: signal.id };
}

describe("hashTombstoneSubjectId", () => {
  it("returns the same hash for the same (type, id) pair", () => {
    const a = hashTombstoneSubjectId("member-signal", "sig-1");
    const b = hashTombstoneSubjectId("member-signal", "sig-1");
    expect(a).toBe(b);
  });

  it("de-correlates across subject types", () => {
    const a = hashTombstoneSubjectId("member-signal", "same-id");
    const b = hashTombstoneSubjectId("request", "same-id");
    expect(a).not.toBe(b);
  });

  it("rejects an unknown subject type", () => {
    expect(() =>
      hashTombstoneSubjectId(
        "bogus-type" as never,
        "anything",
      ),
    ).toThrow(/unknown subjectType/);
  });

  it("rejects an empty subject id", () => {
    expect(() =>
      hashTombstoneSubjectId("member-signal", ""),
    ).toThrow(/requires subjectId/);
  });

  it("never contains the raw subject id in its output", () => {
    const id = "sensitive-subject-id-12345";
    const hashed = hashTombstoneSubjectId("member-signal", id);
    expect(hashed).not.toContain(id);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("computeTombstoneTimings", () => {
  it("uses the ratified Brief 278 defaults when no overrides are provided", () => {
    const t = computeTombstoneTimings({ now: NOW });
    expect(t.deletedAt).toEqual(NOW);
    expect(t.purgeAfter.getTime() - NOW.getTime()).toBe(
      RETENTION_SOFT_DELETE_DAYS * 86_400_000,
    );
    expect(t.permanentStubAt.getTime() - NOW.getTime()).toBe(
      RETENTION_TOMBSTONE_PERMANENT_STUB_DAYS * 86_400_000,
    );
  });

  it("honors overrides", () => {
    const t = computeTombstoneTimings({
      now: NOW,
      softDeleteDays: 7,
      permanentStubDays: 30,
    });
    expect(t.purgeAfter.getTime() - NOW.getTime()).toBe(7 * 86_400_000);
    expect(t.permanentStubAt.getTime() - NOW.getTime()).toBe(30 * 86_400_000);
  });
});

describe("recordPrivacyDeletion", () => {
  it("inserts a tombstone + writes an audit row in one tx and runs the soft-delete callback", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { signalId } = await insertSignalWithUser(db);

      let callbackInvoked = false;
      const result = await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: signalId,
          deletedByActorType: "user",
          deletedReason: "user-requested",
          now: NOW,
        },
        async (tx) => {
          callbackInvoked = true;
          await tx
            .update(networkSchema.networkMemberSignals)
            .set({ status: "deleted", updatedAt: NOW })
            .where(eq(networkSchema.networkMemberSignals.id, signalId));
        },
      );

      expect(callbackInvoked).toBe(true);
      expect(result.created).toBe(true);
      expect(result.tombstone.subjectIdHash).toBe(
        hashTombstoneSubjectId("member-signal", signalId),
      );
      expect(result.tombstone.purgedAt).toBeNull();

      const [signal] = await db
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(eq(networkSchema.networkMemberSignals.id, signalId));
      expect(signal.status).toBe("deleted");

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(
          eq(
            networkSchema.networkAuditEvents.subjectId,
            result.tombstone.id,
          ),
        );
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].eventClass).toBe("delete");
      expect(auditRows[0].actorType).toBe("user");
    });
  }, 20_000);

  it("is idempotent — re-running with the same subject returns the existing row", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { signalId } = await insertSignalWithUser(db);

      const first = await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: signalId,
          deletedByActorType: "user",
          now: NOW,
        },
        async (tx) => {
          await tx
            .update(networkSchema.networkMemberSignals)
            .set({ status: "deleted", updatedAt: NOW })
            .where(eq(networkSchema.networkMemberSignals.id, signalId));
        },
      );

      const second = await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: signalId,
          deletedByActorType: "user",
          now: NOW,
        },
        async () => {
          throw new Error("second call should not invoke the soft-delete callback");
        },
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.tombstone.id).toBe(first.tombstone.id);
    });
  }, 20_000);

  it("records a suppression entry when suppressionIdentifier is supplied", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { signalId } = await insertSignalWithUser(db);

      const result = await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: signalId,
          deletedByActorType: "user",
          suppressionIdentifier: {
            identifier: "Owner@Example.com",
            identifierKind: "email",
          },
          now: NOW,
        },
        async (tx) => {
          await tx
            .update(networkSchema.networkMemberSignals)
            .set({ status: "deleted", updatedAt: NOW })
            .where(eq(networkSchema.networkMemberSignals.id, signalId));
        },
      );

      expect(result.created).toBe(true);
      const suppressions = await db
        .select()
        .from(networkSchema.networkSuppressions)
        .where(eq(networkSchema.networkSuppressions.reason, "deleted-profile"));
      expect(suppressions).toHaveLength(1);
      expect(suppressions[0].identifierKind).toBe("email");
    });
  }, 20_000);

  it.each([undefined, "", null, false, "web-direct-action:abc"])(
    "rejects spoofed / falsy stepRunId before any write (%s)",
    async (bad) => {
      await withNetworkDbTransaction(async (db) => {
        const { signalId } = await insertSignalWithUser(db);
        await expect(
          recordPrivacyDeletion(
            {
              db,
              stepRunId: bad,
              subjectType: "member-signal",
              subjectId: signalId,
              deletedByActorType: "user",
              now: NOW,
            },
            async () => {
              throw new Error("callback should not be reached");
            },
          ),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);
        const tombstones = await db.select().from(networkSchema.networkTombstones);
        expect(tombstones).toHaveLength(0);
      });
    },
    15_000,
  );
});

describe("isSubjectTombstoned / findActiveTombstone", () => {
  it("returns false / null when no tombstone exists", async () => {
    await withNetworkDbTransaction(async (db) => {
      const id = randomUUID();
      expect(
        await isSubjectTombstoned("member-signal", id, { db }),
      ).toBe(false);
      expect(
        await findActiveTombstone("member-signal", id, { db }),
      ).toBeNull();
    });
  });

  it("returns true / a row when a tombstone exists", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const { signalId } = await insertSignalWithUser(db);
      await recordPrivacyDeletion(
        {
          db,
          rootDir,
          stepRunId,
          subjectType: "member-signal",
          subjectId: signalId,
          deletedByActorType: "user",
          now: NOW,
        },
        async (tx) => {
          await tx
            .update(networkSchema.networkMemberSignals)
            .set({ status: "deleted", updatedAt: NOW })
            .where(eq(networkSchema.networkMemberSignals.id, signalId));
        },
      );
      expect(
        await isSubjectTombstoned("member-signal", signalId, { db }),
      ).toBe(true);
      const row = await findActiveTombstone("member-signal", signalId, { db });
      expect(row?.subjectIdHash).toBe(
        hashTombstoneSubjectId("member-signal", signalId),
      );
    });
  }, 20_000);
});
