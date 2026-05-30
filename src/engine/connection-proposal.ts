/**
 * Connection Proposal (Brief 274)
 *
 * Turns a raw matched/scouted `SuggestedCandidate` into a reasoned
 * **Possible Connection** — a superconnector's "here's why this person
 * might be worth considering," never a marketplace candidate row.
 *
 * Hard rules enforced here (Brief 274 Constraints):
 *  - A result is a proposal, not a claim of fit ("possible connection").
 *  - Every result has a why.
 *  - Every evidence item has provenance (source label + url/id).
 *  - Uncertainty is visible (risks / gaps surfaced, confidence honest).
 *  - Private/on-request facts are scrubbed from seeker-facing copy unless
 *    explicitly authorized; the scrub decision is reported on the object.
 *
 * Pure module — no DB, no network, no side effects. `network-manual-search`
 * persists what this builds; the HTTP wrapper guards the side effects.
 */

import { createHash } from "crypto";
import type { JobRequestCardBlock, SuggestedCandidate } from "./content-blocks";
import type {
  NetworkPossibleConnectionConfidence,
  NetworkPossibleConnectionSource,
} from "@ditto/core/db/network";

export type PossibleConnectionNextAction =
  | "refine"
  | "ask-if-open"
  | "save"
  | "watch"
  | "not-a-fit";

export type PossibleConnectionIntroEligibility =
  | "eligible"
  | "consent-unavailable"
  | "blocked";

export interface PossibleConnectionEvidence {
  sourceLabel: string;
  url: string | null;
  snippet: string;
  claimId: string | null;
}

export interface PossibleConnection {
  /** Stable proposal key (dedupe within a run). DB row id is assigned on persist. */
  proposalKey: string;
  source: NetworkPossibleConnectionSource;
  personId: string | null;
  displayName: string;
  headline: string;
  canonicalUrl: string | null;
  isDittoMember: boolean;
  whyThisFits: string;
  whyNow: string | null;
  evidence: PossibleConnectionEvidence[];
  risks: string[];
  confidence: NetworkPossibleConnectionConfidence;
  networkHealthFlags: string[];
  nextAction: PossibleConnectionNextAction;
  introEligibility: PossibleConnectionIntroEligibility;
  /** false when network-health flags suppress/downgrade the result. */
  recommended: boolean;
  notRecommendedReason: string | null;
  /** Whether private/on-request copy was redacted from seeker-facing text. */
  scrubApplied: boolean;
}

export interface NetworkHealthSignal {
  /** keyed by person id (member) or proposal key (off-network). */
  highDemand?: boolean;
  recentlyContacted?: boolean;
  blocked?: boolean;
  antiPersonaRisk?: boolean;
  /** Brief 293 — extensions covering the 8 v1 network-health rules. */
  overContact?: boolean;
  requesterOverAsking?: boolean;
  duplicateCooldown?: boolean;
  staleEvidence?: boolean;
  pendingCommercialReview?: boolean;
}

export interface BuildPossibleConnectionContext {
  card: JobRequestCardBlock;
  /** Active Request calibration fields, when search is grounded in a request. */
  geography?: string | null;
  proofRequired?: string | null;
  /** person-id / proposal-key → health signal. */
  health?: Record<string, NetworkHealthSignal>;
  /**
   * Brief 276 owns the consent foundation. Until it exists, "ask if open"
   * is not an eligible next action — proposals can only be saved/watched.
   */
  consentFoundationAvailable?: boolean;
}

