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
import {
  recordRecipientApproval,
  recordRequesterApproval,
  type RecipientApprovalAction,
  type RequesterApprovalAction,
} from "../../../../../../../src/engine/intro-approval";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { writeNetworkAuditEvent } from "../../../../../../../src/engine/network-audit";
import {
  checkRateLimit,
  isNetworkOperationPaused,
} from "../../../../../../../src/engine/network-abuse-controls";
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

    const rateLimit = await checkRateLimit({
      limitName: "network-intro",
      actor: { kind: "user", id: session.userId },
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "too_many_requests", retryAfterSec: rateLimit.retryAfterSec },
        {
          status: 429,
          headers: { "retry-after": String(rateLimit.retryAfterSec) },
        },
      );
    }

    const target = await loadTargetUser(selectedCandidate.handle);
    if (!target) {
      return NextResponse.json({ error: "target_not_found" }, { status: 404 });
    }
    const pause = await isNetworkOperationPaused({ memberId: target.id });
    if (pause.paused) {
      return NextResponse.json(
        { error: "network_operation_paused", reason: pause.reason },
        { status: 423 },
      );
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

const REQUESTER_CONSENT_ACTIONS: ReadonlySet<RequesterApprovalAction> = new Set([
  "approve",
  "decline",
  "not-now",
  "edit-and-approve",
]);

const RECIPIENT_CONSENT_ACTIONS: ReadonlySet<RecipientApprovalAction> = new Set([
  "approve",
  "decline",
  "not-now",
]);

/**
 * Brief 288 AC #18 — propagate a workspace-side intro consent terminal action
 * back to `network.introductions`. The acting party is resolved from the
 * authenticated network user (the workspace's bearer-token identity), never
 * trusted from the body. The wrapper step run is minted server-side AFTER the
 * action allowlist passes (Insight-239); the engine recorders own the state
 * write, audit row, and downstream sends.
 */
async function handleOutboundConsentPatch(
  body: Record<string, unknown>,
  authUserId: string,
): Promise<NextResponse> {
  const introId = String(body.introId);
  const consentAction = String(body.consentAction);
  const edit = typeof body.edit === "string" ? body.edit : null;
  const declineCategory =
    typeof body.declineCategory === "string" ? body.declineCategory : null;

  const [intro] = await networkDb
    .select({
      id: networkSchema.introductions.id,
      requesterUserId: networkSchema.introductions.requesterUserId,
      recipientUserId: networkSchema.introductions.recipientUserId,
    })
    .from(networkSchema.introductions)
    .where(eq(networkSchema.introductions.id, introId))
    .limit(1);
  if (!intro) {
    return NextResponse.json({ error: "intro_not_found" }, { status: 404 });
  }

  let party: "requester" | "recipient";
  if (intro.recipientUserId && intro.recipientUserId === authUserId) {
    party = "recipient";
  } else if (intro.requesterUserId && intro.requesterUserId === authUserId) {
    party = "requester";
  } else {
    return NextResponse.json({ error: "not_an_intro_party" }, { status: 403 });
  }

  // Insight-239: validate the action against the party's allowed set BEFORE
  // minting the wrapper run, so a malformed action writes no wrapper-run row.
  if (party === "requester") {
    if (!REQUESTER_CONSENT_ACTIONS.has(consentAction as RequesterApprovalAction)) {
      return NextResponse.json({ error: "invalid_consent_action" }, { status: 400 });
    }
  } else if (!RECIPIENT_CONSENT_ACTIONS.has(consentAction as RecipientApprovalAction)) {
    return NextResponse.json({ error: "invalid_consent_action" }, { status: 400 });
  }

  const rateLimit = await checkRateLimit({
    limitName: "network-intro",
    actor: { kind: "user", id: authUserId },
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterSec: rateLimit.retryAfterSec },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSec) },
      },
    );
  }

  const stepRunId = await createNetworkLaneStepRun({
    route: "network-intro-consent",
    sessionId: introId,
    actorId: authUserId,
  });

  const result =
    party === "requester"
      ? await recordRequesterApproval({
          db: networkDb,
          stepRunId,
          introId,
          action: consentAction as RequesterApprovalAction,
          edit,
          declineCategory,
        })
      : await recordRecipientApproval({
          db: networkDb,
          stepRunId,
          introId,
          action: consentAction as RecipientApprovalAction,
          declineCategory,
        });

  if (!result.ok) {
    return NextResponse.json(
      { updated: false, blockedReason: result.blockedReason ?? null },
      { status: 409 },
    );
  }
  return NextResponse.json({
    updated: true,
    party,
    state: result.introduction?.state ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }

    // Brief 288 AC #18 — cross-deployment terminal-state propagation. When a
    // workspace user approves/declines from their in-workspace
    // intro-proposal-card, the workspace persists the terminal state locally
    // and propagates it here via the existing wrapper-run write path. This
    // branch is gated on the outbound-consent shape ({ introId, consentAction })
    // so Brief 261 inbound callers ({ authorizationId, event }) fall through
    // untouched.
    if (
      typeof body.consentAction === "string" &&
      typeof body.introId === "string"
    ) {
      return await handleOutboundConsentPatch(body, auth.userId);
    }

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

    const rateLimit = await checkRateLimit({
      limitName: "network-intro",
      actor: { kind: "user", id: auth.userId },
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "too_many_requests", retryAfterSec: rateLimit.retryAfterSec },
        {
          status: 429,
          headers: { "retry-after": String(rateLimit.retryAfterSec) },
        },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-intro-state-update",
      actorId: auth.userId,
    });
    const row = await updateIntroductionStateForAuthorization({
      authorizationId,
      event: event as "send-it" | "edit-first" | "not-yet" | "expired" | "retry",
    });
    if (row?.state === "approved" || row?.state === "rejected") {
      await writeNetworkAuditEvent({
        stepRunId,
        eventClass: row.state === "approved" ? "intro_approved" : "intro_declined",
        subjectType: "introduction",
        subjectId: row.id,
        actorType: "user",
        actorId: auth.userId,
        reasonCode: event,
        metadata: {
          authorizationId,
          targetUserId: row.targetUserId,
          requesterUserId: row.requesterUserId,
          visitorSessionId: row.visitorSessionId,
        },
      });
    }
    return NextResponse.json({ updated: Boolean(row), introduction: row });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/intros PATCH] Error:", error);
    return NextResponse.json({ error: "intro_state_update_failed" }, { status: 500 });
  }
}
