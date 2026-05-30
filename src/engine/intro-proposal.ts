/**
 * Intro Proposal — Outbound (Mira-proposed) Intro Origination (Brief 288)
 *
 * `proposeIntroduction` is the entry point: it writes a `proposed` row,
 * builds the `IntroProposalCardBlock`, persists it in `transcript`, queues
 * cross-deployment deliveries to both parties (when the recipient is a
 * Ditto member), writes one audit event, and mints the requester-approval
 * email magic link.
 *
 * Side-effects are guarded by `requireNetworkStepRunId` (Insight-180);
 * downstream `sendRequesterApprovalEmail` is gated separately so the wrapper
 * step run can be passed through.
 */

import { randomUUID, createHmac, timingSafeEqual, randomBytes } from "crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, gte } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type {
  AuthorizationRequestBlock,
  ContentBlock,
  IntroProposalCardAffordance,
  IntroProposalCardBlock,
  IntroProposalEvidence,
} from "./content-blocks";
import { networkDb } from "../db/network-db";
import { writeNetworkAuditEvent } from "./network-audit";
import { requireNetworkStepRunId } from "./network-step-run";
import { queueWorkspaceInboxDelivery } from "./workspace-inbox-delivery";
import { classifyAndPrepare } from "./network-email-compliance";
import { scrubNetworkProfileCardForNonOwner } from "./network-privacy-scrubber";
import { renderRequesterApprovalEmail } from "./intro-email-templates";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export const PROPOSE_INTRODUCTION_TOOL_NAME = "propose_introduction";
export const SEND_REQUESTER_APPROVAL_EMAIL_TOOL_NAME =
  "send_requester_approval_email";

const INTRO_MAGIC_LINK_PREFIX = "imlt_";
const INTRO_MAGIC_LINK_VERSION = 1;
const INTRO_MAGIC_LINK_EXPIRY_MS = 24 * 60 * 60 * 1000;
const INTRO_MAGIC_LINKS_PER_EMAIL_PER_HOUR = 5;

export type IntroApprovalParty = "requester" | "recipient";

export interface IntroMagicLinkPayload {
  typ: "intro-approval";
  v: typeof INTRO_MAGIC_LINK_VERSION;
  introId: string;
  party: IntroApprovalParty;
  email: string;
  exp: number;
  iat: number;
  jti: string;
}

function introMagicLinkSecret(): string {
  const value =
    process.env.NETWORK_AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DITTO_NETWORK_TOKEN_SECRET ||
    "";
  if (!value && process.env.DITTO_TEST_MODE !== "true") {
    throw new Error(
      "intro magic-link signing requires NETWORK_AUTH_SECRET (or SESSION_SECRET)",
    );
  }
  return value || "test-mode-secret";
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export interface CreateIntroMagicLinkInput {
  introId: string;
  party: IntroApprovalParty;
  email: string;
  now?: Date;
}

export function createIntroMagicLinkToken(
  input: CreateIntroMagicLinkInput,
): { token: string; expiresAt: Date; jti: string } {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + INTRO_MAGIC_LINK_EXPIRY_MS);
  const jti = randomBytes(16).toString("hex");
  const payload: IntroMagicLinkPayload = {
    typ: "intro-approval",
    v: INTRO_MAGIC_LINK_VERSION,
    introId: input.introId,
    party: input.party,
    email: input.email.toLowerCase(),
    exp: expiresAt.getTime(),
    iat: now.getTime(),
    jti,
  };
  const payloadB64 = encodeBase64Url(JSON.stringify(payload));
  const sig = signPayload(payloadB64, introMagicLinkSecret());
  const token = `${INTRO_MAGIC_LINK_PREFIX}${payloadB64}.${sig}`;
  return { token, expiresAt, jti };
}

export function parseIntroMagicLinkToken(
  token: string,
  now: Date = new Date(),
): IntroMagicLinkPayload | null {
  if (!token.startsWith(INTRO_MAGIC_LINK_PREFIX)) return null;
  const raw = token.slice(INTRO_MAGIC_LINK_PREFIX.length);
  const [payloadB64, sig] = raw.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = signPayload(payloadB64, introMagicLinkSecret());
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(payloadB64)) as Partial<
      IntroMagicLinkPayload
    >;
    if (
      payload.typ !== "intro-approval" ||
      payload.v !== INTRO_MAGIC_LINK_VERSION ||
      typeof payload.introId !== "string" ||
      (payload.party !== "requester" && payload.party !== "recipient") ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    if (payload.exp < now.getTime()) return null;
    return payload as IntroMagicLinkPayload;
  } catch {
    return null;
  }
}

