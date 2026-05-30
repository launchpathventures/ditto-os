import { createHash, randomBytes } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import { assertDiscoverySourceRegistryAllows } from "./discovery-source-registry";
import { classifyAndPrepare } from "./network-email-compliance";
import {
  checkRateLimit,
  isNetworkOperationPaused,
} from "./network-abuse-controls";
import { isOutboundDiscoveryPaused } from "./network-discovery-runtime";
import {
  isSuppressed,
  recordNetworkSuppression,
} from "./network-suppression";
import { writeNetworkAuditEvent } from "./network-audit";
import { createAgentMailAdapterForPersona, type ChannelAdapter } from "./channel";
import { getOrCreateMemberSignal } from "./member-signal-research";
import { recordPrivacyDeletion } from "./network-tombstones";

export const COMPOSE_CLAIM_INVITE_TOOL_NAME = "compose_claim_invite";
export const SEND_CLAIM_INVITE_TOOL_NAME = "send_claim_invite";

export interface ClaimInviteSendFnInput {
  to: string;
  subject: string;
  body: string;
  headers: Record<string, string>;
}

export interface ComposeClaimInviteInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  candidateId: string;
  actorId?: string | null;
  now?: Date;
}

export interface SendClaimInviteInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  candidateId: string;
  actorId?: string | null;
  baseUrl?: string;
  now?: Date;
  sendFn?: (input: ClaimInviteSendFnInput) => Promise<{ success: boolean; messageId?: string; threadId?: string; error?: string }>;
  adapter?: ChannelAdapter | null;
}

export interface RedeemClaimTokenInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  token: string;
  email?: string | null;
  name?: string | null;
  actorId?: string | null;
  now?: Date;
}

export interface DeclineClaimInviteInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  token?: string | null;
  candidateId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  now?: Date;
}

export interface SuppressClaimInviteInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  token?: string | null;
  candidateId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  now?: Date;
}

export interface DeleteDiscoveryProfileInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  token?: string | null;
  discoveryProfileId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  now?: Date;
}

export interface ClaimInvitePreview {
  discoveryProfileId: string;
  displayName: string;
  headline: string;
  canonicalUrl: string | null;
  claims: {
    id: string;
    claimText: string;
    evidenceSnippet: string;
    sourceLabel: string;
    sourceUrl: string | null;
    confidence: string;
  }[];
  candidateId: string | null;
  status: string;
  expiresAt: Date | null;
}

export interface ClaimTokenSignalReviewData {
  claimTokenId: string;
  userId: string;
  memberSignal: typeof networkSchema.networkMemberSignals.$inferSelect;
  claims: (typeof networkSchema.networkSignalClaims.$inferSelect)[];
}

interface CandidateBundle {
  candidate: typeof networkSchema.networkInvitationCandidates.$inferSelect;
  profile: typeof networkSchema.networkDiscoveredProfiles.$inferSelect;
  claims: (typeof networkSchema.networkDiscoveryClaims.$inferSelect)[];
  sources: (typeof networkSchema.networkDiscoverySources.$inferSelect)[];
}

const CLAIM_TOKEN_DAYS = 30;

function clean(value: string | null | undefined, max = 2_000): string | null {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max).trim() : normalized;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export function hashClaimToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) throw new Error("claim token required");
  return createHash("sha256")
    .update(`network-claim-token:v1:${normalized}`)
    .digest("hex");
}

function mintPlainClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

function baseInviteUrl(input?: string): string {
  return (input ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.NETWORK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function claimUrl(baseUrl: string, token: string): string {
  return `${baseInviteUrl(baseUrl)}/network/claim/${encodeURIComponent(token)}`;
}

async function loadCandidateBundle(
  db: NetworkDbLike,
  candidateId: string,
): Promise<CandidateBundle> {
  const [candidate] = await db
    .select()
    .from(networkSchema.networkInvitationCandidates)
    .where(eq(networkSchema.networkInvitationCandidates.id, candidateId))
    .limit(1);
  if (!candidate) throw new Error("claim_invite_candidate_not_found");

  const [profile] = await db
    .select()
    .from(networkSchema.networkDiscoveredProfiles)
    .where(eq(networkSchema.networkDiscoveredProfiles.id, candidate.discoveryProfileId))
    .limit(1);
  if (!profile) throw new Error("discovery_profile_not_found");

  const claims = await db
    .select()
    .from(networkSchema.networkDiscoveryClaims)
    .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, profile.id));
  const sources = await db
    .select()
    .from(networkSchema.networkDiscoverySources);
  const sourceIds = new Set(claims.map((claim) => claim.sourceId));
  return {
    candidate,
    profile,
    claims,
    sources: sources.filter((source) => sourceIds.has(source.id)),
  };
}

