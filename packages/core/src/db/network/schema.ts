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
 * Surface (post-Brief 272 Member Signal): 23 pgTable declarations.
 * Provenance: Brief 263 (this brief; converted from sqliteTable per ADR-048).
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  json,
  index,
  unique,
} from "drizzle-orm/pg-core";
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

export const networkUserStatusValues = ["active", "workspace", "churned"] as const;
export type NetworkUserStatus = (typeof networkUserStatusValues)[number];

export const networkJobRequestStatusValues = ["draft", "active", "paused", "fulfilled", "closed", "open"] as const;
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

export const introductionOriginContextValues = ["client", "visitor", "expert-crossover"] as const;
export type IntroductionOriginContext = (typeof introductionOriginContextValues)[number];

export const introductionStateValues = [
  "queued",
  "queued-for-review",
  "approved",
  "rejected",
  "fulfilled",
  "refused-by-greeter",
  "expired",
] as const;
export type IntroductionState = (typeof introductionStateValues)[number];

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

export const networkWorkspaceDeliveryKindValues = ["forwarded_note", "visitor_intro_request"] as const;
export type NetworkWorkspaceDeliveryKind = (typeof networkWorkspaceDeliveryKindValues)[number];

export const networkWorkspaceDeliveryStatusValues = ["pending", "imported", "failed"] as const;
export type NetworkWorkspaceDeliveryStatus = (typeof networkWorkspaceDeliveryStatusValues)[number];

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
