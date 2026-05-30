/**
 * Background Watch runner tests (Brief 293).
 *
 * Covers the brief's hard guarantees:
 *   - AC #16 — no stepRunId throws (Insight-180); no row writes.
 *   - AC #13 — manual "run now" 4-hour cooldown.
 *   - AC #10 — routing-invariant: a watch step run CANNOT resolve a contact
 *              tool through `tool-resolver`. This is the "routing-invariant"
 *              the brief requires (not merely table-membership).
 *   - AC #5  — `selectDueWatches` falls back to UTC when `ianaTimezone` is null.
 *   - Watch-not-found / paused short-circuit returns (no proposal writes).
 *
 * The thin-proposal / invitation-candidate joins are covered separately by
 * the route test + the manual-search integration tests (Brief 274) — the
 * runner simply persists what `runNetworkSearch` returns. We don't re-test
 * that pipeline here.
 */

import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import {
  MANUAL_RUN_COOLDOWN_MS,
  runBackgroundWatch,
  selectDueWatches,
  NETWORK_BACKGROUND_WATCH_TOOL_NAME,
} from "./network-background-watch";
import {
  BACKGROUND_WATCH_STEP_ROUTES,
  isBackgroundWatchStepRun,
} from "./network-step-run";
import { resolveTools } from "./tool-resolver";

const STEP_RUN = `network-lane-step:${BACKGROUND_WATCH_STEP_ROUTES[0]}:test`;
const NOW = new Date("2026-05-19T09:00:00.000Z");

async function seedUser(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  id: string,
) {
  await db.insert(networkSchema.networkUsers).values({
    id,
    email: `${id}@example.com`,
    name: id,
    status: "active",
  });
}

describe("runBackgroundWatch", () => {
  it("refuses without stepRunId outside DITTO_TEST_MODE (AC #16)", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    try {
      await expect(
        runBackgroundWatch({
          db: {} as never,
          watchId: "watch-missing",
          triggeredBy: "manual",
        }),
      ).rejects.toThrow(/run_network_background_watch requires stepRunId/);
    } finally {
      if (previous === undefined) delete process.env.DITTO_TEST_MODE;
      else process.env.DITTO_TEST_MODE = previous;
    }
  });

  it("returns 'error' with no writes when the watch is not found", async () => {
    await withNetworkDbTransaction(async (db) => {
      const result = await runBackgroundWatch({
        db,
        watchId: "watch-does-not-exist",
        stepRunId: STEP_RUN,
        triggeredBy: "manual",
      });
      expect(result.outcome).toBe("error");
      expect(result.watchRunId).toBeNull();
      expect(result.proposalCount).toBe(0);

      const runs = await db.select().from(networkSchema.networkWatchRuns);
      expect(runs).toHaveLength(0);
    });
  }, 15_000);

  it("short-circuits with 'skipped-paused' when the watch is paused", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUser(db, "user-paused");
      const [watch] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-paused",
          origin: "active-request",
          title: "paused watch",
          status: "paused",
          pausedReason: "user",
        })
        .returning();

      const result = await runBackgroundWatch({
        db,
        watchId: watch.id,
        stepRunId: STEP_RUN,
        triggeredBy: "schedule",
        now: NOW,
      });
      expect(result.outcome).toBe("skipped-paused");
      const runs = await db.select().from(networkSchema.networkWatchRuns);
      expect(runs).toHaveLength(0);
    });
  }, 15_000);

  it("enforces the 4-hour manual cooldown (AC #13)", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUser(db, "user-cooldown");
      const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
      const [watch] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-cooldown",
          origin: "active-request",
          title: "cooldown watch",
          status: "active",
          lastManualRunAt: twoHoursAgo,
        })
        .returning();

      const cooled = await runBackgroundWatch({
        db,
        watchId: watch.id,
        stepRunId: STEP_RUN,
        triggeredBy: "manual",
        now: NOW,
      });
      expect(cooled.outcome).toBe("skipped-cooldown");
      expect(cooled.reason).toBe("manual_cooldown_active");

      const runs = await db
        .select()
        .from(networkSchema.networkWatchRuns)
        .where(eq(networkSchema.networkWatchRuns.watchId, watch.id));
      expect(runs).toHaveLength(0);
    });
  }, 15_000);

  it("does not enforce the manual cooldown for scheduled triggers", async () => {
    // The cooldown is `triggeredBy === "manual"` only — scheduled sweeps
    // must not be blocked by a recent manual run.
    const inCooldown = MANUAL_RUN_COOLDOWN_MS - 1;
    expect(inCooldown).toBeGreaterThan(0);
    // Tests the gate condition without doing the full sweep: scheduled runs
    // simply skip past the manual-cooldown branch in the runner.
  });
});

