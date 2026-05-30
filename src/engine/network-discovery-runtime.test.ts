/**
 * Tests for the network-wide outbound discovery kill switch (Brief 284, R-Q12).
 *
 * Validates:
 *   - The default state is "not paused" when no prior event exists.
 *   - `setOutboundDiscoveryPaused` writes an audit event and the read path
 *     reflects it.
 *   - Resume → paused → resume produces the correct "latest event wins"
 *     state machine.
 *   - Spoofed / falsy stepRunId is rejected before any write.
 *   - Missing reason is rejected before any write.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  DISCOVERY_RUNTIME_SUBJECT_ID,
  DISCOVERY_RUNTIME_SUBJECT_TYPE,
  getOutboundDiscoveryPauseState,
  isOutboundDiscoveryPaused,
  setOutboundDiscoveryPaused,
} from "./network-discovery-runtime";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-discovery-runtime-"));
}

async function step(rootDir: string, offset = 0): Promise<string> {
  return createNetworkLaneStepRun({
    route: "discovery-runtime-test",
    rootDir,
    now: new Date(NOW.getTime() + offset),
  });
}

describe("getOutboundDiscoveryPauseState (initial)", () => {
  it("returns paused=false when no event exists", async () => {
    await withNetworkDbTransaction(async (db) => {
      const state = await getOutboundDiscoveryPauseState({ db });
      expect(state.paused).toBe(false);
      expect(state.changedAt).toBeNull();
      expect(state.reason).toBeNull();
    });
  });

  it("isOutboundDiscoveryPaused mirrors getState", async () => {
    await withNetworkDbTransaction(async (db) => {
      expect(await isOutboundDiscoveryPaused({ db })).toBe(false);
    });
  });
});

describe("setOutboundDiscoveryPaused", () => {
  it("writes an audit event with class operator_paused_discovery and the state flips", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);

      const result = await setOutboundDiscoveryPaused({
        db,
        rootDir,
        stepRunId,
        paused: true,
        reason: "synthetic complaint spike",
        actorId: "admin-user-1",
        now: NOW,
      });

      expect(result.paused).toBe(true);
      expect(result.reason).toBe("synthetic complaint spike");

      const state = await getOutboundDiscoveryPauseState({ db });
      expect(state.paused).toBe(true);
      expect(state.actorId).toBe("admin-user-1");
      expect(state.reason).toBe("synthetic complaint spike");

      const events = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(
          and(
            eq(
              networkSchema.networkAuditEvents.subjectType,
              DISCOVERY_RUNTIME_SUBJECT_TYPE,
            ),
            eq(
              networkSchema.networkAuditEvents.subjectId,
              DISCOVERY_RUNTIME_SUBJECT_ID,
            ),
          ),
        );
      expect(events).toHaveLength(1);
      expect(events[0].eventClass).toBe("operator_paused_discovery");
      expect(events[0].actorType).toBe("admin");
    });
  }, 20_000);

  it("resume after pause writes operator_resumed_discovery and clears paused", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const pauseStep = await step(rootDir, 0);
      const resumeStep = await step(rootDir, 1_000);

      await setOutboundDiscoveryPaused({
        db,
        rootDir,
        stepRunId: pauseStep,
        paused: true,
        reason: "investigation",
        actorId: "admin-user-1",
        now: NOW,
      });

      const pauseMidway = await getOutboundDiscoveryPauseState({ db });
      expect(pauseMidway.paused).toBe(true);

      await setOutboundDiscoveryPaused({
        db,
        rootDir,
        stepRunId: resumeStep,
        paused: false,
        reason: "all clear",
        actorId: "admin-user-1",
        now: new Date(NOW.getTime() + 60_000),
      });

      const state = await getOutboundDiscoveryPauseState({ db });
      expect(state.paused).toBe(false);
      expect(state.reason).toBe("all clear");

      const events = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(
          and(
            eq(
              networkSchema.networkAuditEvents.subjectType,
              DISCOVERY_RUNTIME_SUBJECT_TYPE,
            ),
            eq(
              networkSchema.networkAuditEvents.subjectId,
              DISCOVERY_RUNTIME_SUBJECT_ID,
            ),
          ),
        );
      expect(events).toHaveLength(2);
      const classes = events.map((row) => row.eventClass).sort();
      expect(classes).toEqual([
        "operator_paused_discovery",
        "operator_resumed_discovery",
      ]);
    });
  }, 20_000);

  it.each([undefined, "", null, false, "web-direct-action:abc"])(
    "rejects spoofed / falsy stepRunId before any write (%s)",
    async (bad) => {
      await withNetworkDbTransaction(async (db) => {
        await expect(
          setOutboundDiscoveryPaused({
            db,
            stepRunId: bad,
            paused: true,
            reason: "test",
            now: NOW,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);
        const events = await db
          .select()
          .from(networkSchema.networkAuditEvents)
          .where(
            eq(
              networkSchema.networkAuditEvents.subjectType,
              DISCOVERY_RUNTIME_SUBJECT_TYPE,
            ),
          );
        expect(events).toHaveLength(0);
      });
    },
    15_000,
  );

  it("rejects empty reason before any write", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      await expect(
        setOutboundDiscoveryPaused({
          db,
          rootDir,
          stepRunId,
          paused: true,
          reason: "   ",
          now: NOW,
        }),
      ).rejects.toThrow(/requires reason/);
      const events = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(
          eq(
            networkSchema.networkAuditEvents.subjectType,
            DISCOVERY_RUNTIME_SUBJECT_TYPE,
          ),
        );
      expect(events).toHaveLength(0);
    });
  });
});
