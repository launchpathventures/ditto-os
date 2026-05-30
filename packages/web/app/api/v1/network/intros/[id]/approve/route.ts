import { NextResponse } from "next/server";
import {
  networkDb,
  withNetworkDbAvailability,
} from "../../../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import { parseIntroMagicLinkToken } from "../../../../../../../../../src/engine/intro-proposal";
import {
  recordRecipientApproval,
  recordRequesterApproval,
  type RecipientApprovalAction,
  type RequesterApprovalAction,
} from "../../../../../../../../../src/engine/intro-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const REQUESTER_ACTIONS: ReadonlySet<RequesterApprovalAction> = new Set([
  "approve",
  "decline",
  "not-now",
  "edit-and-approve",
]);

const RECIPIENT_ACTIONS: ReadonlySet<RecipientApprovalAction> = new Set([
  "approve",
  "decline",
  "not-now",
]);

async function postHandler(request: Request, { params }: Params) {
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Insight-232: reject any caller-supplied stepRunId field (including falsy
  // values like null, "", 0, false). The wrapper run must be minted by the
  // server, never trusted from the client.
  if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
    return NextResponse.json(
      { error: "step_run_bypass_rejected" },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token : "";
  const party = body.party;
  const action = body.action;
  const edit = typeof body.edit === "string" ? body.edit : null;
  const declineCategory =
    typeof body.declineCategory === "string" ? body.declineCategory : null;

  if (!token) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }
  if (party !== "requester" && party !== "recipient") {
    return NextResponse.json({ error: "invalid_party" }, { status: 400 });
  }

  // Insight-239 — validate action BEFORE createNetworkLaneStepRun so a
  // malformed action returns HTTP 400 with no wrapper-run row written.
  if (party === "requester") {
    if (
      typeof action !== "string" ||
      !REQUESTER_ACTIONS.has(action as RequesterApprovalAction)
    ) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
  } else {
    if (
      typeof action !== "string" ||
      !RECIPIENT_ACTIONS.has(action as RecipientApprovalAction)
    ) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }
  }

  // Verify the magic-link token BEFORE reading the intro row (AC #13).
  // parseIntroMagicLinkToken returns null on signature mismatch, malformed
  // payload, version drift, or 24h expiry.
  const payload = parseIntroMagicLinkToken(token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  if (payload.introId !== id) {
    return NextResponse.json({ error: "intro_mismatch" }, { status: 401 });
  }
  if (payload.party !== party) {
    return NextResponse.json({ error: "party_mismatch" }, { status: 401 });
  }

  // Mint the wrapper step run server-side after all input validation has
  // passed (Insight-239). A failure beyond this point is allowed to leave
  // the audit log row in place.
  const stepRunId = await createNetworkLaneStepRun({
    route: "network-intro-approve",
    sessionId: id,
    actorId: payload.email,
  });

  if (party === "requester") {
    const result = await recordRequesterApproval({
      db: networkDb,
      stepRunId,
      introId: id,
      action: action as RequesterApprovalAction,
      edit,
      declineCategory,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          blockedReason: result.blockedReason ?? null,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      state: result.introduction?.state ?? null,
      recipientEmailQueued: result.recipientEmailQueued ?? false,
    });
  }

  const result = await recordRecipientApproval({
    db: networkDb,
    stepRunId,
    introId: id,
    action: action as RecipientApprovalAction,
    declineCategory,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        blockedReason: result.blockedReason ?? null,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({
    success: true,
    state: result.introduction?.state ?? null,
    threadQueued: result.threadQueued ?? false,
  });
}

export const POST = withNetworkDbAvailability(postHandler);
