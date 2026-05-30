import { and, desc, eq, or, type SQL } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import type { NetworkDbLike } from "./network-kb-storage";
import type { NeedRequestDraft, NeedRequestIdentity } from "./need-request-calibration";
import { draftNeedRequestFromText } from "./need-request-calibration";
import type { JobRequestCardBlock } from "./content-blocks";

export const UPDATE_NEED_REQUEST_TOOL_NAME = "update_need_request";

type RequestRow = typeof networkSchema.networkJobRequests.$inferSelect;
type RequestInsert = typeof networkSchema.networkJobRequests.$inferInsert;

export interface NeedRequestActor {
  userId?: string | null;
  visitorSessionId?: string | null;
  actorId?: string | null;
}

export interface SaveNeedRequestInput extends NeedRequestActor {
  db?: NetworkDbLike;
  requestId?: string | null;
  draft: NeedRequestDraft;
  status?: networkSchema.NetworkJobRequestStatus;
  mode?: networkSchema.NetworkRequestMode;
  identity?: NeedRequestIdentity | null;
  stepRunId?: string | null;
  now?: Date;
}

export interface ListNeedRequestsInput extends NeedRequestActor {
  db?: NetworkDbLike;
  limit?: number;
}

export interface UpdateNeedRequestStateInput extends NeedRequestActor {
  db?: NetworkDbLike;
  requestId: string;
  action: "pause" | "resume" | "close" | "fulfill";
  stepRunId?: string | null;
  now?: Date;
}

export interface RequestHandoff {
  requestId: string;
  mode: networkSchema.NetworkRequestMode;
  search?: Record<string, unknown> | null;
  watch?: Record<string, unknown> | null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const clean = value?.trim();
    if (clean) return clean;
  }
  return null;
}

function scrubPublicText(value: string | null | undefined, draft: NeedRequestDraft): string {
  let text = value ?? "";
  const privateValues = [
    draft.budgetPrivate,
    draft.privateNotes,
    draft.outcomeValueHint ?? "",
  ].filter((item) => item.trim().length > 0);
  for (const privateValue of privateValues) {
    const escaped = privateValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), "[private]");
  }
  return text.replace(/\s+/g, " ").trim();
}

export function buildNeedRequestPublicCopy(draft: NeedRequestDraft): string {
  return scrubPublicText(draft.shareableSummary, draft);
}

export function needRequestIdentityReadyForIntro(identity: NeedRequestIdentity | null | undefined): boolean {
  const email = identity?.email?.trim();
  const name = identity?.name?.trim();
  const org = identity?.orgSite?.trim();
  const credibility = identity?.credibility?.trim();
  return Boolean(email && name && (org || credibility));
}

function valuesFromDraft({
  draft,
  actor,
  status,
  mode,
  identity,
  now,
}: {
  draft: NeedRequestDraft;
  actor: NeedRequestActor;
  status: networkSchema.NetworkJobRequestStatus;
  mode: networkSchema.NetworkRequestMode;
  identity?: NeedRequestIdentity | null;
  now: Date;
}): RequestInsert {
  const requestIdentity = identity ?? draft.identity;
  return {
    userId: actor.userId ?? null,
    visitorSessionId: actor.visitorSessionId ?? null,
    jobRequestCard: draft.jobRequestCard,
    status,
    mode,
    rawNeed: draft.rawNeed,
    outcomeNeeded: draft.outcomeNeeded,
    idealPerson: draft.idealPerson,
    proofRequired: draft.proofRequired,
    badFit: draft.badFit,
    urgency: draft.urgency,
    geography: draft.geography,
    commercialShape: draft.commercialShape,
    successOutcome: draft.successOutcome,
    outcomeValueHint: draft.outcomeValueHint,
    budgetPrivate: draft.budgetPrivate,
    budgetShareableLabel: draft.budgetShareableLabel,
    shareableSummary: buildNeedRequestPublicCopy(draft),
    privateNotes: draft.privateNotes,
    sourcesAllowed: draft.sourcesAllowed,
    contactPolicy: draft.contactPolicy,
    requesterName: firstNonEmpty(requestIdentity?.name),
    requesterEmail: firstNonEmpty(requestIdentity?.email),
    requesterOrgSite: firstNonEmpty(requestIdentity?.orgSite),
    requesterCredibility: firstNonEmpty(requestIdentity?.credibility),
    searchHandoff: mode === "manual-search" || mode === "both"
      ? buildSearchHandoffPayload(draft)
      : null,
    watchHandoff: mode === "background-watch" || mode === "both"
      ? buildWatchHandoffPayload(draft)
      : null,
    createdAt: now,
    updatedAt: now,
  };
}

