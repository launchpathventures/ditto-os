/**
 * Privacy Delete route (Brief 284, R-Q9)
 *
 * Hybrid soft-delete: in one Postgres transaction we flip the owning row's
 * `status='deleted'` flag AND insert a `network_tombstones` row. The audit
 * event is written after tx commit; an optional `delete-suppression` is
 * recorded for the subject's identifier (so future invites can't re-contact
 * the deleted owner via 283's suppression list).
 *
 *   - Caller `stepRunId` (incl. falsy) → HTTP 400 (Insight-232/211).
 *   - Tombstoned subject → HTTP 410 (idempotent re-delete is a no-op).
 *   - Identity verification (session or email-challenge) is required before
 *     any side effect (R-Q7).
 *   - Email-challenge initiation is a separate `action: "initiate-challenge"`
 *     call; the deletion itself runs under `verify-and-delete`.
 *
 * Email-challenge rate-limiting is enforced through sub-brief 286's
 * `network-abuse-controls.ts` before verifier work starts.
 */

import { NextResponse } from "next/server";
import { eq, inArray, or, sql } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../../src/engine/network-step-run";
import {
  initiateEmailChallenge,
  verifyNetworkIdentity,
  resolveSubjectOwner,
  type NetworkIdentityMethod,
  type NetworkIdentitySubjectType,
} from "../../../../../../../../src/engine/network-identity-verification";
import {
  recordPrivacyDeletion,
  findActiveTombstone,
} from "../../../../../../../../src/engine/network-tombstones";
import { writeNetworkAuditEvent } from "../../../../../../../../src/engine/network-audit";
import { checkEmailChallengeRateLimit } from "../../../../../../../../src/engine/network-abuse-controls";
import { resolveNetworkLaneSession } from "../../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBJECT_TYPES = new Set<NetworkIdentitySubjectType>([
  "member-signal",
  "discovery-profile",
  "request",
  "public-profile",
]);
const METHODS = new Set<NetworkIdentityMethod>([
  "session",
  "email-challenge",
  "claim-token",
]);
const VALID_ACTIONS = new Set(["initiate-challenge", "verify-and-delete"]);

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

function laneContext(value: unknown): "expert" | "client" | null {
  return value === "expert" || value === "client" ? value : null;
}

