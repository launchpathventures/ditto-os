/**
 * Network Manual Search (Brief 274)
 *
 * Makes manual search a first-class, evidence-backed workflow. A seeker
 * can ask Ditto directly for people/expertise/opportunities from
 * `/network`, from an Active Request, or from an approved Member Signal.
 * The output is a compact set of reasoned **Possible Connections** — not
 * a marketplace candidate list.
 *
 * Side-effect guard (Insight-180 / Insight-232): `run_network_search`
 * REQUIRES a `stepRunId` proving the call originates from harness/lane
 * step execution. Without it (outside `DITTO_TEST_MODE`) no external/LLM
 * call is made and no search run is written. The HTTP wrapper mints the
 * step run server-side and rejects any caller-supplied id.
 *
 * Degradation: when public-web search is unavailable (Perplexity not
 * configured / scout returns unavailable) the search degrades to member
 * results with `webSearchAvailable: false` and `partial: true`. It never
 * crashes.
 */

import { desc, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import type { NetworkDbLike } from "./network-kb-storage";
import type { JobRequestCardBlock, SuggestedCandidate } from "./content-blocks";
import { matchOnNetwork } from "./network-match";
import { scoutOffNetwork } from "./network-scout";
import {
  buildPossibleConnections,
  type BuildPossibleConnectionContext,
  type NetworkHealthSignal,
  type PossibleConnection,
} from "./connection-proposal";

export const RUN_NETWORK_SEARCH_TOOL_NAME = "run_network_search";

const MAX_RESULTS = 5;

export interface PersistedPossibleConnection extends PossibleConnection {
  id: string;
}

export interface NetworkManualSearchInput {
  db?: NetworkDbLike;
  userId?: string | null;
  visitorSessionId?: string | null;
  actorId?: string | null;
  sessionId?: string | null;
  stepRunId?: string | null;
  query: string;
  /** Optional Active-Request-derived card; built from `query` when absent. */
  jobRequestCard?: JobRequestCardBlock;
  mode?: networkSchema.NetworkSearchMode;
  sourcesAllowed?: networkSchema.NetworkRequestSourcesAllowed;
  requestId?: string | null;
  memberSignalId?: string | null;
  refinement?: string | null;
  geography?: string | null;
  proofRequired?: string | null;
  health?: Record<string, NetworkHealthSignal>;
  /** Brief 276 owns the consent foundation; false until it exists. */
  consentFoundationAvailable?: boolean;
  sampleLimit?: number;
  now?: Date;
  matchFn?: (
    card: JobRequestCardBlock,
    opts: { sampleLimit: number; now?: () => Date },
  ) => Promise<SuggestedCandidate[]>;
  scoutFn?: (
    card: JobRequestCardBlock,
    stepRunId: string,
  ) => Promise<{ candidates: SuggestedCandidate[]; available: boolean }>;
}

export interface NetworkManualSearchResult {
  searchRunId: string;
  mode: networkSchema.NetworkSearchMode;
  query: string;
  webSearchAvailable: boolean;
  partial: boolean;
  scrubApplied: boolean;
  connections: PersistedPossibleConnection[];
  /** Seeker-facing copy when public web is unavailable. */
  webUnavailableNotice: string | null;
}

function clampQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 2_000);
}

/** Minimal Active-Request-shaped card so match/scout can run from a bare query. */
export function cardFromQuery(
  query: string,
  now: Date,
  partial?: Partial<JobRequestCardBlock>,
): JobRequestCardBlock {
  return {
    type: "job-request-card",
    jtbd: clampQuery(query),
    referenceShape: "",
    antiPersonaMd: "",
    successCriteria: "",
    budgetShape: { ballpark: "", cadence: "project" },
    scoutOptIn: true,
    suggestedCandidates: [],
    greeterCuratedBy: "mira",
    matchCuratedBy: "mira",
    lastUpdatedAt: now.toISOString(),
    ...partial,
  };
}

