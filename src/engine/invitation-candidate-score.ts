import type * as networkSchema from "@ditto/core/db/network";
import { getDiscoverySourceRegistryEntry } from "./discovery-source-registry";

export interface DiscoveryProfileForScoring {
  displayName: string;
  headline: string | null;
  contactEmail?: string | null;
  contactUrl?: string | null;
  contactPathKind?: string | null;
  sourceClass: string;
  sourceSummary?: string | null;
}

export interface DiscoveryClaimForScoring {
  claimText: string;
  evidenceSnippet: string;
  confidence: networkSchema.NetworkDiscoveryClaimConfidence;
  sourceClass: string;
  sourceUrl?: string | null;
  retrievalAt?: Date | string | null;
}

export interface ActiveRequestForScoring {
  id?: string | null;
  outcomeNeeded?: string | null;
  idealPerson?: string | null;
  proofRequired?: string | null;
  badFit?: string | null;
  geography?: string | null;
  status?: string | null;
}

export interface InvitationCandidateScoreInput {
  profile: DiscoveryProfileForScoring;
  claims: DiscoveryClaimForScoring[];
  request?: ActiveRequestForScoring | null;
  priorDeclineOrComplaint?: boolean;
  priorOptOutOrDelete?: boolean;
  sourcePaused?: boolean;
  segmentPaused?: boolean;
  networkHealthPaused?: boolean;
  now?: Date;
}

export interface InvitationCandidateScore {
  superconnectorFit: number;
  activeOpportunityFit: number;
  activeRequestFit: number;
  sourceConfidence: number;
  inviteRisk: number;
  networkHealth: number;
  totalScore: number;
  inviteable: boolean;
  riskFlags: string[];
  suppressionReasons: string[];
  inviteReason: string;
}

const PROFESSIONAL_SIGNAL_PATTERNS = [
  /\bfounder\b/i,
  /\boperator\b/i,
  /\bdesigner\b/i,
  /\bengineer\b/i,
  /\bdeveloper\b/i,
  /\binvestor\b/i,
  /\bconsultant\b/i,
  /\badvisor\b/i,
  /\bproduct\b/i,
  /\bgo-to-market\b/i,
  /\bmarketplace\b/i,
  /\benterprise\b/i,
  /\bopen source\b/i,
  /\bAI\b/i,
  /\bautomation\b/i,
];

const SENSITIVE_INFERENCE_PATTERNS = [
  /\bage\b/i,
  /\brace\b/i,
  /\bethnicity\b/i,
  /\breligion\b/i,
  /\bdisability\b/i,
  /\bmedical\b/i,
  /\bhealth condition\b/i,
  /\bpregnan/i,
  /\bsexual orientation\b/i,
  /\bpolitical\b/i,
  /\bcitizenship\b/i,
  /\bmarital\b/i,
  /\bfamily status\b/i,
];

