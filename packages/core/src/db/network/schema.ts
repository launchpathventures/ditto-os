/**
 * Network Schema — Centralized Ditto Network Service tables (Postgres tier)
 *
 * These tables serve the shared relationship graph, personas,
 * fleet management, and pre-workspace user journey per ADR-025.
 *
 * Deployment: lives on Supabase Postgres (centralized Ditto Network service),
 * NOT in individual workspace SQLite DBs. See ADR-036 §2 (named threshold —
 * superseded-in-part by ADR-048) and ADR-048 (pre-trigger execution).
 *
 * Cross-tier soft references (ADR-036 §3): the `interactions.processRunId`
 * column is a plain `text` column with no `.references(...)`. The referenced
 * `processRuns` row lives in workspace-tier SQLite — there is no Postgres
 * `process_runs` table to FK to. Cross-tier joins are forbidden; combine in
 * application code instead. Future contributors: do NOT add a `.references(...)`
 * to a workspace-tier table here. The no-engine-import test in
 * `src/db/network-db.test.ts` enforces this.
 *
 * Surface (post-Brief 279 outbound discovery): 38 pgTable declarations.
 * Provenance: Brief 263 (this brief; converted from sqliteTable per ADR-048).
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  json,
  jsonb,
  index,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ContentBlock, JobRequestCardBlock, NetworkProfileCardBlock } from "../../content-blocks.js";

// ============================================================
// Type unions — Network-specific
// ============================================================

export const personVisibilityValues = ["internal", "connection"] as const;
export type PersonVisibility = (typeof personVisibilityValues)[number];

export const journeyLayerValues = ["participant", "active", "workspace"] as const;
export type JourneyLayer = (typeof journeyLayerValues)[number];

export const personTrustLevelValues = ["cold", "familiar", "trusted"] as const;
export type PersonTrustLevel = (typeof personTrustLevelValues)[number];

export const personaValues = ["alex", "mira"] as const;
export type PersonaId = (typeof personaValues)[number];

export const personSourceValues = ["manual", "enrichment", "reply", "introduction"] as const;
export type PersonSource = (typeof personSourceValues)[number];

export const interactionTypeValues = [
  "outreach_sent",
  "reply_received",
  "reply_sent",
  "introduction_made",
  "introduction_received",
  "meeting_booked",
  "follow_up",
  "nurture",
  "opt_out",
] as const;
export type InteractionType = (typeof interactionTypeValues)[number];

export const interactionChannelValues = ["email", "voice", "sms", "workspace", "social"] as const;
export type InteractionChannel = (typeof interactionChannelValues)[number];

export const interactionModeValues = ["selling", "connecting", "nurture"] as const;
export type InteractionMode = (typeof interactionModeValues)[number];

export const interactionOutcomeValues = ["positive", "neutral", "negative", "no_response", "deferred", "question", "auto_reply"] as const;
export type InteractionOutcome = (typeof interactionOutcomeValues)[number];

// `deleted` (Brief 284) is the soft-delete terminal state. Code that branches on
// status must treat it as a hard stop — no surfacing in chat, intro, or discovery.
export const networkUserStatusValues = ["active", "workspace", "churned", "deleted"] as const;
export type NetworkUserStatus = (typeof networkUserStatusValues)[number];

export const networkJobRequestStatusValues = ["draft", "active", "paused", "fulfilled", "closed", "open", "deleted"] as const;
export type NetworkJobRequestStatus = (typeof networkJobRequestStatusValues)[number];

export const networkRequestModeValues = ["manual-search", "background-watch", "both"] as const;
export type NetworkRequestMode = (typeof networkRequestModeValues)[number];

export const networkRequestSourcesAllowedValues = ["ditto-members", "public-web", "both"] as const;
export type NetworkRequestSourcesAllowed = (typeof networkRequestSourcesAllowedValues)[number];

export const networkRequestContactPolicyValues = [
  "ask-before-contact",
  "ask-before-intro",
  "never-contact-without-approval",
] as const;
export type NetworkRequestContactPolicy = (typeof networkRequestContactPolicyValues)[number];

export const networkRequestAuditEventValues = [
  "drafted",
  "created",
  "updated",
  "published",
  "paused",
  "resumed",
  "fulfilled",
  "closed",
  "search_started",
  "watch_seeded",
] as const;
export type NetworkRequestAuditEvent = (typeof networkRequestAuditEventValues)[number];

export const networkKbDocumentKindValues = ["upload", "voice", "manual"] as const;
export type NetworkKbDocumentKind = (typeof networkKbDocumentKindValues)[number];

export const networkKbDocumentStatusValues = ["ready", "processing", "failed", "archived"] as const;
export type NetworkKbDocumentStatus = (typeof networkKbDocumentStatusValues)[number];

export const networkKbFactVisibilityValues = ["public", "on-request", "off"] as const;
export type NetworkKbFactVisibility = (typeof networkKbFactVisibilityValues)[number];

export const networkKbFactStatusValues = ["active", "archived"] as const;
export type NetworkKbFactStatus = (typeof networkKbFactStatusValues)[number];

export const networkVoiceIntakeStatusValues = ["reviewed", "processing", "failed", "complete"] as const;
export type NetworkVoiceIntakeStatus = (typeof networkVoiceIntakeStatusValues)[number];

export const networkMemberSignalStatusValues = ["draft", "review", "published", "archived", "deleted"] as const;
export type NetworkMemberSignalStatus = (typeof networkMemberSignalStatusValues)[number];

export const networkSignalSourceTypeValues = [
  "linkedin",
  "website",
  "x",
  "instagram",
  "github",
  "substack",
  "youtube",
  "portfolio",
  "other_url",
  "pasted_text",
  "upload",
  "web_search",
  "inference",
] as const;
export type NetworkSignalSourceType = (typeof networkSignalSourceTypeValues)[number];

export const networkSignalSourceStatusValues = [
  "queued",
  "reading",
  "found",
  "limited",
  "failed",
  "needs_paste",
  "removed",
] as const;
export type NetworkSignalSourceStatus = (typeof networkSignalSourceStatusValues)[number];

export const networkSignalClaimSectionValues = [
  "knownFor",
  "bestIntroducedFor",
  "canHelpWith",
  "currentFocus",
  "openTo",
  "notAFitFor",
  "proof",
  "tasteAndStyle",
  "preferredIntroStyle",
  "sourceSummary",
] as const;
export type NetworkSignalClaimSection = (typeof networkSignalClaimSectionValues)[number];

export const networkSignalClaimConfidenceValues = ["high", "medium", "low"] as const;
export type NetworkSignalClaimConfidence = (typeof networkSignalClaimConfidenceValues)[number];

export const networkSignalClaimVisibilityValues = ["public", "on-request", "private", "hidden"] as const;
export type NetworkSignalClaimVisibility = (typeof networkSignalClaimVisibilityValues)[number];

export const networkSignalClaimApprovalStateValues = [
  "suggested",
  "approved",
  "edited",
  "hidden",
  "rejected",
] as const;
export type NetworkSignalClaimApprovalState = (typeof networkSignalClaimApprovalStateValues)[number];

export const networkSignalReviewEventTypeValues = [
  "source_added",
  "source_removed",
  "claim_drafted",
  "claim_approved",
  "claim_edited",
  "claim_hidden",
  "claim_visibility_changed",
  "signal_published",
  "signal_deleted",
] as const;
export type NetworkSignalReviewEventType = (typeof networkSignalReviewEventTypeValues)[number];

export const networkForwardedNoteStatusValues = ["pending", "answered", "dismissed"] as const;
export type NetworkForwardedNoteStatus = (typeof networkForwardedNoteStatusValues)[number];

export const introductionOriginContextValues = [
  "client",
  "visitor",
  "expert-crossover",
  // Brief 288 — outbound (Mira-proposed) intro origin.
  "mira-proposed",
] as const;
export type IntroductionOriginContext = (typeof introductionOriginContextValues)[number];

export const introductionStateValues = [
  "queued",
  "queued-for-review",
  "approved",
  "rejected",
  "fulfilled",
  "refused-by-greeter",
  "expired",
  // Brief 288 — outbound (Mira-proposed) consent state machine.
  "proposed",
  "requester-approved",
  "recipient-asked",
  "recipient-approved",
  "thread-sent",
  "declined",
  "not-now",
  "feedback-collected",
] as const;
export type IntroductionState = (typeof introductionStateValues)[number];

export const introFeedbackPartyValues = ["requester", "recipient"] as const;
export type IntroFeedbackParty = (typeof introFeedbackPartyValues)[number];

export const introFeedbackEventTypeValues = [
  "reply",
  "button-click",
  "chat-disambiguator-submit",
] as const;
export type IntroFeedbackEventType =
  (typeof introFeedbackEventTypeValues)[number];

export const introFeedbackClassifiedCategoryValues = [
  "decline:not-relevant",
  "decline:too-junior",
  "decline:too-senior",
  "decline:wrong-domain",
  "decline:too-salesy",
  "decline:already-know-them",
  "decline:other",
  "outcome:useful",
  "outcome:not-useful",
  "outcome:no-outcome-yet",
  "ambiguous",
] as const;
export type IntroFeedbackClassifiedCategory =
  (typeof introFeedbackClassifiedCategoryValues)[number];

export const introOutcomeClassValues = [
  "advisory",
  "hire",
  "client",
  "funding",
  "partnership",
  "collaboration",
  "no-outcome",
] as const;
export type IntroOutcomeClass = (typeof introOutcomeClassValues)[number];

export const introductionRefusalReasonValues = [
  "anti-persona",
  "low-fit",
  "user-block",
  "rate-limit",
] as const;
export type IntroductionRefusalReason = (typeof introductionRefusalReasonValues)[number];

export const networkUserBlockListKindValues = ["workspace-user", "visitor-session", "pattern"] as const;
export type NetworkUserBlockListKind = (typeof networkUserBlockListKindValues)[number];

export const networkUpsellTriggerValues = ["expert-q6", "client-q6"] as const;
export type NetworkUpsellTrigger = (typeof networkUpsellTriggerValues)[number];

export const networkWorkspaceDeliveryKindValues = [
  "forwarded_note",
  "visitor_intro_request",
  // Brief 288 — Mira-proposed intro for two-sided consent review.
  "intro-proposal-card",
] as const;
export type NetworkWorkspaceDeliveryKind = (typeof networkWorkspaceDeliveryKindValues)[number];

export const networkWorkspaceDeliveryStatusValues = ["pending", "imported", "failed"] as const;
export type NetworkWorkspaceDeliveryStatus = (typeof networkWorkspaceDeliveryStatusValues)[number];

// Brief 274 — Manual Search + Possible Connection proposals
export const networkPossibleConnectionSourceValues = [
  "ditto-member",
  "public-web",
  "imported-contact",
  "user-provided",
] as const;
export type NetworkPossibleConnectionSource =
  (typeof networkPossibleConnectionSourceValues)[number];

export const networkPossibleConnectionConfidenceValues = ["low", "medium", "high"] as const;
export type NetworkPossibleConnectionConfidence =
  (typeof networkPossibleConnectionConfidenceValues)[number];

export const networkPossibleConnectionLifecycleValues = [
  "proposed",
  "saved-to-request",
  "invitation-candidate",
  "watched",
  "paused",
  "closed",
  "not-a-fit",
  "hidden",
] as const;
export type NetworkPossibleConnectionLifecycle =
  (typeof networkPossibleConnectionLifecycleValues)[number];

export const networkSearchModeValues = [
  "member",
  "public-web",
  "both",
  "from-request",
  "from-member-signal",
] as const;
export type NetworkSearchMode = (typeof networkSearchModeValues)[number];

export const networkSearchFeedbackKindValues = [
  "refine",
  "not-a-fit",
  "save",
  "intro-request",
  "hide",
  "watch",
  "invitation-candidate",
] as const;
export type NetworkSearchFeedbackKind =
  (typeof networkSearchFeedbackKindValues)[number];

export const networkSearchAuditEventValues = [
  "search_run",
  "refine",
  "not_a_fit",
  "save_to_request",
  "invitation_candidate",
  "watch",
  "hide",
  "intro_request",
] as const;
export type NetworkSearchAuditEvent =
  (typeof networkSearchAuditEventValues)[number];

// Brief 293 — Background Watch
export const networkWatchStatusValues = [
  "active",
  "paused",
  "closed",
  "fulfilled",
  "error",
] as const;
export type NetworkWatchStatus = (typeof networkWatchStatusValues)[number];

export const networkWatchPausedReasonValues = [
  "user",
  "auto-quiet",
  "abuse-control",
  "operator",
  "error",
] as const;
export type NetworkWatchPausedReason =
  (typeof networkWatchPausedReasonValues)[number];

export const networkWatchFrequencyValues = [
  "quiet",
  "weekly_digest",
  "immediate_strong_fit",
  "manual_only",
] as const;
export type NetworkWatchFrequency =
  (typeof networkWatchFrequencyValues)[number];

export const networkWatchOriginValues = [
  "active-request",
  "member-signal",
  "operator",
] as const;
export type NetworkWatchOrigin = (typeof networkWatchOriginValues)[number];

export const networkWatchRunOutcomeValues = [
  "ok",
  "quiet",
  "skipped-cooldown",
  "skipped-rate-limit",
  "skipped-paused",
  "error",
] as const;
export type NetworkWatchRunOutcome =
  (typeof networkWatchRunOutcomeValues)[number];

export const networkWatchRunTriggeredByValues = [
  "schedule",
  "manual",
  "harness",
] as const;
export type NetworkWatchRunTriggeredBy =
  (typeof networkWatchRunTriggeredByValues)[number];

export const networkWatchHealthDecisionValues = [
  "pass",
  "downgrade",
  "suppress",
  "queue-for-review",
] as const;
export type NetworkWatchHealthDecision =
  (typeof networkWatchHealthDecisionValues)[number];

export const networkWatchProposalDismissStateValues = [
  "none",
  "not-now",
  "not-a-fit",
  "shown",
] as const;
export type NetworkWatchProposalDismissState =
  (typeof networkWatchProposalDismissStateValues)[number];

export const networkWatchFeedbackKindValues = [
  "saved",
  "intro-request",
  "not-now",
  "not-a-fit",
  "hide",
  "thumbs-up",
  "thumbs-down",
  "refine",
] as const;
export type NetworkWatchFeedbackKind =
  (typeof networkWatchFeedbackKindValues)[number];

// Brief 279 — Outbound Discovery + Claim Invites
export const networkDiscoverySourceClassValues = [
  "ditto-member",
  "user-provided",
  "imported-contact",
  "public-web",
  "member-signal",
  "user-provided-url",
  "public-search-result",
  "public-website",
  "public-professional-post",
  "opportunity-portal",
  "referral-list",
  "linkedin-pointer",
  "linkedin-api",
  "linkedin-scrape",
  "private-dataset",
  "unknown",
] as const;
export type NetworkDiscoverySourceClass =
  (typeof networkDiscoverySourceClassValues)[number];

export const networkDiscoveryProfileStatusValues = [
  "internal",
  "claimed",
  "declined",
  "deleted",
  "expired",
] as const;
export type NetworkDiscoveryProfileStatus =
  (typeof networkDiscoveryProfileStatusValues)[number];

export const networkDiscoveryClaimConfidenceValues = [
  "high",
  "medium",
  "low",
] as const;
export type NetworkDiscoveryClaimConfidence =
  (typeof networkDiscoveryClaimConfidenceValues)[number];

export const networkInvitationCandidateStatusValues = [
  "queued",
  "drafted",
  "approved",
  "suppressed",
  "sent",
  "claimed",
  "declined",
  "deleted",
  "blocked",
] as const;
export type NetworkInvitationCandidateStatus =
  (typeof networkInvitationCandidateStatusValues)[number];

export const networkInvitationChannelValues = [
  "email",
  "contact-form",
  "referral",
  "future-approved-channel",
] as const;
export type NetworkInvitationChannel =
  (typeof networkInvitationChannelValues)[number];

export const networkInvitationEventTypeValues = [
  "queued",
  "scored",
  "drafted",
  "approved",
  "suppressed",
  "sent",
  "claim_opened",
  "claimed",
  "declined",
  "deleted",
  "blocked",
] as const;
export type NetworkInvitationEventType =
  (typeof networkInvitationEventTypeValues)[number];

export const networkClaimTokenStatusValues = [
  "active",
  "redeemed",
  "expired",
  "revoked",
] as const;
export type NetworkClaimTokenStatus =
  (typeof networkClaimTokenStatusValues)[number];

// Brief 282 — generic Network decision audit substrate
export const networkAuditActorTypeValues = [
  "user",
  "visitor",
  "admin",
  "system",
] as const;
export type NetworkAuditActorType =
  (typeof networkAuditActorTypeValues)[number];

export const networkAuditEventClassValues = [
  "source_added",
  "source_removed",
  "source_policy_blocked",
  "claim_edited",
  "claim_visibility_changed",
  "profile_visibility_changed",
  "watch_lifecycle_changed",
  "user_block_added",
  "user_block_removed",
  "request_edited",
  "search_feedback",
  "invitation_candidate_scored",
  "operator_approved",
  "operator_suppressed",
  "operator_paused_discovery",
  "operator_resumed_discovery",
  "invite_sent",
  "claim",
  "decline",
  "complaint",
  "delete",
  "privacy_export",
  "system_retention",
  "watch_feedback",
  // Brief 293 — Background Watch runs, proposals, and auto-pause events.
  "watch_run",
  "watch_proposal",
  "watch_paused_auto",
  "intro_approved",
  "intro_declined",
  "share_generated",
  // Brief 290 — per-channel Share Studio variant generation.
  "share_studio_variant_generated",
  // Brief 291 — visitor conversion attribution.
  "share_attribution_recorded",
  // Brief 288 — outbound (Mira-proposed) intro state transitions.
  "intro_proposed",
  "intro_requester_approved",
  "intro_recipient_asked",
  "intro_recipient_approved",
  "intro_thread_sent",
  "intro_not_now",
  "intro_feedback_recorded",
  "profile_deleted",
  "dry_run_replay",
  "admin_override",
  "operator_revealed_raw_text",
] as const;
export type NetworkAuditEventClass =
  (typeof networkAuditEventClassValues)[number];

// Brief 283 — source-policy, suppression, email compliance, complaints
export const networkSuppressionIdentifierKindValues = [
  "email",
  "domain",
  "person-ref",
  "source",
  "segment",
] as const;
export type NetworkSuppressionIdentifierKind =
  (typeof networkSuppressionIdentifierKindValues)[number];

export const networkSuppressionScopeValues = ["global", "per-user"] as const;
export type NetworkSuppressionScope =
  (typeof networkSuppressionScopeValues)[number];

export const networkSuppressionReasonValues = [
  "anti-persona",
  "low-fit",
  "user-block",
  "rate-limit",
  "opt-out",
  "complaint",
  "decline",
  "blocked-domain",
  "blocked-person",
  "deleted-profile",
  "source-pause",
  "segment-pause",
  "operator-suppressed",
] as const;
export type NetworkSuppressionReason =
  (typeof networkSuppressionReasonValues)[number];

// Brief 284 — Tombstone subject + actor type unions for privacy delete.
// `discovery-profile` is reserved here for Brief 279 to populate once the
// Discovery Profile model exists; 284 only handles the other three subject
// types but lists it so the column constraint accepts the future value.
export const networkTombstoneSubjectTypeValues = [
  "member-signal",
  "discovery-profile",
  "request",
  "public-profile",
] as const;
export type NetworkTombstoneSubjectType =
  (typeof networkTombstoneSubjectTypeValues)[number];

export const networkTombstoneDeletedByActorTypeValues = [
  "user",
  "visitor",
  "admin",
  "system",
] as const;
export type NetworkTombstoneDeletedByActorType =
  (typeof networkTombstoneDeletedByActorTypeValues)[number];

export const workspaceStatusValues = [
  "provisioning",
  "healthy",
  "degraded",
  "deprovisioned",
] as const;
export type WorkspaceStatus = (typeof workspaceStatusValues)[number];

export const healthStatusValues = [
  "ok",
  "liveness_failed",
  "readiness_failed",
] as const;
export type HealthStatus = (typeof healthStatusValues)[number];

export const upgradeStatusValues = [
  "in_progress",
  "completed",
  "partial",
  "failed",
  "circuit_breaker_tripped",
  "rolled_back",
] as const;
export type UpgradeStatus = (typeof upgradeStatusValues)[number];

export const canaryResultValues = ["passed", "failed"] as const;
export type CanaryResult = (typeof canaryResultValues)[number];

export const upgradeTriggeredByValues = ["cli", "api", "ci"] as const;
export type UpgradeTriggeredBy = (typeof upgradeTriggeredByValues)[number];

export const workspaceUpgradeResultValues = [
  "upgraded",
  "failed",
  "rolled_back",
  "skipped",
] as const;
export type WorkspaceUpgradeResult = (typeof workspaceUpgradeResultValues)[number];

export const upgradeHealthCheckResultValues = [
  "ok",
  "liveness_failed",
  "readiness_failed",
  "timeout",
] as const;
export type UpgradeHealthCheckResult = (typeof upgradeHealthCheckResultValues)[number];

// ============================================================
// People — shared relationship graph (ADR-025 §2)
// ============================================================

/**
 * People — everyone Ditto knows about in the relationship graph.
 * Two audiences: internal (Ditto's working graph) and connection (user's visible relationships).
 * Provenance: Brief 079/080, Insight-146, Insight-149.
 */
