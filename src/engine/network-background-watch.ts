/**
 * Background Watch Runner (Brief 293 / parent Brief 275 D1–D5, D10)
 *
 * A Background Watch is a persistent, schedulable instance of an Active
 * Request or Member Signal. The runner implements the cycle decomposition
 * sense → assess → act → gate → land → learn → brief, but without a new
 * process engine: it is a plain async function the hourly Network-deployment
 * sweep (and the manual "run now" route) call directly.
 *
 * Hard guarantees (parent §Constraints):
 *  - Side-effecting; `stepRunId` REQUIRED (Insight-180). With no stepRunId
 *    (and `DITTO_TEST_MODE !== "true"`) the function exits before any row
 *    write or external/LLM call.
 *  - Reuses `runNetworkSearch` (Brief 274) for search + ranking. The runner
 *    DOES NOT duplicate ranking; `network_watch_proposals` are thin joins
 *    to `networkPossibleConnections` (parent D4, Reviewer FLAG-7).
 *  - Health gate (`evaluateNetworkHealth`) runs BEFORE any proposal row is
 *    written — `suppress` decisions never produce a watch proposal row.
 *  - "Watch never contacts" is enforced by the tool boundary (Insight-235),
 *    not by a runtime check here. This runner performs zero outbound contact.
 *  - Manual "run now" enforces a 4-hour per-watch cooldown (parent D17 /
 *    Designer D-Q2) on top of the rate-limit check.
 *  - `network-watch` abuse policy (max 12 starts / user / hour) governs run
 *    starts only (parent D17 / OQ-7).
 */

