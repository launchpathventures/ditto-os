/**
 * Brief 225 — Project onboarding creation helper.
 *
 * Single in-process callable that both the `POST /api/v1/projects` route
 * (with `kickOffOnboarding: true`) and the conversation form-submit
 * dispatcher (`surface-actions.ts:handleGithubProjectConnect`) invoke.
 *
 * Keeping this in one place avoids a self-HTTP roundtrip from the
 * surface-actions layer (which would lose the workspace-session cookie
 * and 401 in any deployment with `WORKSPACE_OWNER_EMAIL` set). Callers
 * that need auth perform the cookie check before delegating here.
 *
 * Provenance: Brief 225 §What Changes (route.ts extension); Reviewer C1 fix.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { startProcessRun } from "../heartbeat";

const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;
const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export interface CreateOnboardingProjectInput {
  slug: string;
  name: string;
  githubRepo?: string;
  defaultBranch?: string;
  /**
   * Optional hints forwarded from `POST /api/v1/projects` body. Runner
   * picks (`defaultRunnerKind` etc.) are deliberately not accepted —
   * the onboarding flow defers them to the confirm route.
   */
  harnessType?: "catalyst" | "native" | "none";
  briefSource?: "filesystem" | "ditto_native" | "github_issues";
  briefPath?: string;
  deployTarget?: "vercel" | "fly" | "manual";
}

export type CreateOnboardingProjectResult =
  | { ok: true; project: typeof schema.projects.$inferSelect; processRunId: string | null; conversationUrl: string }
  | { ok: false; error: string; status: number };

/**
 * Create a project in the BEFORE-flow analysing state + queue the
 * `project-onboarding` process run. NO bearer is generated here — the
 * confirm route generates it at the `analysing → active` flip.
 *
 * Caller is responsible for auth (the route handler checks the
 * workspace-session cookie before delegating; the surface-actions
 * handler runs server-side inside the trusted engine context).
 */
export async function createOnboardingProject(
  input: CreateOnboardingProjectInput,
): Promise<CreateOnboardingProjectResult> {
  if (!SLUG_RE.test(input.slug)) {
    return {
      ok: false,
      error: "slug must be lowercase a-z0-9- starting with a letter",
      status: 400,
    };
  }
  if (input.githubRepo && !REPO_RE.test(input.githubRepo)) {
    return {
      ok: false,
      error: "githubRepo must be in 'owner/repo' shape",
      status: 400,
    };
  }
  if (input.name.length === 0 || input.name.length > 120) {
    return {
      ok: false,
      error: "name must be between 1 and 120 characters",
      status: 400,
    };
  }

  const existing = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.slug, input.slug))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error: `Slug "${input.slug}" already exists`,
      status: 409,
    };
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      slug: input.slug,
      name: input.name,
      githubRepo: input.githubRepo,
      defaultBranch: input.defaultBranch ?? "main",
      harnessType: input.harnessType ?? "none",
      briefSource: input.briefSource,
      briefPath: input.briefPath,
      deployTarget: input.deployTarget,
      kind: "build",
      status: "analysing",
      // Bearer + runner picks deferred until the confirm route flips to
      // active.
    })
    .returning();

  let processRunId: string | null = null;
  try {
    processRunId = await startProcessRun(
      "project-onboarding",
      { projectId: project.id },
      "event",
    );
  } catch (err) {
    console.warn(
      `[projects] failed to start project-onboarding run for ${project.slug}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return {
    ok: true,
    project,
    processRunId,
    conversationUrl: `/projects/${project.slug}/onboarding`,
  };
}
