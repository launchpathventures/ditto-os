/**
 * Intro Email Thread — Warm Hand-off (Brief 288)
 *
 * `createIntroThread` sends the final warm intro email with both parties on
 * the To: line in a single AgentMail thread. It is gated by:
 *   - server-minted `stepRunId` (Insight-180)
 *   - `state === "recipient-approved"` AND both approval timestamps present
 *   - `network-privacy-scrubber` pass on the proposal card
 *   - `network-email-compliance` pass for sender identity, suppression,
 *     RFC 8058 unsubscribe headers, CAN-SPAM footer
 *
 * On success it writes:
 *   - `state = "thread-sent"`
 *   - `threadSentAt = now`
 *   - `threadMessageId = AgentMail thread id`
 *   - one `network_audit_events` row with `eventClass = "intro_thread_sent"`
 *
 * No new email sender: this composes `AgentMailAdapter` (with the extended
 * `additionalTo` field for "both on To:") + `classifyAndPrepare`.
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
import { classifyAndPrepare } from "./network-email-compliance";
import { scrubForSurface } from "./network-privacy-scrubber";
import { renderWarmIntroThreadEmail } from "./intro-email-templates";
import { scrubProposalCardForRecipient } from "./intro-proposal";
import {
  createAgentMailAdapterForPersona,
  type AgentMailAdapter,
} from "./channel";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export const CREATE_INTRO_THREAD_TOOL_NAME = "create_intro_thread";

export interface CreateIntroThreadInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  now?: Date;
  /** Inject a sender for tests; falls back to `createAgentMailAdapterForPersona("mira")`. */
  sender?: Pick<AgentMailAdapter, "send"> | null;
  /** Inject compliance for tests. */
  compliance?: typeof classifyAndPrepare;
}

export interface CreateIntroThreadResult {
  ok: boolean;
  blockedReason?: string;
  subject?: string;
  body?: string;
  headers?: Record<string, string>;
  threadMessageId?: string;
}

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

function deriveFirstName(value: string | null | undefined, fallback: string): string {
  const clean = (value ?? "").trim();
  if (!clean) return fallback;
  const [head] = clean.split(/\s+/);
  return head || fallback;
}

function deriveOneLine(card: IntroProposalCardBlock): {
  requesterOneLine: string;
  recipientOneLine: string;
} {
  // The proposal card carries `whyThisFits` (the recipient's strength) and
  // `whyNow` (the requester's situation). We use them as the one-liners on
  // the warm intro thread. Designer spec section 3.3 confirms.
  return {
    requesterOneLine: card.whyNow,
    recipientOneLine: card.whyThisFits,
  };
}

async function loadIntro(
  db: NetworkDbHandle,
  introId: string,
): Promise<IntroRow | null> {
  const [row] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, introId))
    .limit(1);
  return row ?? null;
}

export async function createIntroThread(
  input: CreateIntroThreadInput,
): Promise<CreateIntroThreadResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    CREATE_INTRO_THREAD_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();

  const intro = await loadIntro(db, input.introId);
  if (!intro) {
    throw new Error(
      `${CREATE_INTRO_THREAD_TOOL_NAME}: introduction ${input.introId} not found`,
    );
  }
  if (intro.state !== "recipient-approved") {
    return {
      ok: false,
      blockedReason: `intro not in 'recipient-approved' state (was ${intro.state})`,
    };
  }
  if (!intro.requesterApprovedAt || !intro.recipientApprovedAt) {
    return {
      ok: false,
      blockedReason:
        "warm intro thread requires both requesterApprovedAt and recipientApprovedAt",
    };
  }
  const recipientEmail = intro.recipientEmail;
  if (!recipientEmail) {
    return { ok: false, blockedReason: "intro has no recipientEmail" };
  }

  // Resolve requester email. The introductions row references requesterUserId;
  // we look up the network user for the email.
  if (!intro.requesterUserId) {
    return { ok: false, blockedReason: "intro has no requesterUserId" };
  }
  const [requesterUser] = await db
    .select({ email: networkSchema.networkUsers.email })
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.id, intro.requesterUserId))
    .limit(1);
  if (!requesterUser?.email) {
    return { ok: false, blockedReason: "requester has no email" };
  }
  const requesterEmail = requesterUser.email;

  // Privacy scrub the card before rendering the thread body.
  const card = getProposalCard(intro);
  const ownerSafeCard = scrubProposalCardForRecipient(card);
  const { payload: scrubbedCard, scrubDecision } = scrubForSurface(
    ownerSafeCard,
    {
      surface: "intro-email",
      viewerContext: {
        viewerType: "requester",
        viewerId: intro.recipientUserId ?? null,
        ownerId: intro.requesterUserId,
      },
    },
  );
  if (!scrubbedCard) {
    return { ok: false, blockedReason: "scrubber rejected payload" };
  }

  const requesterFirstName = deriveFirstName(
    intro.requesterDisplayName,
    "Friend",
  );
  const recipientFirstName = deriveFirstName(
    scrubbedCard.header.replace(/^Mira: intro to /, "").replace(/\?$/, ""),
    recipientEmail.split("@")[0] ?? "Friend",
  );
  const { requesterOneLine, recipientOneLine } = deriveOneLine(scrubbedCard);

  const { subject, body } = renderWarmIntroThreadEmail({
    requesterFirstName,
    recipientFirstName,
    requesterOneLine,
    recipientOneLine,
    context: scrubbedCard.whyThisFits,
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
    };
  }

  const sender = input.sender ?? createAgentMailAdapterForPersona("mira");
  if (!sender) {
    return {
      ok: false,
      blockedReason: "Mira AgentMail adapter unavailable",
      headers: result.headers,
    };
  }

  const sendResult = await sender.send({
    to: recipientEmail,
    additionalTo: [requesterEmail],
    subject: result.subject,
    body: result.body,
    personaId: "mira",
    mode: "connecting",
    headers: result.headers,
  });
  if (!sendResult.success) {
    return {
      ok: false,
      blockedReason: sendResult.error ?? "agentmail send failed",
      headers: result.headers,
    };
  }

  const threadId = sendResult.threadId ?? sendResult.messageId ?? null;

  // State transition: recipient-approved → thread-sent
  const sentCard = { ...scrubbedCard, state: "thread-sent" as const };
  const transcript = (intro.transcript ?? []) as readonly unknown[];
  const updatedTranscript = transcript.map((block) => {
    if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "intro-proposal-card"
    ) {
      return sentCard;
    }
    return block;
  }) as ContentBlock[];

  await db
    .update(networkSchema.introductions)
    .set({
      state: "thread-sent",
      threadSentAt: now,
      threadMessageId: threadId,
      transcript: updatedTranscript,
      updatedAt: now,
    })
    .where(eq(networkSchema.introductions.id, intro.id));

  await writeNetworkAuditEvent({
    db,
    stepRunId,
    eventClass: "intro_thread_sent",
    subjectType: "introduction",
    subjectId: intro.id,
    actorType: "system",
    actorId: "mira",
    reasonCode: null,
    metadata: {
      byParty: "system",
      threadMessageId: threadId,
      scrubWithheld: scrubDecision.withheldTotal,
    },
    now,
  });

  return {
    ok: true,
    subject: result.subject,
    body: result.body,
    headers: result.headers,
    threadMessageId: threadId ?? undefined,
  };
}
