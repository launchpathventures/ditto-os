/**
 * Intro Feedback — reply ingestion and outcome fan-out (Brief 289)
 *
 * Feedback is append-only. The introduction row records coarse lifecycle
 * timestamps, while `network_intro_feedback` preserves each human signal.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { writeNetworkAuditEvent } from "./network-audit";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;
type IntroRow = typeof networkSchema.introductions.$inferSelect;
type FeedbackRow = typeof networkSchema.networkIntroFeedback.$inferSelect;

export const RECORD_INTRO_FEEDBACK_TOOL_NAME = "record_intro_feedback";
export const FAN_OUT_INTRO_FEEDBACK_TOOL_NAME = "fan_out_intro_feedback";

const TERMINAL_OUTCOME_CATEGORIES = new Set([
  "outcome:useful",
  "outcome:not-useful",
]);

const DECLINE_CATEGORY_PREFIX = "decline:";

export interface RecordIntroFeedbackPayload {
  eventType: networkSchema.IntroFeedbackEventType;
  classifiedCategory: networkSchema.IntroFeedbackClassifiedCategory;
  freeText?: string | null;
  outcomeClass?: networkSchema.IntroOutcomeClass | null;
  outcomeAmountCents?: number | null;
  sourceMessageId?: string | null;
}

export interface RecordIntroFeedbackInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  introId: string;
  party: networkSchema.IntroFeedbackParty;
  payload: RecordIntroFeedbackPayload;
  now?: Date;
  fanOut?: boolean;
}

export interface RecordIntroFeedbackResult {
  feedback: FeedbackRow;
  introduction: IntroRow;
  auditEventId: string;
  fanOutApplied: boolean;
}

function metadata(input: IntroRow): Record<string, unknown> {
  return { ...((input.metadata as Record<string, unknown> | null) ?? {}) };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function partyUserId(
  intro: IntroRow,
  party: networkSchema.IntroFeedbackParty,
): string | null {
  if (party === "requester") return intro.requesterUserId ?? null;
  return intro.recipientUserId ?? intro.targetUserId ?? null;
}

function workspaceMetricId(intro: IntroRow): string {
  return intro.requesterUserId ?? intro.targetUserId;
}

function periodStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function loadIntro(
  db: NetworkDbHandle,
  introId: string,
): Promise<IntroRow> {
  const [intro] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, introId))
    .limit(1);
  if (!intro) {
    throw new Error(`${RECORD_INTRO_FEEDBACK_TOOL_NAME}: introduction ${introId} not found`);
  }
  return intro;
}

function nextIntroPatch(
  intro: IntroRow,
  payload: RecordIntroFeedbackPayload,
  now: Date,
): Partial<typeof networkSchema.introductions.$inferInsert> {
  const patch: Partial<typeof networkSchema.introductions.$inferInsert> = {
    lastClassifiedReplyAt: now,
    updatedAt: now,
  };
  if (TERMINAL_OUTCOME_CATEGORIES.has(payload.classifiedCategory)) {
    patch.state = "feedback-collected";
    patch.feedbackCollectedAt = now;
    return patch;
  }
  if (payload.classifiedCategory === "outcome:no-outcome-yet") {
    const existing = metadata(intro);
    const retryCount =
      typeof existing.followUpRetryCount === "number"
        ? existing.followUpRetryCount
        : 0;
    if (retryCount < 1) {
      patch.metadata = {
        ...existing,
        followUpRetryCount: retryCount + 1,
        followUpRetryScheduledAt: addDays(now, 30).toISOString(),
      };
    }
  }
  return patch;
}

export async function recordIntroFeedback(
  input: RecordIntroFeedbackInput,
): Promise<RecordIntroFeedbackResult> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    RECORD_INTRO_FEEDBACK_TOOL_NAME,
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const intro = await loadIntro(db, input.introId);

  const [feedback] = await db
    .insert(networkSchema.networkIntroFeedback)
    .values({
      introId: intro.id,
      party: input.party,
      eventType: input.payload.eventType,
      classifiedCategory: input.payload.classifiedCategory,
      freeText: input.payload.freeText?.trim() || null,
      outcomeClass: input.payload.outcomeClass ?? null,
      outcomeAmountCents: input.payload.outcomeAmountCents ?? null,
      sourceStepRunId: stepRunId,
      sourceMessageId: input.payload.sourceMessageId ?? null,
      createdAt: now,
    })
    .returning();

  const [updatedIntro] = await db
    .update(networkSchema.introductions)
    .set(nextIntroPatch(intro, input.payload, now))
    .where(eq(networkSchema.introductions.id, intro.id))
    .returning();

  const auditRow = await writeNetworkAuditEvent({
    db,
    stepRunId,
    eventClass: "intro_feedback_recorded",
    subjectType: "introduction",
    subjectId: intro.id,
    actorType: "user",
    actorId: partyUserId(intro, input.party),
    reasonCode: input.payload.classifiedCategory,
    metadata: {
      byParty: input.party,
      feedbackId: feedback.id,
      eventType: input.payload.eventType,
      outcomeClass: input.payload.outcomeClass ?? null,
    },
    now,
  });

  let fanOutApplied = false;
  if (input.fanOut !== false) {
    await fanOutIntroFeedback({
      db,
      stepRunId,
      feedbackRowId: feedback.id,
      now,
    });
    fanOutApplied = true;
  }

  return {
    feedback,
    introduction: updatedIntro,
    auditEventId: auditRow.id,
    fanOutApplied,
  };
}

export interface FanOutIntroFeedbackInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  feedbackRowId: string;
  now?: Date;
}

async function ensureMemberSignal(
  db: NetworkDbHandle,
  userId: string,
  now: Date,
): Promise<typeof networkSchema.networkMemberSignals.$inferSelect> {
  const [existing] = await db
    .select()
    .from(networkSchema.networkMemberSignals)
    .where(eq(networkSchema.networkMemberSignals.userId, userId))
    .limit(1);
  if (existing) return existing;
  await db
    .insert(networkSchema.networkMemberSignals)
    .values({ userId, status: "draft", sourceSummary: null, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(networkSchema.networkMemberSignals)
    .where(eq(networkSchema.networkMemberSignals.userId, userId))
    .limit(1);
  if (!created) throw new Error("failed to create member signal for intro feedback");
  return created;
}

async function addUsefulSignalClaim(
  db: NetworkDbHandle,
  intro: IntroRow,
  feedback: FeedbackRow,
  now: Date,
): Promise<void> {
  const userId = intro.requesterUserId ?? intro.targetUserId;
  const signal = await ensureMemberSignal(db, userId, now);
  const [source] = await db
    .insert(networkSchema.networkSignalSources)
    .values({
      memberSignalId: signal.id,
      userId,
      sourceType: "inference",
      sourceLabel: "Intro outcome feedback",
      status: "found",
      evidenceSnippet: feedback.freeText ?? feedback.classifiedCategory,
      confidence: "medium",
      metadata: { introId: intro.id, feedbackId: feedback.id },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(networkSchema.networkSignalClaims).values({
    memberSignalId: signal.id,
    userId,
    sourceId: source.id,
    section: "canHelpWith",
    claimText: `Intro outcome feedback: ${feedback.outcomeClass ?? "useful"} introduction was useful.`,
    sourceType: "inference",
    sourceLabel: "Intro outcome feedback",
    evidenceSnippet: feedback.freeText ?? "Useful intro outcome recorded.",
    confidence: "medium",
    visibility: "private",
    approvalState: "suggested",
    metadata: { introId: intro.id, feedbackId: feedback.id },
    createdAt: now,
    updatedAt: now,
  });
}

async function addAntiPersonaSignal(
  db: NetworkDbHandle,
  intro: IntroRow,
  feedback: FeedbackRow,
  now: Date,
): Promise<void> {
  const userId = partyUserId(intro, feedback.party);
  if (!userId) return;
  const rule = feedback.freeText?.trim()
    ? `${feedback.classifiedCategory}: ${feedback.freeText.trim()}`
    : feedback.classifiedCategory;
  await db.insert(networkSchema.networkUserAntiPersona).values({
    userId,
    ruleMd: rule,
    status: "active",
    storagePath: `intro-feedback/${feedback.id}.md`,
    metadata: { introId: intro.id, feedbackId: feedback.id },
    createdAt: now,
    updatedAt: now,
  });

  const requestId =
    typeof (intro.metadata as Record<string, unknown> | null)?.requestId ===
    "string"
      ? ((intro.metadata as Record<string, unknown>).requestId as string)
      : null;
  if (requestId) {
    const [request] = await db
      .select()
      .from(networkSchema.networkJobRequests)
      .where(eq(networkSchema.networkJobRequests.id, requestId))
      .limit(1);
    if (request) {
      const existing = request.badFit?.trim();
      const next = existing ? `${existing}\n${rule}` : rule;
      await db
        .update(networkSchema.networkJobRequests)
        .set({ badFit: next, updatedAt: now })
        .where(eq(networkSchema.networkJobRequests.id, requestId));
    }
  }
}

async function incrementOutcomeMetric(
  db: NetworkDbHandle,
  intro: IntroRow,
  feedback: FeedbackRow,
  now: Date,
): Promise<void> {
  const usefulInc = feedback.classifiedCategory === "outcome:useful" ? 1 : 0;
  const notUsefulInc =
    feedback.classifiedCategory === "outcome:not-useful" ? 1 : 0;
  const noOutcomeYetInc =
    feedback.classifiedCategory === "outcome:no-outcome-yet" ? 1 : 0;
  const outcomeClass = feedback.outcomeClass;
  const table = networkSchema.networkOutcomeMetrics;
  await db
    .insert(table)
    .values({
      workspaceId: workspaceMetricId(intro),
      periodStart: periodStart(now),
      usefulCount: usefulInc,
      notUsefulCount: notUsefulInc,
      noOutcomeYetCount: noOutcomeYetInc,
      advisoryCount: outcomeClass === "advisory" ? 1 : 0,
      hireCount: outcomeClass === "hire" ? 1 : 0,
      clientCount: outcomeClass === "client" ? 1 : 0,
      fundingCount: outcomeClass === "funding" ? 1 : 0,
      partnershipCount: outcomeClass === "partnership" ? 1 : 0,
      collaborationCount: outcomeClass === "collaboration" ? 1 : 0,
      noOutcomeCount: outcomeClass === "no-outcome" ? 1 : 0,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [table.workspaceId, table.periodStart],
      set: {
        usefulCount: sql`${table.usefulCount} + ${usefulInc}`,
        notUsefulCount: sql`${table.notUsefulCount} + ${notUsefulInc}`,
        noOutcomeYetCount: sql`${table.noOutcomeYetCount} + ${noOutcomeYetInc}`,
        advisoryCount: sql`${table.advisoryCount} + ${outcomeClass === "advisory" ? 1 : 0}`,
        hireCount: sql`${table.hireCount} + ${outcomeClass === "hire" ? 1 : 0}`,
        clientCount: sql`${table.clientCount} + ${outcomeClass === "client" ? 1 : 0}`,
        fundingCount: sql`${table.fundingCount} + ${outcomeClass === "funding" ? 1 : 0}`,
        partnershipCount: sql`${table.partnershipCount} + ${outcomeClass === "partnership" ? 1 : 0}`,
        collaborationCount: sql`${table.collaborationCount} + ${outcomeClass === "collaboration" ? 1 : 0}`,
        noOutcomeCount: sql`${table.noOutcomeCount} + ${outcomeClass === "no-outcome" ? 1 : 0}`,
        updatedAt: now,
      },
    });
}

export async function fanOutIntroFeedback(
  input: FanOutIntroFeedbackInput,
): Promise<{ applied: boolean; feedback: FeedbackRow }> {
  await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    FAN_OUT_INTRO_FEEDBACK_TOOL_NAME,
  );
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const [feedback] = await db
    .select()
    .from(networkSchema.networkIntroFeedback)
    .where(eq(networkSchema.networkIntroFeedback.id, input.feedbackRowId))
    .limit(1);
  if (!feedback) {
    throw new Error(`${FAN_OUT_INTRO_FEEDBACK_TOOL_NAME}: feedback ${input.feedbackRowId} not found`);
  }
  const [intro] = await db
    .select()
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, feedback.introId))
    .limit(1);
  if (!intro) {
    throw new Error(`${FAN_OUT_INTRO_FEEDBACK_TOOL_NAME}: introduction ${feedback.introId} not found`);
  }

  if (feedback.classifiedCategory === "outcome:useful" && feedback.outcomeClass) {
    await addUsefulSignalClaim(db, intro, feedback, now);
  }
  if (
    feedback.classifiedCategory.startsWith(DECLINE_CATEGORY_PREFIX) ||
    feedback.classifiedCategory === "outcome:not-useful"
  ) {
    await addAntiPersonaSignal(db, intro, feedback, now);
  }
  if (feedback.classifiedCategory.startsWith("outcome:")) {
    await incrementOutcomeMetric(db, intro, feedback, now);
  }

  return { applied: true, feedback };
}

export function isAmbiguousIntroFeedback(
  category: networkSchema.IntroFeedbackClassifiedCategory,
): boolean {
  return category === "ambiguous";
}

export const INTRO_FEEDBACK_CATEGORIES =
  networkSchema.introFeedbackClassifiedCategoryValues;
export const INTRO_FEEDBACK_EVENT_TYPES =
  networkSchema.introFeedbackEventTypeValues;
export const INTRO_OUTCOME_CLASSES = networkSchema.introOutcomeClassValues;