async function loadTokenRow(
  db: NetworkDbLike,
  token: string,
): Promise<typeof networkSchema.networkClaimTokens.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(networkSchema.networkClaimTokens)
    .where(eq(networkSchema.networkClaimTokens.tokenHash, hashClaimToken(token)))
    .limit(1);
  return row ?? null;
}

function sourceTypeFromClass(
  sourceClass: networkSchema.NetworkDiscoverySourceClass,
): networkSchema.NetworkSignalSourceType {
  if (sourceClass === "linkedin-pointer" || sourceClass === "linkedin-api") return "linkedin";
  if (sourceClass === "public-website" || sourceClass === "user-provided-url") return "website";
  if (sourceClass === "public-professional-post") return "other_url";
  if (sourceClass === "public-search-result" || sourceClass === "public-web") return "web_search";
  return "other_url";
}

async function discoverySourcePredicateForProfile(
  db: NetworkDbLike,
  discoveryProfileId: string,
) {
  const sourceRefs = await db
    .select({ sourceId: networkSchema.networkDiscoveryClaims.sourceId })
    .from(networkSchema.networkDiscoveryClaims)
    .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, discoveryProfileId));
  const sourceIds = new Set(sourceRefs.map((row) => row.sourceId));
  const metadataRows = await db
    .select({
      id: networkSchema.networkDiscoverySources.id,
      metadata: networkSchema.networkDiscoverySources.metadata,
    })
    .from(networkSchema.networkDiscoverySources);
  for (const source of metadataRows) {
    if (source.metadata?.discoveryProfileId === discoveryProfileId) {
      sourceIds.add(source.id);
    }
  }
  return sourceIds.size > 0
    ? inArray(networkSchema.networkDiscoverySources.id, Array.from(sourceIds))
    : sql`false`;
}

function sectionFromClaim(text: string): networkSchema.NetworkSignalClaimSection {
  if (/\bhelp|advise|mentor|consult|support\b/i.test(text)) return "canHelpWith";
  if (/\bopen to|looking for|available\b/i.test(text)) return "openTo";
  if (/\bbuilding|working on|focus\b/i.test(text)) return "currentFocus";
  return "knownFor";
}

function buildInviteCopy(bundle: CandidateBundle, inviteUrl: string): { subject: string; body: string } {
  const strongest = bundle.claims[0];
  const evidence = strongest
    ? `${strongest.claimText} (${strongest.sourceLabel}${strongest.sourceUrl ? `, ${strongest.sourceUrl}` : ""})`
    : bundle.profile.sourceSummary;
  const subject = `A quick source-backed Ditto Network profile check`;
  const body = [
    `Hi ${bundle.profile.displayName},`,
    "",
    "I help run Ditto Network. We found a public, source-backed signal that may make you relevant for introductions we are seeing.",
    "",
    `What we found: ${evidence}`,
    "",
    "Nothing is public. If this is useful, you can review the suggested claims, edit or hide anything, and decide whether Ditto may use them for future introductions.",
    "",
    `Review or delete it here: ${inviteUrl}`,
    "",
    "If you would rather not be included, the same link lets you decline or delete the discovery profile.",
    "",
    "Alex",
  ].join("\n");
  return { subject, body };
}

async function ensureSendable(
  bundle: CandidateBundle,
  stepRunId: string,
  input: { db: NetworkDbLike; rootDir?: string; actorId?: string | null; now: Date },
): Promise<void> {
  if (bundle.profile.status !== "internal") {
    throw new Error(`discovery_profile_not_sendable:${bundle.profile.status}`);
  }
  if (bundle.candidate.status !== "queued" && bundle.candidate.status !== "drafted" && bundle.candidate.status !== "approved") {
    throw new Error(`claim_invite_candidate_not_sendable:${bundle.candidate.status}`);
  }
  if (!bundle.candidate.contactEmail) {
    throw new Error("claim_invite_requires_email_contact_path");
  }
  if (await isOutboundDiscoveryPaused({ db: input.db })) {
    throw new Error("outbound_discovery_paused");
  }
  if (bundle.candidate.totalScore < 65 || bundle.candidate.suppressionReasons.length > 0) {
    throw new Error("claim_invite_candidate_below_threshold");
  }
  await assertDiscoverySourceRegistryAllows(bundle.candidate.sourceClass, "invite-use", {
    db: input.db,
    rootDir: input.rootDir,
    stepRunId,
    actorId: input.actorId ?? null,
    subjectId: bundle.candidate.id,
    now: input.now,
  });
  const suppressed = await isSuppressed(bundle.candidate.contactEmail, {
    db: input.db,
    now: input.now,
    failClosed: true,
  });
  if (suppressed) throw new Error("claim_invite_recipient_suppressed");
  const pause = await isNetworkOperationPaused({
    db: input.db,
    now: input.now,
    source: bundle.candidate.sourceClass,
    requestId: bundle.candidate.requestId,
  });
  if (pause.paused) throw new Error(`network_operation_paused:${pause.reason}`);
}

