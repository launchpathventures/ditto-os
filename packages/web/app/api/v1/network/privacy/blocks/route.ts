import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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

type BlockAction = "add" | "remove";
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

function blockAction(value: unknown): BlockAction | null {
  if (value === "add" || value === "remove") return value;
  return null;
}

function validatePattern(value: string): boolean {
  if (value.length > 254) return false;
  return !/[\\^$+?.()|\[\]{}]/.test(value);
}

async function resolveSession(sessionId: string, context: LaneContext | null) {
  const contexts: LaneContext[] = context ? [context] : ["expert", "client"];
  for (const candidate of contexts) {
    const session = await resolveNetworkLaneSession({ sessionId, context: candidate });
    if (session) return session;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json({ error: "step_run_bypass_rejected" }, { status: 400 });
    }

    const sessionId = stringOrNull(body.sessionId, 200);
    const action = blockAction(body.action);
    if (!sessionId) return NextResponse.json({ error: "session_id_required" }, { status: 400 });
    if (!action) return NextResponse.json({ error: "invalid_block_action" }, { status: 400 });

    const session = await resolveSession(sessionId, laneContext(body.context));
    if (!session) {
      return NextResponse.json({ error: "network_session_required" }, { status: 403 });
    }

    const now = new Date();
    const stepRunId = await createNetworkLaneStepRun({
      route: `network-privacy-block-${action}`,
      sessionId: session.sessionId,
      actorId: session.actorId,
    });

    if (action === "remove") {
      const blockId = stringOrNull(body.blockId, 200);
      if (!blockId) return NextResponse.json({ error: "block_id_required" }, { status: 400 });
      const [block] = await networkDb
        .select()
        .from(networkSchema.networkUserBlockList)
        .where(
          and(
            eq(networkSchema.networkUserBlockList.id, blockId),
            eq(networkSchema.networkUserBlockList.targetUserId, session.userId),
          ),
        )
        .limit(1);
      if (!block) return NextResponse.json({ error: "block_not_found" }, { status: 404 });
      await networkDb
        .delete(networkSchema.networkUserBlockList)
        .where(eq(networkSchema.networkUserBlockList.id, block.id));
      await writeNetworkAuditEvent({
        stepRunId,
        eventClass: "user_block_removed",
        subjectType: "network-user-block",
        subjectId: block.id,
        actorType: "user",
        actorId: session.actorId,
        reasonCode: "privacy-center-remove-block",
        metadata: {
          kind: block.kind,
          value: block.blockedRequesterIdentifier,
        },
        now,
      });
      return NextResponse.json({ ok: true, removedBlockId: block.id });
    }

    const value = stringOrNull(body.value, 254);
    if (!value || !validatePattern(value)) {
      return NextResponse.json({ error: "invalid_block_pattern" }, { status: 400 });
    }
    const [block] = await networkDb
      .insert(networkSchema.networkUserBlockList)
      .values({
        targetUserId: session.userId,
        kind: "pattern",
        blockedRequesterIdentifier: value,
        reason: stringOrNull(body.reason, 240) ?? "privacy-center-user-block",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          networkSchema.networkUserBlockList.targetUserId,
          networkSchema.networkUserBlockList.kind,
          networkSchema.networkUserBlockList.blockedRequesterIdentifier,
        ],
        set: {
          reason: stringOrNull(body.reason, 240) ?? "privacy-center-user-block",
          updatedAt: now,
        },
      })
      .returning();
    await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "user_block_added",
      subjectType: "network-user-block",
      subjectId: block.id,
      actorType: "user",
      actorId: session.actorId,
      reasonCode: "privacy-center-add-block",
      metadata: { kind: block.kind, value: block.blockedRequesterIdentifier },
      now,
    });
    return NextResponse.json({ block });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/privacy/blocks POST] Error:", error);
    return NextResponse.json({ error: "block_update_failed" }, { status: 500 });
  }
}
