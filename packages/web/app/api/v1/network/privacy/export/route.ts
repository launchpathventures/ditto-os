/**
 * Privacy Export route (Brief 284, R-Q6)
 *
 * Two-step transient flow:
 *
 *   1. `action: "initiate-challenge"` (no session). Body carries the subject ref
 *      and a sessionId. The route calls `initiateEmailChallenge`, returning
 *      `{ ok: true, maskedEmail }` (HTTP 202) so the visitor can complete the
 *      6-digit code prompt without ever seeing the full target address.
 *   2. `action: "verify-and-export"` (default). The route calls
 *      `verifyNetworkIdentity`; on success it snapshots the eligible row set at
 *      that moment and streams the bundle inline. No PII bundle persists at rest
 *      (Insight-201 PII exception, R-Q6).
 *
 * Security:
 *   - `hasCallerStepRun(body)` rejects any caller `stepRunId` key (incl. falsy)
 *     with HTTP 400 before any verifier or db call (Insight-232/211).
 *   - The wrapper run is minted server-side via `createNetworkLaneStepRun`.
 *   - Tombstoned subjects → HTTP 410 (anti-resurrection, Insight-234 #4).
 *   - Email-challenge identity flow is rate-limited by sub-brief 286's
 *     `network-abuse-controls.ts` (declared dependency; not enforced here yet).
 */

import { NextResponse } from "next/server";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { createNetworkLaneStepRun } from "../../../../../../../../src/engine/network-step-run";
import {
  initiateEmailChallenge,
  verifyNetworkIdentity,
  type NetworkIdentityMethod,
  type NetworkIdentitySubjectType,
} from "../../../../../../../../src/engine/network-identity-verification";
import { assembleExportBundle } from "../../../../../../../../src/engine/network-export-bundle";
import { writeNetworkAuditEvent } from "../../../../../../../../src/engine/network-audit";
import { findActiveTombstone } from "../../../../../../../../src/engine/network-tombstones";
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
const VALID_ACTIONS = new Set(["initiate-challenge", "verify-and-export"]);

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

    const tombstone = await findActiveTombstone(subjectType, subjectId);
    if (tombstone) {
      return NextResponse.json({ error: "subject_tombstoned" }, { status: 410 });
    }

    const action =
      typeof body.action === "string" ? body.action : "verify-and-export";
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
        limitName: "privacy-export-email-challenge",
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
      route: `network-privacy-export-${action}`,
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

    const snapshotAt = new Date();
    const bundle = await assembleExportBundle({
      subjectType,
      subjectId,
      snapshotAt,
    });

    await writeNetworkAuditEvent({
      stepRunId,
      eventClass: "privacy_export",
      subjectType: `export:${subjectType}`,
      subjectId,
      actorType: verified.actorType,
      actorId: verified.actorId,
      metadata: {
        snapshotAt: snapshotAt.toISOString(),
        skippedTombstoned: bundle.skippedTombstoned,
        sections: Object.keys(bundle.sections),
      },
    });

    return NextResponse.json({
      ok: true,
      bundle,
      summary: {
        skippedTombstoned: bundle.skippedTombstoned,
        snapshotAt: bundle.snapshotAt,
      },
    });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/privacy/export POST] Error:", error);
    return NextResponse.json(
      { error: "network_privacy_export_failed" },
      { status: 500 },
    );
  }
}