export async function composeClaimInvite(
  input: ComposeClaimInviteInput,
): Promise<{ candidateId: string; subject: string; body: string }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    COMPOSE_CLAIM_INVITE_TOOL_NAME,
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const bundle = await loadCandidateBundle(db, input.candidateId);
  await ensureSendable(bundle, stepRunId, {
    db,
    rootDir: input.rootDir,
    actorId: input.actorId ?? null,
    now,
  });
  const previewToken = "preview";
  const copy = buildInviteCopy(bundle, claimUrl(baseInviteUrl(), previewToken));
  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({
      status: bundle.candidate.status === "approved" ? "approved" : "drafted",
      proposedSubject: copy.subject,
      proposedBody: copy.body,
      updatedAt: now,
    })
    .where(eq(networkSchema.networkInvitationCandidates.id, bundle.candidate.id));
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId: bundle.candidate.id,
    discoveryProfileId: bundle.profile.id,
    eventType: "drafted",
    actorType: "system",
    actorId: input.actorId ?? null,
    channel: "email",
    reasonCode: "claim_invite_composed",
    metadata: { sourceBackedClaimCount: bundle.claims.length },
    stepRunId,
    createdAt: now,
  });
  return { candidateId: bundle.candidate.id, ...copy };
}

export async function approveInvitationCandidate(input: {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  candidateId: string;
  actorId?: string | null;
  reason: string;
  notes?: string | null;
  now?: Date;
}): Promise<{ candidateId: string; auditEventId: string; approvedAt: Date }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "approve_invitation_candidate",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const bundle = await loadCandidateBundle(db, input.candidateId);
  await ensureSendable(bundle, stepRunId, {
    db,
    rootDir: input.rootDir,
    actorId: input.actorId ?? null,
    now,
  });
  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({
      status: "approved",
      operatorApprovedAt: now,
      operatorApprovedBy: input.actorId ?? null,
      updatedAt: now,
    })
    .where(eq(networkSchema.networkInvitationCandidates.id, input.candidateId));
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId: input.candidateId,
    discoveryProfileId: bundle.profile.id,
    eventType: "approved",
    actorType: "admin",
    actorId: input.actorId ?? null,
    channel: "email",
    reasonCode: input.reason.slice(0, 240),
    metadata: input.notes ? { notes: input.notes } : null,
    stepRunId,
    createdAt: now,
  });
  const audit = await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "operator_approved",
    subjectType: "claim_invite",
    subjectId: input.candidateId,
    actorType: "admin",
    actorId: input.actorId ?? null,
    reasonCode: input.reason.slice(0, 240),
    metadata: input.notes ? { notes: input.notes } : null,
    now,
  });
  return { candidateId: input.candidateId, auditEventId: audit.id, approvedAt: audit.createdAt };
}

async function persistClaimTokenRow(
  db: NetworkDbLike,
  input: {
    token: string;
    candidateId: string;
    discoveryProfileId: string;
    stepRunId: string;
    now: Date;
  },
): Promise<typeof networkSchema.networkClaimTokens.$inferSelect> {
  const [row] = await db
    .insert(networkSchema.networkClaimTokens)
    .values({
      tokenHash: hashClaimToken(input.token),
      discoveryProfileId: input.discoveryProfileId,
      candidateId: input.candidateId,
      status: "active",
      expiresAt: addDays(input.now, CLAIM_TOKEN_DAYS),
      stepRunId: input.stepRunId,
      metadata: { tokenDays: CLAIM_TOKEN_DAYS },
      createdAt: input.now,
    })
    .returning();
  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({ claimTokenId: row.id, updatedAt: input.now })
    .where(eq(networkSchema.networkInvitationCandidates.id, input.candidateId));
  return row;
}

