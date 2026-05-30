/**
 * Intro Approval — Two-Sided Consent State Transitions (Brief 288)
 *
 * Three state transitions live here:
 *   - `recordRequesterApproval`  — `proposed`  → `requester-approved` / `declined` / `not-now`
 *   - `sendRecipientApprovalEmail` — `requester-approved` → `recipient-asked` (on send)
 *   - `recordRecipientApproval`  — `recipient-asked` → `recipient-approved` / `declined` / `not-now`
 *
 * All three are guarded by `requireNetworkStepRunId` (Insight-180). The two
 * recording functions also `requireServerMintedNetworkLaneStepRunId` indirectly
 * via `writeNetworkAuditEvent`, since they are only ever fired from inside the
 * HTTP wrapper that mints the run server-side (Insight-232).
 *
 * Email rendering, magic-link minting, and proposal-card scrubbing are pulled
 * from `intro-proposal.ts` to keep this module focused on transitions.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type {
  ContentBlock,
  IntroProposalCardBlock,
} from "./content-blocks";
import { networkDb } from "../db/network-db";
import { writeNetworkAuditEvent } from "./network-audit";
import { requireNetworkStepRunId } from "./network-step-run";
import { queueWorkspaceInboxDelivery } from "./workspace-inbox-delivery";
import { classifyAndPrepare } from "./network-email-compliance";
import { scrubForSurface } from "./network-privacy-scrubber";
import { renderRecipientApprovalEmail } from "./intro-email-templates";
import {
  buildIntroApproveUrl,
  buildIntroDecisionUrl,
  createIntroMagicLinkToken,
  scrubProposalCardForRecipient,
} from "./intro-proposal";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export const RECORD_REQUESTER_APPROVAL_TOOL_NAME = "record_requester_approval";
export const RECORD_RECIPIENT_APPROVAL_TOOL_NAME = "record_recipient_approval";
export const SEND_RECIPIENT_APPROVAL_EMAIL_TOOL_NAME =
  "send_recipient_approval_email";

export type RequesterApprovalAction =
  | "approve"
  | "decline"
  | "not-now"
  | "edit-and-approve";

export type RecipientApprovalAction = "approve" | "decline" | "not-now";

type IntroRow = typeof networkSchema.introductions.$inferSelect;

function getProposalCard(intro: IntroRow): IntroProposalCardBlock {
  const transcript = (intro.transcript ?? []) as readonly unknown[];
  for (const block of transcript) {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "intro-proposal-card"
    ) {
      return block as IntroProposalCardBlock;
    }
  }
  throw new Error(
    `intro ${intro.id} is missing the IntroProposalCardBlock in transcript`,
  );
}

function updateCardState(
  card: IntroProposalCardBlock,
  state: IntroProposalCardBlock["state"],
): IntroProposalCardBlock {
  return { ...card, state };
}

function replaceCardInTranscript(
  intro: IntroRow,
  card: IntroProposalCardBlock,
): unknown[] {
  const transcript = (intro.transcript ?? []) as readonly unknown[];
  return transcript.map((block) => {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "intro-proposal-card"
    ) {
      return card;
    }
    return block;
  });
}

// ============================================================
// recordRequesterApproval
// ============================================================

export interface RecordRequesterApprovalInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  action: RequesterApprovalAction;
  /** Optional edit text from the "Notes for Ditto to consider" field (D11). */
  edit?: string | null;
  /** Optional decline reason; persisted to `declineCategory` for decline only. */
  declineCategory?: string | null;
  now?: Date;
}

export interface RecordRequesterApprovalResult {
  ok: boolean;
  blockedReason?: string;
  introduction?: IntroRow;
  auditEventId?: string;
  /** Set when the approval triggered a downstream recipient-email send. */
  recipientEmailQueued?: boolean;
}

