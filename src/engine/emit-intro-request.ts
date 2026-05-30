import { randomUUID } from "crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { AuthorizationRequestBlock, AuthorizationResult, ContentBlock } from "./content-blocks";
import { requireNetworkStepRunId } from "./network-step-run";
import { queueWorkspaceInboxDelivery } from "./workspace-inbox-delivery";

type NetworkDbHandle = PostgresJsDatabase<typeof networkSchema>;

export const EMIT_INTRO_REQUEST_TOOL_NAME = "emit_intro_request";

export const INTRO_COST_LABELS = {
  first: "1st of 2 free intros (1 left after this)",
  second: "2nd of 2 free intros (last free one)",
  review: "Request will be reviewed (free tier ends here in v1)",
} as const;

export const INTRO_REFUSAL_COPY: Record<networkSchema.IntroductionRefusalReason, string> = {
  "anti-persona":
    "This isn't a fit on their side - they're pickier on this dimension than the listing suggests.",
  "low-fit":
    "From what I can see, the fit is too thin - I don't want to send this and have it land cold.",
  "user-block": "I'm not the right person to introduce on this one.",
  "rate-limit": "You've sent a lot of intro requests recently - give it a beat and come back.",
};

export const INTRO_COUNTER_STATES = [
  "queued",
  "approved",
  "fulfilled",
  "queued-for-review",
] as const satisfies networkSchema.IntroductionState[];

export const INTRO_RATE_LIMIT_MAX_REQUESTS = 5;
export const INTRO_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "can",
  "could",
  "does",
  "for",
  "from",
  "have",
  "into",
  "like",
  "only",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "want",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

export interface EmitIntroRequestInput {
  db?: NetworkDbHandle;
  stepRunId?: string | null;
  originContext: networkSchema.IntroductionOriginContext;
  targetUserId: string;
  targetDisplayName?: string | null;
  requesterUserId?: string | null;
  visitorSessionId?: string | null;
  requesterDisplayName?: string | null;
  requesterOrgLabel?: string | null;
  intentSummary: string;
  transcript?: ContentBlock[] | null;
  draft?: string | null;
  matchConfidence?: number | "high" | "medium" | "low" | null;
  now?: Date;
}

export interface EmitIntroRequestResult {
  block: AuthorizationRequestBlock;
  introduction: typeof networkSchema.introductions.$inferSelect;
  delivery: typeof networkSchema.networkWorkspaceDeliveries.$inferSelect | null;
  eventId: number | null;
}

export interface BlockListEntryInput {
  db?: NetworkDbHandle;
  targetUserId: string;
  kind: networkSchema.NetworkUserBlockListKind;
  blockedRequesterIdentifier: string;
  reason?: string | null;
  now?: Date;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function requesterKey(input: Pick<EmitIntroRequestInput, "requesterUserId" | "visitorSessionId">): {
  column: "requesterUserId" | "visitorSessionId";
  value: string;
} {
  const requesterUserId = input.requesterUserId?.trim();
  if (requesterUserId) return { column: "requesterUserId", value: requesterUserId };
  const visitorSessionId = input.visitorSessionId?.trim();
  if (visitorSessionId) return { column: "visitorSessionId", value: visitorSessionId };
  throw new Error("emit_intro_request requires requesterUserId or visitorSessionId");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/s$/, ""))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a);
  let count = 0;
  for (const token of b) {
    if (set.has(token)) count += 1;
  }
  return count;
}

function antiPersonaMatches(intentSummary: string, ruleMd: string): boolean {
  const intentTokens = tokenize(intentSummary);
  const ruleTokens = tokenize(ruleMd).filter((token) => token !== "never" && token !== "dont");
  if (ruleTokens.length === 0) return false;
  const score = overlapCount(intentTokens, ruleTokens);
  return score >= Math.min(3, Math.max(2, Math.ceil(ruleTokens.length * 0.3)));
}

