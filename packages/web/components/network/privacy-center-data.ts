import type {
  JobRequestCardBlock,
  NetworkProfileCardBlock,
} from "@/lib/engine";

export type PrivacySectionKey =
  | "mirror"
  | "sources"
  | "claims"
  | "profile"
  | "requests"
  | "introductions"
  | "blocked"
  | "data";

export type PrivacySectionState =
  | "loading"
  | "empty"
  | "error"
  | "partial"
  | "success";

export const PRIVACY_SECTION_STATES: PrivacySectionState[] = [
  "loading",
  "empty",
  "error",
  "partial",
  "success",
];

export const PRIVACY_CENTER_SECTIONS: Array<{
  key: PrivacySectionKey;
  label: string;
}> = [
  { key: "mirror", label: "What's public vs private" },
  { key: "sources", label: "Sources" },
  { key: "claims", label: "Claims" },
  { key: "profile", label: "Public profile" },
  { key: "requests", label: "Requests and watches" },
  { key: "introductions", label: "Introductions" },
  { key: "blocked", label: "Blocked and filtered" },
  { key: "data", label: "Your data" },
];

export const PRIVACY_SECTION_STATE_COPY: Record<
  PrivacySectionKey,
  Record<PrivacySectionState, string>
> = {
  mirror: {
    loading: "Checking what Ditto can show about you.",
    empty: "Nothing is public yet.",
    error: "Couldn't load the visibility summary.",
    partial: "Showing the visibility summary from the data that loaded.",
    success: "Current visibility summary.",
  },
  sources: {
    loading: "Loading source provenance.",
    empty: "Ditto hasn't used any sources for this profile yet.",
    error: "Couldn't load sources. Nothing was changed.",
    partial: "Showing the newest loaded sources.",
    success: "Every loaded source includes provenance.",
  },
  claims: {
    loading: "Loading claim controls.",
    empty: "No public or approved-on-request claims are visible.",
    error: "Couldn't load claims. Nothing was changed.",
    partial: "Showing the claims that passed the privacy filter.",
    success: "Claim controls are filtered before render.",
  },
  profile: {
    loading: "Loading the public profile preview.",
    empty: "No public profile projection exists yet.",
    error: "Couldn't load profile controls. Nothing was changed.",
    partial: "Showing the current profile projection without private rules.",
    success: "This preview is what visitors can see.",
  },
  requests: {
    loading: "Loading Active Requests and Background Watches.",
    empty: "No requests or watches are running.",
    error: "Couldn't load requests or watches. Nothing was changed.",
    partial: "Showing the newest requests and watches.",
    success: "Requests and watches can be paused without deleting signal.",
  },
  introductions: {
    loading: "Loading introduction history.",
    empty: "No introductions have been requested yet.",
    error: "Couldn't load introductions.",
    partial: "Showing the newest introduction events.",
    success: "Introduction history is read-only here.",
  },
  blocked: {
    loading: "Loading block list.",
    empty: "No blocked people, sessions, or patterns.",
    error: "Couldn't load blocked entries. Nothing was changed.",
    partial: "Showing loaded block entries.",
    success: "Your filters are owner-visible without exposing rule text.",
  },
  data: {
    loading: "Loading export and delete controls.",
    empty: "Nothing is exportable yet.",
    error: "Couldn't load data controls. Nothing was changed.",
    partial: "Export may include only the loaded scopes.",
    success: "Export and delete are identity gated.",
  },
};

export type PrivacySubjectType =
  | "member-signal"
  | "request"
  | "public-profile"
  | "discovery-profile";

export interface PrivacyIdentity {
  viewerLabel: string;
  subjectType: PrivacySubjectType;
  subjectId: string;
  sessionId?: string | null;
  context?: "expert" | "client" | null;
  userId?: string | null;
  emailMasked?: string | null;
  verified: boolean;
}

export interface PrivacySource {
  id: string;
  label: string;
  type: string;
  url?: string | null;
  status: string;
  lastUsedAt?: string | null;
  claimsDerived: number;
  evidenceSnippet?: string | null;
}

export type PrivacyClaimVisibility =
  | "public"
  | "on-request"
  | "private"
  | "hidden";

export type PrivacyClaimApprovalState =
  | "suggested"
  | "approved"
  | "edited"
  | "hidden"
  | "rejected";

export interface PrivacyClaim {
  id: string;
  section: string;
  claimText: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  sourceType: string;
  evidenceSnippet: string;
  confidence: "high" | "medium" | "low" | string;
  visibility: PrivacyClaimVisibility;
  approvalState: PrivacyClaimApprovalState;
  viewerApprovedOnRequest?: boolean;
}

export interface PrivacyRequest {
  id: string;
  status: string;
  mode: string;
  title: string;
  summary: string;
  updatedAt?: string | null;
  jobRequestCard?: JobRequestCardBlock | null;
}

export interface PrivacyWatch {
  id: string;
  status: string;
  displayName: string;
  headline: string;
  requestId?: string | null;
  confidence?: string | null;
  updatedAt?: string | null;
}