export async function recordRequesterApproval(
  input: RecordRequesterApprovalInput,
): Promise<RecordRequesterApprovalResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    RECORD_REQUESTER_APPROVAL_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();

  const [intro] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, input.introId))
    .limit(1);
  if (!intro) {
    throw new Error(
      `${RECORD_REQUESTER_APPROVAL_TOOL_NAME}: introduction ${input.introId} not found`,
    );
  }
  if (intro.state !== "proposed") {
    return {
      ok: false,
      blockedReason: `intro not in 'proposed' state (was ${intro.state})`,
    };
  }

  const card = getProposalCard(intro);

  let nextState: networkSchema.IntroductionState;
  let eventClass: networkSchema.NetworkAuditEventClass;
  let requesterApprovedAt: Date | null = intro.requesterApprovedAt;
  let declineCategory: string | null = intro.declineCategory;
  const isApprove =
    input.action === "approve" || input.action === "edit-and-approve";
  if (isApprove) {
    nextState = "requester-approved";
    eventClass = "intro_requester_approved";
    requesterApprovedAt = now;
  } else if (input.action === "decline") {
    nextState = "declined";
    eventClass = "intro_declined";
    declineCategory = input.declineCategory ?? "requester-declined";
  } else if (input.action === "not-now") {
    nextState = "not-now";
    eventClass = "intro_not_now";
  } else {
    throw new Error(
      `${RECORD_REQUESTER_APPROVAL_TOOL_NAME}: unknown action '${String(input.action)}'`,
    );
  }

  const editTrim = input.edit?.trim() ?? "";
  // D11 send-time scrub: the "Notes for Ditto to consider" draft is
  // recipient-bound (it informs the warm intro). A draft that copies the
  // requester's own private/hidden/anti-persona claim text is an injection
  // attempt — refuse it before any state write or downstream send. The
  // detection seeds the scrubber's sensitive-value set from the UNSCRUBBED
  // card and checks whether the draft field is redacted under the recipient
  // viewer context (same context `sendRecipientApprovalEmail` uses).
  if (isApprove && editTrim && editDraftInjectsPrivateClaim(card, editTrim, intro)) {
    return {
      ok: false,
      blockedReason: "edit draft injects private-claim data",
    };
  }

  const updatedCard = updateCardState(card, nextState);
  const updatedTranscript = replaceCardInTranscript(intro, updatedCard);
  const metadata: Record<string, unknown> = {
    ...((intro.metadata as Record<string, unknown> | null) ?? {}),
  };
  if (editTrim) metadata.requesterEdit = editTrim;

  const [updatedIntro] = await db
    .update(networkSchema.introductions)
    .set({
      state: nextState,
      requesterApprovedAt,
      declineCategory,
      transcript: updatedTranscript as ContentBlock[],
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      updatedAt: now,
    })
    .where(eq(networkSchema.introductions.id, intro.id))
    .returning();

  const auditRow = await writeNetworkAuditEvent({
    db,
    stepRunId,
    eventClass,
    subjectType: "introduction",
    subjectId: intro.id,
    actorType: "user",
    actorId: intro.requesterUserId ?? null,
    reasonCode: null,
    metadata: {
      byParty: "requester",
      action: input.action,
      hasEdit: editTrim.length > 0,
      declineCategory: declineCategory ?? null,
    },
    now,
  });

  // Defensive idempotent delivery write per AC #16 — first-writer-wins.
  await ensureDeliveriesForIntro(db, updatedIntro, updatedCard, stepRunId, now);

  let recipientEmailQueued = false;
  if (isApprove) {
    const sendResult = await sendRecipientApprovalEmail({
      db,
      stepRunId,
      introId: intro.id,
      now,
    });
    recipientEmailQueued = sendResult.ok;
  }

  return {
    ok: true,
    introduction: updatedIntro,
    auditEventId: auditRow.id,
    recipientEmailQueued,
  };
}

// ============================================================
// sendRecipientApprovalEmail
// ============================================================

export interface SendRecipientApprovalEmailInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  now?: Date;
  compliance?: typeof classifyAndPrepare;
}

export interface SendRecipientApprovalEmailResult {
  ok: boolean;
  blockedReason?: string;
  magicLinkUrl?: string;
  subject?: string;
  body?: string;
  headers?: Record<string, string>;
  scrubWithheld?: number;
}