export const people = pgTable("people", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  organization: text("organization"),
  role: text("role"),
  source: text("source").notNull().$type<PersonSource>().default("manual"),
  journeyLayer: text("journey_layer").notNull().$type<JourneyLayer>().default("participant"),
  visibility: text("visibility").notNull().$type<PersonVisibility>().default("internal"),
  personaAssignment: text("persona_assignment").$type<PersonaId>(),
  trustLevel: text("trust_level").notNull().$type<PersonTrustLevel>().default("cold"),
  optedOut: boolean("opted_out").notNull().default(false),
  lastInteractionAt: timestamp("last_interaction_at", { mode: "date", withTimezone: false }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("people_user_id").on(table.userId),
  index("people_user_visibility").on(table.userId, table.visibility),
  index("people_email").on(table.email),
]);

/**
 * Interactions — every touchpoint between Ditto and a person.
 * Provenance: Brief 079/080, Insight-147.
 *
 * `processRunId` is a cross-tier soft reference (ADR-036 §3): plain text
 * with no FK constraint. The referenced row lives in workspace-tier SQLite.
 */
export const interactions = pgTable("interactions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  personId: text("person_id")
    .references(() => people.id)
    .notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull().$type<InteractionType>(),
  channel: text("channel").notNull().$type<InteractionChannel>().default("email"),
  mode: text("mode").notNull().$type<InteractionMode>(),
  subject: text("subject"),
  summary: text("summary"),
  outcome: text("outcome").$type<InteractionOutcome>(),
  processRunId: text("process_run_id"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("interactions_person_id").on(table.personId),
  index("interactions_user_id").on(table.userId),
]);

