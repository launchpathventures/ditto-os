/**
 * Projects API — Brief 223 (Brief 215 substrate underneath).
 *
 * GET  /api/v1/projects                    — list, filtered by status != archived
 * GET  /api/v1/projects?includeArchived=1  — list including archived
 * POST /api/v1/projects                    — create + generate bearer (returned ONCE)
 *
 * Workspace-session cookie auth (same pattern as
 * `/api/v1/integrations/unipile`). Production: missing/invalid cookie → 401.
 * Local dev (`WORKSPACE_OWNER_EMAIL` unset): accessible without cookie.
 *
 * The bearer is surfaced once with `bearerOnceWarning: true`; the plaintext
 * is never persisted. Hash uses bcrypt(cost=12) and is stored on
 * `projects.runnerBearerHash` (column landed by Brief 215).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, ne } from "drizzle-orm";
import { RunnerKindSchema, type RunnerKind } from "@ditto/core";
import { z } from "zod";

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

const slugRe = /^[a-z][a-z0-9-]{1,63}$/;
const repoRe = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

const runnerConfigBody = z
  .object({
    kind: RunnerKindSchema,
    config: z.record(z.string(), z.unknown()).optional().default({}),
    credentialIds: z.array(z.string()).optional().default([]),
  })
  .strict();

const createProjectBody = z.object({
  slug: z.string().regex(slugRe, "slug must be lowercase a-z0-9- starting with a letter"),
  name: z.string().min(1).max(120),
  githubRepo: z.string().regex(repoRe, "githubRepo must be in 'owner/repo' shape").optional(),
  defaultBranch: z.string().min(1).max(120).optional(),
  harnessType: z.enum(["catalyst", "native", "none"]).default("none"),
  briefSource: z.enum(["filesystem", "ditto_native", "github_issues"]).optional(),
  briefPath: z.string().max(500).optional(),
  defaultRunnerKind: RunnerKindSchema.optional(),
  fallbackRunnerKind: RunnerKindSchema.optional(),
  runnerChain: z.array(RunnerKindSchema).optional(),
  deployTarget: z.enum(["vercel", "fly", "manual"]).optional(),
  /**
   * Optional first project_runners row — when present, the POST handler
   * inserts the project AND a project_runners row in one transaction.
   */
  runnerConfig: runnerConfigBody.optional(),
  /**
   * Brief 225 — when `true` AND the env var `DITTO_PROJECT_ONBOARDING_READY`
   * is set, the project is created with `kind='build'`, `status='analysing'`,
   * and the `project-onboarding` process run is queued. The bearer is NOT
   * generated yet (deferred to the analysing → active flip). When the env
   * var is unset, this field is silently coerced to false (legacy Brief 223
   * behaviour) so production never strands `analysing` projects whose
   * onboarding surface is hidden.
   */
  kickOffOnboarding: z.boolean().optional(),
});

export async function GET(req: Request) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("includeArchived") === "true";

  const { db } = await import("../../../../../../src/db");
  const { projects } = await import("../../../../../../src/db/schema");
  const rows = await (includeArchived
    ? db.select().from(projects)
    : db.select().from(projects).where(ne(projects.status, "archived")));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: Request) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const parsed = createProjectBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Per-kind discriminated-union validation (Brief 223 AC #13).
  if (data.runnerConfig) {
    const { validateRunnerConfig } = await import(
      "../../../../../../src/engine/runner-config-schemas"
    );
    const r = validateRunnerConfig(
      data.runnerConfig.kind,
      data.runnerConfig.config,
    );
    if (!r.ok) {
      return NextResponse.json(
        {
          error: "runnerConfig validation failed",
          kind: data.runnerConfig.kind,
          details: r.error.format(),
        },
        { status: 400 },
      );
    }
  }

  const { db } = await import("../../../../../../src/db");
  const { projects, projectRunners } = await import(
    "../../../../../../src/db/schema"
  );
  const { kindToMode } = await import("@ditto/core");
  const { generateBearerToken, hashBearerToken } = await import(
    "../../../../../../src/engine/project-credentials"
  );

  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, data.slug))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Slug already exists", slug: data.slug },
      { status: 409 }
    );
  }

  // Brief 225 — env-var-gated onboarding flow. When the gate is closed
  // (production with the surface hidden), `kickOffOnboarding` silently
  // coerces to false so legacy Brief 223 behaviour applies; this prevents
  // stranded `analysing` projects.
  const onboardingFlowReady =
    process.env.DITTO_PROJECT_ONBOARDING_READY === "true";
  const useOnboardingFlow = onboardingFlowReady && data.kickOffOnboarding === true;

  if (useOnboardingFlow) {
    const { createOnboardingProject } = await import(
      "../../../../../../src/engine/projects/create-project-onboarding"
    );
    const result = await createOnboardingProject({
      slug: data.slug,
      name: data.name,
      githubRepo: data.githubRepo,
      defaultBranch: data.defaultBranch,
      harnessType: data.harnessType,
      briefSource: data.briefSource,
      briefPath: data.briefPath,
      deployTarget: data.deployTarget,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json(
      {
        project: result.project,
        // Bearer deferred to confirm-route — explicit null surfaces the
        // contract change to API callers.
        bearerToken: null,
        bearerOnceWarning: false,
        conversationUrl: result.conversationUrl,
      },
      { status: 201 },
    );
  }

  // Legacy Brief 223 path — bearer generated up-front, optional first
  // project_runners row inserted as a convenience wrapper.
  const bearerToken = generateBearerToken();
  const bearerHash = await hashBearerToken(bearerToken);

  const inserted = await db
    .insert(projects)
    .values({
      slug: data.slug,
      name: data.name,
      githubRepo: data.githubRepo,
      defaultBranch: data.defaultBranch ?? "main",
      harnessType: data.harnessType,
      briefSource: data.briefSource,
      briefPath: data.briefPath,
      defaultRunnerKind: data.defaultRunnerKind as RunnerKind | undefined,
      fallbackRunnerKind: data.fallbackRunnerKind as RunnerKind | undefined,
      runnerChain: data.runnerChain as RunnerKind[] | undefined,
      deployTarget: data.deployTarget,
      runnerBearerHash: bearerHash,
      kind: "build",
      // Status: 'active' iff a default runner is named, else 'analysing'.
      status: data.defaultRunnerKind ? "active" : "analysing",
    })
    .returning();

  const project = inserted[0];

  if (data.runnerConfig) {
    await db.insert(projectRunners).values({
      projectId: project.id,
      kind: data.runnerConfig.kind,
      mode: kindToMode(data.runnerConfig.kind as RunnerKind),
      enabled: true,
      configJson: data.runnerConfig.config ?? {},
      credentialIds: data.runnerConfig.credentialIds ?? [],
    });
  }

  return NextResponse.json(
    {
      project,
      bearerToken,
      bearerOnceWarning: true,
    },
    { status: 201 }
  );
}