function baseUrl(): string {
  return (
    process.env.NETWORK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://ditto.partners"
  );
}

export function buildIntroDecisionUrl(
  introId: string,
  token: string,
  party: IntroApprovalParty,
): string {
  const url = new URL(`/network/intros/${introId}/chat`, baseUrl());
  url.searchParams.set("token", token);
  url.searchParams.set("party", party);
  return url.toString();
}

export function buildIntroApproveUrl(
  introId: string,
  token: string,
  party: IntroApprovalParty,
  action: "approve" | "decline" | "not-now" = "approve",
): string {
  const url = new URL(`/network/intros/${introId}/chat`, baseUrl());
  url.searchParams.set("token", token);
  url.searchParams.set("party", party);
  url.searchParams.set("action", action);
  return url.toString();
}

// ============================================================
// proposeIntroduction
// ============================================================

export interface ProposeIntroductionInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  /** Ditto network user originating the request. */
  requesterUserId: string;
  /** Display name for the requester (for templates). */
  requesterDisplayName: string;
  /** Ditto network user recipient — null for non-Ditto recipients. */
  recipientUserId?: string | null;
  /** Recipient email — required when recipientUserId is null. */
  recipientEmail?: string | null;
  /** Recipient display name for the proposal card header and templates. */
  recipientDisplayName: string;
  /** Origin context — must be `mira-proposed` for this entry point. */
  originContext?: networkSchema.IntroductionOriginContext;
  /** One-screen reason this match makes sense. */
  whyThisFits: string;
  /** Time-relevant reason this is the right moment. */
  whyNow: string;
  /** Evidence rows (each cites a network_signal_sources row by id). */
  evidence: IntroProposalEvidence[];
  /** Optional risks called out for trust transparency. */
  risks?: string[] | null;
  /** Items that won't leave the requester's workspace. */
  whatStaysPrivate: string[];
  /** Optional cost label surfaced to the requester (free counter, etc). */
  costLabel?: string | null;
  /** 0–1 confidence in the match. */
  confidence: number;
  /** Short summary used by the audit substrate and downstream search. */
  intentSummary: string;
  /** Header surfaced on the recipient's preview AuthorizationRequestBlock. */
  recipientPreviewHeader: string;
  /** Draft text the recipient will see; passed to the recipient preview. */
  recipientPreviewDraft: string;
  now?: Date;
}

export interface ProposeIntroductionResult {
  introduction: typeof networkSchema.introductions.$inferSelect;
  block: IntroProposalCardBlock;
  requesterDelivery:
    | typeof networkSchema.networkWorkspaceDeliveries.$inferSelect
    | null;
  recipientDelivery:
    | typeof networkSchema.networkWorkspaceDeliveries.$inferSelect
    | null;
  auditEventId: string;
}

const PROPOSAL_AFFORDANCES: IntroProposalCardAffordance[] = [
  "approve",
  "decline",
  "not-now",
  "edit-draft",
  "open-chat",
];

function buildRecipientPreviewBlock(
  introId: string,
  input: ProposeIntroductionInput,
): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: input.recipientPreviewHeader,
    preview: [
      {
        type: "text",
        variant: "body",
        text: input.recipientPreviewDraft,
      },
    ],
    recipientLabel:
      input.recipientEmail || input.recipientDisplayName,
    actionClass: "email-send",
    executionResult: null,
    expiresAt: null,
    authorizationId: `intro-${introId}-recipient`,
    request: input.intentSummary,
    draft: input.recipientPreviewDraft,
    requesterId: input.requesterUserId,
    costLabel: null,
    toolName: "send_recipient_approval_email",
    toolInput: {
      introId,
      party: "recipient",
    },
  };
}

function buildProposalCard({
  introId,
  state,
  input,
  recipientPreview,
}: {
  introId: string;
  state: IntroProposalCardBlock["state"];
  input: ProposeIntroductionInput;
  recipientPreview: AuthorizationRequestBlock;
}): IntroProposalCardBlock {
  return {
    type: "intro-proposal-card",
    state,
    introId,
    header: `Mira: intro to ${input.recipientDisplayName}?`,
    whyThisFits: input.whyThisFits,
    whyNow: input.whyNow,
    evidence: input.evidence,
    risks: input.risks ?? null,
    recipientPreview,
    whatStaysPrivate: input.whatStaysPrivate,
    costLabel: input.costLabel ?? null,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    affordances: PROPOSAL_AFFORDANCES,
  };
}

