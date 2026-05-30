/**
 * Network Health Evaluator (Brief 293 / parent Brief 275 D3)
 *
 * Applies the 8 v1 network-health rules to a candidate proposal and
 * emits a `NetworkHealthDecision` (`pass | downgrade | suppress |
 * queue-for-review`) with per-rule reasons. Pure module — no DB, no
 * network calls. Signal inputs are pre-loaded by the runner.
 *
 * The 8 v1 rules (Brief 275 §Network Health Evaluator):
 *   1. Suppress if target has explicit block for requester/domain.
 *   2. Suppress if target anti-persona strongly matches.
 *   3. Suppress if target is over-contacted (too many recent intros).
 *   4. Suppress if requester has too many outstanding asks.
 *   5. Suppress duplicate pair/request proposals inside cooldown window.
 *   6. Downgrade if evidence is stale or weak.
 *   7. Queue for human/operator review if commercial sensitivity is high.
 *   8. Do not propose if confidence is low unless broad exploration is
 *      explicitly enabled.
 *
 * Rule precedence: suppress > queue-for-review > downgrade > pass. The
 * first hit at the highest tier wins for the persisted `kind`; every
 * triggered rule is recorded in `reasons` for the audit trail (AC #8).
 */

import type {
  NetworkWatchHealthDecision,
  NetworkPossibleConnectionConfidence,
} from "@ditto/core/db/network";
import type { NetworkHealthSignal } from "./connection-proposal";

export const NETWORK_HEALTH_RULE_IDS = [
  "blocked",
  "anti-persona",
  "over-contact",
  "requester-over-asking",
  "duplicate-cooldown",
  "stale-evidence",
  "commercial-sensitive",
  "low-confidence",
] as const;
export type NetworkHealthRuleId = (typeof NETWORK_HEALTH_RULE_IDS)[number];

export interface NetworkHealthRuleFinding {
  ruleId: NetworkHealthRuleId;
  /** suppress | queue-for-review | downgrade — what this rule wants. */
  wants: Exclude<NetworkWatchHealthDecision, "pass">;
  reason: string;
}

export interface EvaluateNetworkHealthInput {
  /** Per-target signals; the runner loads these from DB before calling. */
  signal: NetworkHealthSignal;
  confidence: NetworkPossibleConnectionConfidence;
  /** Optional age (in days) of the freshest piece of evidence. null = unknown. */
  evidenceMaxAgeDays?: number | null;
  /** Stale-evidence rule fires when evidence is older than this. */
  staleEvidenceThresholdDays?: number;
  /** Rule 4: outstanding asks the requester already has open. */
  requesterOutstandingAskCount?: number;
  /** Rule 4: requester max-outstanding-asks ceiling. */
  requesterOutstandingAskCeiling?: number;
  /** Rule 7: heuristic flag (commercial-sensitive request). */
  commercialSensitive?: boolean;
  /** Rule 8: when true, low-confidence proposals are allowed through. */
  broadExploration?: boolean;
}

export interface NetworkHealthDecisionResult {
  kind: NetworkWatchHealthDecision;
  reasons: NetworkHealthRuleFinding[];
  /** Set when kind === "downgrade"; otherwise null. */
  downgradedConfidence: NetworkPossibleConnectionConfidence | null;
}

function dropConfidence(
  base: NetworkPossibleConnectionConfidence,
): NetworkPossibleConnectionConfidence {
  if (base === "high") return "medium";
  if (base === "medium") return "low";
  return "low";
}