// ============================================================
// Network Users — people working WITH Ditto (Layer 2+)
// ============================================================

export const networkUsers = pgTable("network_users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  handle: text("handle").unique(),
  businessContext: text("business_context"),
  personaAssignment: text("persona_assignment").$type<PersonaId>(),
  status: text("status").notNull().$type<NetworkUserStatus>().default("active"),
  workspaceId: text("workspace_id"),
  personId: text("person_id").references(() => people.id),
  workspaceSuggestedAt: timestamp("workspace_suggested_at", { mode: "date", withTimezone: false }),
  /** AgentMail threadId of the status email containing the workspace suggestion (Brief 153) */
  suggestionThreadId: text("suggestion_thread_id"),
  /** When the user accepted the workspace suggestion (Brief 153) */
  workspaceAcceptedAt: timestamp("workspace_accepted_at", { mode: "date", withTimezone: false }),
  wantsVisibility: boolean("wants_visibility").notNull().default(false),
  card: json("card").$type<NetworkProfileCardBlock | null>(),
  pausedAt: timestamp("paused_at", { mode: "date", withTimezone: false }),
  /** When Alex last sent a notification email to this user (status, pulse, completion).
   *  Updated by notifyUser() on successful send. Used for recency gating. */
  lastNotifiedAt: timestamp("last_notified_at", { mode: "date", withTimezone: false }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_users_email").on(table.email),
  index("network_users_handle").on(table.handle),
]);

// ============================================================
// Network Job Requests — client-lane opportunity briefs (Brief 264)
// ============================================================

export const networkJobRequests = pgTable("network_job_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id),
  visitorSessionId: text("visitor_session_id"),
  jobRequestCard: json("job_request_card").$type<JobRequestCardBlock>().notNull(),
  status: text("status").notNull().$type<NetworkJobRequestStatus>().default("open"),
  mode: text("mode").notNull().$type<NetworkRequestMode>().default("manual-search"),
  rawNeed: text("raw_need"),
  outcomeNeeded: text("outcome_needed"),
  idealPerson: text("ideal_person"),
  proofRequired: text("proof_required"),
  badFit: text("bad_fit"),
  urgency: text("urgency"),
  geography: text("geography"),
  commercialShape: text("commercial_shape"),
  successOutcome: text("success_outcome"),
  outcomeValueHint: text("outcome_value_hint"),
  budgetPrivate: text("budget_private"),
  budgetShareableLabel: text("budget_shareable_label"),
  shareableSummary: text("shareable_summary"),
  privateNotes: text("private_notes"),
  sourcesAllowed: text("sources_allowed")
    .notNull()
    .$type<NetworkRequestSourcesAllowed>()
    .default("both"),
  contactPolicy: text("contact_policy")
    .notNull()
    .$type<NetworkRequestContactPolicy>()
    .default("ask-before-contact"),
  requesterName: text("requester_name"),
  requesterEmail: text("requester_email"),
  requesterOrgSite: text("requester_org_site"),
  requesterCredibility: text("requester_credibility"),
  searchHandoff: json("search_handoff").$type<Record<string, unknown> | null>(),
  watchHandoff: json("watch_handoff").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_job_requests_user_id").on(table.userId),
  index("network_job_requests_visitor_session_id").on(table.visitorSessionId),
  index("network_job_requests_status").on(table.status),
  index("network_job_requests_mode").on(table.mode),
  index("network_job_requests_updated_at").on(table.updatedAt),
]);

