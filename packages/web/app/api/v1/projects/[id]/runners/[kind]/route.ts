/**
 * Per-runner kind endpoint — Brief 215.
 *
 * PATCH /api/v1/projects/:id/runners/:kind   — update one row
 * DELETE /api/v1/projects/:id/runners/:kind  — remove one row
 *
 * The /test subroute lives at runners/[kind]/test/route.ts.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { runnerKindValues, type RunnerKind } from "@ditto/core";
import { resolveProjectId } from "../../../../../../../../../src/engine/projects/resolve-project-id";

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

const patchBody = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  credentialIds: z.array(z.string()).optional(),
});

function isKnownKind(k: string): k is RunnerKind {
  return (runnerKindValues as readonly string[]).includes(k);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id, kind } = await params;

  if (!isKnownKind(kind)) {
    return NextResponse.json({ error: `Unknown runner kind: ${kind}` }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { db } = await import("../../../../../../../../../../src/db");
  const { projectRunners } = await import(
    "../../../../../../../../../../src/db/schema"
  );
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const updateValues: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.enabled !== undefined) updateValues.enabled = parsed.data.enabled;
  if (parsed.data.config !== undefined) updateValues.configJson = parsed.data.config;
  if (parsed.data.credentialIds !== undefined)
    updateValues.credentialIds = parsed.data.credentialIds;

  const updated = await db
    .update(projectRunners)
    .set(updateValues)
    .where(and(eq(projectRunners.projectId, projectId), eq(projectRunners.kind, kind)))
    .returning();
  if (updated.length === 0) {
    return NextResponse.json({ error: "Runner config not found" }, { status: 404 });
  }
  return NextResponse.json({ runner: updated[0] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id, kind } = await params;

  if (!isKnownKind(kind)) {
    return NextResponse.json({ error: `Unknown runner kind: ${kind}` }, { status: 400 });
  }

  const { db } = await import("../../../../../../../../../../src/db");
  const { projectRunners } = await import(
    "../../../../../../../../../../src/db/schema"
  );
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const deleted = await db
    .delete(projectRunners)
    .where(and(eq(projectRunners.projectId, projectId), eq(projectRunners.kind, kind)))
    .returning();
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Runner config not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