function eventForStatus(status: networkSchema.NetworkJobRequestStatus): networkSchema.NetworkRequestAuditEvent {
  if (status === "active" || status === "open") return "published";
  if (status === "paused") return "paused";
  if (status === "fulfilled") return "fulfilled";
  if (status === "closed") return "closed";
  return "created";
}

async function writeAudit({
  db,
  requestId,
  eventType,
  actorId,
  stepRunId,
  before,
  after,
  now,
}: {
  db: NetworkDbLike;
  requestId: string;
  eventType: networkSchema.NetworkRequestAuditEvent;
  actorId?: string | null;
  stepRunId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  now: Date;
}) {
  await db.insert(networkSchema.networkRequestAuditEvents).values({
    requestId,
    eventType,
    actorId: actorId ?? null,
    stepRunId,
    before: before ?? null,
    after: after ?? null,
    createdAt: now,
  });
}

export function buildSearchHandoffPayload(draft: NeedRequestDraft): Record<string, unknown> {
  return {
    kind: "active-request-search-input",
    query: buildNeedRequestPublicCopy(draft),
    outcomeNeeded: scrubPublicText(draft.outcomeNeeded, draft),
    idealPerson: scrubPublicText(draft.idealPerson, draft),
    proofRequired: scrubPublicText(draft.proofRequired, draft),
    geography: scrubPublicText(draft.geography, draft),
    commercialShape: scrubPublicText(draft.commercialShape, draft),
    sourcesAllowed: draft.sourcesAllowed,
    contactPolicy: draft.contactPolicy,
  };
}

export function buildWatchHandoffPayload(draft: NeedRequestDraft): Record<string, unknown> {
  return {
    kind: "active-request-watch-seed",
    outcomeNeeded: scrubPublicText(draft.outcomeNeeded, draft),
    idealPerson: scrubPublicText(draft.idealPerson, draft),
    proofRequired: scrubPublicText(draft.proofRequired, draft),
    badFit: scrubPublicText(draft.badFit, draft),
    geography: scrubPublicText(draft.geography, draft),
    urgency: draft.urgency,
    sourcesAllowed: draft.sourcesAllowed,
    contactPolicy: draft.contactPolicy,
  };
}

export async function saveNeedRequest(input: SaveNeedRequestInput): Promise<RequestRow> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const stepRunId = requireNetworkStepRunId(input.stepRunId, UPDATE_NEED_REQUEST_TOOL_NAME);
  const actor = {
    userId: input.userId ?? null,
    visitorSessionId: input.visitorSessionId ?? null,
  };
  const values = valuesFromDraft({
    draft: input.draft,
    actor,
    status: input.status ?? "draft",
    mode: input.mode ?? input.draft.mode,
    identity: input.identity,
    now,
  });

  if (input.requestId) {
    const [before] = await db
      .select()
      .from(networkSchema.networkJobRequests)
      .where(
        and(
          eq(networkSchema.networkJobRequests.id, input.requestId),
          actor.userId
            ? eq(networkSchema.networkJobRequests.userId, actor.userId)
            : eq(networkSchema.networkJobRequests.visitorSessionId, actor.visitorSessionId ?? ""),
        ),
      )
      .limit(1);
    if (!before) throw new Error("Active Request not found");
    const [updated] = await db
      .update(networkSchema.networkJobRequests)
      .set({ ...values, createdAt: before.createdAt, updatedAt: now })
      .where(eq(networkSchema.networkJobRequests.id, before.id))
      .returning();
    await writeAudit({
      db,
      requestId: updated.id,
      eventType: "updated",
      actorId: input.actorId,
      stepRunId,
      before: rowSnapshot(before),
      after: rowSnapshot(updated),
      now,
    });
    return updated;
  }

  const [created] = await db
    .insert(networkSchema.networkJobRequests)
    .values(values)
    .returning();
  await writeAudit({
    db,
    requestId: created.id,
    eventType: eventForStatus(created.status),
    actorId: input.actorId,
    stepRunId,
    after: rowSnapshot(created),
    now,
  });
  return created;
}

