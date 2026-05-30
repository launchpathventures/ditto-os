import { NextResponse } from "next/server";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { resolveNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkspaceProvisionContext = "expert" | "client";

function readContext(value: unknown): WorkspaceProvisionContext | null {
  return value === "expert" || value === "client" ? value : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(body, "stepRunId")) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }

    const context = readContext(body.context);
    if (!context) {
      return NextResponse.json({ error: "invalid_workspace_provision_context" }, { status: 400 });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const session = await resolveNetworkLaneSession({ sessionId, context });
    if (!session) {
      return NextResponse.json({ error: "network_lane_session_required" }, { status: 403 });
    }

    const { checkRateLimit } = await import(
      "../../../../../../../src/engine/workspace-provisioner"
    );
    if (!checkRateLimit(session.userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 requests per minute." },
        { status: 429 },
      );
    }

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
    const image = process.env.DITTO_IMAGE_REF;
    const networkUrl = process.env.DITTO_NETWORK_URL ?? `https://${request.headers.get("host")}`;

    if (!railwayToken || !railwayProjectId || !image) {
      return NextResponse.json({ error: "workspace_provisioning_not_configured" }, { status: 500 });
    }

    const { createRailwayClient, provisionWorkspace } = await import(
      "../../../../../../../src/engine/workspace-provisioner"
    );
    const railwayClient = createRailwayClient(railwayToken, railwayProjectId);
    const result = await provisionWorkspace(session.userId, {
      railwayClient,
      projectId: railwayProjectId,
      imageRef: image,
      networkUrl,
      healthCheckTimeoutMs: 300_000,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    const { ManagedWorkspacePreflightError, provisioningErrorMessage } = await import(
      "../../../../../../../src/engine/workspace-provisioner"
    );
    if (error instanceof ManagedWorkspacePreflightError) {
      return NextResponse.json(
        {
          error: error.reason,
          message: error.message,
        },
        { status: 400 },
      );
    }
    const safeMessage = provisioningErrorMessage(error);
    console.error("[/api/v1/network/workspace-provision] Error:", safeMessage);
    return NextResponse.json(
      { error: `Provisioning failed: ${safeMessage}` },
      { status: 500 },
    );
  }
}
