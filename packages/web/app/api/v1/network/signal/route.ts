import { NextResponse } from "next/server";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import {
  researchMemberSignal,
} from "../../../../../../../src/engine/member-signal-research";
import {
  draftMemberSignal,
} from "../../../../../../../src/engine/member-signal-draft";
import {
  updateMemberSignalClaim,
  type MemberSignalClaimAction,
} from "../../../../../../../src/engine/member-signal-review";
import type { MemberSignalSourceInput } from "../../../../../../../src/engine/member-signal-source";
import type { NetworkSignalClaimVisibility } from "@ditto/core/db/network";
import { resolveNetworkLaneSession } from "../kb/session";
import { networkDb } from "../../../../../../../src/db/network-db";
import * as networkSchema from "@ditto/core/db/network";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function signalAction(value: unknown): "research" | "draft" | "update_claim" | null {
  if (value === "research" || value === "draft" || value === "update_claim") return value;
  return null;
}

function claimAction(value: unknown): MemberSignalClaimAction | null {
  if (value === "approve" || value === "edit" || value === "hide" || value === "visibility") {
    return value;
  }
  return null;
}

function visibility(value: unknown): NetworkSignalClaimVisibility | null {
  if (
    value === "public" ||
    value === "on-request" ||
    value === "private" ||
    value === "hidden"
  ) {
    return value;
  }
  return null;
}

function syntheticEmail(sessionId: string): string {
  return `network-${sessionId}@ditto.local`;
}

async function resolveMemberSignalSession(body: Record<string, unknown>) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const fallbackUserId = typeof body.userId === "string" ? body.userId : null;
  const existing = await resolveNetworkLaneSession({
    sessionId,
    context: "expert",
    fallbackUserId,
  });
  if (existing) return existing;
  if (!sessionId) return null;

  const { db, schema } = await import("../../../../../../../src/db");
  const { and, sql } = await import("drizzle-orm");
  const [chatSession] = await db
    .select({
      authenticatedEmail: schema.chatSessions.authenticatedEmail,
    })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.sessionId, sessionId),
        eq(schema.chatSessions.context, "expert"),
        sql`${schema.chatSessions.expiresAt} > ${Date.now()}`,
      ),
    )
    .limit(1);
  if (!chatSession) return null;

  const email = chatSession.authenticatedEmail?.trim().toLowerCase() || syntheticEmail(sessionId);
  const [current] = await networkDb
    .select({
      id: networkSchema.networkUsers.id,
      email: networkSchema.networkUsers.email,
    })
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.email, email))
    .limit(1);
  const user = current ?? (await networkDb
    .insert(networkSchema.networkUsers)
    .values({
      email,
      name: null,
      personaAssignment: "alex",
    })
    .returning({ id: networkSchema.networkUsers.id, email: networkSchema.networkUsers.email }))[0];

  return {
    sessionId,
    userId: user.id,
    actorId: user.id,
    email: user.email,
    context: "expert" as const,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (hasCallerStepRun(body)) {
      return NextResponse.json(
        { error: "step_run_bypass_rejected" },
        { status: 400 },
      );
    }

    const session = await resolveMemberSignalSession(body);
    if (!session) {
      return NextResponse.json(
        { error: "expert_session_required" },
        { status: 403 },
      );
    }

    const action = signalAction(body.action);
    if (!action) {
      return NextResponse.json(
        { error: "invalid_signal_action" },
        { status: 400 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: `network-signal-${action}`,
      sessionId: session.sessionId,
      actorId: session.actorId,
    });

    if (action === "research") {
      const sources = Array.isArray(body.sources)
        ? body.sources as MemberSignalSourceInput[]
        : [];
      if (sources.length === 0) {
        return NextResponse.json(
          { error: "sources_required" },
          { status: 400 },
        );
      }
      const bundle = await researchMemberSignal({
        userId: session.userId,
        sources,
        stepRunId,
        actorId: session.actorId,
        sessionId: session.sessionId,
      });
      return NextResponse.json(bundle);
    }

    if (action === "draft") {
      const result = await draftMemberSignal({
        userId: session.userId,
        memberSignalId: typeof body.memberSignalId === "string" ? body.memberSignalId : null,
        stepRunId,
        actorId: session.actorId,
      });
      return NextResponse.json(result);
    }

    const reviewAction = claimAction(body.claimAction);
    const claimId = typeof body.claimId === "string" ? body.claimId.trim() : "";
    if (!reviewAction || !claimId) {
      return NextResponse.json(
        { error: "claim_action_required" },
        { status: 400 },
      );
    }
    const claim = await updateMemberSignalClaim({
      userId: session.userId,
      claimId,
      action: reviewAction,
      claimText: typeof body.claimText === "string" ? body.claimText : null,
      visibility: visibility(body.visibility),
      stepRunId,
      actorId: session.actorId,
    });
    if (!claim) {
      return NextResponse.json(
        { error: "claim_not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ claim });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/signal] Error:", error);
    return NextResponse.json(
      { error: "member_signal_failed" },
      { status: 500 },
    );
  }
}
