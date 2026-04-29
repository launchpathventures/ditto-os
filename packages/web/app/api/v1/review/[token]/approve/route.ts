/**
 * POST /api/v1/review/[token]/approve — Brief 221 §D10 + AC #6.
 *
 * Approves a runner-dispatch-pause review-page. Validates token + bypass-safe
 * checks against the server-stamped `contentBlocks` (D1):
 *   1. The page must contain a `WorkItemFormBlock` with
 *      `formId === "runner-dispatch-approval"`.
 *   2. The submitted `selectedKind` must appear in the form's
 *      server-stamped runner-kind `options` array.
 *
 * On success: optionally sets `workItems.runner_mode_required = "cloud"`,
 * calls `dispatchWorkItem`, marks the review-page completed, returns the
 * dispatch outcome.
 *
 * Insight-180: stepRunId is read from the `harness_decisions` row written
 * by `pauseRunnerDispatchForApproval()` (keyed on `reviewToken` in
 * reviewDetails.runnerPause.reviewToken).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../../../../../../../../../src/db";
import {
  workItems,
  harnessDecisions,
} from "../../../../../../../../../src/db/schema";
import {
  getReviewPage,
  completeReviewPage,
} from "../../../../../../../../../src/engine/review-pages";
import { dispatchWorkItem } from "../../../../../../../../../src/engine/runner-dispatcher";
import { parseKindOption, type RunnerKind } from "@ditto/core";

const RUNNER_DISPATCH_APPROVAL_FORM_ID = "runner-dispatch-approval";

const ApproveBodySchema = z.object({
  selectedKind: z.string().min(1),
  forceCloud: z.boolean().default(false),
});

interface PageBlock {
  type: string;
  formId?: string;
  fields?: Array<{
    name: string;
    options?: string[];
    value?: unknown;
  }>;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  // Parse body.
  let body: z.infer<typeof ApproveBodySchema>;
  try {
    const json = await request.json();
    body = ApproveBodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  // Validate token + load page.
  const page = await getReviewPage(token);
  if (!page) {
    return NextResponse.json(
      { ok: false, error: "Token expired or invalid" },
      { status: 401 },
    );
  }
  if (page.status !== "active") {
    return NextResponse.json(
      { ok: false, error: `Page already ${page.status}` },
      { status: 409 },
    );
  }

  // D1 namespace-bypass safety: the page MUST contain the runner-dispatch-
  // approval form. Read from server-stamped contentBlocks; the client
  // cannot forge this.
  const blocks = page.contentBlocks as PageBlock[];
  const form = blocks.find(
    (b) =>
      b.type === "work_item_form" &&
      b.formId === RUNNER_DISPATCH_APPROVAL_FORM_ID,
  );
  if (!form) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This review page is not a runner-dispatch-approval flow.",
      },
      { status: 400 },
    );
  }

  const kindField = form.fields?.find((f) => f.name === "selectedKind");
  const eligibleOptions = (kindField?.options as string[] | undefined) ?? [];
  if (!eligibleOptions.includes(body.selectedKind)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Selected runner is not in the server-stamped eligibility list.",
      },
      { status: 400 },
    );
  }
  const { kind: selectedRunnerKind } = parseKindOption(body.selectedKind);

  // Look up the harness_decisions row keyed on this review token (written by
  // pauseRunnerDispatchForApproval). Provides stepRunId + processRunId +
  // workItemId + trustTier. SQLite JSON1 `json_extract` filters server-side
  // (Reviewer MEDIUM #2 — avoids full-table scan).
  const decisionRows = await db
    .select()
    .from(harnessDecisions)
    .where(
      sql`json_extract(${harnessDecisions.reviewDetails}, '$.runnerPause.reviewToken') = ${token}`,
    )
    .limit(1);
  const decision = decisionRows[0];
  if (!decision) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No harness_decisions audit row found for this review-page. Cannot dispatch without stepRunId.",
      },
      { status: 500 },
    );
  }
  const stepRunId = decision.stepRunId;
  const processRunId = decision.processRunId;
  const workItemId = (
    decision.reviewDetails as {
      runnerPause: { workItemId: string };
    }
  ).runnerPause.workItemId;

  // Insight-180 guard.
  if (!stepRunId) {
    return NextResponse.json(
      { ok: false, error: "Insight-180: stepRunId required." },
      { status: 400 },
    );
  }

  // Force-cloud + local-kind conflict guard (Brief 221 §D8 — Reviewer HIGH #1).
  // The chain resolver's mode-filter would silently drop the local-mode
  // selection if forceCloud is on. Reject explicitly so the user sees the
  // collision rather than getting a different runner than they picked.
  const localKinds = new Set(["local-mac-mini"]);
  if (body.forceCloud && localKinds.has(selectedRunnerKind)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Force-cloud is on but you picked a local runner. Either turn off "Force cloud" or pick a cloud runner.',
      },
      { status: 400 },
    );
  }

  // Persist the user's per-dispatch override + force-cloud onto the work item
  // BEFORE dispatch so the chain resolver honours both (Brief 215 §D4 + parent
  // §D13). The override prepends `selectedRunnerKind` to the chain, ensuring
  // the dispatcher actually uses what the user picked (Reviewer CRITICAL #1).
  await db
    .update(workItems)
    .set({
      runnerOverride: selectedRunnerKind as
        | "local-mac-mini"
        | "claude-code-routine"
        | "claude-managed-agent"
        | "github-action"
        | "e2b-sandbox",
      ...(body.forceCloud ? { runnerModeRequired: "cloud" as const } : {}),
    })
    .where(eq(workItems.id, workItemId));

  // Dispatch via the runner-dispatcher.
  const outcome = await dispatchWorkItem({
    stepRunId,
    workItemId,
    processRunId,
    trustTier: decision.trustTier as
      | "supervised"
      | "spot_checked"
      | "autonomous"
      | "critical",
    trustAction: "advance",
  });

  // Reviewer CRITICAL #2 — only consume the token on dispatch success. A
  // transient failure (rate limit, daemon offline, no eligible runner) leaves
  // the token active so the user can retry the same approval link.
  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Dispatch failed: ${outcome.message ?? outcome.reason}`,
        attempted: outcome.attempted,
      },
      { status: 502 },
    );
  }

  // Mark the review-page completed so the token is one-shot AFTER success.
  await completeReviewPage(token);

  return NextResponse.json(
    {
      ok: true,
      dispatchId: outcome.dispatchId,
      runnerKind: outcome.runnerKind,
      attemptIndex: outcome.attemptIndex,
      forcedCloud: body.forceCloud,
      // Echo the user-selected kind for auditing.
      selectedKind: selectedRunnerKind,
    },
    { status: 200 },
  );
}