function softDeleteCallback(
  subjectType: NetworkIdentitySubjectType,
  subjectId: string,
  now: Date,
) {
  return async (tx: typeof networkDb) => {
    switch (subjectType) {
      case "member-signal":
        await tx
          .update(networkSchema.networkMemberSignals)
          .set({ status: "deleted", updatedAt: now })
          .where(eq(networkSchema.networkMemberSignals.id, subjectId));
        return;
      case "request":
        await tx
          .update(networkSchema.networkJobRequests)
          .set({ status: "deleted", updatedAt: now })
          .where(eq(networkSchema.networkJobRequests.id, subjectId));
        return;
      case "public-profile":
        await tx
          .update(networkSchema.networkUsers)
          .set({ status: "deleted", updatedAt: now })
          .where(eq(networkSchema.networkUsers.id, subjectId));
        return;
      case "discovery-profile": {
        const sourceRefs = await tx
          .select({ sourceId: networkSchema.networkDiscoveryClaims.sourceId })
          .from(networkSchema.networkDiscoveryClaims)
          .where(eq(networkSchema.networkDiscoveryClaims.discoveryProfileId, subjectId));
        const sourceIds = Array.from(new Set(sourceRefs.map((row) => row.sourceId)));
        const sourceAssociation = sql`${networkSchema.networkDiscoverySources.metadata}->>'discoveryProfileId' = ${subjectId}`;
        const sourcePredicate = sourceIds.length > 0
          ? or(
              inArray(networkSchema.networkDiscoverySources.id, sourceIds),
              sourceAssociation,
            )
          : sourceAssociation;
        await tx
          .update(networkSchema.networkDiscoveredProfiles)
          .set({ status: "deleted", deletedAt: now, updatedAt: now })
          .where(eq(networkSchema.networkDiscoveredProfiles.id, subjectId));
        await tx
          .update(networkSchema.networkInvitationCandidates)
          .set({ status: "deleted", updatedAt: now })
          .where(eq(networkSchema.networkInvitationCandidates.discoveryProfileId, subjectId));
        await tx
          .update(networkSchema.networkClaimTokens)
          .set({ status: "revoked" })
          .where(eq(networkSchema.networkClaimTokens.discoveryProfileId, subjectId));
        await tx
          .update(networkSchema.networkDiscoverySources)
          .set({
            sourceLabel: "Deleted discovery source",
            sourceUrl: null,
            metadata: {
              discoveryProfileId: subjectId,
              discoveryProfileDeleted: true,
              deletedAt: now.toISOString(),
            },
          })
          .where(sourcePredicate);
        return;
      }
    }
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

    const subjectType = body.subjectType as NetworkIdentitySubjectType;
    const subjectId = stringOrNull(body.subjectId, 200);
    if (!subjectType || !SUBJECT_TYPES.has(subjectType)) {
      return NextResponse.json({ error: "invalid_subject_type" }, { status: 400 });
    }
    if (!subjectId) {
      return NextResponse.json({ error: "subject_id_required" }, { status: 400 });
    }

    const existingTombstone = await findActiveTombstone(subjectType, subjectId);
    if (existingTombstone) {
      return NextResponse.json(
        {
          error: "subject_tombstoned",
          tombstone: { id: existingTombstone.id, deletedAt: existingTombstone.deletedAt },
        },
        { status: 410 },
      );
    }

    const action =
      typeof body.action === "string" ? body.action : "verify-and-delete";
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    const method = body.method as NetworkIdentityMethod | undefined;
    const claimToken = stringOrNull(body.claimToken, 500);
    const sessionId =
      stringOrNull(body.sessionId, 200) ??
      stringOrNull(body.visitorSessionId, 200) ??
      (action !== "initiate-challenge" && method === "claim-token" && claimToken ? "claim-token" : null);
    if (!sessionId) {
      return NextResponse.json({ error: "session_id_required" }, { status: 400 });
    }

    if (action === "initiate-challenge") {
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded?.split(",")[0]?.trim() || "127.0.0.1";
      const limit = await checkEmailChallengeRateLimit({
        limitName: "privacy-delete-email-challenge",
        ip,
        target: stringOrNull(body.email, 320) ?? `${subjectType}:${subjectId}`,
      });
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "too_many_requests", retryAfterSec: limit.retryAfterSec },
          {
            status: 429,
            headers: { "retry-after": String(limit.retryAfterSec) },
          },
        );
      }
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: `network-privacy-delete-${action}`,
      sessionId,
    });

    if (action === "initiate-challenge") {
      const result = await initiateEmailChallenge({
        stepRunId,
        sessionId,
        subject: { subjectType, subjectId },
        claimedEmail: stringOrNull(body.email, 320) ?? undefined,
      });
      if (!result.ok) {
        const status =
          result.error === "subject_tombstoned"
            ? 410
            : result.error === "subject_email_unknown"
              ? 404
              : 400;
        return NextResponse.json(
          { error: result.error ?? "challenge_failed" },
          { status },
        );
      }
      return NextResponse.json(
        { ok: true, maskedEmail: result.maskedEmail },
        { status: 202 },
      );
    }

    if (!method || !METHODS.has(method)) {
      return NextResponse.json({ error: "invalid_method" }, { status: 400 });
    }

    let sessionUserId: string | null = null;
    if (method === "session") {
      const requestedContext = laneContext(body.context);
      const contexts: Array<"expert" | "client"> = requestedContext
        ? [requestedContext]
        : ["client", "expert"];
      let session = null;
      for (const context of contexts) {
        session = await resolveNetworkLaneSession({
          sessionId,
          context,
          fallbackUserId:
            typeof body.userId === "string" ? body.userId : null,
        });
        if (session) break;
      }
      sessionUserId = session?.userId ?? null;
    }

    const emailChallenge =
      method === "email-challenge"
        ? {
            sessionId,
            email: stringOrNull(body.email, 320) ?? "",
            code: stringOrNull(body.code, 12) ?? "",
          }
        : undefined;

    const verified = await verifyNetworkIdentity({
      stepRunId,
      method,
      subject: { subjectType, subjectId },
      sessionUserId,
      emailChallenge,
      claimToken: claimToken ?? undefined,
    });
    if (!verified.verified) {
      const status =
        verified.error === "subject_tombstoned"
          ? 410
          : verified.error === "subject_not_found"
            ? 404
            : 403;
      return NextResponse.json(
        { error: verified.error ?? "verification_failed" },
        { status },
      );
    }

    const owner = await resolveSubjectOwner({ subject: { subjectType, subjectId } });
    const deletedReason =
      stringOrNull(body.reason, 1_000) ?? "user-requested-privacy-delete";
    const now = new Date();

    const result = await recordPrivacyDeletion(
      {
        stepRunId,
        subjectType,
        subjectId,
        deletedByActorType: verified.actorType,
        actorId: verified.actorId,
        deletedReason,
        suppressionIdentifier: owner?.email
          ? { identifier: owner.email, identifierKind: "email" }
          : undefined,
        now,
      },
      softDeleteCallback(subjectType, subjectId, now),
    );

    await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "delete",
      subjectType: `privacy_delete:${subjectType}`,
      subjectId,
      actorType: verified.actorType,
      actorId: verified.actorId,
      reasonCode: deletedReason,
      metadata: {
        tombstoneId: result.tombstone.id,
        purgeAfter: result.tombstone.purgeAfter.toISOString(),
        permanentStubAt: result.tombstone.permanentStubAt.toISOString(),
        idempotent: !result.created,
      },
      now,
    });

    if (subjectType === "public-profile") {
      await writeNetworkAuditEvent({
        stepRunId,
        eventClass: "profile_deleted",
        subjectType: "privacy_delete:public-profile",
        subjectId,
        actorType: verified.actorType,
        actorId: verified.actorId,
        reasonCode: deletedReason,
        metadata: {
          tombstoneId: result.tombstone.id,
          purgeAfter: result.tombstone.purgeAfter.toISOString(),
          permanentStubAt: result.tombstone.permanentStubAt.toISOString(),
        },
        now,
      });
    }

    return NextResponse.json({
      ok: true,
      tombstone: {
        id: result.tombstone.id,
        deletedAt: result.tombstone.deletedAt,
        purgeAfter: result.tombstone.purgeAfter,
        permanentStubAt: result.tombstone.permanentStubAt,
      },
      created: result.created,
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/privacy/delete POST] Error:", error);
    return NextResponse.json(
      { error: "network_privacy_delete_failed" },
      { status: 500 },
    );
  }
}