export const networkRequestAuditEvents = pgTable("network_request_audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  requestId: text("request_id")
    .references(() => networkJobRequests.id)
    .notNull(),
  eventType: text("event_type").notNull().$type<NetworkRequestAuditEvent>(),
  actorId: text("actor_id"),
  stepRunId: text("step_run_id").notNull(),
  before: json("before").$type<Record<string, unknown> | null>(),
  after: json("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_request_audit_events_request_id").on(table.requestId),
  index("network_request_audit_events_event_type").on(table.eventType),
]);

// ============================================================
// Network User Knowledge Base — source-traced profile facts (Brief 258)
// ============================================================

export const networkUserKbDocuments = pgTable("network_user_kb_documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  kind: text("kind").notNull().$type<NetworkKbDocumentKind>(),
  title: text("title").notNull(),
  sourceLabel: text("source_label").notNull(),
  mimeType: text("mime_type"),
  originalFilename: text("original_filename"),
  sanitizedFilename: text("sanitized_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  status: text("status").notNull().$type<NetworkKbDocumentStatus>().default("ready"),
  visibilityDefault: text("visibility_default")
    .notNull()
    .$type<NetworkKbFactVisibility>()
    .default("on-request"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_user_kb_documents_user_id").on(table.userId),
  index("network_user_kb_documents_status").on(table.status),
  index("network_user_kb_documents_updated_at").on(table.updatedAt),
]);

export const networkUserKbFacts = pgTable("network_user_kb_facts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  documentId: text("document_id").references(() => networkUserKbDocuments.id),
  sourceLabel: text("source_label").notNull(),
  sourceLocator: text("source_locator"),
  factMd: text("fact_md").notNull(),
  visibility: text("visibility")
    .notNull()
    .$type<NetworkKbFactVisibility>()
    .default("on-request"),
  status: text("status").notNull().$type<NetworkKbFactStatus>().default("active"),
  storagePath: text("storage_path").notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_user_kb_facts_user_id").on(table.userId),
  index("network_user_kb_facts_user_visibility").on(table.userId, table.visibility),
  index("network_user_kb_facts_status").on(table.status),
  index("network_user_kb_facts_updated_at").on(table.updatedAt),
]);

export const networkUserAntiPersona = pgTable("network_user_anti_persona", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  ruleMd: text("rule_md").notNull(),
  status: text("status").notNull().$type<NetworkKbFactStatus>().default("active"),
  storagePath: text("storage_path").notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_user_anti_persona_user_id").on(table.userId),
  index("network_user_anti_persona_status").on(table.status),
  index("network_user_anti_persona_updated_at").on(table.updatedAt),
]);

export const networkUserVoiceIntake = pgTable("network_user_voice_intake", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  documentId: text("document_id").references(() => networkUserKbDocuments.id),
  transcriptStoragePath: text("transcript_storage_path").notNull(),
  status: text("status").notNull().$type<NetworkVoiceIntakeStatus>().default("reviewed"),
  error: text("error"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_user_voice_intake_user_id").on(table.userId),
  index("network_user_voice_intake_status").on(table.status),
  index("network_user_voice_intake_updated_at").on(table.updatedAt),
]);

// ============================================================
// Member Signal — reviewed projection over KB evidence (Brief 272)
// ============================================================

export const networkMemberSignals = pgTable("network_member_signals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  status: text("status")
    .notNull()
    .$type<NetworkMemberSignalStatus>()
    .default("draft"),
  sourceSummary: text("source_summary"),
  calibrationQuestions: json("calibration_questions").$type<string[] | null>(),
  approvedAt: timestamp("approved_at", { mode: "date", withTimezone: false }),
  publishedAt: timestamp("published_at", { mode: "date", withTimezone: false }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  unique("network_member_signals_user_id_unique").on(table.userId),
  index("network_member_signals_user_status").on(table.userId, table.status),
  index("network_member_signals_updated_at").on(table.updatedAt),
]);

export const networkSignalSources = pgTable("network_signal_sources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  memberSignalId: text("member_signal_id")
    .references(() => networkMemberSignals.id)
    .notNull(),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  sourceType: text("source_type")
    .notNull()
    .$type<NetworkSignalSourceType>(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  originalInput: text("original_input"),
  kbDocumentId: text("kb_document_id").references(() => networkUserKbDocuments.id),
  status: text("status")
    .notNull()
    .$type<NetworkSignalSourceStatus>()
    .default("queued"),
  accessNote: text("access_note"),
  evidenceSnippet: text("evidence_snippet"),
  confidence: text("confidence")
    .notNull()
    .$type<NetworkSignalClaimConfidence>()
    .default("medium"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_signal_sources_signal_id").on(table.memberSignalId),
  index("network_signal_sources_user_id").on(table.userId),
  index("network_signal_sources_type_status").on(table.sourceType, table.status),
  index("network_signal_sources_kb_document_id").on(table.kbDocumentId),
]);

export const networkSignalClaims = pgTable("network_signal_claims", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  memberSignalId: text("member_signal_id")
    .references(() => networkMemberSignals.id)
    .notNull(),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  sourceId: text("source_id")
    .references(() => networkSignalSources.id)
    .notNull(),
  kbFactId: text("kb_fact_id").references(() => networkUserKbFacts.id),
  section: text("section")
    .notNull()
    .$type<NetworkSignalClaimSection>(),
  claimText: text("claim_text").notNull(),
  sourceType: text("source_type")
    .notNull()
    .$type<NetworkSignalSourceType>(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  evidenceSnippet: text("evidence_snippet").notNull(),
  confidence: text("confidence")
    .notNull()
    .$type<NetworkSignalClaimConfidence>()
    .default("medium"),
  visibility: text("visibility")
    .notNull()
    .$type<NetworkSignalClaimVisibility>()
    .default("on-request"),
  approvalState: text("approval_state")
    .notNull()
    .$type<NetworkSignalClaimApprovalState>()
    .default("suggested"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_signal_claims_signal_id").on(table.memberSignalId),
  index("network_signal_claims_user_visibility").on(table.userId, table.visibility),
  index("network_signal_claims_approval_state").on(table.approvalState),
  index("network_signal_claims_source_id").on(table.sourceId),
  index("network_signal_claims_kb_fact_id").on(table.kbFactId),
]);

export const networkSignalReviewEvents = pgTable("network_signal_review_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  memberSignalId: text("member_signal_id")
    .references(() => networkMemberSignals.id)
    .notNull(),
  claimId: text("claim_id").references(() => networkSignalClaims.id),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  eventType: text("event_type")
    .notNull()
    .$type<NetworkSignalReviewEventType>(),
  actorId: text("actor_id"),
  stepRunId: text("step_run_id").notNull(),
  before: json("before").$type<Record<string, unknown> | null>(),
  after: json("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_signal_review_events_signal_id").on(table.memberSignalId),
  index("network_signal_review_events_claim_id").on(table.claimId),
  index("network_signal_review_events_user_id").on(table.userId),
  index("network_signal_review_events_type").on(table.eventType),
]);

// ============================================================
// Manual Search + Possible Connections (Brief 274)
// ============================================================

/**
 * networkSearchRuns — one row per manual search invocation.
 * stepRunId is REQUIRED (Insight-180): the HTTP wrapper mints it; the
 * guarded engine tool refuses without it. No external/LLM call or row
 * write happens when the guard is missing.
 */
export const networkSearchRuns = pgTable("network_search_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").references(() => networkUsers.id),
  visitorSessionId: text("visitor_session_id"),
  actorId: text("actor_id"),
  sessionId: text("session_id"),
  stepRunId: text("step_run_id").notNull(),
  mode: text("mode").notNull().$type<NetworkSearchMode>().default("both"),
  sourcesAllowed: text("sources_allowed")
    .notNull()
    .$type<NetworkRequestSourcesAllowed>()
    .default("both"),
  query: text("query").notNull(),
  refinement: text("refinement"),
  requestId: text("request_id").references(() => networkJobRequests.id),
  memberSignalId: text("member_signal_id").references(() => networkMemberSignals.id),
  resultCount: integer("result_count").notNull().default(0),
  webSearchAvailable: boolean("web_search_available").notNull().default(true),
  partial: boolean("partial").notNull().default(false),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_search_runs_user_id").on(table.userId),
  index("network_search_runs_visitor_session_id").on(table.visitorSessionId),
  index("network_search_runs_request_id").on(table.requestId),
  index("network_search_runs_created_at").on(table.createdAt),
]);

