/**
 * Claim invite token route (Brief 279)
 *
 * GET  — preview the internal Discovery Profile without publishing it.
 * POST — claim, decline, or delete. The route mints the step run and rejects
 *        any caller supplied `stepRunId`, including falsy values.
 */

import { NextResponse } from "next/server";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../../src/engine/network-step-run";
import {
  declineClaimInvite,
  deleteDiscoveryProfile,
  getClaimInvitePreview,
  redeemClaimToken,
  suppressClaimInvite,
} from "../../../../../../../../../src/engine/claim-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

export async function GET(_request: Request, ctx: Params) {
  try {
    const { token } = await ctx.params;
    const preview = await getClaimInvitePreview(decodeURIComponent(token));
    if (!preview) {
      return NextResponse.json({ error: "claim_token_invalid_or_expired" }, { status: 404 });
    }
    return NextResponse.json({ preview });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/invites/[token]/claim GET] Error:", error);
    return NextResponse.json({ error: "claim_invite_preview_failed" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Params) {
  try {
    const { token } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const action = stringOrNull(body.action, 40);
    if (action !== "claim" && action !== "decline" && action !== "suppress" && action !== "delete") {
      return NextResponse.json({ error: "invalid_claim_action" }, { status: 400 });
    }
    const stepRunId = await createNetworkLaneStepRun({
      route: `claim-invite-${action}`,
      actorId: stringOrNull(body.actorId, 200),
    });
    if (action === "claim") {
      const result = await redeemClaimToken({
        stepRunId,
        token: decodeURIComponent(token),
        email: stringOrNull(body.email, 320),
        name: stringOrNull(body.name, 160),
        actorId: stringOrNull(body.actorId, 200),
      });
      return NextResponse.json({ result });
    }
    if (action === "decline") {
      const result = await declineClaimInvite({
        stepRunId,
        token: decodeURIComponent(token),
        actorId: stringOrNull(body.actorId, 200),
        reason: stringOrNull(body.reason, 240),
      });
      return NextResponse.json({ result });
    }
    if (action === "suppress") {
      const result = await suppressClaimInvite({
        stepRunId,
        token: decodeURIComponent(token),
        actorId: stringOrNull(body.actorId, 200),
        reason: stringOrNull(body.reason, 240),
      });
      return NextResponse.json({ result });
    }
    const result = await deleteDiscoveryProfile({
      stepRunId,
      token: decodeURIComponent(token),
      actorId: stringOrNull(body.actorId, 200),
      reason: stringOrNull(body.reason, 240),
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/invites/[token]/claim POST] Error:", error);
    const message = error instanceof Error ? error.message : "claim_invite_action_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
