import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import { recordNetworkSuppression } from "./network-suppression";
import {
  checkRateLimit,
  clearNetworkRateLimitMemory,
  isNetworkOperationPaused,
  rateLimitBucketKey,
} from "./network-abuse-controls";

const NOW = new Date("2026-05-19T10:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-abuse-controls-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "network-abuse-controls-test",
    rootDir,
    now: NOW,
  });
}

describe("network abuse controls", () => {
  it("blocks at the in-memory L1 before touching the durable counter again", async () => {
    clearNetworkRateLimitMemory();
    await withNetworkDbTransaction(async (db) => {
      const memoryStore = new Map();
      const input = {
        db,
        limitName: "network-search" as const,
        actor: { kind: "ip" as const, id: "203.0.113.10" },
        policy: { max: 2, windowMs: 60_000 },
        now: NOW,
        memoryStore,
      };

      await expect(checkRateLimit(input)).resolves.toMatchObject({
        allowed: true,
        source: "postgres",
        count: 1,
      });
      await expect(checkRateLimit(input)).resolves.toMatchObject({
        allowed: true,
        source: "postgres",
        count: 2,
      });
      await expect(checkRateLimit(input)).resolves.toMatchObject({
        allowed: false,
        source: "memory",
        reason: "limit_exceeded",
      });

      const rows = await db
        .select()
        .from(networkSchema.networkRateCounters)
        .where(
          eq(
            networkSchema.networkRateCounters.bucketKey,
            rateLimitBucketKey("network-search", input.actor),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0].count).toBe(2);
    });
  }, 15_000);

  it("uses Postgres as the cross-instance backstop when another instance has a cold L1", async () => {
    await withNetworkDbTransaction(async (db) => {
      const actor = { kind: "ip" as const, id: "203.0.113.11" };
      const policy = { max: 2, windowMs: 60_000 };

      await checkRateLimit({
        db,
        limitName: "network-search",
        actor,
        policy,
        now: NOW,
        memoryStore: new Map(),
      });
      await checkRateLimit({
        db,
        limitName: "network-search",
        actor,
        policy,
        now: NOW,
        memoryStore: new Map(),
      });

      const blocked = await checkRateLimit({
        db,
        limitName: "network-search",
        actor,
        policy,
        now: NOW,
        memoryStore: new Map(),
      });
      expect(blocked).toMatchObject({
        allowed: false,
        source: "postgres",
        count: 3,
        reason: "limit_exceeded",
      });
    });
  }, 15_000);

  it("resets counters at the next fixed window", async () => {
    await withNetworkDbTransaction(async (db) => {
      const actor = { kind: "session" as const, id: "session-1" };
      const policy = { max: 1, windowMs: 60_000 };
      await expect(
        checkRateLimit({
          db,
          limitName: "profile-chat",
          actor,
          policy,
          now: NOW,
          memoryStore: new Map(),
        }),
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        checkRateLimit({
          db,
          limitName: "profile-chat",
          actor,
          policy,
          now: new Date(NOW.getTime() + 61_000),
          memoryStore: new Map(),
        }),
      ).resolves.toMatchObject({ allowed: true, count: 1 });
    });
  }, 15_000);

  it("honors source and segment pauses from the shared suppression substrate", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      await recordNetworkSuppression({
        db,
        rootDir,
        stepRunId,
        identifier: "public-web",
        identifierKind: "source",
        reason: "source-pause",
        source: "admin-superconnector",
        now: NOW,
      });

      await expect(
        isNetworkOperationPaused({ db, source: "public-web", now: NOW }),
      ).resolves.toMatchObject({
        paused: true,
        identifierKind: "source",
        identifier: "public-web",
      });
      await expect(
        isNetworkOperationPaused({ db, source: "ditto-members", now: NOW }),
      ).resolves.toEqual({ paused: false });
    });
  }, 15_000);
});
