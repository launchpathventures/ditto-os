/**
 * POST /api/v1/review/[token]/reject — Brief 221 §D10 + AC #6.
 *
 * Rejects a runner-dispatch-pause review-page. Validates the token + that
 * the page contains the runner-dispatch-approval form (D1 namespace-bypass
 * safety). Marks the work-item state back to `triaged` (re-dispatchable);
 * consumes the token (one-shot).
 *
 * Insight-180: stepRunId is read from the harness_decisions audit row
 * keyed on the review token.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@engine/../db";
import { workItems, harnessDecisions } from "@engine/../db/schema";
import { getReviewPage, completeReviewPage } from "@engine/review-pages";

const RUNNER_DISPATCH_APPROVAL_FORM_ID = "runner-dispatch-approval";

const RejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

interface PageBlock {
  type: string;
  formId?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  let body: z.infer<typeof RejectBodySchema>;
  try {
    const json = await request.json().catch(() => ({}));
    body = RejectBodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

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

  // D1 namespace-bypass safety.
  const blocks = page.contentBlocks as PageBlock[];
  const isApprovalForm = blocks.some(
    (b) =>
      b.type === "work_item_form" &&
      b.formId === RUNNER_DISPATCH_APPROVAL_FORM_ID,
  );
  if (!isApprovalForm) {
    return NextResponse.json(
      {
        ok: false,
        error: "This review page is not a runner-dispatch-approval flow.",
      },
      { status: 400 },
    );
  }

  // Look up audit row to get stepRunId for the Insight-180 guard.
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
  if (!decision || !decision.stepRunId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No harness_decisions audit row with stepRunId found for this review-page (Insight-180).",
      },
      { status: 500 },
    );
  }

  const workItemId = (
    decision.reviewDetails as {
      runnerPause: { workItemId: string };
    }
  ).runnerPause.workItemId;

  // Set work-item state to `routed` (re-dispatchable) — there is no
  // `triaged` value in workItemStatusValues; `routed` is the post-intake
  // state from which a re-dispatch can be re-triggered upstream.
  await db
    .update(workItems)
    .set({ status: "routed" })
    .where(eq(workItems.id, workItemId));

  // Audit the rejection (append to the existing harness_decisions row's
  // reviewDetails.runnerPause; we don't insert a new row — preserves the
  // pause→approve/reject correlation).
  const updatedDetails = {
    ...((decision.reviewDetails as Record<string, unknown>) ?? {}),
    runnerPause: {
      ...((decision.reviewDetails as { runnerPause?: Record<string, unknown> })
        ?.runnerPause ?? {}),
      rejectedAt: new Date().toISOString(),
      rejectReason: body.reason ?? null,
    },
  };
  await db
    .update(harnessDecisions)
    .set({ reviewDetails: updatedDetails })
    .where(eq(harnessDecisions.id, decision.id));

  // Consume token.
  await completeReviewPage(token);

  return NextResponse.json(
    { ok: true, status: "rejected", reason: body.reason ?? null },
    { status: 200 },
  );
}
