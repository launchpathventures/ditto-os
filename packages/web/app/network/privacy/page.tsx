import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { isNetworkDbConnectionError } from "@/lib/network-availability";
import { PrivacyCenter } from "@/components/network/privacy-center";
import {
  resolveNetworkLaneSession,
  type NetworkLaneSession,
} from "../../api/v1/network/kb/session";
import {
  createDiscoveryPrivacyCenterData,
  createEmptyPrivacyCenterData,
  type PrivacyCenterData,
  type PrivacyClaim,
  type PrivacyRequest,
  type PrivacySource,
  type PrivacySubjectType,
} from "@/components/network/privacy-center-data";
import { createNetworkLaneStepRun } from "../../../../../src/engine/network-step-run";
import {
  maskEmail,
  verifyNetworkIdentity,
  type NetworkIdentitySubjectType,
} from "../../../../../src/engine/network-identity-verification";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Center - Ditto Network",
  description:
    "Review and control Network sources, claims, profile visibility, requests, watches, introductions, blocks, export, and deletion.",
};

interface NetworkPrivacyPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeSubjectType(value: string | null): PrivacySubjectType {
  if (
    value === "member-signal" ||
    value === "request" ||
    value === "public-profile" ||
    value === "discovery-profile"
  ) {
    return value;
  }
  return "public-profile";
}

type LaneContext = "expert" | "client";
type VerifiableSubjectType = Exclude<PrivacySubjectType, "discovery-profile">;

function normalizeLaneContext(value: string | null): LaneContext | null {
  if (value === "expert" || value === "client") return value;
  return null;
}

