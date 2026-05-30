/**
 * Network Manual Search route (Brief 274)
 *
 * POST   — run an evidence-backed manual search; returns reasoned
 *          Possible Connections (never a marketplace candidate list).
 * PATCH  — record the seeker's next action on a Possible Connection
 *          (refine / not-a-fit / save / intro-request / hide / watch /
 *          invitation-candidate).
 *
 * Side-effect boundary (Insight-180 / Insight-232): the engine functions
 * require a step run id proving harness-step origin. This route mints the
 * step run server-side and REJECTS any caller-supplied `stepRunId` — even
 * falsy values — via `hasCallerStepRun`. Manual Search never contacts
 * anyone; intro-request is consent-gated downstream.
 */

import { NextResponse } from "next/server";
import type {
  NetworkSearchFeedbackKind,
  NetworkSearchMode,
  NetworkRequestSourcesAllowed,
} from "@ditto/core/db/network";
import type { JobRequestCardBlock } from "@ditto/core";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { runNetworkSearch } from "../../../../../../../src/engine/network-manual-search";
import { recordNetworkSearchFeedback } from "../../../../../../../src/engine/network-search-feedback";
import {
  checkRateLimit,
  isNetworkOperationPaused,
} from "../../../../../../../src/engine/network-abuse-controls";
import { resolveNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 2_000;
const MODE_VALUES = new Set<NetworkSearchMode>([
  "member",
  "public-web",
  "both",
  "from-request",
  "from-member-signal",
]);
const SOURCES_VALUES = new Set<NetworkRequestSourcesAllowed>([
  "ditto-members",
  "public-web",
  "both",
]);
const FEEDBACK_KINDS = new Set<NetworkSearchFeedbackKind>([
  "refine",
  "not-a-fit",
  "save",
  "intro-request",
  "hide",
  "watch",
  "invitation-candidate",
]);

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

/**
 * Accept an Active-Request-derived card only when it is structurally a
 * job-request-card. Grounding the search in the card is what lets the
 * engine scrub the seeker's private budget/anti-persona out of the
 * proposal copy — dropping it silently would defeat that safety gate.
 */
function jobRequestCardOrUndefined(
  value: unknown,
): JobRequestCardBlock | undefined {
  if (
    value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "job-request-card"
  ) {
    return value as JobRequestCardBlock;
  }
  return undefined;
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

function optionalString(value: unknown, max = 2_000): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const query = stringOrNull(body.query, MAX_QUERY_LENGTH);
    if (!query) {
      return NextResponse.json({ error: "query_required" }, { status: 400 });
    }
    const actor = await resolveActor(body);
    if (!actor.userId && !actor.visitorSessionId) {
      return NextResponse.json({ error: "search_actor_required" }, { status: 400 });
    }

    const mode =
      typeof body.mode === "string" && MODE_VALUES.has(body.mode as NetworkSearchMode)
        ? (body.mode as NetworkSearchMode)
        : undefined;
    let sourcesAllowed =
      typeof body.sourcesAllowed === "string" &&
      SOURCES_VALUES.has(body.sourcesAllowed as NetworkRequestSourcesAllowed)
        ? (body.sourcesAllowed as NetworkRequestSourcesAllowed)
        : undefined;
    const requestedSources = sourcesAllowed ?? "both";

    const rateLimit = await checkRateLimit({
      limitName: "network-search",
      actor: actor.userId
        ? { kind: "user", id: actor.userId }
        : { kind: "visitor", id: actor.visitorSessionId! },
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited",
          retryAfterSec: rateLimit.retryAfterSec,
        },
        {
          status: 429,
          headers: { "retry-after": String(rateLimit.retryAfterSec) },
        },
      );
    }

    const requestId = optionalString(body.requestId, 200);
    const memberSignalId = optionalString(body.memberSignalId, 200);
    const scopedPause = await isNetworkOperationPaused({
      requestId,
      memberId: memberSignalId,
    });
    if (scopedPause.paused) {
      return NextResponse.json(
        {
          error: "network_operation_paused",
          reason: scopedPause.reason,
        },
        { status: 423 },
      );
    }

    const memberPause =
      requestedSources === "ditto-members" || requestedSources === "both"
        ? await isNetworkOperationPaused({ source: "ditto-members" })
        : { paused: false };
    const publicPause =
      requestedSources === "public-web" || requestedSources === "both"
        ? await isNetworkOperationPaused({ source: "public-web" })
        : { paused: false };
    if (memberPause.paused && publicPause.paused) {
      return NextResponse.json(
        { error: "network_source_paused", source: "all" },
        { status: 423 },
      );
    }
    if (memberPause.paused && requestedSources === "ditto-members") {
      return NextResponse.json(
        { error: "network_source_paused", source: "ditto-members" },
        { status: 423 },
      );
    }
    if (publicPause.paused && requestedSources === "public-web") {
      return NextResponse.json(
        { error: "network_source_paused", source: "public-web" },
        { status: 423 },
      );
    }
    if (memberPause.paused && requestedSources === "both") {
      sourcesAllowed = "public-web";
    }
    if (publicPause.paused && requestedSources === "both") {
      sourcesAllowed = "ditto-members";
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-manual-search",
      sessionId: actor.sessionId,
      actorId: actor.actorId,
    });
    const result = await runNetworkSearch({
      query,
      mode,
      sourcesAllowed,
      jobRequestCard: jobRequestCardOrUndefined(body.jobRequestCard),
      requestId,
      memberSignalId,
      refinement: optionalString(body.refinement),
      geography: optionalString(body.geography, 400),
      proofRequired: optionalString(body.proofRequired, 400),
      userId: actor.userId,
      visitorSessionId: actor.visitorSessionId,
      actorId: actor.actorId,
      sessionId: actor.sessionId,
      stepRunId,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/search POST] Error:", error);
    return NextResponse.json({ error: "network_search_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const searchRunId = stringOrNull(body.searchRunId, 200);
    if (!searchRunId) {
      return NextResponse.json({ error: "search_run_id_required" }, { status: 400 });
    }
    if (
      typeof body.kind !== "string" ||
      !FEEDBACK_KINDS.has(body.kind as NetworkSearchFeedbackKind)
    ) {
      return NextResponse.json({ error: "invalid_feedback_kind" }, { status: 400 });
    }
    const actor = await resolveActor(body);
    if (!actor.userId && !actor.visitorSessionId) {
      return NextResponse.json({ error: "search_actor_required" }, { status: 400 });
    }
    const stepRunId = await createNetworkLaneStepRun({
      route: `network-search-feedback-${body.kind}`,
      sessionId: actor.sessionId,
      actorId: actor.actorId,
    });
    const result = await recordNetworkSearchFeedback({
      searchRunId,
      kind: body.kind as NetworkSearchFeedbackKind,
      possibleConnectionId: optionalString(body.possibleConnectionId, 200),
      reasonText: optionalString(body.reasonText),
      refinementText: optionalString(body.refinementText),
      requestId: optionalString(body.requestId, 200),
      userId: actor.userId,
      visitorSessionId: actor.visitorSessionId,
      actorId: actor.actorId,
      stepRunId,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/search PATCH] Error:", error);
    return NextResponse.json({ error: "network_search_feedback_failed" }, { status: 500 });
  }
}