export async function sendRecipientApprovalEmail(
  input: SendRecipientApprovalEmailInput,
): Promise<SendRecipientApprovalEmailResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    SEND_RECIPIENT_APPROVAL_EMAIL_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();

  const [intro] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, input.introId))
    .limit(1);
  if (!intro) {
    throw new Error(
      `${SEND_RECIPIENT_APPROVAL_EMAIL_TOOL_NAME}: introduction ${input.introId} not found`,
    );
  }
  if (intro.state !== "requester-approved") {
    return {
      ok: false,
      blockedReason: `intro not in 'requester-approved' state (was ${intro.state})`,
    };
  }
  const recipientEmail = intro.recipientEmail;
  if (!recipientEmail) {
    return {
      ok: false,
      blockedReason: "intro has no recipientEmail",
    };
  }

  const card = getProposalCard(intro);
  // Brief 278 D-Q7: scrub the proposal card down to recipient-safe shape
  // before any recipient surface render. Two layers:
  //   1. `scrubProposalCardForRecipient` nulls antiPersonaMd on any embedded
  //      NetworkProfileCardBlock (owner-only field).
  //   2. `scrubForSurface` walks the rest of the payload to strip private /
  //      hidden / on-request claims and sensitive fields.
  const ownerSafeCard = scrubProposalCardForRecipient(card);
  const { payload: scrubbedCard, scrubDecision } = scrubForSurface(
    ownerSafeCard,
    {
      surface: "intro-email",
      viewerContext: {
        viewerType: "requester",
        viewerId: intro.recipientUserId ?? null,
        ownerId: intro.requesterUserId ?? null,
      },
    },
  );
  if (!scrubbedCard) {
    return { ok: false, blockedReason: "scrubber rejected payload" };
  }

  const { token } = createIntroMagicLinkToken({
    introId: intro.id,
    party: "recipient",
    email: recipientEmail,
    now,
  });
  const magicLinkUrl = buildIntroApproveUrl(
    intro.id,
    token,
    "recipient",
    "approve",
  );
  const chatUrl = buildIntroDecisionUrl(intro.id, token, "recipient");

  const { subject, body } = renderRecipientApprovalEmail({
    recipientFirstName: deriveRecipientFirstName(intro, scrubbedCard),
    requesterDisplayName: intro.requesterDisplayName ?? "Someone",
    whyThisFits: scrubbedCard.whyThisFits,
    whatStaysPrivate: scrubbedCard.whatStaysPrivate,
    magicLinkUrl,
    chatUrl,
  });

  const compliance = input.compliance ?? classifyAndPrepare;
  const result = await compliance({
    db,
    stepRunId,
    kind: "intro",
    to: recipientEmail,
    subject,
    body,
    scope: "global",
    now,
  });
  if (!result.ok) {
    return {
      ok: false,
      blockedReason: result.blockedReason,
      headers: result.headers,
      scrubWithheld: scrubDecision.withheldTotal,
    };
  }

  // State transition: requester-approved → recipient-asked.
  // We update transcript card state to mirror so downstream surfaces render
  // the live state without an extra read.
  const askedCard = updateCardState(scrubbedCard, "recipient-asked");
  await db
    .update(networkSchema.introductions)
    .set({
      state: "recipient-asked",
      transcript: replaceCardInTranscript(intro, askedCard) as ContentBlock[],
      updatedAt: now,
    })
    .where(eq(networkSchema.introductions.id, intro.id));

  await writeNetworkAuditEvent({
    db,
    stepRunId,
    eventClass: "intro_recipient_asked",
    subjectType: "introduction",
    subjectId: intro.id,
    actorType: "system",
    actorId: "mira",
    reasonCode: null,
    metadata: {
      byParty: "system",
      scrubWithheld: scrubDecision.withheldTotal,
    },
    now,
  });

  return {
    ok: true,
    magicLinkUrl,
    subject: result.subject,
    body: result.body,
    headers: result.headers,
    scrubWithheld: scrubDecision.withheldTotal,
  };
}

// ============================================================
// recordRecipientApproval
// ============================================================

export interface RecordRecipientApprovalInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  action: RecipientApprovalAction;
  declineCategory?: string | null;
  now?: Date;
  /** Optional override for the warm-thread sender (test injection). */
  createIntroThread?: (input: {
    db?: NetworkDbHandle;
    stepRunId: string;
    introId: string;
    now?: Date;
  }) => Promise<{ ok: boolean; blockedReason?: string }>;
}

export interface RecordRecipientApprovalResult {
  ok: boolean;
  blockedReason?: string;
  introduction?: IntroRow;
  auditEventId?: string;
  threadQueued?: boolean;
}

export async function recordRecipientApproval(
  input: RecordRecipientApprovalInput,
): Promise<RecordRecipientApprovalResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    RECORD_RECIPIENT_APPROVAL_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();

  const [intro] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, input.introId))
    .limit(1);
  if (!intro) {
    throw new Error(
      `${RECORD_RECIPIENT_APPROVAL_TOOL_NAME}: introduction ${input.introId} not found`,
    );
  }
  if (intro.state !== "recipient-asked") {
    return {
      ok: false,
      blockedReason: `intro not in 'recipient-asked' state (was ${intro.state})`,
    };
  }

  const card = getProposalCard(intro);

  let nextState: networkSchema.IntroductionState;
  let eventClass: networkSchema.NetworkAuditEventClass;
  let recipientApprovedAt: Date | null = intro.recipientApprovedAt;
  let declineCategory: string | null = intro.declineCategory;
  if (input.action === "approve") {
    nextState = "recipient-approved";
    eventClass = "intro_recipient_approved";
    recipientApprovedAt = now;
  } else if (input.action === "decline") {
    nextState = "declined";
    eventClass = "intro_declined";
    declineCategory = input.declineCategory ?? "recipient-declined";
  } else if (input.action === "not-now") {
    nextState = "not-now";
    eventClass = "intro_not_now";
  } else {
    throw new Error(
      `${RECORD_RECIPIENT_APPROVAL_TOOL_NAME}: unknown action '${String(input.action)}'`,
    );
  }

  const updatedCard = updateCardState(card, nextState);
  const updatedTranscript = replaceCardInTranscript(intro, updatedCard);

  const [updatedIntro] = await db
    .update(networkSchema.introductions)
    .set({
      state: nextState,
      recipientApprovedAt,
      declineCategory,
      transcript: updatedTranscript as ContentBlock[],
      updatedAt: now,
    })
    .where(eq(networkSchema.introductions.id, intro.id))
    .returning();

  const auditRow = await writeNetworkAuditEvent({
    db,
    stepRunId,
    eventClass,
    subjectType: "introduction",
    subjectId: intro.id,
    actorType: "user",
    actorId: intro.recipientUserId ?? null,
    reasonCode: null,
    metadata: {
      byParty: "recipient",
      action: input.action,
      declineCategory: declineCategory ?? null,
    },
    now,
  });

  let threadQueued = false;
  if (input.action === "approve") {
    const sender = input.createIntroThread ?? (await loadCreateIntroThread());
    const threadResult = await sender({
      db,
      stepRunId,
      introId: intro.id,
      now,
    });
    threadQueued = threadResult.ok;
  }

  return {
    ok: true,
    introduction: updatedIntro,
    auditEventId: auditRow.id,
    threadQueued,
  };
}

