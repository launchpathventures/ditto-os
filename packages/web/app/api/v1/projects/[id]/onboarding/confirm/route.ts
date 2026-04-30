/**
 * Brief 225 — onboarding confirm route.
 *
 * POST /api/v1/projects/:id/onboarding/confirm
 *
 * Atomic three-write commit on the user's `[Looks good — start the project]`
 * tap (Designer spec §Stage 3 CTA semantics):
 *   1. Insert `project_runners` row for the picked default-runner kind.
 *   2. Generate the runner bearer + bcrypt-hash + write to
 *      `projects.runnerBearerHash`. (Bearer-once, deferred from Brief 223.)
 *   3. Flip `projects.status` to `'active'` + set `projects.defaultRunnerKind`.
 *      Brief 215's `validateStatusTransition` invariant gates this.
 *   4. Mark the onboarding report `workItems.briefState='approved'` if a
 *      stub row exists, optionally appending the user's `edits` text.
 *   5. Queue the retrofitter (sub-brief #3 placeholder) via
 *      `triggerProcess('project-onboarding', { ..., step: 'retrofit' })`.
 *
 * On failure (UNIQUE collision on project_runners, or invariant rejection),
 * rolls back atomically. Returns 400 with structured error.
 *
 * `:id` accepts either UUID id OR slug.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, or, and, desc } from "drizzle-orm";
import { z } from "zod";
import {
  RunnerKindSchema,
  kindToMode,
  validateStatusTransition,
  trustTierValues,
  type RunnerKind,
  type ProjectStatus,
  type TrustTier,
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

const confirmBody = z.object({
  defaultRunnerKind: RunnerKindSchema,
  mode: z.enum(["local", "cloud"]),
  runnerConfig: z.record(z.string(), z.unknown()).optional().default({}),
  credentialIds: z.array(z.string()).optional().default([]),
  trustTier: z.enum(trustTierValues).default("supervised"),
  edits: z.string().max(8000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = confirmBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const { db } = await import("../../../../../../../../../src/db");
  const { projects, projectRunners, workItems } = await import(
    "../../../../../../../../../src/db/schema"
  );
  const { generateBearerToken, hashBearerToken } = await import(
    "../../../../../../../../../src/engine/project-credentials"
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
  if (project.status !== "analysing") {
    return NextResponse.json(
      {
        error: "Project is not in analysing state",
        currentStatus: project.status,
      },
      { status: 400 },
    );
  }

  // Verify per-kind discriminated-union runnerConfig (Brief 223 AC #13).
  const { validateRunnerConfig } = await import(
    "../../../../../../../../../src/engine/runner-config-schemas"
  );
  const cfg = validateRunnerConfig(
    data.defaultRunnerKind,
    data.runnerConfig ?? {},
  );
  if (!cfg.ok) {
    return NextResponse.json(
      {
        error: "runnerConfig validation failed",
        kind: data.defaultRunnerKind,
        details: cfg.error.format(),
      },
      { status: 400 },
    );
  }

  const bearerToken = generateBearerToken();
  const bearerHash = await hashBearerToken(bearerToken);
  const now = new Date();

  // Atomic three-write commit. drizzle-better-sqlite3's transaction is
  // synchronous against the underlying connection — all writes either
  // commit together or roll back on throw.
  let invariantError: { code: string; message: string } | null = null;
  let uniqueCollision = false;
  let updatedReportId: string | null = null;
  try {
    db.transaction((tx) => {
      // 1. Insert project_runners row.
      try {
        tx.insert(projectRunners)
          .values({
            projectId: project.id,
            kind: data.defaultRunnerKind,
            mode: kindToMode(data.defaultRunnerKind as RunnerKind),
            enabled: true,
            configJson: data.runnerConfig ?? {},
            credentialIds: data.credentialIds ?? [],
          })
          .run();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/UNIQUE/i.test(msg)) {
          uniqueCollision = true;
          throw err;
        }
        throw err;
      }

      // 2. Validate status transition (Brief 215 invariant). The runner row
      //    we just inserted should satisfy `enabledRunnerKinds`.
      const enabledRows = tx
        .select({ kind: projectRunners.kind })
        .from(projectRunners)
        .where(
          and(
            eq(projectRunners.projectId, project.id),
            eq(projectRunners.enabled, true),
          ),
        )
        .all();
      const result = validateStatusTransition(
        project.status as ProjectStatus,
        "active",
        {
          defaultRunnerKind: data.defaultRunnerKind as RunnerKind,
          enabledRunnerKinds: new Set(
            enabledRows.map((r) => r.kind as RunnerKind),
          ),
        },
      );
      if (!result.ok) {
        invariantError = {
          code: result.error.code,
          message: result.error.message,
        };
        throw new Error(`invariant: ${result.error.code}`);
      }

      // 3. Flip status + persist runner pick + bearer hash.
      tx.update(projects)
        .set({
          status: "active",
          defaultRunnerKind: data.defaultRunnerKind as RunnerKind,
          runnerBearerHash: bearerHash,
          updatedAt: now,
        })
        .where(eq(projects.id, project.id))
        .run();

      // 4. Mark the onboarding report row 'approved' (with optional edits).
      const reports = tx
        .select({ id: workItems.id, body: workItems.body })
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
        updatedReportId = reports[0].id;
        const body = data.edits
          ? `${reports[0].body ?? ""}\n\n---\nUser edits at confirm:\n${data.edits}`
          : reports[0].body;
        tx.update(workItems)
          .set({
            briefState: "approved",
            stateChangedAt: now,
            body,
            updatedAt: now,
          })
          .where(eq(workItems.id, reports[0].id))
          .run();
      }
    });
  } catch (err) {
    const capturedInvariant = invariantError as
      | { code: string; message: string }
      | null;
    if (capturedInvariant) {
      return NextResponse.json(
        {
          error: "Invalid status transition",
          code: capturedInvariant.code,
          message: capturedInvariant.message,
          from: "analysing",
          to: "active",
        },
        { status: 400 },
      );
    }
    if (uniqueCollision) {
      return NextResponse.json(
        {
          error:
            "A runner of this kind is already configured for this project. Disable or delete it first.",
          kind: data.defaultRunnerKind,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: "Failed to confirm onboarding",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // 5. Retrofitter trigger — Brief 228 fills in the breadcrumb. Kicks off a
  //    SEPARATE process run (project-retrofit.yaml) that walks 4 steps:
  //    generate-plan → surface-plan → dispatch-write → verify-commit. The
  //    retrofit's trust tier inherits via the harness pipeline's existing
  //    parentTrustTier discipline (heartbeat.ts:1743-1750) — we pass
  //    `data.trustTier` (the field the user picked at confirm time) so the
  //    trust-gate honours it at every retrofit step.
  try {
    const { startProcessRun } = await import(
      "../../../../../../../../../src/engine/heartbeat"
    );
    const retrofitRunId = await startProcessRun(
      "project-retrofit",
      { projectId: project.id },
      "event",
      { parentTrustTier: data.trustTier as TrustTier },
    );
    console.log(
      `[onboarding/confirm] retrofit triggered for ${project.slug} (runId=${retrofitRunId}, trustTier=${data.trustTier})`,
    );
  } catch (err) {
    // Retrofit trigger failure is non-fatal to the confirm path — the
    // project is already 'active'; the user can re-trigger via the Re-run
    // button on the onboarding page or the Self tool.
    console.warn(
      `[onboarding/confirm] retrofit trigger failed for ${project.slug}: ${err instanceof Error ? err.message : String(err)} — the project is still active; re-run from /projects/:slug/onboarding`,
    );
  }
  return NextResponse.json(
    {
      projectId: project.id,
      bearerToken,
      bearerOnceWarning: true,
      conversationUrl: `/projects/${project.slug}`,
      reportWorkItemId: updatedReportId,
    },
    { status: 200 },
  );
}