export interface PrivacyIntroduction {
  id: string;
  counterpart: string;
  date: string;
  state: string;
  usefulness?: string | null;
  refusalReason?: string | null;
}

export interface PrivacyBlockListEntry {
  id: string;
  kind: string;
  value: string;
  reasonCode?: string | null;
  createdAt?: string | null;
}

export interface PrivacyDiscoveryExit {
  id: "claim" | "decline" | "suppress" | "delete";
  label: string;
  copy: string;
}

export interface PrivacyDiscoveryProfile {
  enabled: boolean;
  title: string;
  summary: string;
  claimToken?: string | null;
  originalToDitto: true;
  exits: PrivacyDiscoveryExit[];
}

export interface PrivacyCenterData {
  identity: PrivacyIdentity;
  memberSignalId?: string | null;
  profileCard: NetworkProfileCardBlock | null;
  profilePaused: boolean;
  sources: PrivacySource[];
  claims: PrivacyClaim[];
  requests: PrivacyRequest[];
  watches: PrivacyWatch[];
  introductions: PrivacyIntroduction[];
  blocks: PrivacyBlockListEntry[];
  exportSubjectType: PrivacySubjectType;
  exportSubjectId: string;
  deleteSubjectType: PrivacySubjectType;
  deleteSubjectId: string;
  deleteRecoveryDays: number;
  permanentStubYears: number;
  profileUrlBehavior: "410";
  partialNotice?: string | null;
  discoveryProfile?: PrivacyDiscoveryProfile | null;
}

function approvedClaim(claim: PrivacyClaim): boolean {
  return claim.approvalState === "approved" || claim.approvalState === "edited";
}

export function visiblePrivacyClaims(claims: PrivacyClaim[]): PrivacyClaim[] {
  return claims.filter((claim) => {
    if (claim.visibility === "public") return approvedClaim(claim);
    if (claim.visibility === "on-request") {
      return approvedClaim(claim) && claim.viewerApprovedOnRequest === true;
    }
    return false;
  });
}

export function sealedPrivacyClaimCount(claims: PrivacyClaim[]): number {
  return Math.max(claims.length - visiblePrivacyClaims(claims).length, 0);
}

export function sanitizePrivacyProfileCard(
  card: NetworkProfileCardBlock | null,
): NetworkProfileCardBlock | null {
  if (!card) return null;
  return { ...card, antiPersonaMd: null };
}

export function createEmptyPrivacyCenterData(
  input: Partial<PrivacyIdentity> = {},
): PrivacyCenterData {
  const subjectType = input.subjectType ?? "public-profile";
  const subjectId = input.subjectId ?? "unknown";
  return {
    identity: {
      viewerLabel: input.viewerLabel ?? "You",
      subjectType,
      subjectId,
      sessionId: input.sessionId ?? null,
      context: input.context ?? null,
      userId: input.userId ?? null,
      emailMasked: input.emailMasked ?? null,
      verified: input.verified ?? false,
    },
    memberSignalId: null,
    profileCard: null,
    profilePaused: false,
    sources: [],
    claims: [],
    requests: [],
    watches: [],
    introductions: [],
    blocks: [],
    exportSubjectType: subjectType,
    exportSubjectId: subjectId,
    deleteSubjectType: subjectType,
    deleteSubjectId: subjectId,
    deleteRecoveryDays: 30,
    permanentStubYears: 2,
    profileUrlBehavior: "410",
    partialNotice: null,
    discoveryProfile: null,
  };
}

export function createDiscoveryPrivacyCenterData(input: {
  subjectId?: string | null;
  sessionId?: string | null;
  emailMasked?: string | null;
  claimToken?: string | null;
  sources?: PrivacySource[];
} = {}): PrivacyCenterData {
  const subjectId = input.subjectId?.trim() || "discovery-profile";
  return {
    ...createEmptyPrivacyCenterData({
      viewerLabel: "Discovery Profile subject",
      subjectType: "discovery-profile",
      subjectId,
      sessionId: input.sessionId ?? null,
      emailMasked: input.emailMasked ?? null,
      verified: false,
    }),
    sources: input.sources ?? [],
    discoveryProfile: {
      enabled: true,
      title: "A member asked to be connected to people like you.",
      summary:
        "Ditto gathered public information so you can decide what happens next. This Discovery Profile self-service surface is Original to Ditto.",
      claimToken: input.claimToken?.trim() || null,
      originalToDitto: true,
      exits: [
        {
          id: "claim",
          label: "Claim and correct",
          copy: "Take ownership, fix facts, and choose what can become public.",
        },
        {
          id: "decline",
          label: "Decline contact",
          copy: "Stop this connection request without deleting the underlying record.",
        },
        {
          id: "suppress",
          label: "Suppress future use",
          copy: "Tell Ditto not to resurface you in future discovery.",
        },
        {
          id: "delete",
          label: "Delete profile",
          copy: "Remove the public projection and return HTTP 410 on direct profile links.",
        },
      ],
    },
  };
}
