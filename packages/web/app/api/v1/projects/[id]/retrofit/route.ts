/**
 * Brief 228 — Re-run retrofit route.
 *
 * POST /api/v1/projects/:id/retrofit
 *
 * Triggers a fresh `project-retrofit.yaml` invocation for an active project.
 * Idempotent per Insight-212 — re-runs that produce only `unchanged` files
 * complete with `commitSha=null` + an info AlertBlock side-car.
 *
 * Body:
 *   {
 *     kind: "on-demand-rerun",
 *     trustTier?: "supervised" | "spot_checked" | "autonomous" | "critical"
 *   }
 *
 * If `trustTier` is omitted, the route reads the project's last-known
 * retrofit tier (from the most recent prior `processRuns.trustTierOverride`)
 * — falling back to `'supervised'` if no prior exists.
 *
 * `:id` accepts either UUID id OR slug.
 *
 * Provenance: Brief 228 §What Changes; mirrors the
 * `/api/v1/projects/:id/onboarding/confirm` shape from Brief 225.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, or, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { trustTierValues, type TrustTier } from "@ditto/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function checkWorkspaceAuth(): Promise<NextResponse | null> {
  if (!process.env.WORKSPACE_OWNER_EMAIL) return null;
  const cookieStore = await cookies();
  const session = cookieStore.get(WORKSPACE_SESSION_COOKIE);
  if (!session?.value)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sepIdx = session.value.lastIndexOf("|");
  const email =
    sepIdx === -1 ? session.value : session.value.substring(0, sepIdx);
  if (email.toLowerCase() !== process.env.WORKSPACE_OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const retrofitBody = z.object({
  kind: z.literal("on-demand-rerun"),
  trustTier: z.enum(trustTierValues).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = retrofitBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const { db } = await import(
    "../../../../../../../../src/db"
  );
  const { projects, processes, processRuns } = await import(
    "../../../../../../../../src/db/schema"
  );

  // Resolve project by id or slug.
  const [project] = await db
    .select()
    .from(projects)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .limit(1);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (project.status !== "active") {
    return NextResponse.json(
      {
        error: "Project is not active — retrofit requires an active project",
        currentStatus: project.status,
      },
      { status: 400 },
    );
  }

  // Resolve trust tier: explicit override > last-known > 'supervised'.
  // Reviewer CRIT-2 fix: filter via `processRuns.inputs.projectId` (system
  // processes carry projectId in inputs, not in `processes.projectId`).
  let trustTier: TrustTier = data.trustTier ?? "supervised";
  if (!data.trustTier) {
    const lastRunRows = await db
      .select({ trustTierOverride: processRuns.trustTierOverride })
      .from(processRuns)
      .innerJoin(processes, eq(processRuns.processId, processes.id))
      .where(
        and(
          eq(processes.slug, "project-retrofit"),
          sql`json_extract(${processRuns.inputs}, '$.projectId') = ${project.id}`,
        ),
      )
      .orderBy(desc(processRuns.startedAt))
      .limit(1);
    const lastTier = lastRunRows[0]?.trustTierOverride as TrustTier | null;
    if (lastTier) trustTier = lastTier;
  }

  try {
    const { startProcessRun } = await import(
      "../../../../../../../../src/engine/heartbeat"
    );
    const runId = await startProcessRun(
      "project-retrofit",
      { projectId: project.id },
      "manual",
      { parentTrustTier: trustTier },
    );
    return NextResponse.json(
      {
        ok: true,
        projectId: project.id,
        projectSlug: project.slug,
        runId,
        trustTier,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to trigger retrofit",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