// ============================================================
// Helpers
// ============================================================

/**
 * D11 / AC #19 edit-draft injection refusal. Seeds the scrubber's
 * sensitive-value set from the UNSCRUBBED proposal card (full private/hidden/
 * anti-persona text) and tests whether the draft string is redacted under the
 * recipient viewer context. If any owner-private claim text surfaces in the
 * draft, the scrubber substitutes `[private]` — the field differs from the
 * original, which we treat as an injection attempt. Uses only the public
 * `scrubForSurface` (no scrubber internals exported).
 */
function editDraftInjectsPrivateClaim(
  card: IntroProposalCardBlock,
  editTrim: string,
  intro: IntroRow,
): boolean {
  const probe = { proposalContext: card, requesterEditDraft: editTrim };
  const { payload } = scrubForSurface(probe, {
    surface: "intro-email",
    viewerContext: {
      viewerType: "requester",
      viewerId: intro.recipientUserId ?? null,
      ownerId: intro.requesterUserId ?? null,
    },
  });
  const scrubbedDraft =
    payload && typeof payload.requesterEditDraft === "string"
      ? payload.requesterEditDraft
      : "";
  return scrubbedDraft !== editTrim;
}

/** Lazy-load the warm-thread sender to avoid a circular import between this
 *  module and `intro-email-thread.ts` (which imports magic-link helpers from
 *  `intro-proposal.ts` and the recipient template builder from this layer). */
async function loadCreateIntroThread(): Promise<
  (input: {
    db?: NetworkDbHandle;
    stepRunId: string;
    introId: string;
    now?: Date;
  }) => Promise<{ ok: boolean; blockedReason?: string }>
> {
  const mod = await import("./intro-email-thread");
  return mod.createIntroThread;
}

/** Best-effort recipient-name extraction. The recipient name is not stored
 *  on the row directly — we lift it from the proposal card header
 *  ("Mira: intro to {RecipientName}?") if present, else fall back to the
 *  email's local-part. This is a UI nicety, not a security boundary. */
function deriveRecipientFirstName(
  intro: IntroRow,
  card: IntroProposalCardBlock,
): string {
  const fromHeader = card.header.replace(/^Mira: intro to /, "").replace(
    /\?$/,
    "",
  );
  if (fromHeader) return fromHeader.split(/\s+/)[0] ?? fromHeader;
  const email = intro.recipientEmail ?? "";
  return email.split("@")[0] || "there";
}

async function ensureDeliveriesForIntro(
  db: NetworkDbHandle,
  intro: IntroRow,
  card: IntroProposalCardBlock,
  stepRunId: string,
  now: Date,
): Promise<void> {
  // AC #16: defensive idempotent write — proposeIntroduction already wrote
  // these; calling again with the same dedupeKey is a no-op (first writer
  // wins). We do this so a re-tried recordRequesterApproval invocation
  // still leaves both deliveries present even if proposeIntroduction's
  // earlier write was rolled back for any reason.
  const requesterUserId = intro.requesterUserId;
  if (!requesterUserId) return;
  await queueWorkspaceInboxDelivery({
    db,
    userId: requesterUserId,
    kind: "intro-proposal-card",
    blocks: [card],
    stepRunId,
    dedupeKey: `intro:${intro.id}:requester`,
    now,
  });
  if (intro.recipientUserId) {
    await queueWorkspaceInboxDelivery({
      db,
      userId: intro.recipientUserId,
      kind: "intro-proposal-card",
      blocks: [card],
      stepRunId,
      dedupeKey: `intro:${intro.id}:recipient`,
      now,
    });
  }
}