function wantsMember(
  mode: networkSchema.NetworkSearchMode,
  sources: networkSchema.NetworkRequestSourcesAllowed,
): boolean {
  if (sources === "public-web") return false;
  return mode === "member" || mode === "both" || mode === "from-request" ||
    mode === "from-member-signal";
}

function wantsPublic(
  mode: networkSchema.NetworkSearchMode,
  sources: networkSchema.NetworkRequestSourcesAllowed,
): boolean {
  if (sources === "ditto-members") return false;
  return mode === "public-web" || mode === "both" || mode === "from-request";
}

async function defaultScout(
  card: JobRequestCardBlock,
  stepRunId: string,
): Promise<{ candidates: SuggestedCandidate[]; available: boolean }> {
  const result = await scoutOffNetwork({ jobRequestCard: card, stepRunId });
  const unavailable = /not configured|unavailable/i.test(result.review.outputText)
    && result.candidates.length === 0;
  return { candidates: result.candidates, available: !unavailable };
}

export async function runNetworkSearch(
  input: NetworkManualSearchInput,
): Promise<NetworkManualSearchResult> {
  // Side-effect guard FIRST — before any external/LLM call or row write.
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    RUN_NETWORK_SEARCH_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const query = clampQuery(input.query);
  if (!query) {
    throw new Error("run_network_search requires a non-empty query");
  }
  const mode: networkSchema.NetworkSearchMode = input.mode ?? "both";
  const sourcesAllowed: networkSchema.NetworkRequestSourcesAllowed =
    input.sourcesAllowed ?? "both";
  const card = input.jobRequestCard
    ? { ...input.jobRequestCard, jtbd: input.jobRequestCard.jtbd || query }
    : cardFromQuery(query, now);

  const matchFn = input.matchFn ?? matchOnNetwork;
  const scoutFn = input.scoutFn ?? defaultScout;

  const candidates: SuggestedCandidate[] = [];
  let webSearchAvailable = true;
  let partial = false;

  if (wantsMember(mode, sourcesAllowed)) {
    try {
      const members = await matchFn(card, {
        sampleLimit: input.sampleLimit ?? 200,
        now: () => now,
      });
      candidates.push(...members);
    } catch (error) {
      partial = true;
      console.warn("[network-manual-search] member match failed:", error);
    }
  }

  if (wantsPublic(mode, sourcesAllowed)) {
    try {
      const scouted = await scoutFn(card, stepRunId);
      webSearchAvailable = scouted.available;
      if (!scouted.available) partial = true;
      candidates.push(...scouted.candidates);
    } catch (error) {
      webSearchAvailable = false;
      partial = true;
      console.warn("[network-manual-search] public scout failed:", error);
    }
  } else {
    webSearchAvailable = sourcesAllowed === "ditto-members" ? true : webSearchAvailable;
  }

  const ctx: BuildPossibleConnectionContext = {
    card,
    geography: input.geography ?? null,
    proofRequired: input.proofRequired ?? null,
    health: input.health,
    consentFoundationAvailable: input.consentFoundationAvailable ?? false,
  };
  let proposals = buildPossibleConnections(candidates, ctx, now);

  // Apply session/request-scoped prior feedback (AC #12): hidden/not-a-fit
  // proposals from the same actor are suppressed or downranked.
  const suppressed = await loadSuppressedKeys(db, input);
  if (suppressed.hidden.size > 0 || suppressed.notFit.size > 0) {
    proposals = proposals
      .filter((p) => !suppressed.hidden.has(p.proposalKey))
      .map((p) =>
        suppressed.notFit.has(p.proposalKey)
          ? { ...p, recommended: false, notRecommendedReason: p.notRecommendedReason ?? "You marked this not a fit earlier in this search." }
          : p,
      )
      .sort((a, b) => (a.recommended === b.recommended ? 0 : a.recommended ? -1 : 1));
  }

  proposals = proposals.slice(0, MAX_RESULTS);
  const scrubApplied = proposals.some((p) => p.scrubApplied);

  // Persist the search run + proposals + audit (search_run).
  const [run] = await db
    .insert(networkSchema.networkSearchRuns)
    .values({
      userId: input.userId ?? null,
      visitorSessionId: input.visitorSessionId ?? null,
      actorId: input.actorId ?? null,
      sessionId: input.sessionId ?? null,
      stepRunId,
      mode,
      sourcesAllowed,
      query,
      refinement: input.refinement ?? null,
      requestId: input.requestId ?? null,
      memberSignalId: input.memberSignalId ?? null,
      resultCount: proposals.length,
      webSearchAvailable,
      partial,
      metadata: { scrubApplied },
    })
    .returning({ id: networkSchema.networkSearchRuns.id });

  const persisted: PersistedPossibleConnection[] = [];
  for (const proposal of proposals) {
    const [row] = await db
      .insert(networkSchema.networkPossibleConnections)
      .values({
        searchRunId: run.id,
        userId: input.userId ?? null,
        visitorSessionId: input.visitorSessionId ?? null,
        source: proposal.source,
        personId: proposal.personId,
        displayName: proposal.displayName,
        headline: proposal.headline,
        canonicalUrl: proposal.canonicalUrl,
        isDittoMember: proposal.isDittoMember,
        whyThisFits: proposal.whyThisFits,
        whyNow: proposal.whyNow,
        evidence: proposal.evidence,
        risks: proposal.risks,
        confidence: proposal.confidence,
        networkHealthFlags: proposal.networkHealthFlags,
        nextAction: proposal.nextAction,
        introEligibility: proposal.introEligibility,
        lifecycleState: "proposed",
        scrubApplied: proposal.scrubApplied,
        metadata: {
          proposalKey: proposal.proposalKey,
          recommended: proposal.recommended,
          notRecommendedReason: proposal.notRecommendedReason,
        },
      })
      .returning({ id: networkSchema.networkPossibleConnections.id });
    persisted.push({ ...proposal, id: row.id });
  }

  await db.insert(networkSchema.networkSearchAuditEvents).values({
    searchRunId: run.id,
    possibleConnectionId: null,
    eventType: "search_run",
    actorId: input.actorId ?? null,
    stepRunId,
    targetLifecycleState: "proposed",
    scrubDecision: { scrubApplied, mode, sourcesAllowed },
    before: null,
    after: { query, resultCount: persisted.length, webSearchAvailable, partial },
  });

  return {
    searchRunId: run.id,
    mode,
    query,
    webSearchAvailable,
    partial,
    scrubApplied,
    connections: persisted,
    webUnavailableNotice: webSearchAvailable
      ? null
      : "Public web search isn't available right now, so these are Ditto members only. I can keep watching and add public leads when it's back.",
  };
}

async function loadSuppressedKeys(
  db: NetworkDbLike,
  input: NetworkManualSearchInput,
): Promise<{ hidden: Set<string>; notFit: Set<string> }> {
  const hidden = new Set<string>();
  const notFit = new Set<string>();
  const actorId = input.actorId ?? input.userId ?? input.visitorSessionId;
  if (!actorId) return { hidden, notFit };
  try {
    const rows = await db
      .select({
        kind: networkSchema.networkSearchFeedback.kind,
        metadata: networkSchema.networkSearchFeedback.metadata,
      })
      .from(networkSchema.networkSearchFeedback)
      .where(eq(networkSchema.networkSearchFeedback.actorId, actorId))
      .orderBy(desc(networkSchema.networkSearchFeedback.createdAt))
      .limit(100);
    for (const row of rows) {
      const key = (row.metadata as { proposalKey?: string } | null)?.proposalKey;
      if (!key) continue;
      if (row.kind === "hide") hidden.add(key);
      if (row.kind === "not-a-fit") notFit.add(key);
    }
  } catch (error) {
    console.warn("[network-manual-search] suppressed-key load skipped:", error);
  }
  return { hidden, notFit };
}
