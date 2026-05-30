import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import { webSearch as defaultWebSearch } from "./web-search";
import {
  assertDiscoverySourceRegistryAllows,
  blocksLinkedInSnippetClaim,
  classifyDiscoverySourceUrl,
  getDiscoverySourceRegistryEntry,
  type DiscoveryRegistrySourceClass,
} from "./discovery-source-registry";
import { isSuppressed } from "./network-suppression";
import {
  assertNetworkOperationNotPaused,
  isNetworkOperationPaused,
} from "./network-abuse-controls";
import { writeNetworkAuditEvent } from "./network-audit";
import { scoreInvitationCandidate } from "./invitation-candidate-score";
import { isOutboundDiscoveryPaused } from "./network-discovery-runtime";

export const DISCOVER_PUBLIC_PEOPLE_TOOL_NAME = "discover_public_people";

export interface PublicDiscoverySeedProfile {
  displayName: string;
  headline?: string | null;
  canonicalUrl?: string | null;
  contactEmail?: string | null;
  contactUrl?: string | null;
  contactPathKind?: string | null;
  sourceClass?: DiscoveryRegistrySourceClass | string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  evidenceSnippet?: string | null;
  claimText?: string | null;
}

export interface DiscoverPublicPeopleInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  actorId?: string | null;
  query?: string | null;
  segment?: string | null;
  requestId?: string | null;
  watchId?: string | null;
  sourceClasses?: DiscoveryRegistrySourceClass[];
  userProvidedUrls?: string[];
  referralProfiles?: PublicDiscoverySeedProfile[];
  maxProfiles?: number;
  now?: Date;
  webSearchFn?: (query: string) => Promise<string | null>;
}

export interface DiscoveryCandidateSummary {
  candidateId: string;
  discoveryProfileId: string;
  status: networkSchema.NetworkInvitationCandidateStatus;
  totalScore: number;
  inviteable: boolean;
  suppressionReasons: string[];
}

export interface DiscoverPublicPeopleResult {
  webSearchAvailable: boolean;
  profileCount: number;
  candidateCount: number;
  candidates: DiscoveryCandidateSummary[];
  notice: string | null;
}

const MAX_RESULT_PROFILES = 10;
const DEFAULT_DISCOVERY_DAYS = 180;