export async function sendClaimInvite(
  input: SendClaimInviteInput,
): Promise<{ candidateId: string; tokenId: string; messageId: string | null; claimUrl: string }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    SEND_CLAIM_INVITE_TOOL_NAME,
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const bundle = await loadCandidateBundle(db, input.candidateId);
  if (bundle.candidate.status !== "approved") {
    throw new Error("claim_invite_requires_operator_approval");
  }
  await ensureSendable(bundle, stepRunId, {
    db,
    rootDir: input.rootDir,
    actorId: input.actorId ?? null,
    now,
  });
  const rateLimit = await checkRateLimit({
    db,
    limitName: "invite-send",
    actor: { kind: "email", id: bundle.candidate.contactEmail! },
    now,
  });
  if (!rateLimit.allowed) throw new Error(`claim_invite_rate_limited:${rateLimit.reason}`);

  const plainToken = mintPlainClaimToken();
  const url = claimUrl(input.baseUrl ?? baseInviteUrl(), plainToken);
  const copy = bundle.candidate.proposedSubject && bundle.candidate.proposedBody
    ? {
        subject: bundle.candidate.proposedSubject,
        body: bundle.candidate.proposedBody
          .replace(/https?:\/\/[^\s]+\/network\/claim\/preview/g, url)
          .replace(/\/network\/claim\/preview/g, `/network/claim/${plainToken}`),
      }
    : buildInviteCopy(bundle, url);
  const prepared = await classifyAndPrepare({
    db,
    rootDir: input.rootDir,
    stepRunId,
    kind: "claim-invite",
    to: bundle.candidate.contactEmail!,
    subject: copy.subject,
    body: copy.body,
    now,
  });
  if (!prepared.ok) throw new Error(`claim_invite_email_blocked:${prepared.blockedReason}`);

  const tokenRow = await persistClaimTokenRow(db, {
    token: plainToken,
    candidateId: bundle.candidate.id,
    discoveryProfileId: bundle.profile.id,
    stepRunId,
    now,
  });
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId: bundle.candidate.id,
    discoveryProfileId: bundle.profile.id,
    eventType: "queued",
    actorType: "admin",
    actorId: input.actorId ?? null,
    channel: "email",
    reasonCode: "claim_invite_send_prepared",
    metadata: { tokenId: tokenRow.id, compliancePrepared: true },
    stepRunId,
    createdAt: now,
  });

  const revokePreparedToken = async (reason: string): Promise<void> => {
    await db
      .update(networkSchema.networkClaimTokens)
      .set({ status: "revoked" })
      .where(eq(networkSchema.networkClaimTokens.id, tokenRow.id));
    await db.insert(networkSchema.networkInvitationEvents).values({
      candidateId: bundle.candidate.id,
      discoveryProfileId: bundle.profile.id,
      eventType: "blocked",
      actorType: "system",
      actorId: input.actorId ?? null,
      channel: "email",
      reasonCode: "claim_invite_send_failed",
      metadata: { tokenId: tokenRow.id, reason },
      stepRunId,
      createdAt: now,
    });
  };

  let sendResult: Awaited<ReturnType<NonNullable<SendClaimInviteInput["sendFn"]>>>;
  try {
    sendResult = input.sendFn
      ? await input.sendFn({
          to: prepared.to,
          subject: prepared.subject,
          body: prepared.body,
          headers: prepared.headers,
        })
      : await (input.adapter ?? createAgentMailAdapterForPersona("alex"))?.send({
          to: prepared.to,
          subject: prepared.subject,
          body: prepared.body,
          personaId: "alex",
          mode: "connecting",
          includeOptOut: false,
          headers: prepared.headers,
        }) ?? { success: false, error: "agentmail_not_configured" };
  } catch (error) {
    await revokePreparedToken(error instanceof Error ? error.message : "claim_invite_send_failed");
    throw error;
  }
  if (!sendResult.success) {
    await revokePreparedToken(sendResult.error ?? "claim_invite_send_failed");
    throw new Error(sendResult.error ?? "claim_invite_send_failed");
  }

  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({
      status: "sent",
      sentAt: now,
      proposedSubject: prepared.subject,
      proposedBody: prepared.body,
      updatedAt: now,
    })
    .where(eq(networkSchema.networkInvitationCandidates.id, bundle.candidate.id));
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId: bundle.candidate.id,
    discoveryProfileId: bundle.profile.id,
    eventType: "sent",
    actorType: "admin",
    actorId: input.actorId ?? null,
    channel: "email",
    reasonCode: "claim_invite_sent",
    metadata: { messageId: sendResult.messageId ?? null, threadId: sendResult.threadId ?? null },
    stepRunId,
    createdAt: now,
  });
  await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "invite_sent",
    subjectType: "claim_invite",
    subjectId: bundle.candidate.id,
    actorType: "admin",
    actorId: input.actorId ?? null,
    reasonCode: "claim_invite_sent",
    metadata: { discoveryProfileId: bundle.profile.id, tokenId: tokenRow.id },
    now,
  });
  return {
    candidateId: bundle.candidate.id,
    tokenId: tokenRow.id,
    messageId: sendResult.messageId ?? null,
    claimUrl: url,
  };
}

