import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import type { JobRequestCardBlock, SuggestedCandidate } from "./content-blocks";
import { runNetworkSearch } from "./network-manual-search";
import { recordNetworkSearchFeedback } from "./network-search-feedback";

const STEP_RUN = "network-lane-step:network-manual-search:test";
const NOW = new Date("2026-05-16T00:00:00.000Z");

function memberCandidate(partial: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "priya-ops",
    name: "Priya Shah",
    oneLineRole: "Marketplace operations lead",
    rationaleMd: "Ran ops for a messy two-sided marketplace and rebuilt supply liquidity.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: NOW.toISOString(),
    ...partial,
  };
}

function scoutedCandidate(partial: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "scouted:jordan",
    name: "Jordan Lee",
    oneLineRole: "Publicly sourced marketplace ops consultant",
    rationaleMd: "Public source shows two-sided marketplace operations work.",
    fitConfidence: "medium",
    source: "scouted",
    sourceUrl: "https://example.com/jordan",
    sourceLabel: "example.com",
    computedAt: NOW.toISOString(),
    ...partial,
  };
}

describe("runNetworkSearch", () => {
  it("refuses without stepRunId outside DITTO_TEST_MODE", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    await expect(
      runNetworkSearch({
        db: {} as never,
        query: "marketplace ops",
        matchFn: async () => [memberCandidate()],
        scoutFn: async () => ({ candidates: [], available: true }),
      }),
    ).rejects.toThrow("run_network_search requires stepRunId");
    if (previous === undefined) delete process.env.DITTO_TEST_MODE;
    else process.env.DITTO_TEST_MODE = previous;
  });

  it("merges and dedupes members ahead of public leads, persisting run + connections", async () => {
    await withNetworkDbTransaction(async (db) => {
      const result = await runNetworkSearch({
        db,
        query: "marketplace operations expert for a messy two-sided network",
        visitorSessionId: "visitor-1",
        actorId: "visitor-1",
        stepRunId: STEP_RUN,
        now: NOW,
        matchFn: async () => [memberCandidate(), memberCandidate()],
        scoutFn: async () => ({ candidates: [scoutedCandidate()], available: true }),
      });

      expect(result.connections).toHaveLength(2);
      expect(result.connections[0].isDittoMember).toBe(true);
      expect(result.webSearchAvailable).toBe(true);
      expect(result.partial).toBe(false);

      const runs = await db
        .select()
        .from(networkSchema.networkSearchRuns)
        .where(eq(networkSchema.networkSearchRuns.id, result.searchRunId));
      expect(runs).toHaveLength(1);
      expect(runs[0].stepRunId).toBe(STEP_RUN);

      const persisted = await db
        .select()
        .from(networkSchema.networkPossibleConnections)
        .where(eq(networkSchema.networkPossibleConnections.searchRunId, result.searchRunId));
      expect(persisted).toHaveLength(2);

      const audit = await db
        .select()
        .from(networkSchema.networkSearchAuditEvents)
        .where(eq(networkSchema.networkSearchAuditEvents.searchRunId, result.searchRunId));
      expect(audit.map((a) => a.eventType)).toContain("search_run");
    });
  }, 15_000);

  it("degrades to member-only with a clear notice when public web is unavailable", async () => {
    await withNetworkDbTransaction(async (db) => {
      const result = await runNetworkSearch({
        db,
        query: "marketplace ops",
        visitorSessionId: "visitor-2",
        actorId: "visitor-2",
        stepRunId: STEP_RUN,
        now: NOW,
        matchFn: async () => [memberCandidate()],
        scoutFn: async () => ({ candidates: [], available: false }),
      });

      expect(result.webSearchAvailable).toBe(false);
      expect(result.partial).toBe(true);
      expect(result.webUnavailableNotice).toMatch(/Ditto members/i);
      expect(result.connections.every((c) => c.isDittoMember)).toBe(true);
    });
  }, 15_000);

  it("does not crash when both member match and public scout fail", async () => {
    await withNetworkDbTransaction(async (db) => {
      const result = await runNetworkSearch({
        db,
        query: "marketplace ops",
        visitorSessionId: "visitor-3",
        actorId: "visitor-3",
        stepRunId: STEP_RUN,
        now: NOW,
        matchFn: async () => {
          throw new Error("member match boom");
        },
        scoutFn: async () => {
          throw new Error("scout boom");
        },
      });
      expect(result.partial).toBe(true);
      expect(result.connections).toHaveLength(0);
    });
  }, 15_000);

  it("suppresses proposals the actor previously hid in the same session", async () => {
    await withNetworkDbTransaction(async (db) => {
      const first = await runNetworkSearch({
        db,
        query: "marketplace ops",
        visitorSessionId: "visitor-4",
        actorId: "visitor-4",
        stepRunId: STEP_RUN,
        now: NOW,
        matchFn: async () => [memberCandidate()],
        scoutFn: async () => ({ candidates: [], available: true }),
      });
      const target = first.connections[0];

      await recordNetworkSearchFeedback({
        db,
        searchRunId: first.searchRunId,
        possibleConnectionId: target.id,
        actorId: "visitor-4",
        stepRunId: STEP_RUN,
        kind: "hide",
      });

      const second = await runNetworkSearch({
        db,
        query: "marketplace ops",
        visitorSessionId: "visitor-4",
        actorId: "visitor-4",
        stepRunId: STEP_RUN,
        now: NOW,
        matchFn: async () => [memberCandidate()],
        scoutFn: async () => ({ candidates: [], available: true }),
      });
      expect(
        second.connections.some((c) => c.proposalKey === target.proposalKey),
      ).toBe(false);
    });
  }, 15_000);

  it("does not quote private budget/anti-persona in seeker-facing copy", async () => {
    await withNetworkDbTransaction(async (db) => {
      const jobRequestCard: JobRequestCardBlock = {
        type: "job-request-card",
        jtbd: "a marketplace ops expert",
        referenceShape: "",
        antiPersonaMd: "no agency middlemen",
        successCriteria: "",
        budgetShape: { ballpark: "$30k/month", cadence: "monthly" },
        scoutOptIn: true,
        suggestedCandidates: [],
        greeterCuratedBy: "mira",
        matchCuratedBy: "mira",
        lastUpdatedAt: NOW.toISOString(),
      };
      const result = await runNetworkSearch({
        db,
        query: "marketplace ops",
        jobRequestCard,
        visitorSessionId: "visitor-5",
        actorId: "visitor-5",
        stepRunId: STEP_RUN,
        now: NOW,
        matchFn: async () => [
          memberCandidate({
            rationaleMd: "Great fit; bills $30k/month and dislikes no agency middlemen.",
          }),
        ],
        scoutFn: async () => ({ candidates: [], available: true }),
      });
      const serialized = JSON.stringify(result.connections);
      expect(serialized).not.toContain("$30k/month");
      expect(serialized).not.toContain("no agency middlemen");
      expect(result.scrubApplied).toBe(true);
    });
  }, 15_000);
});