async function rateLimitProposalsForRequester(
  db: NetworkDbHandle,
  requesterUserId: string,
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const rows = await db
    .select({ id: networkSchema.introductions.id })
    .from(networkSchema.introductions)
    .where(
      and(
        eq(networkSchema.introductions.requesterUserId, requesterUserId),
        eq(networkSchema.introductions.originContext, "mira-proposed"),
        gte(networkSchema.introductions.createdAt, since),
      ),
    )
    .limit(INTRO_MAGIC_LINKS_PER_EMAIL_PER_HOUR + 1);
  if (rows.length >= INTRO_MAGIC_LINKS_PER_EMAIL_PER_HOUR) {
    throw new Error(
      `${PROPOSE_INTRODUCTION_TOOL_NAME} rate limit: ${INTRO_MAGIC_LINKS_PER_EMAIL_PER_HOUR}/hour reached for requester ${requesterUserId}`,
    );
  }
}

export async function proposeIntroduction(
  input: ProposeIntroductionInput,
): Promise<ProposeIntroductionResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    PROPOSE_INTRODUCTION_TOOL_NAME,
    { rejectWebDirect: true },
  );
  if (input.confidence < 0 || input.confidence > 1) {
    throw new Error(
      `${PROPOSE_INTRODUCTION_TOOL_NAME} confidence must be in [0,1]`,
    );
  }
  if (!input.recipientUserId && !input.recipientEmail) {
    throw new Error(
      `${PROPOSE_INTRODUCTION_TOOL_NAME} requires recipientUserId or recipientEmail`,
    );
  }
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  await rateLimitProposalsForRequester(db, input.requesterUserId, now);

  const introId = randomUUID();
  const recipientPreview = buildRecipientPreviewBlock(introId, input);
  const block = buildProposalCard({
    introId,
    state: "proposed",
    input,
    recipientPreview,
  });

  const [introduction] = await db
    .insert(networkSchema.introductions)
    .values({
      id: introId,
      targetUserId: input.recipientUserId ?? input.requesterUserId,
      requesterUserId: input.requesterUserId,
      visitorSessionId: null,
      requesterDisplayName: input.requesterDisplayName,
      requesterOrgLabel: null,
      originContext: input.originContext ?? "mira-proposed",
      intentSummary: input.intentSummary,
      draft: input.recipientPreviewDraft,
      costLabel: input.costLabel ?? null,
      authorizationId: `intro-${introId}`,
      authorizationBlock: recipientPreview,
      transcript: [block],
      state: "proposed",
      refusalReason: null,
      sourceStepRunId: stepRunId,
      metadata: null,
      recipientUserId: input.recipientUserId ?? null,
      recipientEmail: input.recipientEmail ?? null,
      followUpCadenceDays: 14,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const auditRow = await writeNetworkAuditEvent({
    db,
    stepRunId,
    eventClass: "intro_proposed",
    subjectType: "introduction",
    subjectId: introId,
    actorType: "system",
    actorId: "mira",
    reasonCode: null,
    metadata: {
      requesterUserId: input.requesterUserId,
      recipientUserId: input.recipientUserId ?? null,
      confidence: block.confidence,
    },
    now,
  });

  let requesterDelivery:
    | typeof networkSchema.networkWorkspaceDeliveries.$inferSelect
    | null = null;
  let recipientDelivery:
    | typeof networkSchema.networkWorkspaceDeliveries.$inferSelect
    | null = null;

  const requesterDeliveryResult = await queueWorkspaceInboxDelivery({
    db,
    userId: input.requesterUserId,
    kind: "intro-proposal-card",
    blocks: [block],
    stepRunId,
    dedupeKey: `intro:${introId}:requester`,
    now,
  });
  requesterDelivery = requesterDeliveryResult.delivery;

  if (input.recipientUserId) {
    const recipientResult = await queueWorkspaceInboxDelivery({
      db,
      userId: input.recipientUserId,
      kind: "intro-proposal-card",
      blocks: [block],
      stepRunId,
      dedupeKey: `intro:${introId}:recipient`,
      now,
    });
    recipientDelivery = recipientResult.delivery;
  }

  if (requesterDelivery || recipientDelivery) {
    await db
      .update(networkSchema.introductions)
      .set({
        requesterDeliveryId: requesterDelivery?.id ?? null,
        recipientDeliveryId: recipientDelivery?.id ?? null,
        updatedAt: now,
      })
      .where(eq(networkSchema.introductions.id, introId));
  }

  return {
    introduction: {
      ...introduction,
      requesterDeliveryId: requesterDelivery?.id ?? null,
      recipientDeliveryId: recipientDelivery?.id ?? null,
    },
    block,
    requesterDelivery,
    recipientDelivery,
    auditEventId: auditRow.id,
  };
}

// ============================================================
// sendRequesterApprovalEmail
// ============================================================

export interface SendRequesterApprovalEmailInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  /** Resolved requester email — caller looks this up (Network user record). */
  requesterEmail: string;
  /** Optional shape override of the magic-link `now` for testability. */
  now?: Date;
  /** Optional compliance override — primarily for tests. */
  compliance?: typeof classifyAndPrepare;
}

