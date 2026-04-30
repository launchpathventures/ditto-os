/**
 * Brief 225 — onboarding cancel route.
 *
 * POST /api/v1/projects/:id/onboarding/cancel
 *
 * Flips `projects.status` from `'analysing'` to `'archived'` (the same
 * destination the user reaches by tapping `[Don't onboard]` in §Stage 3
 * of the Designer spec). Marks the onboarding report row
 * `briefState='blocked'` if it exists.
 *
 * Brief 215's `validateStatusTransition` invariant already permits
 * `analysing → archived` (verified at `packages/core/src/projects/invariants.ts:60-113`).
 *
 * `:id` accepts either UUID id OR slug.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, or, and, desc } from "drizzle-orm";
import { validateStatusTransition, type ProjectStatus } from "@ditto/core";

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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const { db } = await import("../../../../../../../../../src/db");
  const { projects, workItems } = await import(
    "../../../../../../../../../src/db/schema"
  );

  const [project] = await db
    .select()
    .from(projects)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .limit(1);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (project.status !== "analysing") {
    return NextResponse.json(
      {
        error: "Project is not in analysing state",
        currentStatus: project.status,
      },
      { status: 400 },
    );
  }

  // The invariant check is for forward-compatibility — should always pass
  // for analysing → archived per the existing rules.
  const inv = validateStatusTransition(
    project.status as ProjectStatus,
    "archived",
    {
      defaultRunnerKind: null,
      enabledRunnerKinds: new Set(),
    },
  );
  if (!inv.ok) {
    return NextResponse.json(
      {
        error: "Invalid status transition",
        code: inv.error.code,
        message: inv.error.message,
        from: inv.error.from,
        to: inv.error.to,
      },
      { status: 400 },
    );
  }

  const now = new Date();
  db.transaction((tx) => {
    tx.update(projects)
      .set({ status: "archived", updatedAt: now })
      .where(eq(projects.id, project.id))
      .run();

    const reports = tx
      .select({ id: workItems.id })
      .from(workItems)
      .where(
        and(
          eq(workItems.projectId, project.id),
          eq(workItems.briefState, "backlog"),
        ),
      )
      .orderBy(desc(workItems.createdAt))
      .limit(1)
      .all();
    if (reports.length > 0) {
      tx.update(workItems)
        .set({
          briefState: "blocked",
          stateChangedAt: now,
          updatedAt: now,
        })
        .where(eq(workItems.id, reports[0].id))
        .run();
    }
  });

  return NextResponse.json({ ok: true, projectId: project.id });
}
