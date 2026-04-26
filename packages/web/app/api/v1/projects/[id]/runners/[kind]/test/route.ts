/**
 * Test-dispatch endpoint — Brief 215.
 *
 * POST /api/v1/projects/:id/runners/:kind/test — stub health check.
 *
 * For local-mac-mini, the real health check lives in the bridge-server's
 * pairing flow (Brief 212). For cloud kinds (sub-briefs 216-218), this
 * returns 501 until those adapters land.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, or } from "drizzle-orm";
import { runnerKindValues, type RunnerKind } from "@ditto/core";

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

function isKnownKind(k: string): k is RunnerKind {
  return (runnerKindValues as readonly string[]).includes(k);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id, kind } = await params;

  if (!isKnownKind(kind)) {
    return NextResponse.json({ error: `Unknown runner kind: ${kind}` }, { status: 400 });
  }

  if (kind !== "local-mac-mini") {
    return NextResponse.json(
      { error: `Test dispatch for ${kind} ships in the corresponding sub-brief.` },
      { status: 501 }
    );
  }

  const { db } = await import("../../../../../../../../../../../src/db");
  const { projects, projectRunners } = await import(
    "../../../../../../../../../../../src/db/schema"
  );

  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .limit(1);
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const runnerRow = await db
    .select()
    .from(projectRunners)
    .where(
      and(eq(projectRunners.projectId, projectRows[0].id), eq(projectRunners.kind, kind))
    )
    .limit(1);
  if (runnerRow.length === 0) {
    return NextResponse.json({ error: "Runner config not found" }, { status: 404 });
  }

  // Stub for Brief 215 — actual integration lands when bridge-server is wired
  // into the registry (Brief 212 completion). Mark health as `unknown` for
  // now — the user re-tests once the daemon is paired.
  await db
    .update(projectRunners)
    .set({
      lastHealthCheckAt: new Date(),
      lastHealthStatus: "unknown",
    })
    .where(
      and(eq(projectRunners.projectId, projectRows[0].id), eq(projectRunners.kind, kind))
    );

  return NextResponse.json({
    status: "unknown",
    reason: "Bridge integration completes when sub-brief 212 cli daemon ships.",
  });
}
