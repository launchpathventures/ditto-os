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
import { writeNetworkAuditEvent } from "../../../../../../../src/engine/network-audit";
import { getClaimTokenSignalReviewData } from "../../../../../../../src/engine/claim-invite";
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

function signalAction(value: unknown): "research" | "draft" | "update_claim" | "remove_source" | null {
  if (
    value === "research" ||
    value === "draft" ||
    value === "update_claim" ||
    value === "remove_source"
  ) {
    return value;
  }
  return null;
}

function claimAction(value: unknown): MemberSignalClaimAction | null {
  if (
    value === "approve" ||
    value === "edit" ||
    value === "hide" ||
    value === "delete" ||
    value === "visibility"
  ) {
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

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
}

function syntheticEmail(sessionId: string): string {
  return `network-${sessionId}@ditto.local`;
}

async function resolveMemberSignalSession(body: Record<string, unknown>) {
  const claimToken = stringOrNull(body.claimToken, 500);
  const memberSignalId = stringOrNull(body.memberSignalId, 200);
  if (claimToken && memberSignalId) {
    const data = await getClaimTokenSignalReviewData({
      token: claimToken,
      memberSignalId,
    });
    if (data) {
      return {
        sessionId: `claim-token:${data.claimTokenId}`,
        userId: data.userId,
        actorId: data.userId,
        email: null,
        context: "expert" as const,
      };
    }
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const fallbackUserId = typeof body.userId === "string" ? body.userId : null;
  const requestedContext = body.context === "client" || body.context === "expert"
    ? body.context
    : null;
  const contexts: Array<"expert" | "client"> = requestedContext
    ? [requestedContext]
    : ["expert", "client"];
  for (const context of contexts) {
    const existing = await resolveNetworkLaneSession({
      sessionId,
      context,
      fallbackUserId,
    });
    if (existing) return existing;
  }
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
        eq(schema.chatSessions.context, requestedContext ?? "expert"),
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const memberSignalId = stringOrNull(
      url.searchParams.get("memberSignalId") ?? url.searchParams.get("claim"),
      200,
    );
    const claimToken = stringOrNull(url.searchParams.get("claimToken"), 500);
    if (!memberSignalId || !claimToken) {
      return NextResponse.json(
        { error: "claim_token_signal_required" },
        { status: 400 },
      );
    }
    const data = await getClaimTokenSignalReviewData({
      token: claimToken,
      memberSignalId,
    });
    if (!data) {
      return NextResponse.json(
        { error: "claim_token_invalid_or_expired" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      memberSignal: data.memberSignal,
      claims: data.claims,
      userId: data.userId,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/signal GET] Error:", error);
    return NextResponse.json(
      { error: "member_signal_load_failed" },
      { status: 500 },
    );
  }
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

    if (action === "remove_source") {
      const sourceId = stringOrNull(body.sourceId, 200);
      const memberSignalId = stringOrNull(body.memberSignalId, 200);
      if (!sourceId || !memberSignalId) {
        return NextResponse.json(
          { error: "source_id_required" },
          { status: 400 },
        );
      }
      const [source] = await networkDb
        .select({
          id: networkSchema.networkSignalSources.id,
          memberSignalId: networkSchema.networkSignalSources.memberSignalId,
          userId: networkSchema.networkSignalSources.userId,
          status: networkSchema.networkSignalSources.status,
          sourceLabel: networkSchema.networkSignalSources.sourceLabel,
        })
        .from(networkSchema.networkSignalSources)
        .where(eq(networkSchema.networkSignalSources.id, sourceId))
        .limit(1);
      if (!source || source.memberSignalId !== memberSignalId || source.userId !== session.userId) {
        return NextResponse.json(
          { error: "source_not_found" },
          { status: 404 },
        );
      }
      const now = new Date();
      const [updated] = await networkDb
        .update(networkSchema.networkSignalSources)
        .set({ status: "removed", updatedAt: now })
        .where(eq(networkSchema.networkSignalSources.id, source.id))
        .returning();
      await networkDb.insert(networkSchema.networkSignalReviewEvents).values({
        memberSignalId,
        claimId: null,
        userId: session.userId,
        eventType: "source_removed",
        actorId: session.actorId,
        stepRunId,
        before: { status: source.status },
        after: { status: updated.status },
        createdAt: now,
      });
      await writeNetworkAuditEvent({
        stepRunId,
        eventClass: "source_removed",
        subjectType: "member-signal-source",
        subjectId: source.id,
        actorType: "user",
        actorId: session.actorId,
        reasonCode: "privacy-center-remove-source",
        metadata: { memberSignalId, sourceLabel: source.sourceLabel },
        now,
      });
      return NextResponse.json({ source: updated });
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