function clean(value: string | null | undefined, max = 2_000): string | null {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > max ? normalized.slice(0, max).trim() : normalized;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function emailFromText(value: string): string | null {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

function urlFromText(value: string): string | null {
  return value.match(/https?:\/\/[^\s)\]}>"']+/i)?.[0] ?? null;
}

function titleFromLine(line: string, fallback: string): string {
  const withoutUrl = line.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const first = withoutUrl.split(/[|;-]/)[0]?.trim();
  return clean(first, 120) ?? fallback;
}

function claimFromLine(line: string): string {
  const clipped = clean(line, 260);
  return clipped ?? "Public source shows a professional signal relevant to the request.";
}

function queryForInput(
  input: DiscoverPublicPeopleInput,
  request: typeof networkSchema.networkJobRequests.$inferSelect | null,
): string {
  const requestText = request
    ? [request.outcomeNeeded, request.idealPerson, request.proofRequired, request.geography]
        .filter(Boolean)
        .join(" ")
    : "";
  const urls = (input.userProvidedUrls ?? []).join(" ");
  const base = clean([input.query, requestText, input.segment, urls].filter(Boolean).join(" "), 1_200);
  return base
    ? `Find public professional people and source URLs relevant to: ${base}. Include contact paths only when public and compliant.`
    : "Find public professional people with source-backed evidence and public contact paths.";
}

function parseWebProfiles(text: string, query: string): PublicDiscoverySeedProfile[] {
  return text
    .split("\n")
    .map((line) => clean(line, 1_000))
    .filter((line): line is string => Boolean(line))
    .map((line, index) => {
      const sourceUrl = urlFromText(line);
      const sourceClass = classifyDiscoverySourceUrl(sourceUrl, "public-search-result");
      const pointerOnly = blocksLinkedInSnippetClaim(sourceClass, sourceUrl);
      const contactEmail = pointerOnly ? null : emailFromText(line);
      return {
        displayName: pointerOnly
          ? `LinkedIn profile pointer ${index + 1}`
          : titleFromLine(line, `Public lead ${index + 1}`),
        headline: pointerOnly
          ? "LinkedIn URL pointer"
          : clean(line, 180) ?? query.slice(0, 120),
        canonicalUrl: sourceUrl,
        contactEmail,
        contactUrl: contactEmail ? null : sourceUrl,
        contactPathKind: pointerOnly ? null : contactEmail ? "email" : sourceUrl ? "public-url" : null,
        sourceClass,
        sourceLabel: sourceClass === "linkedin-pointer" ? "LinkedIn pointer" : "Public search result",
        sourceUrl,
        evidenceSnippet: pointerOnly ? null : line,
        claimText: pointerOnly ? null : claimFromLine(line),
      };
    });
}

async function loadRequest(
  db: NetworkDbLike,
  requestId: string | null | undefined,
): Promise<typeof networkSchema.networkJobRequests.$inferSelect | null> {
  if (!requestId) return null;
  const [request] = await db
    .select()
    .from(networkSchema.networkJobRequests)
    .where(eq(networkSchema.networkJobRequests.id, requestId))
    .limit(1);
  return request ?? null;
}

async function persistSource({
  db,
  sourceClass,
  sourceLabel,
  sourceUrl,
  retrievalAt,
  metadata,
}: {
  db: NetworkDbLike;
  sourceClass: DiscoveryRegistrySourceClass;
  sourceLabel: string;
  sourceUrl: string | null;
  retrievalAt: Date;
  metadata: Record<string, unknown> | null;
}): Promise<typeof networkSchema.networkDiscoverySources.$inferSelect> {
  const entry = getDiscoverySourceRegistryEntry(sourceClass);
  const [source] = await db
    .insert(networkSchema.networkDiscoverySources)
    .values({
      sourceClass: entry.sourceClass,
      sourceLabel,
      sourceUrl,
      collectionMethod: entry.collectionMethod,
      storagePolicy: entry.storagePolicy,
      rateLimitPolicy: entry.rateLimitPolicy,
      invitePolicy: entry.invitePolicy,
      allowedUse: entry.allowedUse,
      policySnapshot: {
        sourceClass: entry.sourceClass,
        notes: entry.notes,
        platformPolicyUrl: entry.platformPolicyUrl ?? null,
      },
      retrievalAt,
      metadata,
    })
    .returning();
  return source;
}

export async function discoverPublicPeople(
  input: DiscoverPublicPeopleInput,
): Promise<DiscoverPublicPeopleResult> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    DISCOVER_PUBLIC_PEOPLE_TOOL_NAME,
    { rootDir: input.rootDir },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();

  if (await isOutboundDiscoveryPaused({ db })) {
    throw new Error("outbound_discovery_paused");
  }
  await assertNetworkOperationNotPaused({
    db,
    now,
    source: "public-web",
    segment: input.segment ?? null,
    requestId: input.requestId ?? null,
  });

  const request = await loadRequest(db, input.requestId);
  const query = queryForInput(input, request);
  const webSearchFn = input.webSearchFn ?? defaultWebSearch;
  let webSearchAvailable = true;
  let webProfiles: PublicDiscoverySeedProfile[] = [];

  if (input.query || input.requestId) {
    const result = await webSearchFn(query);
    if (result) {
      webProfiles = parseWebProfiles(result, query);
    } else {
      webSearchAvailable = Boolean(process.env.PERPLEXITY_API_KEY);
    }
  }

  const urlProfiles: PublicDiscoverySeedProfile[] = (input.userProvidedUrls ?? [])
    .map((url, index) => ({
      displayName: `User-provided lead ${index + 1}`,
      headline: "User-provided public URL",
      canonicalUrl: url,
      contactUrl: url,
      contactPathKind: "public-url",
      sourceClass: classifyDiscoverySourceUrl(url, "user-provided-url"),
      sourceLabel: "User-provided URL",
      sourceUrl: url,
      evidenceSnippet: `User provided ${url}`,
      claimText: "User provided a public source URL for review.",
    }));

  const seedProfiles = [
    ...(input.referralProfiles ?? []),
    ...urlProfiles,
    ...webProfiles,
  ].slice(0, Math.min(input.maxProfiles ?? MAX_RESULT_PROFILES, MAX_RESULT_PROFILES));

  const candidates: DiscoveryCandidateSummary[] = [];
  for (const [index, seed] of seedProfiles.entries()) {
    const classifiedSource = seed.sourceClass
      ? getDiscoverySourceRegistryEntry(seed.sourceClass).sourceClass
      : classifyDiscoverySourceUrl(seed.sourceUrl ?? seed.canonicalUrl, "public-search-result");
    await assertDiscoverySourceRegistryAllows(classifiedSource, "collect", {
      db,
      rootDir: input.rootDir,
      stepRunId,
      actorId: input.actorId ?? null,
      subjectId: seed.sourceUrl ?? seed.canonicalUrl ?? seed.displayName,
      now,
    });
    await assertDiscoverySourceRegistryAllows(classifiedSource, "store", {
      db,
      rootDir: input.rootDir,
      stepRunId,
      actorId: input.actorId ?? null,
      subjectId: seed.sourceUrl ?? seed.canonicalUrl ?? seed.displayName,
      now,
    });

    const source = await persistSource({
      db,
      sourceClass: classifiedSource,
      sourceLabel: clean(seed.sourceLabel, 160) ?? getDiscoverySourceRegistryEntry(classifiedSource).sourceLabel,
      sourceUrl: clean(seed.sourceUrl ?? seed.canonicalUrl, 1_000),
      retrievalAt: now,
      metadata: { actorId: input.actorId ?? null, query, requestId: input.requestId ?? null },
    });

    const sourceUrl = clean(seed.sourceUrl ?? seed.canonicalUrl, 1_000);
    const pointerOnly = blocksLinkedInSnippetClaim(classifiedSource, sourceUrl);

    const [profile] = await db
      .insert(networkSchema.networkDiscoveredProfiles)
      .values({
        displayName: pointerOnly
          ? `LinkedIn profile pointer ${index + 1}`
          : clean(seed.displayName, 160) ?? "Discovered person",
        headline: pointerOnly
          ? "LinkedIn URL pointer"
          : clean(seed.headline, 240) ?? "Public professional signal",
        canonicalUrl: clean(seed.canonicalUrl ?? seed.sourceUrl, 1_000),
        contactEmail: pointerOnly ? null : clean(seed.contactEmail, 320),
        contactUrl: clean(seed.contactUrl, 1_000),
        contactPathKind: pointerOnly ? null : clean(seed.contactPathKind, 80),
        sourceClass: classifiedSource,
        sourceSummary: pointerOnly
          ? "LinkedIn URL stored as a policy-constrained pointer. No LinkedIn profile content or snippets were stored."
          : clean(seed.evidenceSnippet, 500) ?? getDiscoverySourceRegistryEntry(classifiedSource).notes,
        requestId: input.requestId ?? null,
        watchId: input.watchId ?? null,
        status: "internal",
        expiresAt: addDays(now, DEFAULT_DISCOVERY_DAYS),
        stepRunId,
        metadata: {
          query,
          segment: input.segment ?? null,
          internalOnly: true,
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db
      .update(networkSchema.networkDiscoverySources)
      .set({
        metadata: {
          ...(source.metadata ?? {}),
          discoveryProfileId: profile.id,
          discoveryProfileSourceRole: "primary",
        },
      })
      .where(eq(networkSchema.networkDiscoverySources.id, source.id));

    const claims: (typeof networkSchema.networkDiscoveryClaims.$inferSelect)[] = [];
    if (!blocksLinkedInSnippetClaim(classifiedSource, sourceUrl)) {
      const claimText = clean(seed.claimText, 500);
      const evidenceSnippet = clean(seed.evidenceSnippet, 1_000);
      if (claimText && evidenceSnippet) {
        const [claim] = await db
          .insert(networkSchema.networkDiscoveryClaims)
          .values({
            discoveryProfileId: profile.id,
            sourceId: source.id,
            claimText,
            evidenceSnippet,
            confidence: classifiedSource === "referral-list" ? "high" : "medium",
            sourceClass: classifiedSource,
            sourceLabel: source.sourceLabel,
            sourceUrl,
            retrievalAt: now,
            metadata: { linkedInSnippetBlocked: false },
          })
          .returning();
        claims.push(claim);
      }
    }

    const suppressionHit = profile.contactEmail
      ? await isSuppressed(profile.contactEmail, { db, now, failClosed: false })
      : false;
    const sourcePaused = (await isNetworkOperationPaused({
      db,
      now,
      source: classifiedSource,
      segment: input.segment ?? null,
      requestId: input.requestId ?? null,
    })).paused;
    const score = scoreInvitationCandidate({
      profile,
      claims,
      request,
      priorOptOutOrDelete: suppressionHit,
      sourcePaused,
      now,
    });
    const status: networkSchema.NetworkInvitationCandidateStatus =
      score.inviteable ? "queued" : "blocked";
    const [candidate] = await db
      .insert(networkSchema.networkInvitationCandidates)
      .values({
        discoveryProfileId: profile.id,
        requestId: input.requestId ?? null,
        watchId: input.watchId ?? null,
        status,
        channel: profile.contactEmail ? "email" : "contact-form",
        sourceClass: classifiedSource,
        contactEmail: profile.contactEmail,
        contactUrl: profile.contactUrl,
        contactPathKind: profile.contactPathKind,
        superconnectorFit: score.superconnectorFit,
        activeOpportunityFit: score.activeOpportunityFit,
        activeRequestFit: score.activeRequestFit,
        sourceConfidence: score.sourceConfidence,
        inviteRisk: score.inviteRisk,
        networkHealth: score.networkHealth,
        totalScore: score.totalScore,
        scores: {
          superconnectorFit: score.superconnectorFit,
          activeOpportunityFit: score.activeOpportunityFit,
          activeRequestFit: score.activeRequestFit,
          sourceConfidence: score.sourceConfidence,
          inviteRisk: score.inviteRisk,
          networkHealth: score.networkHealth,
        },
        riskFlags: score.riskFlags,
        suppressionReasons: score.suppressionReasons,
        inviteReason: score.inviteReason,
        stepRunId,
        metadata: { webSearchAvailable, inviteable: score.inviteable },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(networkSchema.networkInvitationEvents).values({
      candidateId: candidate.id,
      discoveryProfileId: profile.id,
      eventType: status === "queued" ? "queued" : "blocked",
      actorType: "system",
      actorId: input.actorId ?? null,
      channel: candidate.channel,
      reasonCode: status === "queued" ? "score_passed" : "score_blocked",
      metadata: { score },
      stepRunId,
      createdAt: now,
    });
    await writeNetworkAuditEvent({
      db,
      rootDir: input.rootDir,
      stepRunId,
      eventClass: "invitation_candidate_scored",
      subjectType: "claim_invite",
      subjectId: candidate.id,
      actorType: "system",
      actorId: input.actorId ?? null,
      reasonCode: status,
      metadata: { discoveryProfileId: profile.id, totalScore: score.totalScore },
      now,
    });

    candidates.push({
      candidateId: candidate.id,
      discoveryProfileId: profile.id,
      status,
      totalScore: score.totalScore,
      inviteable: score.inviteable,
      suppressionReasons: score.suppressionReasons,
    });
  }

  return {
    webSearchAvailable,
    profileCount: seedProfiles.length,
    candidateCount: candidates.length,
    candidates,
    notice: webSearchAvailable
      ? null
      : "Public web search is not configured, so discovery only used provided URLs/referral seeds.",
  };
}