import { and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import {
  isNetworkOperationPaused,
  checkRateLimit,
} from "./network-abuse-controls";
import {
  evaluateNetworkHealth,
  summarizeNetworkHealth,
  type NetworkHealthDecisionResult,
} from "./network-health";
import {
  runNetworkSearch,
  type NetworkManualSearchInput,
  type PersistedPossibleConnection,
} from "./network-manual-search";
import { requireNetworkStepRunId } from "./network-step-run";
import type { NetworkHealthSignal } from "./connection-proposal";

export const NETWORK_BACKGROUND_WATCH_TOOL_NAME = "run_network_background_watch";

/** Manual "run now" cooldown — parent D17 / Designer D-Q2. */
export const MANUAL_RUN_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Default frequency cadences keyed by frequency value. null = no schedule. */
const FREQUENCY_INTERVAL_MS: Record<networkSchema.NetworkWatchFrequency, number | null> = {
  quiet: 14 * 24 * 60 * 60 * 1000,
  weekly_digest: 7 * 24 * 60 * 60 * 1000,
  immediate_strong_fit: 24 * 60 * 60 * 1000,
  manual_only: null,
};

export interface RunBackgroundWatchInput {
  db?: NetworkDbLike;
  watchId: string;
  stepRunId?: string | null;
  triggeredBy: networkSchema.NetworkWatchRunTriggeredBy;
  actorId?: string | null;
  now?: Date;
  /** Test-mode injection points (parent D2 — `runNetworkSearch` reuse). */
  matchFn?: NetworkManualSearchInput["matchFn"];
  scoutFn?: NetworkManualSearchInput["scoutFn"];
}

export interface RunBackgroundWatchResult {
  watchRunId: string | null;
  outcome: networkSchema.NetworkWatchRunOutcome;
  proposalCount: number;
  rawCandidateCount: number;
  reason?: string;
}

/** Coarse heuristic for rule 7 (commercial-sensitivity → operator review). */
function looksCommerciallySensitive(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(acquisition|m&a|investor|fundraise|series [a-d]|term sheet|deal|cap table)\b/i.test(
    text,
  );
}

/**
 * Build a per-target health signal from prior watch surfacings + block list
 * + anti-persona signal. Cross-watch propagation is OFF in v1 (parent OQ-2);
 * cooldown checks scope to this watch only.
 */
async function buildSignal(
  db: NetworkDbLike,
  watch: { id: string; userId: string },
  connection: PersistedPossibleConnection,
  now: Date,
): Promise<NetworkHealthSignal> {
  const signal: NetworkHealthSignal = {};
  const cooldownSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Rule 5 — duplicate cooldown (scoped to THIS watch only, parent OQ-2).
  const prior = await db
    .select({ id: networkSchema.networkWatchProposals.id })
    .from(networkSchema.networkWatchProposals)
    .where(
      and(
        eq(networkSchema.networkWatchProposals.watchId, watch.id),
        eq(
          networkSchema.networkWatchProposals.possibleConnectionId,
          connection.id,
        ),
        gte(networkSchema.networkWatchProposals.createdAt, cooldownSince),
      ),
    )
    .limit(1);
  if (prior.length > 0) signal.duplicateCooldown = true;

  // Rule 1 — explicit block (target → requester). Only meaningful when the
  // proposal target is a Ditto member (we have a userId via personId mapping
  // on members). Off-network proposals don't have a block-list precedent in
  // this skeleton; rule 1 stays false unless a member match exists.
  if (connection.isDittoMember && connection.personId) {
    const blocks = await db
      .select({ id: networkSchema.networkUserBlockList.id })
      .from(networkSchema.networkUserBlockList)
      .where(eq(networkSchema.networkUserBlockList.blockedRequesterIdentifier, watch.userId))
      .limit(1);
    if (blocks.length > 0) signal.blocked = true;
  }

  // Rule 2 — anti-persona match (target's anti-persona rule mentions requester).
  // Skeleton stays conservative: we surface the precedent table existence
  // but the proposal-level match is computed in `buildPossibleConnections`
  // (Brief 274). When the proposal already carries an anti-persona flag in
  // its `risks[]` we mirror it onto the signal.
  if (connection.risks.some((r) => /anti-persona/i.test(r))) {
    signal.antiPersonaRisk = true;
  }

  // Rule 6 — stale evidence flag. The evaluator computes age from
  // `evidenceMaxAgeDays`; we pre-flag here when the proposal already lists
  // a "stale" risk to keep the audit row legible.
  if (connection.risks.some((r) => /stale/i.test(r))) {
    signal.staleEvidence = true;
  }

  return signal;
}

/**
 * Count outstanding watch proposals the requester has open (rule 4 precursor).
 * "Outstanding" = surfaced but not dismissed.
 */
async function countOutstandingAsks(
  db: NetworkDbLike,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: networkSchema.networkWatchProposals.id })
    .from(networkSchema.networkWatchProposals)
    .innerJoin(
      networkSchema.networkBackgroundWatches,
      eq(
        networkSchema.networkWatchProposals.watchId,
        networkSchema.networkBackgroundWatches.id,
      ),
    )
    .where(
      and(
        eq(networkSchema.networkBackgroundWatches.userId, userId),
        eq(networkSchema.networkWatchProposals.dismissState, "none"),
      ),
    );
  return rows.length;
}

function computeWhatChanged(
  isFirstSurfacing: boolean,
  signal: NetworkHealthSignal,
): string | null {
  if (isFirstSurfacing) return "First surfacing for this watch.";
  if (signal.staleEvidence) return "Evidence age tipped past the stale threshold.";
  return null;
}

function nextRunFor(
  frequency: networkSchema.NetworkWatchFrequency,
  now: Date,
): Date | null {
  const interval = FREQUENCY_INTERVAL_MS[frequency];
  if (interval === null) return null;
  return new Date(now.getTime() + interval);
}