/**
 * networkPossibleConnections — a reasoned proposal, never a claim of fit.
 * Private/on-request facts are never persisted into seeker-facing copy
 * (whyThisFits/whyNow/evidence) unless authorized; the scrub decision is
 * recorded on the row and in the audit trail.
 */
export const networkPossibleConnections = pgTable("network_possible_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  searchRunId: text("search_run_id")
    .references(() => networkSearchRuns.id)
    .notNull(),
  userId: text("user_id").references(() => networkUsers.id),
  visitorSessionId: text("visitor_session_id"),
  source: text("source")
    .notNull()
    .$type<NetworkPossibleConnectionSource>(),
  personId: text("person_id"),
  displayName: text("display_name").notNull(),
  headline: text("headline").notNull(),
  canonicalUrl: text("canonical_url"),
  isDittoMember: boolean("is_ditto_member").notNull().default(false),
  whyThisFits: text("why_this_fits").notNull(),
  whyNow: text("why_now"),
  evidence: json("evidence")
    .$type<{ sourceLabel: string; url: string | null; snippet: string; claimId: string | null }[]>()
    .notNull(),
  risks: json("risks").$type<string[]>().notNull(),
  confidence: text("confidence")
    .notNull()
    .$type<NetworkPossibleConnectionConfidence>()
    .default("medium"),
  networkHealthFlags: json("network_health_flags").$type<string[]>().notNull(),
  nextAction: text("next_action").notNull(),
  introEligibility: text("intro_eligibility").notNull(),
  lifecycleState: text("lifecycle_state")
    .notNull()
    .$type<NetworkPossibleConnectionLifecycle>()
    .default("proposed"),
  savedToRequestId: text("saved_to_request_id").references(() => networkJobRequests.id),
  scrubApplied: boolean("scrub_applied").notNull().default(false),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_possible_connections_search_run_id").on(table.searchRunId),
  index("network_possible_connections_user_id").on(table.userId),
  index("network_possible_connections_lifecycle").on(table.lifecycleState),
  index("network_possible_connections_saved_request").on(table.savedToRequestId),
]);

/**
 * networkSearchFeedback — refine / not-a-fit / save / intro-request / hide
 * / watch / invitation-candidate. Session/request-scoped; affects ranking
 * in the same search session. stepRunId REQUIRED.
 */
export const networkSearchFeedback = pgTable("network_search_feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  searchRunId: text("search_run_id")
    .references(() => networkSearchRuns.id)
    .notNull(),
  possibleConnectionId: text("possible_connection_id")
    .references(() => networkPossibleConnections.id),
  actorId: text("actor_id"),
  stepRunId: text("step_run_id").notNull(),
  kind: text("kind").notNull().$type<NetworkSearchFeedbackKind>(),
  reasonText: text("reason_text"),
  refinementText: text("refinement_text"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_search_feedback_search_run_id").on(table.searchRunId),
  index("network_search_feedback_connection_id").on(table.possibleConnectionId),
  index("network_search_feedback_kind").on(table.kind),
]);

/**
 * networkSearchAuditEvents — every transition out of Manual Search writes
 * one row: actor, source result id, target lifecycle state, scrub decision.
 */
export const networkSearchAuditEvents = pgTable("network_search_audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  searchRunId: text("search_run_id").references(() => networkSearchRuns.id),
  possibleConnectionId: text("possible_connection_id")
    .references(() => networkPossibleConnections.id),
  eventType: text("event_type")
    .notNull()
    .$type<NetworkSearchAuditEvent>(),
  actorId: text("actor_id"),
  stepRunId: text("step_run_id").notNull(),
  targetLifecycleState: text("target_lifecycle_state")
    .$type<NetworkPossibleConnectionLifecycle | null>(),
  scrubDecision: json("scrub_decision").$type<Record<string, unknown> | null>(),
  before: json("before").$type<Record<string, unknown> | null>(),
  after: json("after").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_search_audit_events_search_run_id").on(table.searchRunId),
  index("network_search_audit_events_connection_id").on(table.possibleConnectionId),
  index("network_search_audit_events_type").on(table.eventType),
]);

// ============================================================
// Outbound Discovery + Claim Invites (Brief 279)
// ============================================================

/**
 * networkDiscoverySources — reviewable source registry snapshots for public
 * discovery. Rows record what class of source was used and the policy snapshot
 * that allowed or blocked collect/store/invite-use at that moment.
 */
export const networkDiscoverySources = pgTable("network_discovery_sources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  sourceClass: text("source_class")
    .notNull()
    .$type<NetworkDiscoverySourceClass>(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  collectionMethod: text("collection_method").notNull(),
  storagePolicy: text("storage_policy").notNull(),
  rateLimitPolicy: text("rate_limit_policy").notNull(),
  invitePolicy: text("invite_policy").notNull(),
  allowedUse: json("allowed_use")
    .$type<{ collect: boolean; store: boolean; inviteUse: boolean }>()
    .notNull(),
  policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
  retrievalAt: timestamp("retrieval_at", { mode: "date", withTimezone: false })
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
}, (table) => [
  index("network_discovery_sources_class_created_at").on(table.sourceClass, table.createdAt),
  index("network_discovery_sources_url").on(table.sourceUrl),
]);

/**
 * networkDiscoveredProfiles — internal-only profile shells for people found
 * outside Ditto. They are not public Network profiles until the person claims
 * and reviews the suggested Member Signal projection.
 */
export const networkDiscoveredProfiles = pgTable("network_discovered_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  displayName: text("display_name").notNull(),
  headline: text("headline").notNull(),
  canonicalUrl: text("canonical_url"),
  contactEmail: text("contact_email"),
  contactUrl: text("contact_url"),
  contactPathKind: text("contact_path_kind"),
  sourceClass: text("source_class")
    .notNull()
    .$type<NetworkDiscoverySourceClass>(),
  sourceSummary: text("source_summary").notNull(),
  requestId: text("request_id").references(() => networkJobRequests.id),
  possibleConnectionId: text("possible_connection_id")
    .references(() => networkPossibleConnections.id),
  watchId: text("watch_id"),
  status: text("status")
    .notNull()
    .$type<NetworkDiscoveryProfileStatus>()
    .default("internal"),
  claimedUserId: text("claimed_user_id").references(() => networkUsers.id),
  claimedAt: timestamp("claimed_at", { mode: "date", withTimezone: false }),
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: false }),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false }),
  stepRunId: text("step_run_id").notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_discovered_profiles_status_created_at").on(table.status, table.createdAt),
  index("network_discovered_profiles_request_id").on(table.requestId),
  index("network_discovered_profiles_possible_connection_id").on(table.possibleConnectionId),
  index("network_discovered_profiles_contact_email").on(table.contactEmail),
]);

/**
 * networkDiscoveryClaims — source-backed evidence used for scoring and for the
 * eventual editable Member Signal seed. Claims always point at a source row.
 */
export const networkDiscoveryClaims = pgTable("network_discovery_claims", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  discoveryProfileId: text("discovery_profile_id")
    .references(() => networkDiscoveredProfiles.id)
    .notNull(),
  sourceId: text("source_id")
    .references(() => networkDiscoverySources.id)
    .notNull(),
  claimText: text("claim_text").notNull(),
  evidenceSnippet: text("evidence_snippet").notNull(),
  confidence: text("confidence")
    .notNull()
    .$type<NetworkDiscoveryClaimConfidence>()
    .default("medium"),
  sourceClass: text("source_class")
    .notNull()
    .$type<NetworkDiscoverySourceClass>(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  retrievalAt: timestamp("retrieval_at", { mode: "date", withTimezone: false })
    .notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_discovery_claims_profile_id").on(table.discoveryProfileId),
  index("network_discovery_claims_source_id").on(table.sourceId),
  index("network_discovery_claims_source_class").on(table.sourceClass),
]);

/**
 * networkInvitationCandidates — operator queue for potential claim invites.
 * Scoring dimensions are denormalized for admin review, with the full scoring
 * payload kept in `scores` and `riskFlags`.
 */
