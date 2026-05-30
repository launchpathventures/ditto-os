import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import type { SuggestedCandidate } from "./content-blocks";
import { runNetworkSearch, type PersistedPossibleConnection } from "./network-manual-search";
import { recordNetworkSearchFeedback } from "./network-search-feedback";
import type { NetworkDbLike } from "./network-kb-storage";

const STEP_RUN = "network-lane-step:network-search-feedback:test";
const NOW = new Date("2026-05-16T00:00:00.000Z");

function memberCandidate(partial: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "priya-ops",
    name: "Priya Shah",
    oneLineRole: "Marketplace operations lead",
    rationaleMd: "Ran ops for a messy two-sided marketplace.",
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
    oneLineRole: "Publicly sourced ops consultant",
    rationaleMd: "Public source shows marketplace operations work.",
    fitConfidence: "medium",
    source: "scouted",
    sourceUrl: "https://example.com/jordan",
    sourceLabel: "example.com",
    computedAt: NOW.toISOString(),
    ...partial,
  };
}

async function seedSearch(
  db: NetworkDbLike,
  candidates: SuggestedCandidate[],
): Promise<{ searchRunId: string; connections: PersistedPossibleConnection[] }> {
  const result = await runNetworkSearch({
    db,
    query: "marketplace ops",
    visitorSessionId: "visitor-fb",
    actorId: "visitor-fb",
    stepRunId: STEP_RUN,
    now: NOW,
    matchFn: async () => candidates.filter((c) => c.source === "on-network"),
    scoutFn: async () => ({
      candidates: candidates.filter((c) => c.source === "scouted"),
      available: true,
    }),
  });
  return { searchRunId: result.searchRunId, connections: result.connections };
}

describe("recordNetworkSearchFeedback", () => {
  it("refuses without stepRunId outside DITTO_TEST_MODE", async () => {
    const previous = process.env.DITTO_TEST_MODE;
    delete process.env.DITTO_TEST_MODE;
    await expect(
      recordNetworkSearchFeedback({
        db: {} as never,
        searchRunId: "run",
        kind: "refine",
      }),
    ).rejects.toThrow("record_network_search_feedback requires stepRunId");
    if (previous === undefined) delete process.env.DITTO_TEST_MODE;
    else process.env.DITTO_TEST_MODE = previous;
  });

  it("stores a refinement as feedback with an audit event", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { searchRunId } = await seedSearch(db, [memberCandidate()]);
      const res = await recordNetworkSearchFeedback({
        db,
        searchRunId,
        actorId: "visitor-fb",
        stepRunId: STEP_RUN,
        kind: "refine",
        refinementText: "more commercial, less academic",
      });
      expect(res.kind).toBe("refine");

      const feedback = await db
        .select()
        .from(networkSchema.networkSearchFeedback)
        .where(eq(networkSchema.networkSearchFeedback.searchRunId, searchRunId));
      expect(feedback).toHaveLength(1);
      expect(feedback[0].refinementText).toBe("more commercial, less academic");

      const audit = await db
        .select()
        .from(networkSchema.networkSearchAuditEvents)
        .where(eq(networkSchema.networkSearchAuditEvents.searchRunId, searchRunId));
      expect(audit.map((a) => a.eventType)).toContain("refine");
    });
  }, 15_000);

  it("marks not-a-fit and transitions the connection lifecycle", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { searchRunId, connections } = await seedSearch(db, [memberCandidate()]);
      const target = connections[0];
      const res = await recordNetworkSearchFeedback({
        db,
        searchRunId,
        possibleConnectionId: target.id,
        actorId: "visitor-fb",
        stepRunId: STEP_RUN,
        kind: "not-a-fit",
        reasonText: "too academic",
      });
      expect(res.lifecycleState).toBe("not-a-fit");

      const [row] = await db
        .select()
        .from(networkSchema.networkPossibleConnections)
        .where(eq(networkSchema.networkPossibleConnections.id, target.id));
      expect(row.lifecycleState).toBe("not-a-fit");
    });
  }, 15_000);

  it("saves a result to an Active Request", async () => {
    await withNetworkDbTransaction(async (db) => {
      const [request] = await db
        .insert(networkSchema.networkJobRequests)
        .values({
          visitorSessionId: "visitor-fb",
          jobRequestCard: {
            type: "job-request-card",
            jtbd: "marketplace ops",
            referenceShape: "",
            antiPersonaMd: "",
            successCriteria: "",
            budgetShape: { ballpark: "", cadence: "monthly" },
            scoutOptIn: true,
            suggestedCandidates: [],
            greeterCuratedBy: "mira",
            matchCuratedBy: "mira",
            lastUpdatedAt: NOW.toISOString(),
          },
          status: "active",
          mode: "manual-search",
        })
        .returning({ id: networkSchema.networkJobRequests.id });

      const { searchRunId, connections } = await seedSearch(db, [memberCandidate()]);
      const target = connections[0];
      const res = await recordNetworkSearchFeedback({
        db,
        searchRunId,
        possibleConnectionId: target.id,
        actorId: "visitor-fb",
        stepRunId: STEP_RUN,
        kind: "save",
        requestId: request.id,
      });
      expect(res.lifecycleState).toBe("saved-to-request");

      const [row] = await db
        .select()
        .from(networkSchema.networkPossibleConnections)
        .where(eq(networkSchema.networkPossibleConnections.id, target.id));
      expect(row.savedToRequestId).toBe(request.id);
    });
  }, 15_000);

  it("degrades intro-request to a saved proposal until the consent foundation exists", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { searchRunId, connections } = await seedSearch(db, [memberCandidate()]);
      const target = connections[0];
      const res = await recordNetworkSearchFeedback({
        db,
        searchRunId,
        possibleConnectionId: target.id,
        actorId: "visitor-fb",
        stepRunId: STEP_RUN,
        kind: "intro-request",
        requestId: "request-xyz",
        consentFoundationAvailable: false,
      });
      expect(res.consentGated).toBe(true);
      expect(res.notice).toMatch(/set up how introductions/i);
      expect(res.lifecycleState).toBe("saved-to-request");
    });
  }, 15_000);

  it("queues a non-member as an invitation candidate without any contact", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { searchRunId, connections } = await seedSearch(db, [scoutedCandidate()]);
      const target = connections.find((c) => !c.isDittoMember);
      expect(target).toBeDefined();
      const res = await recordNetworkSearchFeedback({
        db,
        searchRunId,
        possibleConnectionId: target!.id,
        actorId: "visitor-fb",
        stepRunId: STEP_RUN,
        kind: "invitation-candidate",
      });
      expect(res.lifecycleState).toBe("invitation-candidate");
      expect(res.notice).toMatch(/No outreach happens now/i);
    });
  }, 15_000);

  it("rejects invitation-candidate for a Ditto member", async () => {
    await withNetworkDbTransaction(async (db) => {
      const { searchRunId, connections } = await seedSearch(db, [memberCandidate()]);
      await expect(
        recordNetworkSearchFeedback({
          db,
          searchRunId,
          possibleConnectionId: connections[0].id,
          actorId: "visitor-fb",
          stepRunId: STEP_RUN,
          kind: "invitation-candidate",
        }),
      ).rejects.toThrow(/off-network/i);
    });
  }, 15_000);
});
