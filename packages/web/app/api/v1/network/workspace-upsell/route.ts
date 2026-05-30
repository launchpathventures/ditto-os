import { NextResponse } from "next/server";
import { isNetworkDbConnectionError, networkUnavailableResponse } from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { maybeFireWorkspaceUpsell } from "../../../../../../../src/engine/workspace-upsell-trigger";
import { resolveNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }
    const trigger = body.trigger === "expert-q6" || body.trigger === "client-q6"
      ? body.trigger
      : null;
    if (!trigger) {
      return NextResponse.json({ error: "invalid_upsell_trigger" }, { status: 400 });
    }
    const context = trigger === "expert-q6" ? "expert" : "client";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const session = await resolveNetworkLaneSession({
      sessionId,
      context,
      fallbackUserId: typeof body.userId === "string" ? body.userId : null,
    });
    if (!session) {
      return NextResponse.json({ error: "network_lane_session_required" }, { status: 403 });
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-workspace-upsell",
      sessionId,
      actorId: session.userId,
    });
    const result = await maybeFireWorkspaceUpsell({
      stepRunId,
      userId: session.userId,
      trigger,
      handle: typeof body.handle === "string" ? body.handle : null,
    });

    return NextResponse.json({
      fired: result.fired,
      copy: result.copy,
      declineLabel: result.declineLabel,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/workspace-upsell] Error:", error);
    return NextResponse.json({ error: "workspace_upsell_failed" }, { status: 500 });
  }
}