const PRIVATE_TOKEN = "[private]";

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function privateValues(card: JobRequestCardBlock): string[] {
  return [card.antiPersonaMd, card.budgetShape.ballpark]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** Redacts private/on-request request fields out of seeker-facing copy. */
export function scrubProposalText(text: string, card: JobRequestCardBlock): {
  text: string;
  scrubbed: boolean;
} {
  let scrubbed = text;
  let didScrub = false;
  for (const value of privateValues(card)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    if (re.test(scrubbed)) {
      didScrub = true;
      scrubbed = scrubbed.replace(new RegExp(escaped, "gi"), PRIVATE_TOKEN);
    }
  }
  return { text: clean(scrubbed), scrubbed: didScrub };
}

function proposalKey(candidate: SuggestedCandidate): string {
  const basis = candidate.sourceUrl
    ? `${candidate.name}|${candidate.sourceUrl}`
    : `${candidate.source}|${candidate.handle}`;
  return `pc:${createHash("sha256").update(basis).digest("hex").slice(0, 16)}`;
}

function mapSource(candidate: SuggestedCandidate): NetworkPossibleConnectionSource {
  return candidate.source === "on-network" ? "ditto-member" : "public-web";
}

function deriveRisks(
  candidate: SuggestedCandidate,
  ctx: BuildPossibleConnectionContext,
  now: Date,
): string[] {
  const risks: string[] = [];
  if (candidate.source === "scouted" && !candidate.sourceUrl) {
    risks.push("Missing public proof — no source URL to verify this lead.");
  }
  const rationale = clean(candidate.rationaleMd);
  if (rationale.length < 40) {
    risks.push("Low context — the source gives only a thin signal of fit.");
  }
  if (ctx.geography && !new RegExp(ctx.geography.split(/[\s,]+/)[0] ?? ctx.geography, "i")
    .test(`${candidate.oneLineRole} ${rationale}`)) {
    risks.push(`Geography unconfirmed — request asks for ${ctx.geography}; source does not confirm location.`);
  }
  if (ctx.proofRequired && !new RegExp("proof|case study|portfolio|reference|track record", "i")
    .test(rationale)) {
    risks.push("Seniority/proof uncertain — the source does not surface the proof this request requires.");
  }
  const computedAt = new Date(candidate.computedAt).getTime();
  if (!Number.isNaN(computedAt) && now.getTime() - computedAt > 30 * 24 * 60 * 60 * 1000) {
    risks.push("Stale source — this signal is more than 30 days old.");
  }
  return risks;
}

function downgrade(
  base: NetworkPossibleConnectionConfidence,
): NetworkPossibleConnectionConfidence {
  return base === "high" ? "medium" : "low";
}

/**
 * Build a single Possible Connection from a SuggestedCandidate.
 * Never throws on thin input — returns an honest low-confidence proposal
 * with visible gaps instead.
 */
export function buildPossibleConnection(
  candidate: SuggestedCandidate,
  ctx: BuildPossibleConnectionContext,
  now: Date = new Date(),
): PossibleConnection {
  const key = proposalKey(candidate);
  const source = mapSource(candidate);
  const isDittoMember = source === "ditto-member";
  const healthKey = isDittoMember ? candidate.handle : key;
  const health = ctx.health?.[healthKey] ?? {};

  const why = scrubProposalText(candidate.rationaleMd, ctx.card);
  const role = scrubProposalText(candidate.oneLineRole, ctx.card);
  const scrubApplied = why.scrubbed || role.scrubbed;

  const evidence: PossibleConnectionEvidence[] = [];
  if (candidate.sourceLabel || candidate.sourceUrl) {
    evidence.push({
      sourceLabel: candidate.sourceLabel
        ?? (isDittoMember ? "Ditto member signal" : "Public source"),
      url: candidate.sourceUrl ?? null,
      snippet: candidate.sourceSnippet
        ? scrubProposalText(candidate.sourceSnippet, ctx.card).text
        : why.text,
      claimId: isDittoMember ? candidate.handle : null,
    });
  } else if (isDittoMember) {
    evidence.push({
      sourceLabel: "Ditto member signal",
      url: null,
      snippet: why.text,
      claimId: candidate.handle,
    });
  }

  const risks = deriveRisks(candidate, ctx, now);

  const healthFlags: string[] = [];
  if (health.highDemand) healthFlags.push("high-demand");
  if (health.recentlyContacted) healthFlags.push("recently-contacted");
  if (health.blocked) healthFlags.push("blocked");
  if (health.antiPersonaRisk) healthFlags.push("anti-persona-risk");

  let confidence: NetworkPossibleConnectionConfidence = candidate.fitConfidence;
  if (risks.length >= 2 || evidence.length === 0) confidence = downgrade(confidence);

  const suppressed = health.blocked || health.antiPersonaRisk;
  const downgraded = health.highDemand || health.recentlyContacted;
  if (suppressed) confidence = "low";
  else if (downgraded) confidence = downgrade(confidence);

  const recommended = !suppressed;
  let notRecommendedReason: string | null = null;
  if (health.blocked) {
    notRecommendedReason = "Not currently recommended — this person is blocked for this network.";
  } else if (health.antiPersonaRisk) {
    notRecommendedReason = "Not currently recommended — this person matches an anti-persona filter.";
  } else if (downgraded) {
    notRecommendedReason = health.highDemand
      ? "Reach out sparingly — this person is in high demand right now."
      : "Reach out sparingly — this person was contacted recently.";
  }

  const introEligibility: PossibleConnectionIntroEligibility = suppressed
    ? "blocked"
    : ctx.consentFoundationAvailable
      ? "eligible"
      : "consent-unavailable";

  const nextAction: PossibleConnectionNextAction = suppressed
    ? "not-a-fit"
    : introEligibility === "eligible"
      ? "ask-if-open"
      : "save";

  return {
    proposalKey: key,
    source,
    personId: isDittoMember ? candidate.handle : null,
    displayName: scrubProposalText(candidate.name, ctx.card).text || "Possible connection",
    headline: role.text || (isDittoMember ? "Ditto member" : "Publicly sourced lead"),
    canonicalUrl: candidate.sourceUrl ?? null,
    isDittoMember,
    whyThisFits: why.text || "Surfaced as a possible fit; ask me to dig deeper before you act.",
    whyNow: ctx.card.jtbd ? `You're looking for ${scrubProposalText(ctx.card.jtbd, ctx.card).text}.` : null,
    evidence,
    risks,
    confidence,
    networkHealthFlags: healthFlags,
    nextAction,
    introEligibility,
    recommended,
    notRecommendedReason,
    scrubApplied,
  };
}

/** Build, dedupe by proposal key, member-first when fit is equal. */
export function buildPossibleConnections(
  candidates: SuggestedCandidate[],
  ctx: BuildPossibleConnectionContext,
  now: Date = new Date(),
): PossibleConnection[] {
  const seen = new Set<string>();
  const built = candidates
    .map((candidate) => buildPossibleConnection(candidate, ctx, now))
    .filter((proposal) => {
      if (seen.has(proposal.proposalKey)) return false;
      seen.add(proposal.proposalKey);
      return true;
    });
  const rank: Record<NetworkPossibleConnectionConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return built.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (rank[a.confidence] !== rank[b.confidence]) {
      return rank[a.confidence] - rank[b.confidence];
    }
    if (a.isDittoMember !== b.isDittoMember) return a.isDittoMember ? -1 : 1;
    return 0;
  });
}