export function evaluateNetworkHealth(
  input: EvaluateNetworkHealthInput,
): NetworkHealthDecisionResult {
  const reasons: NetworkHealthRuleFinding[] = [];
  const signal = input.signal;

  // Rule 1 — explicit block.
  if (signal.blocked) {
    reasons.push({
      ruleId: "blocked",
      wants: "suppress",
      reason: "Target has an explicit block for this requester or domain.",
    });
  }

  // Rule 2 — anti-persona match.
  if (signal.antiPersonaRisk) {
    reasons.push({
      ruleId: "anti-persona",
      wants: "suppress",
      reason: "Target's anti-persona rule matches this requester.",
    });
  }

  // Rule 3 — over-contact (target-side throttle).
  if (signal.overContact || signal.highDemand || signal.recentlyContacted) {
    reasons.push({
      ruleId: "over-contact",
      wants: "suppress",
      reason: "Target is over-contacted right now; back off.",
    });
  }

  // Rule 4 — requester over-asking (requester-side throttle).
  const outstanding = input.requesterOutstandingAskCount ?? 0;
  const ceiling = input.requesterOutstandingAskCeiling ?? 5;
  if (signal.requesterOverAsking || outstanding >= ceiling) {
    reasons.push({
      ruleId: "requester-over-asking",
      wants: "suppress",
      reason: `Requester already has ${outstanding} outstanding asks (ceiling ${ceiling}).`,
    });
  }

  // Rule 5 — duplicate cooldown (recently surfaced same target).
  if (signal.duplicateCooldown) {
    reasons.push({
      ruleId: "duplicate-cooldown",
      wants: "suppress",
      reason: "This pair/request was surfaced within the cooldown window.",
    });
  }

  // Rule 6 — stale evidence → downgrade (not suppress).
  const staleThresholdDays = input.staleEvidenceThresholdDays ?? 30;
  const age = input.evidenceMaxAgeDays;
  if (
    signal.staleEvidence ||
    (typeof age === "number" && age > staleThresholdDays)
  ) {
    reasons.push({
      ruleId: "stale-evidence",
      wants: "downgrade",
      reason: `Freshest evidence is older than ${staleThresholdDays} days.`,
    });
  }

  // Rule 7 — commercial sensitivity → queue for operator review.
  if (signal.pendingCommercialReview || input.commercialSensitive) {
    reasons.push({
      ruleId: "commercial-sensitive",
      wants: "queue-for-review",
      reason: "Commercial sensitivity flagged; needs operator review.",
    });
  }

  // Rule 8 — low confidence (unless broad exploration is allowed).
  if (input.confidence === "low" && !input.broadExploration) {
    reasons.push({
      ruleId: "low-confidence",
      wants: "suppress",
      reason:
        "Confidence is low and broad-exploration mode is not enabled for this watch.",
    });
  }

  // Decide the winning decision tier.
  const wants = new Set(reasons.map((r) => r.wants));
  if (wants.has("suppress")) {
    return { kind: "suppress", reasons, downgradedConfidence: null };
  }
  if (wants.has("queue-for-review")) {
    return { kind: "queue-for-review", reasons, downgradedConfidence: null };
  }
  if (wants.has("downgrade")) {
    return {
      kind: "downgrade",
      reasons,
      downgradedConfidence: dropConfidence(input.confidence),
    };
  }
  return { kind: "pass", reasons, downgradedConfidence: null };
}

export interface NetworkHealthSummary {
  /** Per-decision counts across the run. */
  counts: Record<NetworkWatchHealthDecision, number>;
  /** Rule-hit tallies across the run. */
  ruleHits: Partial<Record<NetworkHealthRuleId, number>>;
}

export function summarizeNetworkHealth(
  decisions: NetworkHealthDecisionResult[],
): NetworkHealthSummary {
  const counts: Record<NetworkWatchHealthDecision, number> = {
    pass: 0,
    downgrade: 0,
    suppress: 0,
    "queue-for-review": 0,
  };
  const ruleHits: Partial<Record<NetworkHealthRuleId, number>> = {};
  for (const decision of decisions) {
    counts[decision.kind] += 1;
    for (const r of decision.reasons) {
      ruleHits[r.ruleId] = (ruleHits[r.ruleId] ?? 0) + 1;
    }
  }
  return { counts, ruleHits };
}
