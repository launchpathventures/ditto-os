/**
 * Project detail API — Brief 223.
 *
 * GET    /api/v1/projects/:id   — retrieve, joining project_runners
 * PATCH  /api/v1/projects/:id   — update; supports `rotateBearer: true`;
 *                                 calls validateStatusTransition on `status`
 * DELETE /api/v1/projects/:id   — SOFT delete (sets status='archived')
 *
 * `:id` accepts either UUID id OR slug (admin pages use slug).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, or, and } from "drizzle-orm";
import { z } from "zod";
import {
  validateStatusTransition,
  runnerKindValues,
  type ProjectStatus,
  type RunnerKind,
} from "@ditto/core";

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

const runnerKindEnum = z.enum(runnerKindValues);

const patchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  githubRepo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).optional(),
  defaultBranch: z.string().optional(),
  harnessType: z.enum(["catalyst", "native", "none"]).optional(),
  briefSource: z.enum(["filesystem", "ditto_native", "github_issues"]).nullable().optional(),
  briefPath: z.string().nullable().optional(),
  defaultRunnerKind: runnerKindEnum.nullable().optional(),
  fallbackRunnerKind: runnerKindEnum.nullable().optional(),
  runnerChain: z.array(runnerKindEnum).nullable().optional(),
  deployTarget: z.enum(["vercel", "fly", "manual"]).nullable().optional(),
  status: z.enum(["analysing", "active", "paused", "archived"]).optional(),
  /** Brief 223 §AC #6 — rotate the runner bearer atomically. */
  rotateBearer: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const { db } = await import("../../../../../../../src/db");
  const { projects, projectRunners } = await import(
    "../../../../../../../src/db/schema"
  );

  const rows = await db
    .select()
    .from(projects)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runners = await db
    .select()
    .from(projectRunners)
    .where(eq(projectRunners.projectId, rows[0].id));

  return NextResponse.json({ project: rows[0], runners });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { db } = await import("../../../../../../../src/db");
  const { projects, projectRunners, activities } = await import(
    "../../../../../../../src/db/schema"
  );

  const current = await db
    .select()
    .from(projects)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .limit(1);
  if (current.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const project = current[0];

  // Status transition gate — Brief 215 invariant.
  if (parsed.data.status && parsed.data.status !== project.status) {
    const enabledRunners = await db
      .select({ kind: projectRunners.kind })
      .from(projectRunners)
      .where(
        and(
          eq(projectRunners.projectId, project.id),
          eq(projectRunners.enabled, true),
        ),
      );
    const result = validateStatusTransition(
      project.status as ProjectStatus,
      parsed.data.status as ProjectStatus,
      {
        defaultRunnerKind: project.defaultRunnerKind as RunnerKind | null,
        enabledRunnerKinds: new Set(
          enabledRunners.map((r) => r.kind as RunnerKind),
        ),
      },
    );
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Invalid status transition",
          code: result.error.code,
          message: result.error.message,
          from: result.error.from,
          to: result.error.to,
        },
        { status: 400 },
      );
    }
  }

  const updateData: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
  };
  delete updateData.rotateBearer;

  // rotateBearer: issue a fresh bearer + invalidate the old hash atomically.
  let newBearerToken: string | undefined;
  if (parsed.data.rotateBearer) {
    const { generateBearerToken, hashBearerToken } = await import(
      "../../../../../../../src/engine/project-credentials"
    );
    newBearerToken = generateBearerToken();
    updateData.runnerBearerHash = await hashBearerToken(newBearerToken);
  }

  const updated = await db
    .update(projects)
    .set(updateData)
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .returning();
  if (updated.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Forensic audit row for bearer rotation (Insight-017 security checklist).
  if (parsed.data.rotateBearer) {
    await db.insert(activities).values({
      action: "project_bearer_rotated",
      description: `Bearer rotated for project ${project.slug}`,
      actorType: "admin-cookie",
      entityType: "project",
      entityId: project.id,
      metadata: {
        bearerRotation: {
          rotatedAt: new Date().toISOString(),
          projectSlug: project.slug,
        },
      },
    });
  }

  return NextResponse.json({
    project: updated[0],
    ...(newBearerToken
      ? { bearerToken: newBearerToken, bearerOnceWarning: true }
      : {}),
  });
}

/**
 * Soft-delete: sets status='archived'. Brief 223 §AC #7 — does NOT cascade
 * delete; existing processes referencing this project survive (downstream
 * brief decides "orphaned" rendering).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const { db } = await import("../../../../../../../src/db");
  const { projects } = await import("../../../../../../../src/db/schema");

  const archived = await db
    .update(projects)
    .set({ status: "archived", updatedAt: new Date() })
    .where(or(eq(projects.id, id), eq(projects.slug, id)))
    .returning();
  if (archived.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, project: archived[0] });
}
