import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb, withNetworkDbAvailability } from "../../../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import { emitIntroRequest } from "../../../../../../../../../src/engine/emit-intro-request";
import { buildVisitorTranscriptPreview } from "../../../../../../../../../src/engine/visitor-profile-chat";
import {
  consumePendingVisitorIntro,
  getPendingVisitorIntro,
  getVisitorProfileTranscript,
  visitorTranscriptHash,
} from "../../../../../../../../../src/engine/visitor-profile-session";
import {
  checkVisitorRateLimit,
  visitorRateLimitCopy,
} from "../../../../../../../../../src/engine/visitor-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function normalizeHandle(handle: string): string {
  return decodeURIComponent(handle).trim().toLowerCase();
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "them";
}

function visitorIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

function lastVisitorIntent(
  transcript: Array<{ role: "visitor" | "greeter"; content: string }>,
  fallback: string,
): string {
  return [...transcript].reverse().find((turn) => turn.role === "visitor")?.content ?? fallback;
}

async function loadUser(handle: string) {
  const [user] = await networkDb
    .select()
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.handle, handle))
    .limit(1);
  return user ?? null;
}

async function postHandler(request: Request, { params }: Params) {
  const { id } = await params;
  const user = await loadUser(normalizeHandle(id));
  if (!user) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
    return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
  }
  const draftOverride = typeof body.draft === "string" ? body.draft.trim().slice(0, 4_000) : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 200) : "";
  const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.slice(0, 200) : null;
  const ip = visitorIp(request);
  const greeterName = user.personaAssignment === "mira" ? "Mira" : "Alex";
  const rateLimit = await checkVisitorRateLimit({ ip, fingerprint, sessionId });
  if ("blocked" in rateLimit) {
    return NextResponse.json(
      {
        rateLimited: true,
        retryAfterSec: rateLimit.retryAfterSec,
        message: visitorRateLimitCopy(greeterName, rateLimit),
      },
      { status: 429 },
    );
  }
  if (!sessionId) {
    return NextResponse.json({ error: "session_required" }, { status: 400 });
  }
  const pending = getPendingVisitorIntro({ sessionId, userId: user.id });
  if (!pending) {
    return NextResponse.json({ error: "intro_request_not_pending" }, { status: 409 });
  }
  const transcript = getVisitorProfileTranscript(sessionId);
  if (pending.transcriptHash !== visitorTranscriptHash(transcript)) {
    return NextResponse.json({ error: "intro_request_stale" }, { status: 409 });
  }
  const draft = draftOverride || pending.draft;
  if (!draft) {
    return NextResponse.json({ error: "draft_required" }, { status: 400 });
  }

  const userName = user.name || user.handle || "the profile owner";
  const userFirst = firstName(userName);
  const stepRunId = await createNetworkLaneStepRun({
    route: "people-profile-intro-request",
    sessionId,
    actorId: sessionId,
  });
  const result = await emitIntroRequest({
    targetUserId: user.id,
    targetDisplayName: userName,
    visitorSessionId: sessionId,
    requesterDisplayName: typeof body.visitorName === "string" ? body.visitorName.slice(0, 160) : null,
    requesterOrgLabel: typeof body.visitorOrg === "string" ? body.visitorOrg.slice(0, 160) : null,
    originContext: "visitor",
    intentSummary: lastVisitorIntent(transcript, draft),
    draft,
    transcript: buildVisitorTranscriptPreview(transcript),
    stepRunId,
  });
  consumePendingVisitorIntro({ sessionId, userId: user.id });

  return NextResponse.json({
    block: result.block,
    introductionId: result.introduction.id,
    state: result.introduction.state,
    message:
      result.block.state === "rejected"
        ? result.block.executionResult?.reasonForVisitor ?? "I'm not the right person to introduce on this one."
        : `I'll send this to ${userFirst}; if it lands, you'll hear back in a day or two.`,
  });
}

export const POST = withNetworkDbAvailability(postHandler);
