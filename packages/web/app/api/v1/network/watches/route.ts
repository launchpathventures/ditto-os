/**
 * Background Watch HTTP control surface (Brief 293)
 *
 * POST   — `{ action: "create" }`         : create a watch from an Active
 *                                            Request or Member Signal.
 *          `{ action: "run-now" }`        : trigger one manual cycle
 *                                            (enforces 4-hour cooldown).
 * GET    — list the caller's watches.
 * PATCH  — `{ action: "pause" }`          : pause an active watch.
 *          `{ action: "resume" }`         : resume a paused watch.
 *          `{ action: "close" }`          : close a watch (terminal).
 *          `{ action: "refine" }`         : update the watch's refinement.
 *
 * Hard guarantees (parent §Constraints):
 *  - Validate the action enum BEFORE minting a step run (Insight-239).
 *  - Reject any request body containing a `stepRunId` key — including
 *    falsy values (`null`/`""`/`0`/`false`). Key presence, not truthiness
 *    (Insight-232). Reject path writes nothing.
 *  - Mint a server-side network-lane stepRunId per action and pass it to
 *    the engine — never trust caller-supplied step ids.
 *  - The manual-run path enforces the 4-hour cooldown via `runBackgroundWatch`.
 */

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import type {
  NetworkWatchFrequency,
  NetworkWatchOrigin,
  NetworkWatchPausedReason,
} from "@ditto/core/db/network";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../src/engine/network-step-run";
import { runBackgroundWatch } from "../../../../../../../src/engine/network-background-watch";
import { resolveNetworkLaneSession } from "../kb/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREQUENCY_VALUES = new Set<NetworkWatchFrequency>([
  "quiet",
  "weekly_digest",
  "immediate_strong_fit",
  "manual_only",
]);

const ORIGIN_VALUES = new Set<NetworkWatchOrigin>([
  "active-request",
  "member-signal",
  "operator",
]);

const POST_ACTIONS = new Set<string>(["create", "run-now"]);
const PATCH_ACTIONS = new Set<string>(["pause", "resume", "close", "refine"]);

function hasCallerStepRun(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "stepRunId");
}

function stringOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > max) return null;
  return clean;
}

