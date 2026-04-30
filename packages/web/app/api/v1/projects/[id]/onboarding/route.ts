/**
 * Brief 225 — onboarding state endpoint.
 *
 * GET /api/v1/projects/:id/onboarding
 *
 * Returns the current onboarding run state so the chat-col Server Component
 * at `/projects/:slug/onboarding` can hydrate without re-fetching the
 * project + the run separately. Verb-suffixed siblings: /confirm, /cancel.
 *
 * `:id` accepts either UUID id OR slug (consistent with sibling routes).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, or, and, desc, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function checkWorkspaceAuth(): Promise<NextResponse | null> {
  if (!process.env.WORKSPACE_OWNER_EMAIL) return null;
  const cookieStore = await cookies();
  const session = cookieStore.get(WORKSPACE_SESSION_COOKIE);
  if (!session?.value) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sepIdx = session.value.lastIndexOf("|");
  const email = sepIdx === -1 ? session.value : session.value.substring(0, sepIdx);
  if (email.toLowerCase() !== process.env.WORKSPACE_OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const { db } = await import("../../../../../../../../src/db");
  const { projects, processRuns, processes, workItems, stepRuns } =
    await import("../../../../../../../../src/db/schema");

  const [project] = await db
    .select()
    .from(projects)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .limit(1);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find the most-recent project-onboarding run that referenced this
  // project. Filter pushed to SQL (LIKE on the JSON-encoded inputs)
  // mirroring the heartbeat's executionIds pattern (heartbeat.ts:759) so
  // the lookup is bounded regardless of global run history size.
  const idPattern = `%"projectId":"${project.id}"%`;
  const matchedRuns = await db
    .select({
      runId: processRuns.id,
      status: processRuns.status,
      createdAt: processRuns.createdAt,
    })
    .from(processRuns)
    .innerJoin(processes, eq(processRuns.processId, processes.id))
    .where(
      and(
        eq(processes.slug, "project-onboarding"),
        sql`${processRuns.inputs} LIKE ${idPattern}`,
      ),
    )
    .orderBy(desc(processRuns.createdAt))
    .limit(1);
  const matched = matchedRuns[0];

  // Resolve `currentStep` — last step run on the matched process run.
  let currentStep: string | null = null;
  if (matched) {
    const lastSteps = await db
      .select({ stepId: stepRuns.stepId, status: stepRuns.status })
      .from(stepRuns)
      .where(eq(stepRuns.processRunId, matched.runId))
      .orderBy(desc(stepRuns.startedAt))
      .limit(1);
    currentStep = lastSteps[0]?.stepId ?? null;
  }

  // Surface the report workItems row (when surface-report has run). Filter
  // on briefState in {backlog, approved, blocked} so we only ever pick up
  // an onboarding-report row, never a stray manual capture.
  const reports = await db
    .select({ id: workItems.id, briefState: workItems.briefState })
    .from(workItems)
    .where(
      and(
        eq(workItems.projectId, project.id),
        eq(workItems.source, "system_generated"),
      ),
    )
    .orderBy(desc(workItems.createdAt))
    .limit(5);
  const reportRow = reports.find(
    (r) =>
      r.briefState === "backlog" ||
      r.briefState === "approved" ||
      r.briefState === "blocked",
  );
  const reportWorkItemId = reportRow?.id ?? null;

  return NextResponse.json({
    projectId: project.id,
    slug: project.slug,
    status: project.status,
    onboardingRunId: matched?.runId ?? null,
    onboardingRunStatus: matched?.status ?? null,
    currentStep,
    reportWorkItemId,
  });
}