export interface SendRequesterApprovalEmailResult {
  ok: boolean;
  blockedReason?: string;
  magicLinkUrl?: string;
  subject?: string;
  body?: string;
  headers?: Record<string, string>;
}

export async function sendRequesterApprovalEmail(
  input: SendRequesterApprovalEmailInput,
): Promise<SendRequesterApprovalEmailResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    SEND_REQUESTER_APPROVAL_EMAIL_TOOL_NAME,
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
      `${SEND_REQUESTER_APPROVAL_EMAIL_TOOL_NAME}: introduction ${input.introId} not found`,
    );
  }
  if (intro.state !== "proposed") {
    return {
      ok: false,
      blockedReason: `intro not in 'proposed' state (was ${intro.state})`,
    };
  }
  const transcript = (intro.transcript ?? []) as readonly IntroProposalCardBlock[];
  const card = transcript.find(
    (block) => block?.type === "intro-proposal-card",
  );
  if (!card) {
    throw new Error(
      `${SEND_REQUESTER_APPROVAL_EMAIL_TOOL_NAME}: intro ${input.introId} missing IntroProposalCardBlock`,
    );
  }

  const { token } = createIntroMagicLinkToken({
    introId: input.introId,
    party: "requester",
    email: input.requesterEmail,
    now,
  });
  const magicLinkUrl = buildIntroApproveUrl(
    input.introId,
    token,
    "requester",
    "approve",
  );
  const chatUrl = buildIntroDecisionUrl(input.introId, token, "requester");

  const { subject, body } = renderRequesterApprovalEmail({
    requesterFirstName: intro.requesterDisplayName ?? "there",
    recipientDisplayName: card.header.replace(/^Mira: intro to /, "").replace(/\?$/, ""),
    whyThisFits: card.whyThisFits,
    whyNow: card.whyNow,
    costLabel: card.costLabel,
    magicLinkUrl,
    chatUrl,
  });

  const compliance = input.compliance ?? classifyAndPrepare;
  const result = await compliance({
    db,
    stepRunId,
    kind: "intro",
    to: input.requesterEmail,
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
    };
  }

  return {
    ok: true,
    magicLinkUrl,
    subject: result.subject,
    body: result.body,
    headers: result.headers,
  };
}

// ============================================================
// Helpers exported for downstream modules (recipient email path)
// ============================================================

/** Apply Brief 278 D-Q7 owner-only scrub on every IntroProposalCardBlock
 *  reference before any recipient surface is rendered. The card carries the
 *  recipient preview AuthorizationRequestBlock; we keep that intact and scrub
 *  any embedded NetworkProfileCardBlock down to the non-owner shape. */
export function scrubProposalCardForRecipient(
  card: IntroProposalCardBlock,
): IntroProposalCardBlock {
  const preview = card.recipientPreview;
  const scrubbedPreview: AuthorizationRequestBlock = {
    ...preview,
    preview: (preview.preview ?? []).map((block: ContentBlock) => {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "network-profile-card"
      ) {
        return scrubNetworkProfileCardForNonOwner(
          block as Parameters<typeof scrubNetworkProfileCardForNonOwner>[0],
        );
      }
      return block;
    }),
  };
  return {
    ...card,
    recipientPreview: scrubbedPreview,
  };
}