async function resolveUserId(
  body: Record<string, unknown>,
): Promise<string | null> {
  const sessionId = stringOrNull(body.sessionId, 200);
  const session = await resolveNetworkLaneSession({
    sessionId,
    context: "client",
    fallbackUserId: typeof body.userId === "string" ? body.userId : null,
  });
  return session?.userId ?? null;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Insight-239 — validate the action enum BEFORE minting a step run.
  const action = stringOrNull(body.action, 32) ?? "create";
  if (!POST_ACTIONS.has(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  // Insight-232 — reject ANY body that includes the stepRunId key.
  if (hasCallerStepRun(body)) {
    return NextResponse.json(
      { error: "step_run_bypass_rejected" },
      { status: 400 },
    );
  }

  try {
    if (action === "create") {
      const userId = await resolveUserId(body);
      if (!userId) {
        return NextResponse.json({ error: "user_required" }, { status: 401 });
      }
      const requestId = stringOrNull(body.requestId, 200);
      const signalId = stringOrNull(body.signalId, 200);
      if (!requestId && !signalId) {
        return NextResponse.json(
          { error: "request_or_signal_required" },
          { status: 400 },
        );
      }
      if (requestId && signalId) {
        return NextResponse.json(
          { error: "request_and_signal_exclusive" },
          { status: 400 },
        );
      }
      const origin: NetworkWatchOrigin =
        typeof body.origin === "string" && ORIGIN_VALUES.has(body.origin as NetworkWatchOrigin)
          ? (body.origin as NetworkWatchOrigin)
          : requestId
            ? "active-request"
            : "member-signal";
      const title = stringOrNull(body.title, 200) ?? "Background Watch";
      const frequency: NetworkWatchFrequency =
        typeof body.frequency === "string" &&
        FREQUENCY_VALUES.has(body.frequency as NetworkWatchFrequency)
          ? (body.frequency as NetworkWatchFrequency)
          : "weekly_digest";
      const ianaTimezone = stringOrNull(body.ianaTimezone, 64);
      const refinement = stringOrNull(body.refinement, 2_000);

      const stepRunId = await createNetworkLaneStepRun({
        route: "network-watch-create",
        actorId: userId,
      });

      const [row] = await networkDb
        .insert(networkSchema.networkBackgroundWatches)
        .values({
          userId,
          requestId,
          signalId,
          origin,
          title,
          frequency,
          ianaTimezone,
          refinement,
          status: "active",
        })
        .returning();

      await networkDb.insert(networkSchema.networkAuditEvents).values({
        eventClass: "watch_lifecycle_changed",
        subjectType: "background_watch",
        subjectId: row.id,
        actorType: "user",
        actorId: userId,
        stepRunId,
        reasonCode: "created",
        metadata: { origin, frequency, requestId, signalId },
      });

      return NextResponse.json({ watch: row });
    }

    // action === "run-now"
    const watchId = stringOrNull(body.watchId, 200);
    if (!watchId) {
      return NextResponse.json({ error: "watch_id_required" }, { status: 400 });
    }
    const userId = await resolveUserId(body);
    if (!userId) {
      return NextResponse.json({ error: "user_required" }, { status: 401 });
    }
    const stepRunId = await createNetworkLaneStepRun({
      route: "network-background-watch-manual",
      actorId: userId,
      sessionId: `watch:${watchId}`,
    });
    const result = await runBackgroundWatch({
      watchId,
      stepRunId,
      triggeredBy: "manual",
      actorId: userId,
    });
    if (result.outcome === "skipped-cooldown") {
      return NextResponse.json(
        { error: "manual_cooldown_active", result },
        { status: 429 },
      );
    }
    if (result.outcome === "skipped-rate-limit") {
      return NextResponse.json({ error: "rate_limited", result }, { status: 429 });
    }
    return NextResponse.json({ result });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/watches POST] Error:", error);
    return NextResponse.json({ error: "watch_action_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const fallbackUserId = url.searchParams.get("userId");
    const session = await resolveNetworkLaneSession({
      sessionId,
      context: "client",
      fallbackUserId,
    });
    const userId = session?.userId ?? null;
    if (!userId) {
      return NextResponse.json({ error: "user_required" }, { status: 401 });
    }
    const rows = await networkDb
      .select()
      .from(networkSchema.networkBackgroundWatches)
      .where(eq(networkSchema.networkBackgroundWatches.userId, userId))
      .orderBy(desc(networkSchema.networkBackgroundWatches.createdAt));
    return NextResponse.json({ watches: rows });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/watches GET] Error:", error);
    return NextResponse.json({ error: "watch_list_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = stringOrNull(body.action, 32);
  if (!action || !PATCH_ACTIONS.has(action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  if (hasCallerStepRun(body)) {
    return NextResponse.json(
      { error: "step_run_bypass_rejected" },
      { status: 400 },
    );
  }

  try {
    const watchId = stringOrNull(body.watchId, 200);
    if (!watchId) {
      return NextResponse.json({ error: "watch_id_required" }, { status: 400 });
    }
    const userId = await resolveUserId(body);
    if (!userId) {
      return NextResponse.json({ error: "user_required" }, { status: 401 });
    }

    const [watch] = await networkDb
      .select()
      .from(networkSchema.networkBackgroundWatches)
      .where(
        and(
          eq(networkSchema.networkBackgroundWatches.id, watchId),
          eq(networkSchema.networkBackgroundWatches.userId, userId),
        ),
      )
      .limit(1);
    if (!watch) {
      return NextResponse.json({ error: "watch_not_found" }, { status: 404 });
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: `network-watch-${action}`,
      actorId: userId,
      sessionId: `watch:${watchId}`,
    });
    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };
    let reasonCode = action;

    if (action === "pause") {
      const reason: NetworkWatchPausedReason = "user";
      updates.status = "paused";
      updates.pausedReason = reason;
    } else if (action === "resume") {
      if (watch.status !== "paused") {
        return NextResponse.json(
          { error: "watch_not_paused" },
          { status: 409 },
        );
      }
      updates.status = "active";
      updates.pausedReason = null;
    } else if (action === "close") {
      updates.status = "closed";
      updates.closeReason = stringOrNull(body.closeReason, 2_000);
    } else if (action === "refine") {
      const refinement = stringOrNull(body.refinement, 2_000);
      if (!refinement) {
        return NextResponse.json(
          { error: "refinement_required" },
          { status: 400 },
        );
      }
      updates.refinement = refinement;
      reasonCode = "refined";
    }

    const [row] = await networkDb
      .update(networkSchema.networkBackgroundWatches)
      .set(updates)
      .where(eq(networkSchema.networkBackgroundWatches.id, watchId))
      .returning();

    await networkDb.insert(networkSchema.networkAuditEvents).values({
      eventClass: "watch_lifecycle_changed",
      subjectType: "background_watch",
      subjectId: watchId,
      actorType: "user",
      actorId: userId,
      stepRunId,
      reasonCode,
      metadata: { action },
    });

    return NextResponse.json({ watch: row });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/watches PATCH] Error:", error);
    return NextResponse.json({ error: "watch_action_failed" }, { status: 500 });
  }
}