export async function runBackgroundWatch(
  input: RunBackgroundWatchInput,
): Promise<RunBackgroundWatchResult> {
  // Side-effect guard FIRST. With no stepRunId outside test mode the runner
  // performs no row writes, no external calls (Insight-180; AC #16).
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    NETWORK_BACKGROUND_WATCH_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();

  // Validate watch exists / is active.
  const [watch] = await db
    .select()
    .from(networkSchema.networkBackgroundWatches)
    .where(eq(networkSchema.networkBackgroundWatches.id, input.watchId))
    .limit(1);
  if (!watch) {
    return {
      watchRunId: null,
      outcome: "error",
      proposalCount: 0,
      rawCandidateCount: 0,
      reason: "watch_not_found",
    };
  }
  if (watch.status !== "active") {
    return {
      watchRunId: null,
      outcome: "skipped-paused",
      proposalCount: 0,
      rawCandidateCount: 0,
      reason: `watch_status_${watch.status}`,
    };
  }

  // Manual cooldown — parent D17 / Designer D-Q2.
  if (input.triggeredBy === "manual" && watch.lastManualRunAt) {
    const since = now.getTime() - watch.lastManualRunAt.getTime();
    if (since < MANUAL_RUN_COOLDOWN_MS) {
      return {
        watchRunId: null,
        outcome: "skipped-cooldown",
        proposalCount: 0,
        rawCandidateCount: 0,
        reason: "manual_cooldown_active",
      };
    }
  }

  // Abuse control — parent D17 / OQ-7. Counts run STARTS per user per hour.
  const rate = await checkRateLimit({
    db,
    limitName: "network-watch",
    actor: { kind: "user", id: watch.userId },
    now,
  });
  if (!rate.allowed) {
    return {
      watchRunId: null,
      outcome: "skipped-rate-limit",
      proposalCount: 0,
      rawCandidateCount: 0,
      reason: "rate_limited",
    };
  }

  // Operator-paused sources / segments / requests.
  const pause = await isNetworkOperationPaused({
    db,
    requestId: watch.requestId,
    memberId: watch.signalId,
  });
  if (pause.paused) {
    return {
      watchRunId: null,
      outcome: "skipped-paused",
      proposalCount: 0,
      rawCandidateCount: 0,
      reason: pause.reason ?? "paused",
    };
  }

  // Sense → load the seed request/signal copy used to ground the search.
  let query = watch.title;
  let card: NetworkManualSearchInput["jobRequestCard"];
  let commercialSensitive = false;
  if (watch.requestId) {
    const [req] = await db
      .select()
      .from(networkSchema.networkJobRequests)
      .where(eq(networkSchema.networkJobRequests.id, watch.requestId))
      .limit(1);
    if (req) {
      query = req.outcomeNeeded?.trim() || req.rawNeed?.trim() || query;
      card = (req.jobRequestCard ?? undefined) as NetworkManualSearchInput["jobRequestCard"];
      commercialSensitive =
        looksCommerciallySensitive(req.commercialShape) ||
        looksCommerciallySensitive(req.outcomeValueHint);
    }
  } else if (watch.signalId) {
    const [signal] = await db
      .select()
      .from(networkSchema.networkMemberSignals)
      .where(eq(networkSchema.networkMemberSignals.id, watch.signalId))
      .limit(1);
    if (signal) {
      query = (signal.sourceSummary ?? "").trim() || query;
    }
  }

  // Open a watch-run row up front so failures still leave an audit trail.
  const [runRow] = await db
    .insert(networkSchema.networkWatchRuns)
    .values({
      watchId: watch.id,
      triggeredBy: input.triggeredBy,
      outcome: "ok",
      stepRunId,
      startedAt: now,
      proposalCount: 0,
      rawCandidateCount: 0,
    })
    .returning({ id: networkSchema.networkWatchRuns.id });

  // Act → run the manual-search pipeline through to persisted proposals.
  let searchResult;
  try {
    searchResult = await runNetworkSearch({
      db,
      userId: watch.userId,
      actorId: input.actorId ?? watch.userId,
      sessionId: `watch:${watch.id}`,
      stepRunId,
      query: query || `watch:${watch.id}`,
      jobRequestCard: card,
      mode: watch.requestId ? "from-request" : "both",
      sourcesAllowed: "both",
      requestId: watch.requestId,
      memberSignalId: watch.signalId,
      refinement: watch.refinement,
      now,
      matchFn: input.matchFn,
      scoutFn: input.scoutFn,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "search_failed";
    await db
      .update(networkSchema.networkWatchRuns)
      .set({
        outcome: "error",
        errorSummary: message,
        completedAt: new Date(now.getTime()),
      })
      .where(eq(networkSchema.networkWatchRuns.id, runRow.id));
    return {
      watchRunId: runRow.id,
      outcome: "error",
      proposalCount: 0,
      rawCandidateCount: 0,
      reason: message,
    };
  }

  // Gate → run network-health for each persisted Possible Connection.
  const requesterOutstanding = await countOutstandingAsks(db, watch.userId);
  const decisions: Array<{
    connection: PersistedPossibleConnection;
    decision: NetworkHealthDecisionResult;
    signal: NetworkHealthSignal;
  }> = [];

  for (const connection of searchResult.connections) {
    const signal = await buildSignal(db, watch, connection, now);
    const decision = evaluateNetworkHealth({
      signal,
      confidence: connection.confidence,
      evidenceMaxAgeDays: null,
      requesterOutstandingAskCount: requesterOutstanding,
      commercialSensitive,
      broadExploration: false,
    });
    decisions.push({ connection, decision, signal });
  }

  // Land → persist thin proposal rows for non-suppress decisions.
  let proposalCount = 0;
  for (const entry of decisions) {
    if (entry.decision.kind === "suppress") continue;
    const priorRow = await db
      .select({ id: networkSchema.networkWatchProposals.id })
      .from(networkSchema.networkWatchProposals)
      .where(
        and(
          eq(networkSchema.networkWatchProposals.watchId, watch.id),
          eq(
            networkSchema.networkWatchProposals.possibleConnectionId,
            entry.connection.id,
          ),
        ),
      )
      .limit(1);

    const whatChanged = computeWhatChanged(priorRow.length === 0, entry.signal);
    const [proposalRow] = await db
      .insert(networkSchema.networkWatchProposals)
      .values({
        watchId: watch.id,
        watchRunId: runRow.id,
        possibleConnectionId: entry.connection.id,
        healthDecision: entry.decision.kind,
        healthReasons: {
          reasons: entry.decision.reasons,
          downgradedConfidence: entry.decision.downgradedConfidence,
        } as Record<string, unknown>,
        whatChanged,
      })
      .returning({ id: networkSchema.networkWatchProposals.id });

    // Flip the underlying connection's lifecycle to "watched" (parent D4).
    await db
      .update(networkSchema.networkPossibleConnections)
      .set({ lifecycleState: "watched", updatedAt: new Date() })
      .where(
        eq(networkSchema.networkPossibleConnections.id, entry.connection.id),
      );

    // D10 — set invitation candidate watchId for existing off-network candidates
    // pointing at this Possible Connection. We never bypass `discoveryProfileId`
    // (Brief 279 path stays intact); we only link existing candidates.
    await db
      .update(networkSchema.networkInvitationCandidates)
      .set({ watchId: watch.id, updatedAt: new Date() })
      .where(
        and(
          eq(
            networkSchema.networkInvitationCandidates.possibleConnectionId,
            entry.connection.id,
          ),
          isNull(networkSchema.networkInvitationCandidates.watchId),
        ),
      );

    await db.insert(networkSchema.networkAuditEvents).values({
      eventClass: "watch_proposal",
      subjectType: "watch_proposal",
      subjectId: proposalRow.id,
      actorType: "system",
      actorId: null,
      stepRunId,
      reasonCode: entry.decision.kind,
      metadata: {
        watchId: watch.id,
        watchRunId: runRow.id,
        possibleConnectionId: entry.connection.id,
        ruleHits: entry.decision.reasons.map((r) => r.ruleId),
      },
    });

    proposalCount += 1;
  }

  // Learn → close out the run row with the health summary + outcome.
  const summary = summarizeNetworkHealth(decisions.map((d) => d.decision));
  const outcome: networkSchema.NetworkWatchRunOutcome =
    proposalCount === 0 ? "quiet" : "ok";

  await db
    .update(networkSchema.networkWatchRuns)
    .set({
      outcome,
      searchRunId: searchResult.searchRunId,
      proposalCount,
      rawCandidateCount: searchResult.connections.length,
      healthSummary: summary as unknown as Record<string, unknown>,
      completedAt: new Date(now.getTime()),
    })
    .where(eq(networkSchema.networkWatchRuns.id, runRow.id));

  await db.insert(networkSchema.networkAuditEvents).values({
    eventClass: "watch_run",
    subjectType: "watch_run",
    subjectId: runRow.id,
    actorType: input.triggeredBy === "manual" ? "user" : "system",
    actorId: input.triggeredBy === "manual" ? input.actorId ?? null : null,
    stepRunId,
    reasonCode: outcome,
    metadata: {
      watchId: watch.id,
      triggeredBy: input.triggeredBy,
      proposalCount,
      rawCandidateCount: searchResult.connections.length,
      health: summary,
    },
  });

  // Brief → update the watch row: nextRunAt, lastRunAt, manual marker,
  // consecutive-quiet counter (parent D6 / nit-5 calibration substrate).
  const consecutiveQuietRuns =
    outcome === "quiet" ? watch.consecutiveQuietRuns + 1 : 0;
  await db
    .update(networkSchema.networkBackgroundWatches)
    .set({
      nextRunAt: nextRunFor(watch.frequency, now),
      lastRunAt: now,
      lastManualRunAt:
        input.triggeredBy === "manual" ? now : watch.lastManualRunAt,
      consecutiveQuietRuns,
      updatedAt: new Date(),
    })
    .where(eq(networkSchema.networkBackgroundWatches.id, watch.id));

  return {
    watchRunId: runRow.id,
    outcome,
    proposalCount,
    rawCandidateCount: searchResult.connections.length,
  };
}

/**
 * Select due watches for the hourly Network-deployment sweep (Brief 293 §sched).
 * Used by `src/engine/scheduler.ts`. Per parent D11, when `ianaTimezone` is null
 * the sweep falls back to UTC explicitly — the filter applies an hour-bucket
 * comparison in the watch's local tz (or UTC) against `localHourTarget`.
 */
export async function selectDueWatches(
  options: {
    db?: NetworkDbLike;
    now?: Date;
    localHourTarget?: number;
  } = {},
): Promise<{ watchId: string; userId: string }[]> {
  const db = options.db ?? networkDb;
  const now = options.now ?? new Date();
  const targetHour = options.localHourTarget ?? 9;

  // AC #12 — `active` AND `nextRunAt <= now` AND `nextRunAt IS NOT NULL`. The
  // null-guard excludes `manual_only` watches (frequency=null cadence).
  const due = await db
    .select({
      id: networkSchema.networkBackgroundWatches.id,
      userId: networkSchema.networkBackgroundWatches.userId,
      ianaTimezone: networkSchema.networkBackgroundWatches.ianaTimezone,
    })
    .from(networkSchema.networkBackgroundWatches)
    .where(
      and(
        eq(networkSchema.networkBackgroundWatches.status, "active"),
        isNotNull(networkSchema.networkBackgroundWatches.nextRunAt),
        lte(networkSchema.networkBackgroundWatches.nextRunAt, now),
      ),
    )
    .orderBy(desc(networkSchema.networkBackgroundWatches.nextRunAt));

  return due
    .filter((row) => {
      // tz filter — UTC fallback when ianaTimezone is null (parent D11 / AC #5).
      const tz = row.ianaTimezone ?? "UTC";
      let localHour: number;
      try {
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          hour12: false,
        });
        localHour = Number.parseInt(fmt.format(now), 10);
      } catch {
        // Invalid tz strings fall back to UTC, not silent skip.
        localHour = now.getUTCHours();
      }
      return localHour === targetHour;
    })
    .map((row) => ({ watchId: row.id, userId: row.userId }));
}