export async function getClaimInvitePreview(
  token: string,
  opts: { db?: NetworkDbLike; now?: Date } = {},
): Promise<ClaimInvitePreview | null> {
  const db = opts.db ?? networkDb;
  const now = opts.now ?? new Date();
  const row = await loadTokenRow(db, token);
  if (!row || row.status !== "active" || row.expiresAt <= now) return null;
  const [profile] = await db
    .select()
    .from(networkSchema.networkDiscoveredProfiles)
    .where(eq(networkSchema.networkDiscoveredProfiles.id, row.discoveryProfileId))
    .limit(1);
  if (!profile || profile.status === "deleted") return null;
  const claims = await db
    .select()
    .from(networkSchema.networkDiscoveryClaims)
    .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, profile.id));
  return {
    discoveryProfileId: profile.id,
    displayName: profile.displayName,
    headline: profile.headline,
    canonicalUrl: profile.canonicalUrl,
    claims: claims.map((claim) => ({
      id: claim.id,
      claimText: claim.claimText,
      evidenceSnippet: claim.evidenceSnippet,
      sourceLabel: claim.sourceLabel,
      sourceUrl: claim.sourceUrl,
      confidence: claim.confidence,
    })),
    candidateId: row.candidateId,
    status: profile.status,
    expiresAt: row.expiresAt,
  };
}

async function getOrCreateNetworkUserFromClaim(
  db: NetworkDbLike,
  input: { email: string; name: string | null; now: Date },
): Promise<typeof networkSchema.networkUsers.$inferSelect> {
  const email = normalizeEmail(input.email);
  const [row] = await db
    .insert(networkSchema.networkUsers)
    .values({
      email,
      name: input.name,
      status: "active",
      wantsVisibility: false,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: networkSchema.networkUsers.email,
      set: {
        name: input.name,
        status: "active",
        updatedAt: input.now,
      },
    })
    .returning();
  return row;
}

