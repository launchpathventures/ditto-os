import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type { JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";
import { authenticateRequest } from "@/lib/network-auth";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../src/db/network-db";
import { emitIntroRequest, updateIntroductionStateForAuthorization } from "../../../../../../../src/engine/emit-intro-request";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { resolveNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_FIELD_LENGTH = 2_000;
const MAX_BUDGET_FIELD_LENGTH = 500;

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isJobRequestCard(value: unknown): value is JobRequestCardBlock {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<JobRequestCardBlock>;
  return (
    card.type === "job-request-card" &&
    boundedString(card.jtbd, MAX_TEXT_FIELD_LENGTH) &&
    boundedString(card.referenceShape, MAX_TEXT_FIELD_LENGTH) &&
    boundedString(card.antiPersonaMd, MAX_TEXT_FIELD_LENGTH) &&
    boundedString(card.successCriteria, MAX_TEXT_FIELD_LENGTH) &&
    typeof card.budgetShape === "object" &&
    card.budgetShape != null &&
    boundedString(card.budgetShape.ballpark, MAX_BUDGET_FIELD_LENGTH) &&
    (
      card.budgetShape.cadence === "hourly" ||
      card.budgetShape.cadence === "monthly" ||
      card.budgetShape.cadence === "project"
    ) &&
    typeof card.scoutOptIn === "boolean" &&
    Array.isArray(card.suggestedCandidates) &&
    (card.greeterCuratedBy === "alex" || card.greeterCuratedBy === "mira") &&
    (card.matchCuratedBy === "alex" || card.matchCuratedBy === "mira") &&
    boundedString(card.lastUpdatedAt, 100)
  );
}

function isSuggestedCandidate(value: unknown): value is SuggestedCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SuggestedCandidate>;
  return (
    boundedString(candidate.handle, 160) &&
    boundedString(candidate.name, 160) &&
    boundedString(candidate.oneLineRole, 280) &&
    boundedString(candidate.rationaleMd, 2_000) &&
    (candidate.fitConfidence === "high" ||
      candidate.fitConfidence === "medium" ||
      candidate.fitConfidence === "low") &&
    (candidate.source === "on-network" || candidate.source === "scouted") &&
    boundedString(candidate.computedAt, 100)
  );
}

async function loadTargetUser(handle: string) {
  const [user] = await networkDb
    .select({
      id: networkSchema.networkUsers.id,
      name: networkSchema.networkUsers.name,
      handle: networkSchema.networkUsers.handle,
    })
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.handle, handle))
    .limit(1);
  return user ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    if (!isJobRequestCard(body.jobRequestCard)) {
      return NextResponse.json({ error: "invalid_job_request_card" }, { status: 400 });
    }
    if (!isSuggestedCandidate(body.selectedCandidate)) {
      return NextResponse.json({ error: "invalid_selected_candidate" }, { status: 400 });
    }

    const selectedCandidate = body.selectedCandidate as SuggestedCandidate;
    if (selectedCandidate.source !== "on-network") {
      return NextResponse.json({ error: "scouted_candidate_is_hint_only" }, { status: 400 });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const session = await resolveNetworkLaneSession({
      sessionId,
      context: "client",
      fallbackUserId: typeof body.requesterUserId === "string" ? body.requesterUserId : null,
    });
    if (!session) {
      return NextResponse.json({ error: "client_session_required" }, { status: 403 });
    }

    const target = await loadTargetUser(selectedCandidate.handle);
    if (!target) {
      return NextResponse.json({ error: "target_not_found" }, { status: 404 });
    }

    const jobRequestCard = body.jobRequestCard as JobRequestCardBlock;
    const stepRunId = await createNetworkLaneStepRun({
      route: "network-client-intro-request",
      sessionId,
      actorId: session.userId,
    });
    const result = await emitIntroRequest({
      stepRunId,
      originContext: "client",
      targetUserId: target.id,
      targetDisplayName: target.name || selectedCandidate.name,
      requesterUserId: session.userId,
      requesterDisplayName: session.email ?? session.userId,
      intentSummary: `${jobRequestCard.jtbd} Candidate: ${selectedCandidate.name}. ${selectedCandidate.rationaleMd}`,
      matchConfidence: selectedCandidate.fitConfidence,
      transcript: [
        {
          type: "data",
          format: "key_value",
          title: "Opportunity brief",
          data: {
            jtbd: jobRequestCard.jtbd,
            referenceShape: jobRequestCard.referenceShape,
            successCriteria: jobRequestCard.successCriteria,
            scout: jobRequestCard.scoutOptIn ? "on-network + off-network" : "on-network only",
          },
        },
        {
          type: "data",
          format: "key_value",
          title: "Selected candidate",
          data: {
            handle: selectedCandidate.handle,
            name: selectedCandidate.name,
            role: selectedCandidate.oneLineRole,
            fitConfidence: selectedCandidate.fitConfidence,
          },
        },
      ],
    });

    return NextResponse.json({
      block: result.block,
      introductionId: result.introduction.id,
      state: result.introduction.state,
      deliveryId: result.delivery?.id ?? null,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/intros] Error:", error);
    return NextResponse.json({ error: "intro_request_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const authorizationId = typeof body.authorizationId === "string" ? body.authorizationId : "";
    const event = typeof body.event === "string" ? body.event : "";
    if (
      !authorizationId ||
      !["send-it", "edit-first", "not-yet", "expired", "retry"].includes(event)
    ) {
      return NextResponse.json({ error: "invalid_intro_state_update" }, { status: 400 });
    }

    const [existing] = await networkDb
      .select({
        targetUserId: networkSchema.introductions.targetUserId,
      })
      .from(networkSchema.introductions)
      .where(eq(networkSchema.introductions.authorizationId, authorizationId))
      .limit(1);
    if (!existing || existing.targetUserId !== auth.userId) {
      return NextResponse.json({ error: "intro_not_found" }, { status: 404 });
    }

    const row = await updateIntroductionStateForAuthorization({
      authorizationId,
      event: event as "send-it" | "edit-first" | "not-yet" | "expired" | "retry",
    });
    return NextResponse.json({ updated: Boolean(row), introduction: row });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/intros PATCH] Error:", error);
    return NextResponse.json({ error: "intro_state_update_failed" }, { status: 500 });
  }
}