export async function updateNeedRequestState(input: UpdateNeedRequestStateInput): Promise<RequestRow> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const stepRunId = requireNetworkStepRunId(input.stepRunId, UPDATE_NEED_REQUEST_TOOL_NAME);
  const nextStatus: Record<UpdateNeedRequestStateInput["action"], networkSchema.NetworkJobRequestStatus> = {
    pause: "paused",
    resume: "active",
    close: "closed",
    fulfill: "fulfilled",
  };
  const eventType: Record<UpdateNeedRequestStateInput["action"], networkSchema.NetworkRequestAuditEvent> = {
    pause: "paused",
    resume: "resumed",
    close: "closed",
    fulfill: "fulfilled",
  };
  const [before] = await db
    .select()
    .from(networkSchema.networkJobRequests)
    .where(
      and(
        eq(networkSchema.networkJobRequests.id, input.requestId),
        input.userId
          ? eq(networkSchema.networkJobRequests.userId, input.userId)
          : eq(networkSchema.networkJobRequests.visitorSessionId, input.visitorSessionId ?? ""),
      ),
    )
    .limit(1);
  if (!before) throw new Error("Active Request not found");

  const [updated] = await db
    .update(networkSchema.networkJobRequests)
    .set({ status: nextStatus[input.action], updatedAt: now })
    .where(eq(networkSchema.networkJobRequests.id, before.id))
    .returning();
  await writeAudit({
    db,
    requestId: updated.id,
    eventType: eventType[input.action],
    actorId: input.actorId,
    stepRunId,
    before: rowSnapshot(before),
    after: rowSnapshot(updated),
    now,
  });
  return updated;
}

export async function listNeedRequests(input: ListNeedRequestsInput): Promise<RequestRow[]> {
  const db = input.db ?? networkDb;
  const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
  if (!input.userId && !input.visitorSessionId) return [];
  const conditions: SQL[] = [];
  if (input.userId) conditions.push(eq(networkSchema.networkJobRequests.userId, input.userId));
  if (input.visitorSessionId) {
    conditions.push(eq(networkSchema.networkJobRequests.visitorSessionId, input.visitorSessionId));
  }
  const where = conditions.length === 1 ? conditions[0] : or(...conditions);
  return db
    .select()
    .from(networkSchema.networkJobRequests)
    .where(where)
    .orderBy(desc(networkSchema.networkJobRequests.updatedAt))
    .limit(limit);
}

export async function draftAndSaveNeedRequest(input: {
  db?: NetworkDbLike;
  rawNeed: string;
  requesterContext?: NeedRequestIdentity | null;
  actor: NeedRequestActor;
  status?: networkSchema.NetworkJobRequestStatus;
  mode?: networkSchema.NetworkRequestMode;
  stepRunId?: string | null;
  now?: Date;
}): Promise<{ draft: NeedRequestDraft; request: RequestRow }> {
  const draft = draftNeedRequestFromText({
    rawNeed: input.rawNeed,
    requesterContext: input.requesterContext,
    now: input.now,
  });
  const request = await saveNeedRequest({
    db: input.db,
    draft,
    ...input.actor,
    status: input.status,
    mode: input.mode,
    identity: input.requesterContext,
    stepRunId: input.stepRunId,
    now: input.now,
  });
  return { draft, request };
}

function rowSnapshot(row: RequestRow): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.userId,
    visitorSessionId: row.visitorSessionId,
    status: row.status,
    mode: row.mode,
    outcomeNeeded: row.outcomeNeeded,
    idealPerson: row.idealPerson,
    proofRequired: row.proofRequired,
    geography: row.geography,
    commercialShape: row.commercialShape,
    successOutcome: row.successOutcome,
    shareableSummary: row.shareableSummary,
    sourcesAllowed: row.sourcesAllowed,
    contactPolicy: row.contactPolicy,
  };
}

export function activeRequestToJobRequestCard(row: RequestRow): JobRequestCardBlock {
  return row.jobRequestCard;
}
