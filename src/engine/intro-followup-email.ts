/**
 * Intro Follow-Up Email (Brief 289)
 *
 * Sends the 14-day outcome prompt to one party after the warm intro thread.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { notifyUser, type NotifyResult } from "./notify-user";
import { classifyAndPrepare } from "./network-email-compliance";
import { requireNetworkStepRunId } from "./network-step-run";
import {
  buildIntroDecisionUrl,
  createIntroMagicLinkToken,
} from "./intro-proposal";
import { renderFollowUpEmail } from "./intro-email-templates";
import { createAgentMailAdapterForPersona } from "./channel";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;
type IntroRow = typeof networkSchema.introductions.$inferSelect;

export const SEND_FOLLOW_UP_EMAIL_TOOL_NAME = "send_follow_up_email";

export interface SendFollowUpEmailInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  party: networkSchema.IntroFeedbackParty;
  now?: Date;
  notify?: typeof notifyUser;
  compliance?: typeof classifyAndPrepare;
}

export interface SendFollowUpEmailResult {
  ok: boolean;
  blockedReason?: string;
  subject?: string;
  body?: string;
  headers?: Record<string, string>;
  notifyResult?: NotifyResult;
}

function firstName(value: string | null | undefined, fallback: string): string {
  const clean = value?.trim();
  if (!clean) return fallback;
  return clean.split(/\s+/)[0] || fallback;
}

function workspaceSender(handle: string | null | undefined): string {
  const clean = (handle ?? "network").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `mira@${clean || "network"}.ditto.partners`;
}

function introLabel(intro: IntroRow): string {
  if (intro.threadMessageId) return `intro thread ${intro.threadMessageId}`;
  return intro.intentSummary || "the intro";
}

function outcomeUrl(
  introId: string,
  party: networkSchema.IntroFeedbackParty,
  token: string,
  category: networkSchema.IntroFeedbackClassifiedCategory,
): string {
  const url = new URL(buildIntroDecisionUrl(introId, token, party));
  url.searchParams.set("feedback", category);
  return url.toString();
}

async function loadUser(
  db: NetworkDbHandle,
  userId: string,
): Promise<typeof networkSchema.networkUsers.$inferSelect | null> {
  const [user] = await db
    .select()
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.id, userId))
    .limit(1);
  return user ?? null;
}

export async function sendFollowUpEmail(
  input: SendFollowUpEmailInput,
): Promise<SendFollowUpEmailResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    SEND_FOLLOW_UP_EMAIL_TOOL_NAME,
    { rejectWebDirect: true },
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const [intro] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, input.introId))
    .limit(1);
  if (!intro) throw new Error(`${SEND_FOLLOW_UP_EMAIL_TOOL_NAME}: introduction ${input.introId} not found`);
  if (intro.state !== "thread-sent") {
    return { ok: false, blockedReason: `intro not in 'thread-sent' state (was ${intro.state})` };
  }

  const requester = intro.requesterUserId
    ? await loadUser(db, intro.requesterUserId)
    : null;
  const recipient = intro.recipientUserId
    ? await loadUser(db, intro.recipientUserId)
    : null;
  const partyUser = input.party === "requester" ? requester : recipient;
  if (input.party === "requester" && !partyUser) {
    return { ok: false, blockedReason: "requester user not found" };
  }
  const recipientEmail =
    input.party === "recipient"
      ? partyUser?.email ?? intro.recipientEmail
      : partyUser?.email;
  if (!recipientEmail) {
    return { ok: false, blockedReason: `${input.party} email not found` };
  }

  const token = createIntroMagicLinkToken({
    introId: intro.id,
    party: input.party,
    email: recipientEmail,
    now,
  }).token;
  const { subject, body } = renderFollowUpEmail({
    recipientFirstName: firstName(
      partyUser?.name,
      recipientEmail.split("@")[0] || "there",
    ),
    introSubjectLabel: introLabel(intro),
    usefulUrl: outcomeUrl(intro.id, input.party, token, "outcome:useful"),
    notUsefulUrl: outcomeUrl(intro.id, input.party, token, "outcome:not-useful"),
    noOutcomeYetUrl: outcomeUrl(intro.id, input.party, token, "outcome:no-outcome-yet"),
  });

  const from = workspaceSender(requester?.handle ?? requester?.workspaceId);
  const compliance = input.compliance ?? classifyAndPrepare;
  const prepared = await compliance({
    db,
    stepRunId,
    kind: "intro",
    to: recipientEmail,
    subject,
    body,
    scope: "global",
    scopeUserId: partyUser?.id ?? intro.requesterUserId ?? intro.targetUserId,
    fromOverride: from,
    replyToOverride: from,
    config: {
      defaultFrom: from,
      defaultReplyTo: from,
      allowedMailboxes: [from],
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://ditto.partners"}/api/v1/network/unsubscribe`,
    },
    now,
  });
  if (!prepared.ok) {
    return {
      ok: false,
      blockedReason: prepared.blockedReason,
      headers: prepared.headers,
    };
  }

  const notify = input.notify ?? notifyUser;
  if (!partyUser && input.party === "recipient") {
    const sender = createAgentMailAdapterForPersona("mira");
    if (!sender) {
      return {
        ok: false,
        blockedReason: "Mira AgentMail adapter unavailable",
        subject: prepared.subject,
        body: prepared.body,
        headers: prepared.headers,
      };
    }
    const sendResult = await sender.send({
      to: recipientEmail,
      subject: prepared.subject,
      body: prepared.body,
      personaId: "mira",
      mode: "connecting",
      inReplyToMessageId: intro.threadMessageId ?? undefined,
      includeOptOut: false,
      headers: prepared.headers,
    });
    return {
      ok: sendResult.success,
      blockedReason: sendResult.error,
      subject: prepared.subject,
      body: prepared.body,
      headers: prepared.headers,
      notifyResult: sendResult.success
        ? {
            success: true,
            channel: "email",
            messageId: sendResult.messageId,
            threadId: sendResult.threadId,
          }
        : undefined,
    };
  }
  const notifyResult = await notify({
    userId: partyUser!.id,
    personId: partyUser!.personId ?? partyUser!.id,
    subject: prepared.subject,
    body: prepared.body,
    personaId: "mira",
    mode: "connecting",
    inReplyToMessageId: intro.threadMessageId ?? undefined,
    includeOptOut: false,
    headers: prepared.headers,
  });
  if (!notifyResult.success) {
    return {
      ok: false,
      blockedReason: notifyResult.error ?? "notify_failed",
      subject: prepared.subject,
      body: prepared.body,
      headers: prepared.headers,
      notifyResult,
    };
  }
  return {
    ok: true,
    subject: prepared.subject,
    body: prepared.body,
    headers: prepared.headers,
    notifyResult,
  };
}