export async function redeemClaimToken(
  input: RedeemClaimTokenInput,
): Promise<{ userId: string; memberSignalId: string; redirectTo: string }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "redeem_claim_token",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const tokenRow = await loadTokenRow(db, input.token);
  if (!tokenRow || tokenRow.status !== "active" || tokenRow.expiresAt <= now) {
    throw new Error("claim_token_invalid_or_expired");
  }
  const [profile] = await db
    .select()
    .from(networkSchema.networkDiscoveredProfiles)
    .where(eq(networkSchema.networkDiscoveredProfiles.id, tokenRow.discoveryProfileId))
    .limit(1);
  if (!profile || profile.status === "deleted") throw new Error("discovery_profile_not_found");
  const profileEmail = clean(profile.contactEmail, 320);
  const providedEmail = clean(input.email, 320);
  if (profileEmail && providedEmail && normalizeEmail(profileEmail) !== normalizeEmail(providedEmail)) {
    throw new Error("claim_email_mismatch");
  }
  const email = profileEmail ?? providedEmail;
  if (!email) throw new Error("claim_requires_email");
  const user = await getOrCreateNetworkUserFromClaim(db, {
    email,
    name: clean(input.name ?? profile.displayName, 160),
    now,
  });
  const signal = await getOrCreateMemberSignal({ db, userId: user.id, now });
  const discoveryClaims = await db
    .select()
    .from(networkSchema.networkDiscoveryClaims)
    .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, profile.id));
  const sourceIdByDiscoverySource = new Map<string, string>();

  for (const claim of discoveryClaims) {
    let signalSourceId = sourceIdByDiscoverySource.get(claim.sourceId);
    if (!signalSourceId) {
      const [signalSource] = await db
        .insert(networkSchema.networkSignalSources)
        .values({
          memberSignalId: signal.id,
          userId: user.id,
          sourceType: sourceTypeFromClass(claim.sourceClass),
          sourceLabel: claim.sourceLabel,
          sourceUrl: claim.sourceUrl,
          originalInput: "Claim invite seed",
          status: "found",
          accessNote: "Imported from a claimed Discovery Profile.",
          evidenceSnippet: claim.evidenceSnippet,
          confidence: claim.confidence,
          metadata: { discoveryProfileId: profile.id, discoveryClaimSourceId: claim.sourceId },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      signalSourceId = signalSource.id;
      sourceIdByDiscoverySource.set(claim.sourceId, signalSourceId);
      await db.insert(networkSchema.networkSignalReviewEvents).values({
        memberSignalId: signal.id,
        claimId: null,
        userId: user.id,
        eventType: "source_added",
        actorId: input.actorId ?? user.id,
        stepRunId,
        before: null,
        after: { sourceId: signalSource.id, discoveryProfileId: profile.id },
        createdAt: now,
      });
    }
    const [signalClaim] = await db
      .insert(networkSchema.networkSignalClaims)
      .values({
        memberSignalId: signal.id,
        userId: user.id,
        sourceId: signalSourceId,
        section: sectionFromClaim(claim.claimText),
        claimText: claim.claimText,
        sourceType: sourceTypeFromClass(claim.sourceClass),
        sourceLabel: claim.sourceLabel,
        sourceUrl: claim.sourceUrl,
        evidenceSnippet: claim.evidenceSnippet,
        confidence: claim.confidence,
        visibility: "on-request",
        approvalState: "suggested",
        metadata: { discoveryProfileId: profile.id, discoveryClaimId: claim.id },
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(networkSchema.networkSignalReviewEvents).values({
      memberSignalId: signal.id,
      claimId: signalClaim.id,
      userId: user.id,
      eventType: "claim_drafted",
      actorId: input.actorId ?? user.id,
      stepRunId,
      before: null,
      after: { discoveryProfileId: profile.id, approvalState: "suggested", visibility: "on-request" },
      createdAt: now,
    });
  }

  await db
    .update(networkSchema.networkMemberSignals)
    .set({
      status: "review",
      sourceSummary: "Claim invite seed imported for review. Suggested claims are private/on-request until edited and approved.",
      updatedAt: now,
    })
    .where(eq(networkSchema.networkMemberSignals.id, signal.id));
  await db
    .update(networkSchema.networkClaimTokens)
    .set({ status: "redeemed", redeemedAt: now, redeemedUserId: user.id })
    .where(eq(networkSchema.networkClaimTokens.id, tokenRow.id));
  await db
    .update(networkSchema.networkDiscoveredProfiles)
    .set({ status: "claimed", claimedAt: now, claimedUserId: user.id, updatedAt: now })
    .where(eq(networkSchema.networkDiscoveredProfiles.id, profile.id));
  if (tokenRow.candidateId) {
    await db
      .update(networkSchema.networkInvitationCandidates)
      .set({ status: "claimed", updatedAt: now })
      .where(eq(networkSchema.networkInvitationCandidates.id, tokenRow.candidateId));
    await db.insert(networkSchema.networkInvitationEvents).values({
      candidateId: tokenRow.candidateId,
      discoveryProfileId: profile.id,
      eventType: "claimed",
      actorType: "visitor",
      actorId: input.actorId ?? user.id,
      channel: "email",
      reasonCode: "claim_token_redeemed",
      metadata: { memberSignalId: signal.id, userId: user.id },
      stepRunId,
      createdAt: now,
    });
  }
  await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "claim",
    subjectType: "discovery_profile",
    subjectId: profile.id,
    actorType: "visitor",
    actorId: input.actorId ?? user.id,
    reasonCode: "claim_token_redeemed",
    metadata: { memberSignalId: signal.id, tokenId: tokenRow.id },
    now,
  });
  return {
    userId: user.id,
    memberSignalId: signal.id,
    redirectTo: `/network/signal?claim=${encodeURIComponent(signal.id)}&claimToken=${encodeURIComponent(input.token)}&seed=discovery-profile`,
  };
}

export async function getClaimTokenSignalReviewData(input: {
  db?: NetworkDbLike;
  token: string;
  memberSignalId: string;
  now?: Date;
}): Promise<ClaimTokenSignalReviewData | null> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const tokenRow = await loadTokenRow(db, input.token);
  if (
    !tokenRow ||
    tokenRow.status !== "redeemed" ||
    !tokenRow.redeemedUserId ||
    tokenRow.expiresAt <= now
  ) {
    return null;
  }
  const [signal] = await db
    .select()
    .from(networkSchema.networkMemberSignals)
    .where(
      and(
        eq(networkSchema.networkMemberSignals.id, input.memberSignalId),
        eq(networkSchema.networkMemberSignals.userId, tokenRow.redeemedUserId),
      ),
    )
    .limit(1);
  if (!signal || signal.status === "deleted") return null;
  const claims = await db
    .select()
    .from(networkSchema.networkSignalClaims)
    .where(
      and(
        eq(networkSchema.networkSignalClaims.memberSignalId, signal.id),
        eq(networkSchema.networkSignalClaims.userId, tokenRow.redeemedUserId),
      ),
    );
  return {
    claimTokenId: tokenRow.id,
    userId: tokenRow.redeemedUserId,
    memberSignal: signal,
    claims,
  };
}