export const networkInvitationCandidates = pgTable("network_invitation_candidates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  discoveryProfileId: text("discovery_profile_id")
    .references(() => networkDiscoveredProfiles.id)
    .notNull(),
  possibleConnectionId: text("possible_connection_id")
    .references(() => networkPossibleConnections.id),
  requestId: text("request_id").references(() => networkJobRequests.id),
  watchId: text("watch_id"),
  status: text("status")
    .notNull()
    .$type<NetworkInvitationCandidateStatus>()
    .default("queued"),
  channel: text("channel")
    .notNull()
    .$type<NetworkInvitationChannel>()
    .default("email"),
  sourceClass: text("source_class")
    .notNull()
    .$type<NetworkDiscoverySourceClass>(),
  contactEmail: text("contact_email"),
  contactUrl: text("contact_url"),
  contactPathKind: text("contact_path_kind"),
  superconnectorFit: integer("superconnector_fit").notNull().default(0),
  activeOpportunityFit: integer("active_opportunity_fit").notNull().default(0),
  activeRequestFit: integer("active_request_fit").notNull().default(0),
  sourceConfidence: integer("source_confidence").notNull().default(0),
  inviteRisk: integer("invite_risk").notNull().default(0),
  networkHealth: integer("network_health").notNull().default(0),
  totalScore: integer("total_score").notNull().default(0),
  scores: json("scores").$type<Record<string, unknown>>().notNull(),
  riskFlags: json("risk_flags").$type<string[]>().notNull(),
  suppressionReasons: json("suppression_reasons").$type<string[]>().notNull(),
  inviteReason: text("invite_reason").notNull(),
  proposedSubject: text("proposed_subject"),
  proposedBody: text("proposed_body"),
  operatorApprovedAt: timestamp("operator_approved_at", { mode: "date", withTimezone: false }),
  operatorApprovedBy: text("operator_approved_by"),
  sentAt: timestamp("sent_at", { mode: "date", withTimezone: false }),
  claimTokenId: text("claim_token_id"),
  stepRunId: text("step_run_id").notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_invitation_candidates_status_created_at").on(table.status, table.createdAt),
  index("network_invitation_candidates_profile_id").on(table.discoveryProfileId),
  index("network_invitation_candidates_request_id").on(table.requestId),
  index("network_invitation_candidates_watch_id").on(table.watchId),
]);

export const networkInvitationEvents = pgTable("network_invitation_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  candidateId: text("candidate_id")
    .references(() => networkInvitationCandidates.id),
  discoveryProfileId: text("discovery_profile_id")
    .references(() => networkDiscoveredProfiles.id),
  eventType: text("event_type")
    .notNull()
    .$type<NetworkInvitationEventType>(),
  actorType: text("actor_type")
    .notNull()
    .$type<NetworkAuditActorType>(),
  actorId: text("actor_id"),
  channel: text("channel").$type<NetworkInvitationChannel>(),
  reasonCode: text("reason_code"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  stepRunId: text("step_run_id").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_invitation_events_candidate_id").on(table.candidateId),
  index("network_invitation_events_profile_id").on(table.discoveryProfileId),
  index("network_invitation_events_type_created_at").on(table.eventType, table.createdAt),
]);

export const networkClaimTokens = pgTable("network_claim_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  tokenHash: text("token_hash").notNull().unique(),
  discoveryProfileId: text("discovery_profile_id")
    .references(() => networkDiscoveredProfiles.id)
    .notNull(),
  candidateId: text("candidate_id")
    .references(() => networkInvitationCandidates.id),
  status: text("status")
    .notNull()
    .$type<NetworkClaimTokenStatus>()
    .default("active"),
  redeemedUserId: text("redeemed_user_id").references(() => networkUsers.id),
  redeemedAt: timestamp("redeemed_at", { mode: "date", withTimezone: false }),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false })
    .notNull(),
  stepRunId: text("step_run_id").notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_claim_tokens_hash").on(table.tokenHash),
  index("network_claim_tokens_profile_id").on(table.discoveryProfileId),
  index("network_claim_tokens_candidate_id").on(table.candidateId),
  index("network_claim_tokens_expires_at").on(table.expiresAt),
]);

// ============================================================
// Generic Network Decision Audit (Brief 282)
// ============================================================

/**
 * networkAuditEvents — generic decision-level audit for privacy, suppression,
 * source policy, abuse, discovery, invite, complaint, delete, and admin events.
 *
 * This is deliberately separate from lane-step JSONL provenance. The only
 * linkage is `stepRunId`; no step output is duplicated into this row.
 *
 * Append-only by application convention: code may insert rows but must not
 * update or delete them. `prevHash` is reserved for a future hash-chain and is
 * nullable/unwired in this brief.
 */
export const networkAuditEvents = pgTable("network_audit_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  eventClass: text("event_class")
    .notNull()
    .$type<NetworkAuditEventClass>(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  actorType: text("actor_type")
    .notNull()
    .$type<NetworkAuditActorType>(),
  actorId: text("actor_id"),
  reasonCode: text("reason_code"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  stepRunId: text("step_run_id").notNull(),
  prevHash: text("prev_hash"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_audit_events_class_created_at").on(table.eventClass, table.createdAt),
  index("network_audit_events_subject").on(table.subjectType, table.subjectId),
  index("network_audit_events_actor").on(table.actorType, table.actorId),
]);

// ============================================================
// Share Attribution (Brief 291)
// ============================================================

export const networkShareAttribution = pgTable("network_share_attribution", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  profileHandle: text("profile_handle").notNull(),
  channel: text("channel").notNull(),
  action: text("action").notNull(),
  visitorSidHash: text("visitor_sid_hash"),
  ts: timestamp("ts", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_share_attribution_profile_channel_ts").on(
    table.profileHandle,
    table.channel,
    table.ts,
  ),
]);

// ============================================================
// Suppression + Complaint Idempotency (Brief 283)
// ============================================================

/**
 * networkSuppressions — hashed opt-out, complaint, decline, deleted-profile,
 * blocked-domain/person, and source/segment pause decisions.
 *
 * Raw contact identifiers are normalized and hashed before storage. The
 * plaintext source label is policy metadata, not the recipient address.
 */
export const networkSuppressions = pgTable("network_suppressions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  identifierHash: text("identifier_hash").notNull(),
  identifierKind: text("identifier_kind")
    .notNull()
    .$type<NetworkSuppressionIdentifierKind>(),
  scope: text("scope")
    .notNull()
    .$type<NetworkSuppressionScope>(),
  scopeUserId: text("scope_user_id"),
  reason: text("reason")
    .notNull()
    .$type<NetworkSuppressionReason>(),
  source: text("source").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false }),
  stepRunId: text("step_run_id").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_suppressions_identifier").on(table.identifierHash),
  index("network_suppressions_reason_created_at").on(table.reason, table.createdAt),
  index("network_suppressions_source_created_at").on(table.source, table.createdAt),
  uniqueIndex("network_suppressions_global_identifier_unique").on(
    table.identifierHash,
    table.scope,
  ).where(sql`${table.scope} = 'global'`),
  uniqueIndex("network_suppressions_per_user_identifier_unique").on(
    table.identifierHash,
    table.scope,
    table.scopeUserId,
  ).where(sql`${table.scope} = 'per-user'`),
  check(
    "network_suppressions_scope_user_id_check",
    sql`(${table.scope} = 'global' AND ${table.scopeUserId} IS NULL) OR (${table.scope} = 'per-user' AND ${table.scopeUserId} IS NOT NULL)`,
  ),
]);

/**
 * networkWebhookDeliveries — idempotency window for Svix webhook retries.
 * This is not an audit table; it prevents duplicate suppression/counter writes.
 */
export const networkWebhookDeliveries = pgTable("network_webhook_deliveries", {
  svixId: text("svix_id").primaryKey(),
  eventType: text("event_type").notNull(),
  stepRunId: text("step_run_id").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false })
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_webhook_deliveries_expires_at").on(table.expiresAt),
]);

// ============================================================
// Tombstones — durable delete record (Brief 284)
// ============================================================

/**
 * networkTombstones — the durable legal/audit record of a privacy delete.
 *
 * Hybrid-delete model (R-Q9): the owning row gets its soft-delete status flag,
 * a row lands here as the permanent marker, and the scheduled hard purge keys
 * on this row's `purgeAfter`. After `permanentStubAt` the row is minimized to
 * a permanent non-PII stub by the retention engine (drops `deletedReason` and
 * any metadata that could leak prior content).
 *
 * `subjectIdHash` is a sha256 of the subject id with a per-subject-type salt;
 * the row carries no plaintext PII. The `subjectType` + `subjectIdHash` index
 * is the lookup key the public profile route uses to return HTTP 410 (R-Q11).
 *
 * Audit rows in `networkAuditEvents` are never deleted by the purge — that
 * substrate is append-only per Brief 282.
 */
export const networkTombstones = pgTable("network_tombstones", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  subjectType: text("subject_type")
    .notNull()
    .$type<NetworkTombstoneSubjectType>(),
  subjectIdHash: text("subject_id_hash").notNull(),
  deletedReason: text("deleted_reason"),
  deletedByActorType: text("deleted_by_actor_type")
    .notNull()
    .$type<NetworkTombstoneDeletedByActorType>(),
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: false })
    .notNull(),
  purgeAfter: timestamp("purge_after", { mode: "date", withTimezone: false })
    .notNull(),
  permanentStubAt: timestamp("permanent_stub_at", { mode: "date", withTimezone: false })
    .notNull(),
  purgedAt: timestamp("purged_at", { mode: "date", withTimezone: false }),
  stubbedAt: timestamp("stubbed_at", { mode: "date", withTimezone: false }),
  stepRunId: text("step_run_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("network_tombstones_subject_unique").on(
    table.subjectType,
    table.subjectIdHash,
  ),
  index("network_tombstones_purge_after").on(table.purgeAfter),
  index("network_tombstones_permanent_stub_at").on(table.permanentStubAt),
]);

