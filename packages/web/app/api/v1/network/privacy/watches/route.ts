import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../../src/engine/network-step-run";
import { writeNetworkAuditEvent } from "../../../../../../../../src/engine/network-audit";
import { resolveNetworkLaneSession } from "../../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WatchAction = "pause" | "resume" | "close";
type LaneContext = "expert" | "client";

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

function laneContext(value: unknown): LaneContext | null {
  return value === "expert" || value === "client" ? value : null;
}

function watchAction(value: unknown): WatchAction | null {
  if (value === "pause" || value === "resume" || value === "close") return value;
  return null;
}

async function resolveSession(sessionId: string, context: LaneContext | null) {
  const contexts: LaneContext[] = context ? [context] : ["expert", "client"];
  for (const candidate of contexts) {
    const session = await resolveNetworkLaneSession({ sessionId, context: candidate });
    if (session) return session;
  }
  return null;
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }

    const sessionId = stringOrNull(body.sessionId, 200);
    const watchId = stringOrNull(body.watchId, 200);
    const action = watchAction(body.action);
    if (!sessionId) return NextResponse.json({ error: "session_id_required" }, { status: 400 });
    if (!watchId) return NextResponse.json({ error: "watch_id_required" }, { status: 400 });
    if (!action) return NextResponse.json({ error: "invalid_watch_action" }, { status: 400 });

    const session = await resolveSession(sessionId, laneContext(body.context));
    if (!session) {
      return NextResponse.json({ error: "network_session_required" }, { status: 403 });
    }

    const [watch] = await networkDb
      .select({
        id: networkSchema.networkPossibleConnections.id,
        userId: networkSchema.networkPossibleConnections.userId,
        lifecycleState: networkSchema.networkPossibleConnections.lifecycleState,
      })
      .from(networkSchema.networkPossibleConnections)
      .where(eq(networkSchema.networkPossibleConnections.id, watchId))
      .limit(1);
    if (!watch || watch.userId !== session.userId) {
      return NextResponse.json({ error: "watch_not_found" }, { status: 404 });
    }

    const lifecycleState =
      action === "resume" ? "watched" : action === "pause" ? "paused" : "closed";
    const now = new Date();
    const stepRunId = await createNetworkLaneStepRun({
      route: `network-privacy-watch-${action}`,
      sessionId: session.sessionId,
      actorId: session.actorId,
    });
    const [updated] = await networkDb
      .update(networkSchema.networkPossibleConnections)
      .set({ lifecycleState, updatedAt: now })
      .where(eq(networkSchema.networkPossibleConnections.id, watch.id))
      .returning();

    await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "watch_lifecycle_changed",
      subjectType: "background-watch",
      subjectId: watch.id,
      actorType: "user",
      actorId: session.actorId,
      reasonCode: `privacy-center-watch-${action}`,
      metadata: {
        before: watch.lifecycleState,
        after: lifecycleState,
        context: session.context,
      },
      now,
    });

    return NextResponse.json({ watch: updated });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/privacy/watches PATCH] Error:", error);
    return NextResponse.json({ error: "watch_update_failed" }, { status: 500 });
  }
}