function confidenceScore(value: EmitIntroRequestInput["matchConfidence"]): number {
  if (typeof value === "number") return value;
  if (value === "high") return 0.9;
  if (value === "medium") return 0.65;
  if (value === "low") return 0.3;
  return 0.75;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function simpleWildcardMatch(pattern: string, value: string): boolean {
  if (!isValidBlockListPattern(pattern)) return false;
  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`, "i");
  return regex.test(value);
}

export function isValidBlockListPattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  const forbidden = new Set(["?", "(", ")", "[", "]", "\\", "^", "$", "+", "{", "}"]);
  return [...trimmed].every((char) => !forbidden.has(char));
}

function validateBlockListIdentifier(
  kind: networkSchema.NetworkUserBlockListKind,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("block list identifier is required");
  if (kind === "pattern" && !isValidBlockListPattern(trimmed)) {
    throw new Error("block list pattern must be a simple wildcard under 255 chars");
  }
  if (trimmed.length > 254) {
    throw new Error("block list identifier must be at most 254 chars");
  }
  return trimmed;
}

export async function insertNetworkUserBlockListEntry({
  db = networkDb,
  targetUserId,
  kind,
  blockedRequesterIdentifier,
  reason,
  now = new Date(),
}: BlockListEntryInput): Promise<typeof networkSchema.networkUserBlockList.$inferSelect> {
  const identifier = validateBlockListIdentifier(kind, blockedRequesterIdentifier);
  const [row] = await db
    .insert(networkSchema.networkUserBlockList)
    .values({
      targetUserId,
      kind,
      blockedRequesterIdentifier: identifier,
      reason: reason?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

async function requesterHasUserBlock(
  db: NetworkDbHandle,
  input: EmitIntroRequestInput,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(networkSchema.networkUserBlockList)
    .where(eq(networkSchema.networkUserBlockList.targetUserId, input.targetUserId));
  if (rows.length === 0) return false;

  const exactValues = new Set(
    [
      input.requesterUserId,
      input.visitorSessionId,
      input.requesterDisplayName,
      input.requesterOrgLabel,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  const searchableValues = [
    ...exactValues,
    input.intentSummary,
  ].map((value) => value.toLowerCase());

  return rows.some((row) => {
    const identifier = row.blockedRequesterIdentifier.trim();
    if (row.kind === "workspace-user") return Boolean(input.requesterUserId && identifier === input.requesterUserId);
    if (row.kind === "visitor-session") return Boolean(input.visitorSessionId && identifier === input.visitorSessionId);
    return searchableValues.some((value) => simpleWildcardMatch(identifier, value));
  });
}

async function refusalReason(
  db: NetworkDbHandle,
  input: EmitIntroRequestInput,
  now: Date,
): Promise<networkSchema.IntroductionRefusalReason | null> {
  const [antiPersonaRows, blocked] = await Promise.all([
    db
      .select({ ruleMd: networkSchema.networkUserAntiPersona.ruleMd })
      .from(networkSchema.networkUserAntiPersona)
      .where(
        and(
          eq(networkSchema.networkUserAntiPersona.userId, input.targetUserId),
          eq(networkSchema.networkUserAntiPersona.status, "active"),
        ),
      ),
    requesterHasUserBlock(db, input),
  ]);
  if (antiPersonaRows.some((row) => antiPersonaMatches(input.intentSummary, row.ruleMd))) {
    return "anti-persona";
  }
  if (confidenceScore(input.matchConfidence) < 0.5) {
    return "low-fit";
  }
  if (blocked) {
    return "user-block";
  }

  const requester = requesterKey(input);
  const since = new Date(now.getTime() - INTRO_RATE_LIMIT_WINDOW_MS);
  const rows = await db
    .select({ id: networkSchema.introductions.id })
    .from(networkSchema.introductions)
    .where(
      and(
        requester.column === "requesterUserId"
          ? eq(networkSchema.introductions.requesterUserId, requester.value)
          : eq(networkSchema.introductions.visitorSessionId, requester.value),
        gte(networkSchema.introductions.createdAt, since),
      ),
    )
    .limit(INTRO_RATE_LIMIT_MAX_REQUESTS);
  if (rows.length >= INTRO_RATE_LIMIT_MAX_REQUESTS) {
    return "rate-limit";
  }
  return null;
}

async function usedIntroCount(db: NetworkDbHandle, input: EmitIntroRequestInput): Promise<number> {
  const requester = requesterKey(input);
  const rows = await db
    .select({ id: networkSchema.introductions.id })
    .from(networkSchema.introductions)
    .where(
      and(
        requester.column === "requesterUserId"
          ? eq(networkSchema.introductions.requesterUserId, requester.value)
          : eq(networkSchema.introductions.visitorSessionId, requester.value),
        inArray(networkSchema.introductions.state, INTRO_COUNTER_STATES),
      ),
    );
  return rows.length;
}

function labelForCount(count: number): {
  costLabel: string;
  state: "queued" | "queued-for-review";
} {
  if (count === 0) return { costLabel: INTRO_COST_LABELS.first, state: "queued" };
  if (count === 1) return { costLabel: INTRO_COST_LABELS.second, state: "queued" };
  return { costLabel: INTRO_COST_LABELS.review, state: "queued-for-review" };
}

function requesterLabel(input: EmitIntroRequestInput): string {
  if (input.requesterDisplayName && input.requesterOrgLabel) {
    return `${input.requesterDisplayName} at ${input.requesterOrgLabel}`;
  }
  if (input.requesterDisplayName) return input.requesterDisplayName;
  if (input.requesterOrgLabel) return `Someone at ${input.requesterOrgLabel}`;
  if (input.requesterUserId) return input.requesterUserId;
  return input.visitorSessionId ?? "anonymous visitor";
}

function composeDraft(input: EmitIntroRequestInput): string {
  const target = input.targetDisplayName?.trim() || "there";
  return [
    `Hi ${target} - ${requesterLabel(input)} asked for an introduction through Ditto.`,
    "",
    `Their ask: ${input.intentSummary}`,
    "",
    "The request context is attached below so you can decide whether this should go out.",
  ].join("\n");
}

function introPreviewBlocks(input: EmitIntroRequestInput, draft: string): ContentBlock[] {
  return [
    {
      type: "text",
      variant: "body",
      text: `Draft intro request\n\n${draft}`,
    },
    {
      type: "data",
      format: "key_value",
      title: "Requester",
      data: {
        requesterId: input.requesterUserId ?? input.visitorSessionId ?? "anonymous",
        name: input.requesterDisplayName || "anonymous requester",
        organization: input.requesterOrgLabel || "",
        origin: input.originContext,
      },
    },
    ...(input.transcript ?? []),
  ];
}

function buildBlock({
  input,
  authorizationId,
  draft,
  state,
  costLabel,
  executionResult,
}: {
  input: EmitIntroRequestInput;
  authorizationId: string;
  draft: string;
  state: AuthorizationRequestBlock["state"];
  costLabel: string | null;
  executionResult: AuthorizationResult | null;
}): AuthorizationRequestBlock {
  const target = input.targetDisplayName?.trim() || "the profile owner";
  const request = `Intro request for ${target}: ${cleanText(input.intentSummary).slice(0, 220)}`;
  return {
    type: "authorization-request",
    state,
    header: `Intro request for ${target}`,
    recipientLabel: target,
    actionClass: "email-send",
    executionResult,
    expiresAt: null,
    authorizationId,
    request,
    draft,
    requesterId: input.requesterUserId ?? input.visitorSessionId ?? "anonymous",
    preview: introPreviewBlocks(input, draft),
    costLabel,
    toolName: "visitor_intro_request",
    toolInput: {
      request,
      draft,
      requesterId: input.requesterUserId ?? input.visitorSessionId ?? "anonymous",
      requesterDisplayName: input.requesterDisplayName ?? null,
      requesterOrgLabel: input.requesterOrgLabel ?? null,
      originContext: input.originContext,
      intentSummary: input.intentSummary,
    },
  };
}

export async function emitIntroRequest({
  db = networkDb,
  stepRunId,
  now = new Date(),
  ...input
}: EmitIntroRequestInput): Promise<EmitIntroRequestResult> {
  const resolvedStepRunId = requireNetworkStepRunId(stepRunId, EMIT_INTRO_REQUEST_TOOL_NAME, {
    rejectWebDirect: true,
  });
  const intentSummary = cleanText(input.intentSummary);
  if (!intentSummary) {
    throw new Error("emit_intro_request requires intentSummary");
  }
  requesterKey(input);

  const authorizationId = `intro-${randomUUID()}`;
  const refusal = await refusalReason(db, { ...input, intentSummary }, now);
  const draft = cleanText(input.draft ?? "") || composeDraft({ ...input, intentSummary });

  if (refusal) {
    const block = buildBlock({
      input: { ...input, intentSummary },
      authorizationId,
      draft,
      state: "rejected",
      costLabel: null,
      executionResult: {
        status: "failed",
        reasonForVisitor: INTRO_REFUSAL_COPY[refusal],
        reasonForLog: refusal,
      },
    });
    const [introduction] = await db
      .insert(networkSchema.introductions)
      .values({
        targetUserId: input.targetUserId,
        requesterUserId: input.requesterUserId?.trim() || null,
        visitorSessionId: input.visitorSessionId?.trim() || null,
        requesterDisplayName: input.requesterDisplayName?.trim() || null,
        requesterOrgLabel: input.requesterOrgLabel?.trim() || null,
        originContext: input.originContext,
        intentSummary,
        draft,
        costLabel: null,
        authorizationId,
        authorizationBlock: block,
        transcript: input.transcript ?? null,
        state: "refused-by-greeter",
        refusalReason: refusal,
        sourceStepRunId: resolvedStepRunId,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { block, introduction, delivery: null, eventId: null };
  }

  const count = await usedIntroCount(db, { ...input, intentSummary });
  const counter = labelForCount(count);
  const block = buildBlock({
    input: { ...input, intentSummary },
    authorizationId,
    draft,
    state: "pending",
    costLabel: counter.costLabel,
    executionResult: null,
  });
  const [introduction] = await db
    .insert(networkSchema.introductions)
    .values({
      targetUserId: input.targetUserId,
      requesterUserId: input.requesterUserId?.trim() || null,
      visitorSessionId: input.visitorSessionId?.trim() || null,
      requesterDisplayName: input.requesterDisplayName?.trim() || null,
      requesterOrgLabel: input.requesterOrgLabel?.trim() || null,
      originContext: input.originContext,
      intentSummary,
      draft,
      costLabel: counter.costLabel,
      authorizationId,
      authorizationBlock: block,
      transcript: input.transcript ?? null,
      state: counter.state,
      refusalReason: null,
      sourceStepRunId: resolvedStepRunId,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const delivery = await queueWorkspaceInboxDelivery({
    db,
    userId: input.targetUserId,
    kind: "visitor_intro_request",
    blocks: [block],
    stepRunId: resolvedStepRunId,
    dedupeKey: `intro:${authorizationId}`,
    now,
  });

  return {
    block,
    introduction,
    delivery: delivery.delivery,
    eventId: delivery.eventId,
  };
}

export function introductionStateForAuthorizationEvent(
  event: "send-it" | "edit-first" | "not-yet" | "expired" | "retry",
): networkSchema.IntroductionState | null {
  if (event === "send-it" || event === "retry") return "approved";
  if (event === "not-yet") return "rejected";
  if (event === "expired") return "expired";
  return null;
}

export async function updateIntroductionStateForAuthorization({
  db = networkDb,
  authorizationId,
  event,
  now = new Date(),
}: {
  db?: NetworkDbHandle;
  authorizationId: string;
  event: "send-it" | "edit-first" | "not-yet" | "expired" | "retry";
  now?: Date;
}): Promise<typeof networkSchema.introductions.$inferSelect | null> {
  const state = introductionStateForAuthorizationEvent(event);
  if (!state) return null;
  const [row] = await db
    .update(networkSchema.introductions)
    .set({ state, updatedAt: now })
    .where(
      and(
        eq(networkSchema.introductions.authorizationId, authorizationId),
        or(
          eq(networkSchema.introductions.state, "queued"),
          eq(networkSchema.introductions.state, "queued-for-review"),
        ),
      ),
    )
    .returning();
  return row ?? null;
}
