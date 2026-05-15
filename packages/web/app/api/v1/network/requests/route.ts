import { NextResponse } from "next/server";
import type {
  NetworkJobRequestStatus,
  NetworkRequestContactPolicy,
  NetworkRequestMode,
  NetworkRequestSourcesAllowed,
} from "@ditto/core/db/network";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { draftNeedRequest } from "../../../../../../../src/engine/need-request-draft";
import {
  listNeedRequests,
  saveNeedRequest,
  updateNeedRequestState,
} from "../../../../../../../src/engine/need-request-storage";
import type {
  NeedRequestDraft,
  NeedRequestIdentity,
} from "../../../../../../../src/engine/need-request-calibration";
import { resolveNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NEED_LENGTH = 4_000;
const MODE_VALUES = new Set<NetworkRequestMode>(["manual-search", "background-watch", "both"]);
const SOURCES_VALUES = new Set<NetworkRequestSourcesAllowed>(["ditto-members", "public-web", "both"]);
const CONTACT_VALUES = new Set<NetworkRequestContactPolicy>([
  "ask-before-contact",
  "ask-before-intro",
  "never-contact-without-approval",
]);

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max = MAX_NEED_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

function nullableString(value: unknown, max = 1_000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function mode(value: unknown, fallback: NetworkRequestMode): NetworkRequestMode {
  return typeof value === "string" && MODE_VALUES.has(value as NetworkRequestMode)
    ? value as NetworkRequestMode
    : fallback;
}

function sources(value: unknown, fallback: NetworkRequestSourcesAllowed): NetworkRequestSourcesAllowed {
  return typeof value === "string" && SOURCES_VALUES.has(value as NetworkRequestSourcesAllowed)
    ? value as NetworkRequestSourcesAllowed
    : fallback;
}

function contactPolicy(value: unknown, fallback: NetworkRequestContactPolicy): NetworkRequestContactPolicy {
  return typeof value === "string" && CONTACT_VALUES.has(value as NetworkRequestContactPolicy)
    ? value as NetworkRequestContactPolicy
    : fallback;
}

function identityFrom(value: unknown): NeedRequestIdentity {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    name: typeof input.name === "string" ? input.name.trim() : null,
    email: typeof input.email === "string" ? input.email.trim().toLowerCase() : null,
    orgSite: typeof input.orgSite === "string" ? input.orgSite.trim() : null,
    credibility: typeof input.credibility === "string" ? input.credibility.trim() : null,
  };
}

function applyEditableFields(draft: NeedRequestDraft, value: unknown): NeedRequestDraft {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const next: NeedRequestDraft = {
    ...draft,
    outcomeNeeded: nullableString(input.outcomeNeeded) || draft.outcomeNeeded,
    idealPerson: nullableString(input.idealPerson) || draft.idealPerson,
    proofRequired: nullableString(input.proofRequired) || draft.proofRequired,
    badFit: nullableString(input.badFit) || draft.badFit,
    urgency: nullableString(input.urgency) || draft.urgency,
    geography: nullableString(input.geography) || draft.geography,
    commercialShape: nullableString(input.commercialShape) || draft.commercialShape,
    successOutcome: nullableString(input.successOutcome) || draft.successOutcome,
    outcomeValueHint: typeof input.outcomeValueHint === "string" ? input.outcomeValueHint.trim() || null : draft.outcomeValueHint,
    budgetPrivate: nullableString(input.budgetPrivate) || draft.budgetPrivate,
    budgetShareableLabel: nullableString(input.budgetShareableLabel, 280),
    shareableSummary: nullableString(input.shareableSummary) || draft.shareableSummary,
    privateNotes: nullableString(input.privateNotes) || draft.privateNotes,
    sourcesAllowed: sources(input.sourcesAllowed, draft.sourcesAllowed),
    contactPolicy: contactPolicy(input.contactPolicy, draft.contactPolicy),
    mode: mode(input.mode, draft.mode),
  };
  next.jobRequestCard = {
    ...draft.jobRequestCard,
    jtbd: next.outcomeNeeded || draft.jobRequestCard.jtbd,
    referenceShape: next.proofRequired || draft.jobRequestCard.referenceShape,
    antiPersonaMd: next.badFit || draft.jobRequestCard.antiPersonaMd,
    successCriteria: next.successOutcome || draft.jobRequestCard.successCriteria,
    budgetShape: {
      ...draft.jobRequestCard.budgetShape,
      ballpark: next.budgetPrivate || "private budget not provided",
    },
    scoutOptIn: next.sourcesAllowed !== "ditto-members",
    lastUpdatedAt: new Date().toISOString(),
  };
  return next;
}

async function resolveActor(body: Record<string, unknown>) {
  const sessionId = stringOrNull(body.sessionId, 200);
  const visitorSessionId = stringOrNull(body.visitorSessionId, 200) ?? sessionId;
  const session = await resolveNetworkLaneSession({
    sessionId,
    context: "client",
    fallbackUserId: typeof body.userId === "string" ? body.userId : null,
  });
  return {
    userId: session?.userId ?? null,
    visitorSessionId: session ? null : visitorSessionId,
    actorId: session?.actorId ?? visitorSessionId,
    sessionId: session?.sessionId ?? sessionId ?? visitorSessionId,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const visitorSessionId = url.searchParams.get("visitorSessionId");
    const session = await resolveNetworkLaneSession({
      sessionId,
      context: "client",
      fallbackUserId: null,
    });
    if (!session && !visitorSessionId) {
      return NextResponse.json({ error: "request_actor_required" }, { status: 400 });
    }
    const requests = await listNeedRequests({
      userId: session?.userId ?? null,
      visitorSessionId: session ? null : visitorSessionId,
    });
    return NextResponse.json({ requests });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/requests GET] Error:", error);
    return NextResponse.json({ error: "active_request_list_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const rawNeed = stringOrNull(body.rawNeed);
    if (!rawNeed) {
      return NextResponse.json({ error: "raw_need_required" }, { status: 400 });
    }
    const action = body.action === "draft" ? "draft" : "save";
    const actor = await resolveActor(body);
    if (!actor.userId && !actor.visitorSessionId) {
      return NextResponse.json({ error: "request_actor_required" }, { status: 400 });
    }
    const stepRunId = await createNetworkLaneStepRun({
      route: action === "draft" ? "network-request-draft" : "network-request-save",
      sessionId: actor.sessionId,
      actorId: actor.actorId,
    });
    const requesterContext = identityFrom(body.identity);
    const drafted = await draftNeedRequest({
      rawNeed,
      requesterContext,
      stepRunId,
    });
    const draft = applyEditableFields(drafted, body.draft);
    if (action === "draft") {
      return NextResponse.json({ draft });
    }

    const status: NetworkJobRequestStatus = body.publish === true ? "active" : "draft";
    const requestRow = await saveNeedRequest({
      requestId: typeof body.requestId === "string" ? body.requestId : null,
      draft,
      userId: actor.userId,
      visitorSessionId: actor.visitorSessionId,
      actorId: actor.actorId,
      status,
      mode: draft.mode,
      identity: requesterContext,
      stepRunId,
    });
    return NextResponse.json({ draft, request: requestRow });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/requests POST] Error:", error);
    return NextResponse.json({ error: "active_request_save_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const requestId = stringOrNull(body.requestId, 200);
    if (!requestId) return NextResponse.json({ error: "request_id_required" }, { status: 400 });
    if (
      body.action !== "pause" &&
      body.action !== "resume" &&
      body.action !== "close" &&
      body.action !== "fulfill"
    ) {
      return NextResponse.json({ error: "invalid_request_action" }, { status: 400 });
    }
    const actor = await resolveActor(body);
    if (!actor.userId && !actor.visitorSessionId) {
      return NextResponse.json({ error: "request_actor_required" }, { status: 400 });
    }
    const stepRunId = await createNetworkLaneStepRun({
      route: `network-request-${body.action}`,
      sessionId: actor.sessionId,
      actorId: actor.actorId,
    });
    const updated = await updateNeedRequestState({
      requestId,
      action: body.action,
      userId: actor.userId,
      visitorSessionId: actor.visitorSessionId,
      actorId: actor.actorId,
      stepRunId,
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/requests PATCH] Error:", error);
    return NextResponse.json({ error: "active_request_update_failed" }, { status: 500 });
  }
}