// ============================================================
// Shared Network Rate Counters (Brief 286)
// ============================================================

/**
 * networkRateCounters — fixed-window, cross-instance abuse-control backstop.
 *
 * The in-memory limiter remains L1 for fast local pressure relief. This table is
 * the durable Network-tier counter shared by all public instances. Each limit
 * writes to a deterministic `bucketKey` (`limitName:actor-kind:actor-hash`) and
 * a fixed `windowStart`; the unique pair lets application code atomically
 * increment the same row from multiple instances.
 */
export const networkRateCounters = pgTable("network_rate_counters", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  bucketKey: text("bucket_key").notNull(),
  windowStart: timestamp("window_start", { mode: "date", withTimezone: false })
    .notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("network_rate_counters_bucket_window_unique").on(
    table.bucketKey,
    table.windowStart,
  ),
  index("network_rate_counters_updated_at").on(table.updatedAt),
]);

export const networkForwardedNotes = pgTable("network_forwarded_notes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  fromVisitorName: text("from_visitor_name"),
  fromVisitorOrg: text("from_visitor_org"),
  factQuestionMd: text("fact_question_md").notNull(),
  visitorIp: text("visitor_ip"),
  visitorSessionId: text("visitor_session_id"),
  status: text("status").notNull().$type<NetworkForwardedNoteStatus>().default("pending"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_forwarded_notes_user_id").on(table.userId),
  index("network_forwarded_notes_status").on(table.status),
]);

// ============================================================
// Introductions — gated intro requests + v1 free counter (Brief 261)
// ============================================================

export const introductions = pgTable("introductions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  targetUserId: text("target_user_id")
    .references(() => networkUsers.id)
    .notNull(),
  requesterUserId: text("requester_user_id").references(() => networkUsers.id),
  visitorSessionId: text("visitor_session_id"),
  requesterDisplayName: text("requester_display_name"),
  requesterOrgLabel: text("requester_org_label"),
  originContext: text("origin_context").notNull().$type<IntroductionOriginContext>(),
  intentSummary: text("intent_summary").notNull(),
  draft: text("draft"),
  costLabel: text("cost_label"),
  authorizationId: text("authorization_id"),
  authorizationBlock: json("authorization_block").$type<ContentBlock | null>(),
  transcript: json("transcript").$type<ContentBlock[] | null>(),
  state: text("state").notNull().$type<IntroductionState>(),
  refusalReason: text("refusal_reason").$type<IntroductionRefusalReason>(),
  sourceStepRunId: text("source_step_run_id"),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  // Brief 288 — two-sided consent state machine (Mira-proposed flow).
  requesterApprovedAt: timestamp("requester_approved_at", { mode: "date", withTimezone: false }),
  recipientApprovedAt: timestamp("recipient_approved_at", { mode: "date", withTimezone: false }),
  threadSentAt: timestamp("thread_sent_at", { mode: "date", withTimezone: false }),
  recipientUserId: text("recipient_user_id").references(() => networkUsers.id),
  recipientEmail: text("recipient_email"),
  threadMessageId: text("thread_message_id"),
  declineCategory: text("decline_category"),
  followUpCadenceDays: integer("follow_up_cadence_days").notNull().default(14),
  feedbackRequestedAt: timestamp("feedback_requested_at", { mode: "date", withTimezone: false }),
  feedbackCollectedAt: timestamp("feedback_collected_at", { mode: "date", withTimezone: false }),
  lastClassifiedReplyAt: timestamp("last_classified_reply_at", { mode: "date", withTimezone: false }),
  recipientDeliveryId: text("recipient_delivery_id").references(
    () => networkWorkspaceDeliveries.id,
  ),
  requesterDeliveryId: text("requester_delivery_id").references(
    () => networkWorkspaceDeliveries.id,
  ),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("introductions_target_user_id").on(table.targetUserId),
  index("introductions_requester_user_id").on(table.requesterUserId),
  index("introductions_visitor_session_id").on(table.visitorSessionId),
  index("introductions_state").on(table.state),
  index("introductions_authorization_id").on(table.authorizationId),
  index("introductions_recipient_user_id").on(table.recipientUserId),
  index("introductions_thread_message_id").on(table.threadMessageId),
  index("introductions_feedback_requested_at").on(table.feedbackRequestedAt),
  index("introductions_feedback_collected_at").on(table.feedbackCollectedAt),
]);

export const networkIntroFeedback = pgTable("network_intro_feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  introId: text("intro_id")
    .references(() => introductions.id)
    .notNull(),
  party: text("party").notNull().$type<IntroFeedbackParty>(),
  eventType: text("event_type").notNull().$type<IntroFeedbackEventType>(),
  classifiedCategory: text("classified_category")
    .notNull()
    .$type<IntroFeedbackClassifiedCategory>(),
  freeText: text("free_text"),
  outcomeClass: text("outcome_class").$type<IntroOutcomeClass>(),
  outcomeAmountCents: integer("outcome_amount_cents"),
  sourceStepRunId: text("source_step_run_id").notNull(),
  sourceMessageId: text("source_message_id"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_intro_feedback_intro_id").on(table.introId),
  index("network_intro_feedback_party").on(table.party),
  index("network_intro_feedback_category").on(table.classifiedCategory),
  index("network_intro_feedback_created_at").on(table.createdAt),
]);

export const networkOutcomeMetrics = pgTable("network_outcome_metrics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id").notNull(),
  periodStart: timestamp("period_start", { mode: "date", withTimezone: false })
    .notNull(),
  usefulCount: integer("useful_count").notNull().default(0),
  notUsefulCount: integer("not_useful_count").notNull().default(0),
  noOutcomeYetCount: integer("no_outcome_yet_count").notNull().default(0),
  advisoryCount: integer("advisory_count").notNull().default(0),
  hireCount: integer("hire_count").notNull().default(0),
  clientCount: integer("client_count").notNull().default(0),
  fundingCount: integer("funding_count").notNull().default(0),
  partnershipCount: integer("partnership_count").notNull().default(0),
  collaborationCount: integer("collaboration_count").notNull().default(0),
  noOutcomeCount: integer("no_outcome_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("network_outcome_metrics_workspace_period_unique").on(
    table.workspaceId,
    table.periodStart,
  ),
  index("network_outcome_metrics_workspace_id").on(table.workspaceId),
]);

export const networkUserBlockList = pgTable("network_user_block_list", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  targetUserId: text("target_user_id")
    .references(() => networkUsers.id)
    .notNull(),
  kind: text("kind").notNull().$type<NetworkUserBlockListKind>(),
  blockedRequesterIdentifier: text("blocked_requester_identifier").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_user_block_list_target_user_id").on(table.targetUserId),
  index("network_user_block_list_identifier").on(table.blockedRequesterIdentifier),
  unique("network_user_block_list_target_identifier_unique").on(
    table.targetUserId,
    table.kind,
    table.blockedRequesterIdentifier,
  ),
]);

export const networkSessionUpsellLog = pgTable("network_session_upsell_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  trigger: text("trigger").notNull().$type<NetworkUpsellTrigger>(),
  firedAt: timestamp("fired_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_session_upsell_log_user_id").on(table.userId),
  unique("network_session_upsell_log_user_trigger_unique").on(table.userId, table.trigger),
]);

export const networkWorkspaceDeliveries = pgTable("network_workspace_deliveries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  kind: text("kind").notNull().$type<NetworkWorkspaceDeliveryKind>(),
  status: text("status").notNull().$type<NetworkWorkspaceDeliveryStatus>().default("pending"),
  blocks: json("blocks").$type<ContentBlock[]>().notNull(),
  dedupeKey: text("dedupe_key"),
  sourceStepRunId: text("source_step_run_id"),
  importedAt: timestamp("imported_at", { mode: "date", withTimezone: false }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_workspace_deliveries_user_status").on(table.userId, table.status),
  index("network_workspace_deliveries_dedupe_key").on(table.dedupeKey),
]);

// ============================================================
// Admin Feedback — admin-scoped guidance (Brief 108)
// ============================================================

export const adminFeedback = pgTable("admin_feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  feedback: text("feedback").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("admin_feedback_user_id").on(table.userId),
]);

// ============================================================
// Network Tokens — API authentication
// ============================================================

export const networkTokens = pgTable("network_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: false }),
}, (table) => [
  index("network_tokens_user_id").on(table.userId),
  index("network_tokens_hash").on(table.tokenHash),
]);

