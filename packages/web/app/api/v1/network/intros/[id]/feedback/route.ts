import { NextResponse } from "next/server";
import * as networkSchema from "@ditto/core/db/network";
import {
  networkDb,
  withNetworkDbAvailability,
} from "../../../../../../../../../src/db/network-db";
import { checkRateLimit } from "../../../../../../../../../src/engine/network-abuse-controls";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import { parseIntroMagicLinkToken } from "../../../../../../../../../src/engine/intro-proposal";
import {
  INTRO_FEEDBACK_CATEGORIES,
  INTRO_FEEDBACK_EVENT_TYPES,
  INTRO_OUTCOME_CLASSES,
  isAmbiguousIntroFeedback,
  recordIntroFeedback,
} from "../../../../../../../../../src/engine/intro-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ROUTE_EVENT_TYPES = new Set<networkSchema.IntroFeedbackEventType>([
  "button-click",
  "chat-disambiguator-submit",
]);
const EVENT_TYPES = new Set<string>(INTRO_FEEDBACK_EVENT_TYPES);
const CATEGORIES = new Set<string>(INTRO_FEEDBACK_CATEGORIES);
const OUTCOME_CLASSES = new Set<string>(INTRO_OUTCOME_CLASSES);

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function postHandler(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) return bad("invalid_body");
  if (hasCallerStepRun(body)) return bad("step_run_bypass_rejected");

  const token = typeof body.token === "string" ? body.token : "";
  const party = body.party;
  const eventType = body.eventType;
  const classifiedCategory = body.classifiedCategory;
  const freeText = typeof body.freeText === "string" ? body.freeText : null;
  const outcomeClass = body.outcomeClass;
  const outcomeAmountCents = body.outcomeAmountCents;

  if (!token) return bad("token_required");
  if (party !== "requester" && party !== "recipient") {
    return bad("invalid_party");
  }
  if (
    typeof eventType !== "string" ||
    !EVENT_TYPES.has(eventType) ||
    !ROUTE_EVENT_TYPES.has(eventType as networkSchema.IntroFeedbackEventType)
  ) {
    return bad("invalid_event_type");
  }
  if (
    typeof classifiedCategory !== "string" ||
    !CATEGORIES.has(classifiedCategory)
  ) {
    return bad("invalid_classified_category");
  }
  if (
    outcomeClass !== null &&
    outcomeClass !== undefined &&
    (typeof outcomeClass !== "string" || !OUTCOME_CLASSES.has(outcomeClass))
  ) {
    return bad("invalid_outcome_class");
  }
  if (
    outcomeAmountCents !== null &&
    outcomeAmountCents !== undefined &&
    (!Number.isInteger(outcomeAmountCents) || outcomeAmountCents < 0)
  ) {
    return bad("invalid_outcome_amount");
  }

  const payload = parseIntroMagicLinkToken(token);
  if (!payload) return bad("invalid_token", 401);
  if (payload.introId !== id) return bad("intro_mismatch", 401);
  if (payload.party !== party) return bad("party_mismatch", 401);

  const rate = await checkRateLimit({
    db: networkDb,
    limitName: "network-intro",
    actor: { kind: "email", id: payload.email },
    policy: { max: 5, windowMs: 60 * 60 * 1000 },
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: rate.retryAfterSec },
      { status: 429 },
    );
  }

  if (
    isAmbiguousIntroFeedback(
      classifiedCategory as networkSchema.IntroFeedbackClassifiedCategory,
    )
  ) {
    return NextResponse.json({
      success: false,
      action: "chat-disambiguation-required",
    });
  }

  const stepRunId = await createNetworkLaneStepRun({
    route: "network-intro-feedback",
    sessionId: id,
    actorId: payload.email,
  });
  const result = await recordIntroFeedback({
    db: networkDb,
    stepRunId,
    introId: id,
    party,
    payload: {
      eventType: eventType as networkSchema.IntroFeedbackEventType,
      classifiedCategory:
        classifiedCategory as networkSchema.IntroFeedbackClassifiedCategory,
      freeText,
      outcomeClass:
        (outcomeClass as networkSchema.IntroOutcomeClass | null | undefined) ??
        null,
      outcomeAmountCents:
        typeof outcomeAmountCents === "number" ? outcomeAmountCents : null,
    },
  });

  return NextResponse.json({
    success: true,
    feedbackId: result.feedback.id,
    state: result.introduction.state,
    fanOutApplied: result.fanOutApplied,
  });
}

export const POST = withNetworkDbAvailability(postHandler);