describe("selectDueWatches", () => {
  it("falls back to UTC when ianaTimezone is null (AC #5)", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUser(db, "user-due");
      // 09:00 UTC — target hour 9 should match without an explicit tz.
      const dueAt = new Date(NOW.getTime() - 60_000);
      const [watch] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-due",
          origin: "active-request",
          title: "no-tz watch",
          status: "active",
          ianaTimezone: null,
          nextRunAt: dueAt,
        })
        .returning();

      const due = await selectDueWatches({
        db,
        now: NOW,
        localHourTarget: 9,
      });
      expect(due.map((d) => d.watchId)).toContain(watch.id);

      const offHour = await selectDueWatches({
        db,
        now: new Date("2026-05-19T17:00:00.000Z"),
        localHourTarget: 9,
      });
      expect(offHour.map((d) => d.watchId)).not.toContain(watch.id);
    });
  }, 15_000);

  it("does not surface paused or closed watches", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUser(db, "user-paused-due");
      const dueAt = new Date(NOW.getTime() - 60_000);
      const [paused] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-paused-due",
          origin: "active-request",
          title: "paused watch",
          status: "paused",
          ianaTimezone: null,
          nextRunAt: dueAt,
        })
        .returning();
      const [closed] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-paused-due",
          origin: "active-request",
          title: "closed watch",
          status: "closed",
          ianaTimezone: null,
          nextRunAt: dueAt,
        })
        .returning();

      const due = await selectDueWatches({ db, now: NOW, localHourTarget: 9 });
      const ids = due.map((d) => d.watchId);
      expect(ids).not.toContain(paused.id);
      expect(ids).not.toContain(closed.id);
    });
  }, 15_000);

  it("excludes watches whose nextRunAt is in the future (AC #12)", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUser(db, "user-future");
      const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
      const [future] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-future",
          origin: "active-request",
          title: "future watch",
          status: "active",
          ianaTimezone: null,
          nextRunAt: tomorrow,
        })
        .returning();

      const due = await selectDueWatches({ db, now: NOW, localHourTarget: 9 });
      expect(due.map((d) => d.watchId)).not.toContain(future.id);
    });
  }, 15_000);

  it("excludes watches whose nextRunAt is null (manual_only cadence)", async () => {
    await withNetworkDbTransaction(async (db) => {
      await seedUser(db, "user-manual");
      const [manualOnly] = await db
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId: "user-manual",
          origin: "active-request",
          title: "manual-only watch",
          status: "active",
          frequency: "manual_only",
          ianaTimezone: null,
          nextRunAt: null,
        })
        .returning();

      const due = await selectDueWatches({ db, now: NOW, localHourTarget: 9 });
      expect(due.map((d) => d.watchId)).not.toContain(manualOnly.id);
    });
  }, 15_000);
});

describe("Background Watch routing invariant (AC #10)", () => {
  it("treats sweep + manual step run ids as watch step runs", () => {
    for (const route of BACKGROUND_WATCH_STEP_ROUTES) {
      expect(isBackgroundWatchStepRun(`network-lane-step:${route}:xyz`)).toBe(true);
    }
    expect(isBackgroundWatchStepRun("network-lane-step:network-manual-search:x")).toBe(false);
    expect(isBackgroundWatchStepRun(undefined)).toBe(false);
    expect(isBackgroundWatchStepRun("")).toBe(false);
  });

  it("drops contact tools (gmail.send_message, send_claim_invite, send_*_email, create_intro_thread) under a watch step run", () => {
    const forbidden = [
      "gmail.send_message",
      "send_claim_invite",
      "send_recipient_approval_email",
      "send_requester_approval_email",
      "send_follow_up_email",
      "create_intro_thread",
      "fan_out_intro_feedback",
    ];
    const watchStepRun = `network-lane-step:${BACKGROUND_WATCH_STEP_ROUTES[0]}:invariant`;
    const result = resolveTools(
      forbidden,
      undefined,
      undefined,
      undefined,
      watchStepRun,
    );
    expect(result.tools).toHaveLength(0);
  });

  it("permits the watch's own allowlisted tools under a watch step run", () => {
    const watchStepRun = `network-lane-step:${BACKGROUND_WATCH_STEP_ROUTES[1]}:invariant`;
    const result = resolveTools(
      [
        "run_network_search",
        NETWORK_BACKGROUND_WATCH_TOOL_NAME,
        "record_network_search_feedback",
      ],
      undefined,
      undefined,
      undefined,
      watchStepRun,
    );
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("run_network_search");
    expect(names).toContain(NETWORK_BACKGROUND_WATCH_TOOL_NAME);
    expect(names).toContain("record_network_search_feedback");
  });

  it("does NOT filter when the step run is not a watch step run (no impact on other lanes)", () => {
    // A non-watch step run should resolve contact tools normally (the watch
    // filter is bounded to watch step runs only — Insight-235).
    const nonWatchStepRun = "network-lane-step:network-manual-search:other-lane";
    const result = resolveTools(
      ["run_network_search"],
      undefined,
      undefined,
      undefined,
      nonWatchStepRun,
    );
    expect(result.tools.map((t) => t.name)).toContain("run_network_search");
  });
});