// ============================================================
// Managed Workspaces — fleet registry (Brief 090/100)
// ============================================================

export const managedWorkspaces = pgTable("managed_workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id").notNull().unique(),
  /** @deprecated Dead column — kept for backward compat after Railway migration (Brief 100). */
  machineId: text("machine_id").notNull(),
  volumeId: text("volume_id").notNull(),
  workspaceUrl: text("workspace_url").notNull(),
  region: text("region").notNull().default("syd"),
  imageRef: text("image_ref").notNull(),
  currentVersion: text("current_version"),
  status: text("status").notNull().$type<WorkspaceStatus>().default("provisioning"),
  lastHealthCheckAt: timestamp("last_health_check_at", { mode: "date", withTimezone: false }),
  lastHealthStatus: text("last_health_status").$type<HealthStatus>(),
  errorLog: text("error_log"),
  tokenId: text("token_id").notNull(),
  serviceId: text("service_id"),
  railwayEnvironmentId: text("railway_environment_id"),
  authSecretHash: text("auth_secret_hash"),
  deprovisionedAt: timestamp("deprovisioned_at", { mode: "date", withTimezone: false }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Fleet Upgrades (Brief 091)
// ============================================================

export const upgradeHistory = pgTable("upgrade_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  imageRef: text("image_ref").notNull(),
  previousImageRef: text("previous_image_ref"),
  status: text("status").notNull().$type<UpgradeStatus>().default("in_progress"),
  totalWorkspaces: integer("total_workspaces").notNull(),
  upgradedCount: integer("upgraded_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  canaryWorkspaceId: text("canary_workspace_id"),
  canaryResult: text("canary_result").$type<CanaryResult>(),
  circuitBreakerAt: timestamp("circuit_breaker_at", { mode: "date", withTimezone: false }),
  errorSummary: text("error_summary"),
  triggeredBy: text("triggered_by").notNull().$type<UpgradeTriggeredBy>(),
  startedAt: timestamp("started_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: false }),
});

export const upgradeWorkspaceResults = pgTable("upgrade_workspace_results", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  upgradeId: text("upgrade_id")
    .references(() => upgradeHistory.id)
    .notNull(),
  workspaceId: text("workspace_id")
    .references(() => managedWorkspaces.id)
    .notNull(),
  previousImageRef: text("previous_image_ref").notNull(),
  result: text("result").notNull().$type<WorkspaceUpgradeResult>(),
  healthCheckResult: text("health_check_result").$type<UpgradeHealthCheckResult>(),
  errorLog: text("error_log"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================
// Brief 293 — Background Watch (Network-tier skeleton)
//
// A Watch is a persistent, schedulable instance of an Active Request or
// Member Signal that runs `runNetworkSearch` through an 8-rule
// network-health gate and queues thin proposals. No outbound contact
// (parent Brief 275 D12, Insight-235 — capability by transport).
// ============================================================

export const networkBackgroundWatches = pgTable("network_background_watches", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .references(() => networkUsers.id)
    .notNull(),
  /** One of `requestId` / `signalId` is set; the other is null. */
  requestId: text("request_id").references(() => networkJobRequests.id),
  signalId: text("signal_id").references(() => networkMemberSignals.id),
  origin: text("origin").notNull().$type<NetworkWatchOrigin>(),
  title: text("title").notNull(),
  status: text("status")
    .notNull()
    .$type<NetworkWatchStatus>()
    .default("active"),
  pausedReason: text("paused_reason").$type<NetworkWatchPausedReason>(),
  frequency: text("frequency")
    .notNull()
    .$type<NetworkWatchFrequency>()
    .default("weekly_digest"),
  nextRunAt: timestamp("next_run_at", { mode: "date", withTimezone: false }),
  lastRunAt: timestamp("last_run_at", { mode: "date", withTimezone: false }),
  lastManualRunAt: timestamp("last_manual_run_at", { mode: "date", withTimezone: false }),
  consecutiveQuietRuns: integer("consecutive_quiet_runs").notNull().default(0),
  /** IANA tz string (e.g., "America/Los_Angeles") or null → UTC fallback in sweep. */
  ianaTimezone: text("iana_timezone"),
  /** Watch-level settings (sourcesAllowed, refinement hints, dismiss rules, etc.). */
  settings: json("settings").$type<Record<string, unknown> | null>(),
  /** Optional refinement carried across runs (parent D7). */
  refinement: text("refinement"),
  /** Free-form note from the operator/user when paused/closed. */
  closeReason: text("close_reason"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_background_watches_user_id").on(table.userId),
  index("network_background_watches_status").on(table.status),
  index("network_background_watches_next_run_at").on(table.nextRunAt),
  index("network_background_watches_request_id").on(table.requestId),
  index("network_background_watches_signal_id").on(table.signalId),
]);

export const networkWatchRuns = pgTable("network_watch_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  watchId: text("watch_id")
    .references(() => networkBackgroundWatches.id)
    .notNull(),
  /** Search run created via `runNetworkSearch`, when the run produced results. */
  searchRunId: text("search_run_id").references(() => networkSearchRuns.id),
  triggeredBy: text("triggered_by")
    .notNull()
    .$type<NetworkWatchRunTriggeredBy>(),
  outcome: text("outcome")
    .notNull()
    .$type<NetworkWatchRunOutcome>()
    .default("ok"),
  /** Network-lane stepRunId minted server-side; required (Insight-180). */
  stepRunId: text("step_run_id").notNull(),
  /** Number of thin proposals written by this run after health gating. */
  proposalCount: integer("proposal_count").notNull().default(0),
  /** Number of candidates `runNetworkSearch` produced before health gating. */
  rawCandidateCount: integer("raw_candidate_count").notNull().default(0),
  /** Aggregate health summary: per-decision counts, rule-hit tallies. */
  healthSummary: json("health_summary").$type<Record<string, unknown> | null>(),
  errorSummary: text("error_summary"),
  startedAt: timestamp("started_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: false }),
}, (table) => [
  index("network_watch_runs_watch_id").on(table.watchId),
  index("network_watch_runs_started_at").on(table.startedAt),
  index("network_watch_runs_outcome").on(table.outcome),
]);

/**
 * networkWatchProposals — thin join between a watch run and a
 * `networkPossibleConnections` row (parent D4, Reviewer FLAG-7).
 *
 * MUST NOT duplicate the connection's fields (whyThisFits, evidence, …);
 * those live on `networkPossibleConnections`. This row carries the
 * watch-specific health decision, what-changed delta vs the prior run,
 * and the seeker's dismiss state.
 */
export const networkWatchProposals = pgTable("network_watch_proposals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  watchId: text("watch_id")
    .references(() => networkBackgroundWatches.id)
    .notNull(),
  watchRunId: text("watch_run_id")
    .references(() => networkWatchRuns.id)
    .notNull(),
  possibleConnectionId: text("possible_connection_id")
    .references(() => networkPossibleConnections.id)
    .notNull(),
  healthDecision: text("health_decision")
    .notNull()
    .$type<NetworkWatchHealthDecision>(),
  /** Per-rule findings keyed by rule id; persisted for AC #8. */
  healthReasons: json("health_reasons").$type<Record<string, unknown>>().notNull(),
  /** Human-readable delta vs the prior surfacing of this connection. */
  whatChanged: text("what_changed"),
  dismissState: text("dismiss_state")
    .notNull()
    .$type<NetworkWatchProposalDismissState>()
    .default("none"),
  dismissedAt: timestamp("dismissed_at", { mode: "date", withTimezone: false }),
  /** When the proposal was first shown to the seeker (set by 294/295). */
  shownAt: timestamp("shown_at", { mode: "date", withTimezone: false }),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_watch_proposals_watch_id").on(table.watchId),
  index("network_watch_proposals_watch_run_id").on(table.watchRunId),
  index("network_watch_proposals_connection_id").on(table.possibleConnectionId),
  index("network_watch_proposals_dismiss_state").on(table.dismissState),
  uniqueIndex("network_watch_proposals_run_connection_uq").on(
    table.watchRunId,
    table.possibleConnectionId,
  ),
]);

export const networkWatchFeedback = pgTable("network_watch_feedback", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  watchId: text("watch_id")
    .references(() => networkBackgroundWatches.id)
    .notNull(),
  watchProposalId: text("watch_proposal_id").references(
    () => networkWatchProposals.id,
  ),
  kind: text("kind").notNull().$type<NetworkWatchFeedbackKind>(),
  actorId: text("actor_id"),
  reasonText: text("reason_text"),
  refinementText: text("refinement_text"),
  stepRunId: text("step_run_id").notNull(),
  metadata: json("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  index("network_watch_feedback_watch_id").on(table.watchId),
  index("network_watch_feedback_proposal_id").on(table.watchProposalId),
  index("network_watch_feedback_kind").on(table.kind),
]);
