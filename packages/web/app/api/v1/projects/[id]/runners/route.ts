/**
 * Project Runners API — Brief 215 §"What Changes".
 *
 * GET  /api/v1/projects/:id/runners — list configured runners for project
 * POST /api/v1/projects/:id/runners — add a new project_runner
 *
 * Per AC #13: cloud kinds (claude-code-routine, claude-managed-agent,
 * github-action, e2b-sandbox) return 501 because their adapters ship in
 * sub-briefs 216-218. Only `local-mac-mini` validates against its config
 * schema (Brief 215's adapter shim) and stores correctly.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { kindToMode, type RunnerKind } from "@ditto/core";
import { resolveProjectId } from "../../../../../../../../src/engine/projects/resolve-project-id";

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

const localMacMiniConfig = z.object({
  deviceId: z.string().min(1),
  tmuxSession: z.string().optional(),
  sshHost: z.string().optional(),
  sshUser: z.string().optional(),
  credentialId: z.string().optional(),
});

/**
 * Brief 216 — claude-code-routine config form. The bearer is accepted as
 * plaintext at the boundary, written to the credential vault as a project-
 * scoped credential, and replaced with `bearer_credential_id` before persist.
 */
const claudeCodeRoutineConfigForm = z.object({
  endpoint_url: z.string().url(),
  bearer: z.string().min(20),
  default_repo: z.string().regex(/^[^/]+\/[^/]+$/),
  default_branch: z.string().min(1).default("main"),
  beta_header: z.string().optional(),
});

const createRunnerBody = z.object({
  kind: z.enum([
    "local-mac-mini",
    "claude-code-routine",
    "claude-managed-agent",
    "github-action",
    "e2b-sandbox",
  ]),
  config: z.record(z.string(), z.unknown()).default({}),
  credentialIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

const NOT_YET_IMPLEMENTED: Record<RunnerKind, string | null> = {
  "local-mac-mini": null,
  "claude-code-routine": null, // Brief 216 — adapter wired
  "claude-managed-agent": "Runner kind not yet implemented (sub-brief 217).",
  "github-action": "Runner kind not yet implemented (sub-brief 218).",
  "e2b-sandbox": "Runner kind not yet implemented (deferred).",
};


export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const { db } = await import("../../../../../../../../../src/db");
  const { projectRunners } = await import(
    "../../../../../../../../../src/db/schema"
  );
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(projectRunners)
    .where(eq(projectRunners.projectId, projectId));
  return NextResponse.json({ runners: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = createRunnerBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const kind = data.kind as RunnerKind;

  // Sub-brief gating per AC #13.
  if (NOT_YET_IMPLEMENTED[kind]) {
    return NextResponse.json(
      { error: NOT_YET_IMPLEMENTED[kind], kind },
      { status: 501 }
    );
  }

  // Validate kind-specific config schema for local-mac-mini.
  if (kind === "local-mac-mini") {
    const cfg = localMacMiniConfig.safeParse(data.config);
    if (!cfg.success) {
      return NextResponse.json(
        { error: "Config validation failed", details: cfg.error.format() },
        { status: 400 }
      );
    }
  }

  // Brief 216 — claude-code-routine: validate the form shape, then encrypt
  // the bearer into the credential vault and replace plaintext with id.
  let routineCredentialId: string | null = null;
  let routineFinalConfig: Record<string, unknown> | null = null;
  if (kind === "claude-code-routine") {
    const cfg = claudeCodeRoutineConfigForm.safeParse(data.config);
    if (!cfg.success) {
      return NextResponse.json(
        { error: "Config validation failed", details: cfg.error.format() },
        { status: 400 }
      );
    }
    // Verify the routine adapter accepts the resulting persisted shape.
    const { routineConfigSchema } = await import(
      "../../../../../../../../../src/adapters/claude-code-routine"
    );
    const { storeProjectCredential } = await import(
      "../../../../../../../../../src/engine/credential-vault"
    );
    routineCredentialId = await storeProjectCredential(
      `routine.<projectSlug>.bearer`,
      cfg.data.bearer,
    );
    routineFinalConfig = {
      endpoint_url: cfg.data.endpoint_url,
      bearer_credential_id: routineCredentialId,
      default_repo: cfg.data.default_repo,
      default_branch: cfg.data.default_branch,
      ...(cfg.data.beta_header ? { beta_header: cfg.data.beta_header } : {}),
    };
    const adapterValidation = routineConfigSchema.safeParse(routineFinalConfig);
    if (!adapterValidation.success) {
      return NextResponse.json(
        {
          error: "Routine adapter rejected the constructed config",
          details: adapterValidation.error.format(),
        },
        { status: 400 }
      );
    }
  }

  const { db } = await import("../../../../../../../../../src/db");
  const { projectRunners } = await import(
    "../../../../../../../../../src/db/schema"
  );
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Re-key the credential service to use the project slug for clarity in audit.
  if (kind === "claude-code-routine" && routineCredentialId) {
    const { projects: projectsTable } = await import(
      "../../../../../../../../../src/db/schema"
    );
    const projRow = await db
      .select({ slug: projectsTable.slug })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (projRow.length > 0) {
      const { credentials } = await import(
        "../../../../../../../../../src/db/schema"
      );
      await db
        .update(credentials)
        .set({ service: `routine.${projRow[0].slug}.bearer` })
        .where(eq(credentials.id, routineCredentialId));
    }
  }

  // Reject duplicate (projectId, kind) up front for a clean 409 — UNIQUE
  // constraint would otherwise surface as a 500.
  const existing = await db
    .select({ id: projectRunners.id })
    .from(projectRunners)
    .where(
      and(eq(projectRunners.projectId, projectId), eq(projectRunners.kind, kind))
    )
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A runner of this kind already exists for the project", kind },
      { status: 409 }
    );
  }

  const persistedConfig =
    kind === "claude-code-routine" && routineFinalConfig
      ? routineFinalConfig
      : data.config;
  const persistedCredentialIds =
    kind === "claude-code-routine" && routineCredentialId
      ? [routineCredentialId, ...data.credentialIds]
      : data.credentialIds;

  const inserted = await db
    .insert(projectRunners)
    .values({
      projectId,
      kind,
      mode: kindToMode(kind),
      enabled: data.enabled,
      configJson: persistedConfig,
      credentialIds: persistedCredentialIds,
      lastHealthStatus: "unknown",
    })
    .returning();

  return NextResponse.json({ runner: inserted[0] }, { status: 201 });
}