export async function suppressInvitationCandidate(input: {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  candidateId: string;
  actorId?: string | null;
  reason: string;
  notes?: string | null;
  now?: Date;
}): Promise<{ candidateId: string; auditEventId: string; suppressedAt: Date }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "suppress_invitation_candidate",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const bundle = await loadCandidateBundle(db, input.candidateId);
  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({
      status: "suppressed",
      suppressionReasons: Array.from(new Set([...bundle.candidate.suppressionReasons, input.reason])),
      updatedAt: now,
    })
    .where(eq(networkSchema.networkInvitationCandidates.id, input.candidateId));
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId: input.candidateId,
    discoveryProfileId: bundle.profile.id,
    eventType: "suppressed",
    actorType: "admin",
    actorId: input.actorId ?? null,
    channel: bundle.candidate.channel,
    reasonCode: input.reason.slice(0, 240),
    metadata: input.notes ? { notes: input.notes } : null,
    stepRunId,
    createdAt: now,
  });
  const audit = await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "operator_suppressed",
    subjectType: "claim_invite",
    subjectId: input.candidateId,
    actorType: "admin",
    actorId: input.actorId ?? null,
    reasonCode: input.reason.slice(0, 240),
    metadata: input.notes ? { notes: input.notes } : null,
    now,
  });
  if (bundle.candidate.contactEmail) {
    await recordNetworkSuppression({
      db,
      rootDir: input.rootDir,
      stepRunId,
      identifier: bundle.candidate.contactEmail,
      identifierKind: "email",
      scope: "global",
      reason: "operator-suppressed",
      source: "operator-claim-invite",
      actorId: input.actorId ?? null,
      now,
    });
  }
  return { candidateId: input.candidateId, auditEventId: audit.id, suppressedAt: now };
}

export async function declineClaimInvite(
  input: DeclineClaimInviteInput,
): Promise<{ ok: true; discoveryProfileId: string }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "decline_claim_invite",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const tokenRow = input.token ? await loadTokenRow(db, input.token) : null;
  const candidateId = input.candidateId ?? tokenRow?.candidateId;
  if (!candidateId) throw new Error("decline_claim_invite_requires_candidate");
  const bundle = await loadCandidateBundle(db, candidateId);
  await db
    .update(networkSchema.networkDiscoveredProfiles)
    .set({ status: "declined", updatedAt: now })
    .where(eq(networkSchema.networkDiscoveredProfiles.id, bundle.profile.id));
  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({ status: "declined", updatedAt: now })
    .where(eq(networkSchema.networkInvitationCandidates.id, candidateId));
  if (tokenRow) {
    await db
      .update(networkSchema.networkClaimTokens)
      .set({ status: "revoked" })
      .where(eq(networkSchema.networkClaimTokens.id, tokenRow.id));
  }
  if (bundle.candidate.contactEmail) {
    await recordNetworkSuppression({
      db,
      rootDir: input.rootDir,
      stepRunId,
      identifier: bundle.candidate.contactEmail,
      identifierKind: "email",
      scope: "global",
      reason: "decline",
      source: "claim-invite",
      actorId: input.actorId ?? null,
      now,
    });
  }
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId,
    discoveryProfileId: bundle.profile.id,
    eventType: "declined",
    actorType: "visitor",
    actorId: input.actorId ?? null,
    channel: bundle.candidate.channel,
    reasonCode: clean(input.reason, 240) ?? "declined",
    metadata: null,
    stepRunId,
    createdAt: now,
  });
  await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "decline",
    subjectType: "discovery_profile",
    subjectId: bundle.profile.id,
    actorType: "visitor",
    actorId: input.actorId ?? null,
    reasonCode: clean(input.reason, 240) ?? "declined",
    metadata: { candidateId },
    now,
  });
  return { ok: true, discoveryProfileId: bundle.profile.id };
}

