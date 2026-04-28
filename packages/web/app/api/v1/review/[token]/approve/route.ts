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
import { eq, and, desc } from "drizzle-orm";
import { db } from "@engine/../db";
import {
  reviewPages,
  workItems,
  harnessDecisions,
  type RunnerKindValue,
} from "@engine/../db/schema";
import { getReviewPage, completeReviewPage } from "@engine/review-pages";
import { dispatchWorkItem } from "@engine/runner-dispatcher";
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
  // workItemId + trustTier.
  const decisionRows = await db
    .select()
    .from(harnessDecisions)
    .orderBy(desc(harnessDecisions.createdAt));
  const decision = decisionRows.find((d) => {
    const rd = d.reviewDetails as
      | { runnerPause?: { reviewToken?: string; workItemId?: string } }
      | null;
    return rd?.runnerPause?.reviewToken === token;
  });
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

  // Optionally persist force-cloud onto the work item BEFORE dispatch so the
  // chain re-resolution honours it (parent §D13).
  if (body.forceCloud) {
    await db
      .update(workItems)
      .set({ runnerModeRequired: "cloud" })
      .where(eq(workItems.id, workItemId));
  }

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

  // Mark the review-page completed so the token is one-shot.
  await completeReviewPage(token);

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