function toVerifiableSubjectType(value: PrivacySubjectType): VerifiableSubjectType | null {
  if (value === "discovery-profile") return null;
  return value;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function displayDate(value: Date | string | null | undefined): string {
  const raw = iso(value);
  if (!raw) return "not recorded";
  return raw.slice(0, 10);
}

function fallbackProfileCard(
  user: typeof networkSchema.networkUsers.$inferSelect,
): NetworkProfileCardBlock {
  const name = user.name?.trim() || "Network member";
  const handle = user.handle?.trim() || user.id;
  return {
    type: "network-profile-card",
    handle,
    name,
    portraitUrl: null,
    cityLabel: null,
    oneLineRole: user.businessContext?.trim() || "Ditto Network member",
    signalDots: [],
    badges: [{ label: "member", color: "lavender" }],
    narrativeMd: "This public preview is waiting for approved claims.",
    antiPersonaMd: null,
    greeterCuratedBy: user.personaAssignment === "mira" ? "mira" : "alex",
    lastUpdatedAt: iso(user.updatedAt) ?? new Date().toISOString(),
    visibility: user.wantsVisibility && !user.pausedAt ? "public" : "off",
    shareUrl: `/people/${encodeURIComponent(handle)}`,
    ogImageUrl: `/api/v1/network/people/${encodeURIComponent(user.id)}/card-png`,
  };
}

function requestTitle(card: unknown): string {
  const candidate = card as { jtbd?: unknown } | null;
  if (typeof candidate?.jtbd === "string" && candidate.jtbd.trim()) {
    return candidate.jtbd.trim();
  }
  return "Active Request";
}

function requestSummary(card: unknown, fallback: string | null): string {
  const candidate = card as { referenceShape?: unknown; successCriteria?: unknown } | null;
  const parts = [
    typeof candidate?.referenceShape === "string" ? candidate.referenceShape : null,
    typeof candidate?.successCriteria === "string" ? candidate.successCriteria : null,
  ].filter((item): item is string => Boolean(item?.trim()));
  if (parts.length > 0) return parts.join(" ");
  return fallback?.trim() || "No public request summary recorded.";
}

function identityRequiredData(input: {
  viewerLabel?: string;
  subjectType: PrivacySubjectType;
  subjectId: string;
  sessionId?: string | null;
  emailMasked?: string | null;
  message?: string;
}): PrivacyCenterData {
  return {
    ...createEmptyPrivacyCenterData({
      viewerLabel: input.viewerLabel ?? "Network member",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      sessionId: input.sessionId,
      emailMasked: input.emailMasked,
      verified: false,
    }),
    partialNotice:
      input.message ??
      "Identity verification is required before Ditto shows owner-only Network data.",
  };
}

async function resolveVerifiedAccess({
  requestedSubjectType,
  requestedSubjectId,
  requestedUserId,
  sessionId,
  context,
}: {
  requestedSubjectType: PrivacySubjectType;
  requestedSubjectId: string;
  requestedUserId: string;
  sessionId: string | null;
  context: LaneContext | null;
}): Promise<{
  session: NetworkLaneSession;
  subjectType: VerifiableSubjectType;
  subjectId: string;
  emailMasked: string | null;
} | null> {
  if (!sessionId) return null;

  const contexts: LaneContext[] = context ? [context] : ["expert", "client"];
  let session: NetworkLaneSession | null = null;
  for (const candidate of contexts) {
    session = await resolveNetworkLaneSession({ sessionId, context: candidate });
    if (session) break;
  }
  if (!session) return null;

  let subjectType = toVerifiableSubjectType(requestedSubjectType);
  let subjectId = requestedSubjectId;
  if (requestedUserId && (!subjectId || requestedSubjectType === "public-profile")) {
    subjectType = "public-profile";
    subjectId = requestedUserId;
  }
  if (!subjectType || !subjectId) {
    subjectType = "public-profile";
    subjectId = session.userId;
  }

  const stepRunId = await createNetworkLaneStepRun({
    route: "network-privacy-page-verify",
    sessionId: session.sessionId,
    actorId: session.actorId,
  });
  const verified = await verifyNetworkIdentity({
    stepRunId,
    method: "session",
    subject: {
      subjectType: subjectType as NetworkIdentitySubjectType,
      subjectId,
    },
    sessionUserId: session.userId,
  });
  if (!verified.verified) return null;

  return {
    session,
    subjectType,
    subjectId,
    emailMasked: verified.subjectOwnerEmail ? maskEmail(verified.subjectOwnerEmail) : null,
  };
}

export async function loadPrivacyCenterData(
  params: Record<string, string | string[] | undefined>,
): Promise<PrivacyCenterData> {
  const requestedSubjectType = normalizeSubjectType(firstParam(params.subjectType));
  const requestedSubjectId = firstParam(params.subjectId)?.trim() || firstParam(params.id)?.trim() || "";
  const requestedUserId = firstParam(params.userId)?.trim() || "";
  const requestedSessionId = firstParam(params.sessionId)?.trim() || null;
  const requestedContext = normalizeLaneContext(firstParam(params.context));
  const emailMasked = firstParam(params.maskedEmail)?.trim() || null;
  const claimToken =
    firstParam(params.claimToken)?.trim() || firstParam(params.token)?.trim() || null;

  if (requestedSubjectType === "discovery-profile" || claimToken) {
    if (!claimToken) {
      return identityRequiredData({
        viewerLabel: "Discovery Profile subject",
        subjectType: "discovery-profile",
        subjectId: requestedSubjectId || "identity-required",
        sessionId: requestedSessionId,
        emailMasked,
      });
    }

    try {
      const { getClaimInvitePreview } = await import("../../../../../src/engine/claim-invite");
      const preview = await getClaimInvitePreview(claimToken);
      if (!preview) {
        return identityRequiredData({
          viewerLabel: "Discovery Profile subject",
          subjectType: "discovery-profile",
          subjectId: requestedSubjectId || "identity-required",
          sessionId: requestedSessionId,
          emailMasked,
          message: "This Discovery Profile invite could not be verified.",
        });
      }
      if (requestedSubjectId && requestedSubjectId !== preview.discoveryProfileId) {
        return identityRequiredData({
          viewerLabel: "Discovery Profile subject",
          subjectType: "discovery-profile",
          subjectId: requestedSubjectId,
          sessionId: requestedSessionId,
          emailMasked,
          message: "This Discovery Profile invite does not match the requested subject.",
        });
      }

      const stepRunId = await createNetworkLaneStepRun({
        route: "network-privacy-discovery-verify",
        sessionId: requestedSessionId,
        actorId: preview.candidateId ? `claim-token:${preview.candidateId}` : null,
      });
      const verified = await verifyNetworkIdentity({
        stepRunId,
        method: "claim-token",
        subject: {
          subjectType: "discovery-profile",
          subjectId: preview.discoveryProfileId,
        },
        claimToken,
      });
      if (!verified.verified) {
        return identityRequiredData({
          viewerLabel: "Discovery Profile subject",
          subjectType: "discovery-profile",
          subjectId: preview.discoveryProfileId,
          sessionId: requestedSessionId,
          emailMasked,
          message: "This Discovery Profile invite could not be verified.",
        });
      }

      const sourceMap = new Map<string, PrivacySource>();
      for (const claim of preview.claims) {
        const key = `${claim.sourceLabel}:${claim.sourceUrl ?? ""}`;
        const current = sourceMap.get(key);
        if (current) {
          current.claimsDerived += 1;
        } else {
          sourceMap.set(key, {
            id: `discovery-source-${sourceMap.size + 1}`,
            label: claim.sourceLabel,
            type: "public-web",
            url: claim.sourceUrl,
            status: "found",
            claimsDerived: 1,
            evidenceSnippet: claim.evidenceSnippet,
          });
        }
      }
      const discoveryData = createDiscoveryPrivacyCenterData({
        subjectId: preview.discoveryProfileId,
        sessionId: requestedSessionId,
        emailMasked: verified.subjectOwnerEmail ? maskEmail(verified.subjectOwnerEmail) : emailMasked,
        claimToken,
        sources: Array.from(sourceMap.values()),
      });
      return {
        ...discoveryData,
        identity: {
          ...discoveryData.identity,
          subjectId: preview.discoveryProfileId,
          verified: true,
          emailMasked: verified.subjectOwnerEmail ? maskEmail(verified.subjectOwnerEmail) : emailMasked,
        },
        claims: preview.claims.map((claim): PrivacyClaim => ({
          id: claim.id,
          section: "knownFor",
          claimText: claim.claimText,
          sourceLabel: claim.sourceLabel,
          sourceUrl: claim.sourceUrl,
          sourceType: "public-web",
          evidenceSnippet: claim.evidenceSnippet,
          confidence: claim.confidence,
          visibility: "on-request",
          approvalState: "approved",
          viewerApprovedOnRequest: true,
        })),
      };
    } catch (error) {
      if (isNetworkDbConnectionError(error)) {
        return {
          ...createEmptyPrivacyCenterData({
            viewerLabel: "Discovery Profile subject",
            subjectType: "discovery-profile",
            subjectId: requestedSubjectId || "network-unavailable",
            sessionId: requestedSessionId,
            emailMasked,
            verified: false,
          }),
          partialNotice:
            "The Network data store is unavailable, so this route is showing fail-closed empty states.",
        };
      }
      throw error;
    }
  }

  const access = await resolveVerifiedAccess({
    requestedSubjectType,
    requestedSubjectId,
    requestedUserId,
    sessionId: requestedSessionId,
    context: requestedContext,
  });

  if (!access) {
    return identityRequiredData({
      subjectType: toVerifiableSubjectType(requestedSubjectType) ?? "public-profile",
      subjectId: requestedSubjectId || requestedUserId || "identity-required",
      sessionId: requestedSessionId,
      emailMasked,
    });
  }

  try {
    const { networkDb } = await import("../../../../../src/db/network-db");
    const subjectType = access.subjectType;
    const subjectId = access.subjectId;
    const sessionId = access.session.sessionId;
    let user: typeof networkSchema.networkUsers.$inferSelect | null = null;
    let memberSignal: typeof networkSchema.networkMemberSignals.$inferSelect | null = null;
    let exportSubjectType: PrivacySubjectType = subjectType;
    let exportSubjectId = subjectId;

    if (subjectType === "public-profile") {
      [user] = await networkDb
        .select()
        .from(networkSchema.networkUsers)
        .where(eq(networkSchema.networkUsers.id, subjectId))
        .limit(1);
    } else if (subjectType === "member-signal") {
      [memberSignal] = await networkDb
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(eq(networkSchema.networkMemberSignals.id, subjectId))
        .limit(1);
      if (memberSignal) {
        [user] = await networkDb
          .select()
          .from(networkSchema.networkUsers)
          .where(eq(networkSchema.networkUsers.id, memberSignal.userId))
          .limit(1);
      }
    } else if (subjectType === "request") {
      const [request] = await networkDb
        .select()
        .from(networkSchema.networkJobRequests)
        .where(eq(networkSchema.networkJobRequests.id, subjectId))
        .limit(1);
      if (request?.userId) {
        [user] = await networkDb
          .select()
          .from(networkSchema.networkUsers)
          .where(eq(networkSchema.networkUsers.id, request.userId))
          .limit(1);
      }
    }

    if (!user) {
      return createEmptyPrivacyCenterData({
        viewerLabel: "Network member",
        subjectType,
        subjectId,
        sessionId,
        emailMasked: access.emailMasked ?? emailMasked,
        verified: false,
      });
    }

    if (!memberSignal) {
      [memberSignal] = await networkDb
        .select()
        .from(networkSchema.networkMemberSignals)
        .where(eq(networkSchema.networkMemberSignals.userId, user.id))
        .limit(1);
    }

    if (subjectType === "public-profile") {
      exportSubjectType = "public-profile";
      exportSubjectId = user.id;
    } else if (subjectType === "member-signal" && memberSignal) {
      exportSubjectType = "member-signal";
      exportSubjectId = memberSignal.id;
    } else if (subjectType === "request") {
      exportSubjectType = "request";
      exportSubjectId = subjectId;
    } else if (memberSignal) {
      exportSubjectType = "member-signal";
      exportSubjectId = memberSignal.id;
    }

    const [sourceRows, claimRows, requestRows, watchRows, introRows, blockRows] =
      await Promise.all([
        memberSignal
          ? networkDb
              .select()
              .from(networkSchema.networkSignalSources)
              .where(eq(networkSchema.networkSignalSources.memberSignalId, memberSignal.id))
              .orderBy(desc(networkSchema.networkSignalSources.updatedAt))
          : Promise.resolve([]),
        memberSignal
          ? networkDb
              .select()
              .from(networkSchema.networkSignalClaims)
              .where(eq(networkSchema.networkSignalClaims.memberSignalId, memberSignal.id))
              .orderBy(desc(networkSchema.networkSignalClaims.updatedAt))
          : Promise.resolve([]),
        networkDb
          .select()
          .from(networkSchema.networkJobRequests)
          .where(eq(networkSchema.networkJobRequests.userId, user.id))
          .orderBy(desc(networkSchema.networkJobRequests.updatedAt))
          .limit(20),
        networkDb
          .select()
          .from(networkSchema.networkPossibleConnections)
          .where(eq(networkSchema.networkPossibleConnections.userId, user.id))
          .orderBy(desc(networkSchema.networkPossibleConnections.updatedAt))
          .limit(20),
        networkDb
          .select()
          .from(networkSchema.introductions)
          .where(eq(networkSchema.introductions.targetUserId, user.id))
          .orderBy(desc(networkSchema.introductions.updatedAt))
          .limit(20),
        networkDb
          .select()
          .from(networkSchema.networkUserBlockList)
          .where(eq(networkSchema.networkUserBlockList.targetUserId, user.id))
          .orderBy(desc(networkSchema.networkUserBlockList.updatedAt))
          .limit(20),
      ]);

    const claimCountBySource = new Map<string, number>();
    for (const claim of claimRows) {
      claimCountBySource.set(claim.sourceId, (claimCountBySource.get(claim.sourceId) ?? 0) + 1);
    }

    const sources: PrivacySource[] = sourceRows.map((source) => ({
      id: source.id,
      label: source.sourceLabel,
      type: source.sourceType,
      url: source.sourceUrl,
      status: source.status,
      lastUsedAt: displayDate(source.updatedAt),
      claimsDerived: claimCountBySource.get(source.id) ?? 0,
      evidenceSnippet: source.evidenceSnippet ?? source.accessNote,
    }));

    const claims: PrivacyClaim[] = claimRows.map((claim) => ({
      id: claim.id,
      section: claim.section,
      claimText: claim.claimText,
      sourceLabel: claim.sourceLabel,
      sourceUrl: claim.sourceUrl,
      sourceType: claim.sourceType,
      evidenceSnippet: claim.evidenceSnippet,
      confidence: claim.confidence,
      visibility: claim.visibility,
      approvalState: claim.approvalState,
      viewerApprovedOnRequest: true,
    }));

    const requests: PrivacyRequest[] = requestRows.map((request) => ({
      id: request.id,
      status: request.status,
      mode: request.mode,
      title: requestTitle(request.jobRequestCard),
      summary: requestSummary(request.jobRequestCard, request.shareableSummary),
      updatedAt: displayDate(request.updatedAt),
      jobRequestCard: request.jobRequestCard,
    }));

    return {
      identity: {
        viewerLabel: user.name ?? user.email,
        subjectType: exportSubjectType,
        subjectId: exportSubjectId,
        sessionId,
        context: access.session.context,
        userId: user.id,
        emailMasked: access.emailMasked ?? emailMasked,
        verified: true,
      },
      memberSignalId: memberSignal?.id ?? null,
      profileCard: user.card ? { ...user.card, antiPersonaMd: null } : fallbackProfileCard(user),
      profilePaused: Boolean(user.pausedAt) || !user.wantsVisibility,
      sources,
      claims,
      requests,
      watches: watchRows.map((watch) => ({
        id: watch.id,
        status: watch.lifecycleState,
        displayName: watch.displayName,
        headline: watch.headline,
        requestId: watch.savedToRequestId,
        confidence: watch.confidence,
        updatedAt: displayDate(watch.updatedAt),
      })),
      introductions: introRows.map((intro) => ({
        id: intro.id,
        counterpart: intro.requesterDisplayName ?? intro.requesterOrgLabel ?? "Requester",
        date: displayDate(intro.updatedAt),
        state: intro.state,
        usefulness: intro.costLabel,
        refusalReason: intro.refusalReason,
      })),
      blocks: blockRows.map((block) => ({
        id: block.id,
        kind: block.kind,
        value: block.blockedRequesterIdentifier,
        reasonCode: "user-block",
        createdAt: displayDate(block.createdAt),
      })),
      exportSubjectType,
      exportSubjectId,
      deleteSubjectType: exportSubjectType,
      deleteSubjectId: exportSubjectId,
      deleteRecoveryDays: 30,
      permanentStubYears: 2,
      profileUrlBehavior: "410",
      partialNotice: null,
      discoveryProfile: null,
    };
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return {
        ...createEmptyPrivacyCenterData({
          viewerLabel: "Network member",
          subjectType: toVerifiableSubjectType(requestedSubjectType) ?? "public-profile",
          subjectId: requestedSubjectId || requestedUserId || "network-unavailable",
          sessionId: requestedSessionId,
          emailMasked,
          verified: false,
        }),
        partialNotice:
          "The Network data store is unavailable, so this route is showing fail-closed empty states.",
      };
    }
    throw error;
  }
}

export default async function NetworkPrivacyPage({ searchParams }: NetworkPrivacyPageProps) {
  const params = await searchParams;
  const data = await loadPrivacyCenterData(params);
  return <PrivacyCenter data={data} />;
}
