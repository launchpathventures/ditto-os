/**
 * Work-item status webhook — Brief 223 §AC #8.
 *
 *   POST /api/v1/work-items/:id/status
 *
 * Bearer-token gated against `projects.runnerBearerHash` of the project that
 * owns the work item. Pipeline-spec §7 contract.
 *
 * Body: { state, prUrl?, error?, notes?, stepRunId?, runnerKind?, externalRunId?, linkedProcessRunId? }
 *
 * On success:
 *  - updates `work_items.briefState`, `work_items.stateChangedAt`, optionally `work_items.linkedProcessRunId`
 *  - if `runnerKind` + `externalRunId` present, transitions matching `runner_dispatches` row
 *  - writes `activities` row with `action='work_item_status_update'` (the conversation-stream consumer)
 *  - Insight-180: if `stepRunId` is omitted, the bounded waiver kicks in —
 *    activities.metadata.guardWaived = true, surfaceable for downgrade-signal review.
 *
 * The webhook is the ONLY exception to the workspace-session cookie auth
 * pattern (the runner is not a browser session).
 */

import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import {
  workItemStatusUpdateSchema,
  transitionDispatch,
  type RunnerDispatchEvent,
  type RunnerDispatchStatus,
  type BriefState,
} from "@ditto/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Map briefState transitions to runner_dispatches events. Conservative —
 * only the clear cases drive an automatic dispatch transition. Other
 * transitions leave the dispatch row untouched.
 */
function briefStateToDispatchEvent(
  state: BriefState,
  currentStatus: RunnerDispatchStatus,
): RunnerDispatchEvent | null {
  switch (state) {
    case "active":
      // queued → dispatched → running
      if (currentStatus === "queued") return "dispatch";
      if (currentStatus === "dispatched") return "start";
      return null;
    case "shipped":
      return "succeed";
    case "blocked":
      return "fail";
    case "archived":
      return "cancel";
    default:
      return null;
  }
}

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  // If multiple Authorization headers were sent, fetch.Headers comma-joins
  // them. Reject ambiguous input rather than silently picking the first.
  if (auth.includes(",")) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(auth);
  return m ? m[1] : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const presented = extractBearer(req);
  if (!presented) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer header" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = workItemStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const { db } = await import("../../../../../../../../../src/db");
  const { workItems, projects, runnerDispatches, activities } = await import(
    "../../../../../../../../../src/db/schema"
  );
  const { verifyBearerToken } = await import(
    "../../../../../../../../../src/engine/project-credentials"
  );
  // Brief 216 — ephemeral per-dispatch token verification (claude-code-routine).
  const { verifyEphemeralCallbackToken } = await import(
    "../../../../../../../../../src/engine/runner-status-handlers/routine"
  );

  // Look up work item + project bearer hash.
  const wiRows = await db
    .select({
      id: workItems.id,
      projectId: workItems.projectId,
      bearerHash: projects.runnerBearerHash,
    })
    .from(workItems)
    .leftJoin(projects, eq(workItems.projectId, projects.id))
    .where(eq(workItems.id, id))
    .limit(1);

  // Insight-017: avoid leaking work-item existence to unauthenticated callers.
  // All auth-bearing failures return 401 uniformly.
  if (wiRows.length === 0) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wi = wiRows[0];
  if (!wi.projectId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Brief 216 §AC #8 — accept EITHER an ephemeral per-dispatch callback token
  // OR the long-lived project bearer. Ephemeral first (more specific), fall
  // back to project bearer.
  let bearerSource: "ephemeral" | "project" | "none" = "none";
  let matchedDispatchId: string | undefined;

  const ephemeral = await verifyEphemeralCallbackToken(presented, id);
  if (ephemeral.ok) {
    bearerSource = "ephemeral";
    matchedDispatchId = ephemeral.dispatchId;
  } else if (wi.bearerHash) {
    const projectMatch = await verifyBearerToken(presented, wi.bearerHash);
    if (projectMatch) bearerSource = "project";
  }

  if (bearerSource === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify linkedProcessRunId FK exists if provided (defensive, AC #8).
  if (data.linkedProcessRunId) {
    const { processRuns } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const existing = await db
      .select({ id: processRuns.id })
      .from(processRuns)
      .where(eq(processRuns.id, data.linkedProcessRunId))
      .limit(1);
    if (existing.length === 0) {
      return NextResponse.json(
        { error: "linkedProcessRunId does not exist" },
        { status: 400 },
      );
    }
  }

  // Atomically apply: work_items update + (optional) runner_dispatches
  // transition + activities audit row. If any step fails, the lot rolls back
  // so we don't end up with a state change without an audit trail.
  const now = new Date();
  const guardWaived = !data.stepRunId;
  let dispatchTransitioned: { from: string; to: string } | null = null;

  await db.transaction((tx) => {
    tx.update(workItems)
      .set({
        briefState: data.state,
        stateChangedAt: now,
        ...(data.linkedProcessRunId
          ? { linkedProcessRunId: data.linkedProcessRunId }
          : {}),
        updatedAt: now,
      })
      .where(eq(workItems.id, id))
      .run();

    // Optional: bridge the runner_dispatches lifecycle.
    if (data.runnerKind && data.externalRunId) {
      const dispatches = tx
        .select()
        .from(runnerDispatches)
        .where(
          and(
            eq(runnerDispatches.workItemId, id),
            eq(runnerDispatches.runnerKind, data.runnerKind),
            eq(runnerDispatches.externalRunId, data.externalRunId),
          ),
        )
        .limit(1)
        .all();
      if (dispatches.length > 0) {
        const d = dispatches[0];
        const event = briefStateToDispatchEvent(
          data.state,
          d.status as RunnerDispatchStatus,
        );
        if (event) {
          const tr = transitionDispatch(d.status as RunnerDispatchStatus, event);
          if (tr.ok) {
            tx.update(runnerDispatches)
              .set({
                status: tr.to,
                ...(event === "succeed" || event === "fail" || event === "cancel"
                  ? { finishedAt: now }
                  : {}),
                ...(event === "start" && !d.startedAt
                  ? { startedAt: now }
                  : {}),
                ...(data.error ? { errorReason: data.error } : {}),
              })
              .where(eq(runnerDispatches.id, d.id))
              .run();
            dispatchTransitioned = { from: d.status, to: tr.to };
          }
        }
      }
    }

    // Audit + conversation-post: activities row. Insight-180 bounded waiver
    // sets metadata.guardWaived when no stepRunId was supplied. Brief 216
    // adds bearerSource (ephemeral vs project) for forensic auditability.
    tx.insert(activities)
      .values({
        action: "work_item_status_update",
        description: `Work item ${id} → ${data.state}`,
        actorType: "runner-webhook",
        actorId: data.runnerKind ?? null,
        entityType: "work_item",
        entityId: id,
        metadata: {
          webhook: {
            state: data.state,
            prUrl: data.prUrl,
            notes: data.notes,
            error: data.error,
            runnerKind: data.runnerKind,
            externalRunId: data.externalRunId,
            stepRunId: data.stepRunId ?? null,
            guardWaived,
            bearerSource,
            ...(matchedDispatchId ? { matchedDispatchId } : {}),
          },
          ...(dispatchTransitioned ? { dispatchTransitioned } : {}),
        },
      })
      .run();
  });

  return NextResponse.json({
    ok: true,
    workItemId: id,
    briefState: data.state,
    bearerSource,
    ...(dispatchTransitioned ? { dispatchTransitioned } : {}),
    ...(guardWaived ? { guardWaived: true } : {}),
  });
}