const GENERIC_REASON_PATTERNS = [
  /^interesting profile\.?$/i,
  /^great fit\.?$/i,
  /^seems relevant\.?$/i,
  /^might be useful\.?$/i,
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function textBundle(input: InvitationCandidateScoreInput): string {
  return [
    input.profile.displayName,
    input.profile.headline,
    input.profile.sourceSummary,
    ...input.claims.flatMap((claim) => [claim.claimText, claim.evidenceSnippet]),
  ]
    .filter(Boolean)
    .join("\n");
}

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function daysOld(value: Date | string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function hasContactPath(profile: DiscoveryProfileForScoring): boolean {
  return Boolean(profile.contactEmail?.trim() || profile.contactUrl?.trim());
}

function requestTerms(request: ActiveRequestForScoring | null | undefined): string[] {
  if (!request) return [];
  const text = [
    request.outcomeNeeded,
    request.idealPerson,
    request.proofRequired,
    request.geography,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return Array.from(new Set(text.match(/[a-z][a-z0-9-]{3,}/g) ?? []))
    .filter((term) => !["with", "from", "that", "this", "have", "need", "person"].includes(term))
    .slice(0, 20);
}

function buildInviteReason(
  profile: DiscoveryProfileForScoring,
  claims: DiscoveryClaimForScoring[],
  request?: ActiveRequestForScoring | null,
): string {
  const strongest = claims.find((claim) => claim.confidence === "high") ?? claims[0];
  const requestShape = request?.outcomeNeeded ?? request?.idealPerson;
  if (strongest && requestShape) {
    return `${profile.displayName} has source-backed evidence for ${strongest.claimText}; that overlaps with ${requestShape}.`;
  }
  if (strongest) {
    return `${profile.displayName} has source-backed evidence for ${strongest.claimText}.`;
  }
  return `${profile.displayName} has a public professional signal, but needs stronger source evidence before outreach.`;
}

export function scoreInvitationCandidate(
  input: InvitationCandidateScoreInput,
): InvitationCandidateScore {
  const now = input.now ?? new Date();
  const bundle = textBundle(input);
  const lower = bundle.toLowerCase();
  const riskFlags: string[] = [];
  const suppressionReasons: string[] = [];
  const sourceEntry = getDiscoverySourceRegistryEntry(input.profile.sourceClass);

  const professionalSignalCount = countMatches(PROFESSIONAL_SIGNAL_PATTERNS, bundle);
  if (professionalSignalCount === 0) suppressionReasons.push("no_professional_signal");

  if (!hasContactPath(input.profile)) suppressionReasons.push("no_contact_path");

  if (SENSITIVE_INFERENCE_PATTERNS.some((pattern) => pattern.test(bundle))) {
    suppressionReasons.push("sensitive_or_protected_class_inference");
    riskFlags.push("sensitive_inference");
  }

  const staleEvidence = input.claims.every((claim) => {
    const age = daysOld(claim.retrievalAt, now);
    return age !== null && age > 180;
  });
  if (input.claims.length === 0 || staleEvidence) suppressionReasons.push("stale_or_missing_evidence");

  if (input.priorDeclineOrComplaint) suppressionReasons.push("prior_decline_or_complaint");
  if (input.priorOptOutOrDelete) suppressionReasons.push("prior_opt_out_or_delete");
  if (input.sourcePaused) suppressionReasons.push("paused_source");
  if (input.segmentPaused) suppressionReasons.push("paused_segment");
  if (!sourceEntry.allowedUse.inviteUse) suppressionReasons.push("source_not_invite_eligible");
  if (input.networkHealthPaused) suppressionReasons.push("network_health_paused");

  const requestKeywords = requestTerms(input.request);
  const requestMatches = requestKeywords.filter((term) => lower.includes(term)).length;
  const confidenceScore = input.claims.length === 0
    ? 0
    : input.claims.reduce((sum, claim) => {
      if (claim.confidence === "high") return sum + 100;
      if (claim.confidence === "medium") return sum + 70;
      return sum + 35;
    }, 0) / input.claims.length;

  const superconnectorFit = clampScore(35 + professionalSignalCount * 15 + (hasContactPath(input.profile) ? 15 : 0));
  const activeOpportunityFit = clampScore(35 + requestMatches * 12 + (input.request?.status === "active" ? 10 : 0));
  const activeRequestFit = input.request ? clampScore(30 + requestMatches * 16) : 40;
  const sourceConfidence = clampScore(confidenceScore);
  const inviteRisk = clampScore(100 - suppressionReasons.length * 18 - riskFlags.length * 10);
  const networkHealth = input.networkHealthPaused ? 0 : 90;
  const totalScore = clampScore(
    superconnectorFit * 0.22 +
      activeOpportunityFit * 0.18 +
      activeRequestFit * 0.2 +
      sourceConfidence * 0.18 +
      inviteRisk * 0.12 +
      networkHealth * 0.1,
  );
  const inviteReason = buildInviteReason(input.profile, input.claims, input.request);
  if (GENERIC_REASON_PATTERNS.some((pattern) => pattern.test(inviteReason))) {
    suppressionReasons.push("weak_generic_invite_reason");
  }

  return {
    superconnectorFit,
    activeOpportunityFit,
    activeRequestFit,
    sourceConfidence,
    inviteRisk,
    networkHealth,
    totalScore,
    inviteable: suppressionReasons.length === 0 && totalScore >= 65,
    riskFlags,
    suppressionReasons,
    inviteReason,
  };
}