export async function suppressClaimInvite(
  input: SuppressClaimInviteInput,
): Promise<{ ok: true; discoveryProfileId: string }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "suppress_claim_invite",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const tokenRow = input.token ? await loadTokenRow(db, input.token) : null;
  const candidateId = input.candidateId ?? tokenRow?.candidateId;
  if (!candidateId) throw new Error("suppress_claim_invite_requires_candidate");
  const bundle = await loadCandidateBundle(db, candidateId);
  await db
    .update(networkSchema.networkDiscoveredProfiles)
    .set({ status: "declined", updatedAt: now })
    .where(eq(networkSchema.networkDiscoveredProfiles.id, bundle.profile.id));
  await db
    .update(networkSchema.networkInvitationCandidates)
    .set({
      status: "suppressed",
      suppressionReasons: [
        ...bundle.candidate.suppressionReasons,
        clean(input.reason, 240) ?? "visitor-suppressed",
      ],
      updatedAt: now,
    })
    .where(eq(networkSchema.networkInvitationCandidates.id, candidateId));
  if (tokenRow) {
    await db
      .update(networkSchema.networkClaimTokens)
      .set({ status: "revoked" })
      .where(eq(networkSchema.networkClaimTokens.id, tokenRow.id));
  }
  if (bundle.candidate.contactEmail) {
    await recordNetworkSuppression({
      db,
      rootDir: input.rootDir,
      stepRunId,
      identifier: bundle.candidate.contactEmail,
      identifierKind: "email",
      scope: "global",
      reason: "operator-suppressed",
      source: "privacy-center",
      actorId: input.actorId ?? null,
      now,
    });
  }
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId,
    discoveryProfileId: bundle.profile.id,
    eventType: "suppressed",
    actorType: "visitor",
    actorId: input.actorId ?? null,
    channel: bundle.candidate.channel,
    reasonCode: clean(input.reason, 240) ?? "suppressed",
    metadata: null,
    stepRunId,
    createdAt: now,
  });
  await writeNetworkAuditEvent({
    db,
    rootDir: input.rootDir,
    stepRunId,
    eventClass: "operator_suppressed",
    subjectType: "discovery_profile",
    subjectId: bundle.profile.id,
    actorType: "visitor",
    actorId: input.actorId ?? null,
    reasonCode: clean(input.reason, 240) ?? "suppressed",
    metadata: { candidateId, source: "privacy_center_self_service" },
    now,
  });
  return { ok: true, discoveryProfileId: bundle.profile.id };
}

export async function deleteDiscoveryProfile(
  input: DeleteDiscoveryProfileInput,
): Promise<{ ok: true; discoveryProfileId: string }> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "delete_discovery_profile",
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const tokenRow = input.token ? await loadTokenRow(db, input.token) : null;
  const discoveryProfileId = input.discoveryProfileId ?? tokenRow?.discoveryProfileId;
  if (!discoveryProfileId) throw new Error("delete_discovery_profile_requires_subject");
  const [profile] = await db
    .select()
    .from(networkSchema.networkDiscoveredProfiles)
    .where(eq(networkSchema.networkDiscoveredProfiles.id, discoveryProfileId))
    .limit(1);
  if (!profile) throw new Error("discovery_profile_not_found");
  await recordPrivacyDeletion({
    db,
    rootDir: input.rootDir,
    stepRunId,
    subjectType: "discovery-profile",
    subjectId: profile.id,
    deletedByActorType: "visitor",
    actorId: input.actorId ?? null,
    deletedReason: clean(input.reason, 240) ?? "claim_invite_delete",
    suppressionIdentifier: profile.contactEmail
      ? { identifier: profile.contactEmail, identifierKind: "email" }
      : undefined,
    metadata: { source: "claim_invite" },
    now,
  }, async (tx) => {
    const sourcePredicate = await discoverySourcePredicateForProfile(tx, profile.id);
    await tx
      .update(networkSchema.networkDiscoveredProfiles)
      .set({ status: "deleted", deletedAt: now, updatedAt: now })
      .where(eq(networkSchema.networkDiscoveredProfiles.id, profile.id));
    if (tokenRow?.candidateId) {
      await tx
        .update(networkSchema.networkInvitationCandidates)
        .set({ status: "deleted", updatedAt: now })
        .where(eq(networkSchema.networkInvitationCandidates.id, tokenRow.candidateId));
    }
    if (tokenRow) {
      await tx
        .update(networkSchema.networkClaimTokens)
        .set({ status: "revoked" })
        .where(eq(networkSchema.networkClaimTokens.id, tokenRow.id));
    }
    await tx
      .update(networkSchema.networkDiscoverySources)
      .set({
        sourceLabel: "Deleted discovery source",
        sourceUrl: null,
        metadata: {
          discoveryProfileId: profile.id,
          discoveryProfileDeleted: true,
          deletedAt: now.toISOString(),
        },
      })
      .where(sourcePredicate);
  });
  await db.insert(networkSchema.networkInvitationEvents).values({
    candidateId: tokenRow?.candidateId ?? null,
    discoveryProfileId: profile.id,
    eventType: "deleted",
    actorType: "visitor",
    actorId: input.actorId ?? null,
    channel: "email",
    reasonCode: clean(input.reason, 240) ?? "deleted",
    metadata: null,
    stepRunId,
    createdAt: now,
  });
  return { ok: true, discoveryProfileId: profile.id };
}
