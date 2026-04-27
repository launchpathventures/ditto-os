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
  // Anthropic bearers are typically `sk-ant-oat01-...` and >=80 chars; min 60
  // catches truncation/typos that would otherwise fail at first dispatch.
  bearer: z.string().min(60).regex(/^sk-ant-/, {
    message: "Anthropic bearer must start with sk-ant-",
  }),
  default_repo: z.string().regex(/^[^/]+\/[^/]+$/),
  default_branch: z.string().min(1).default("main"),
  beta_header: z.string().optional(),
});

/**
 * Brief 217 — claude-managed-agent config form. The Anthropic API key is
 * accepted as plaintext at the boundary, written to the credential vault
 * keyed `runner.<projectSlug>.api_key`, and replaced with
 * `bearer_credential_id` before persist.
 */
const claudeManagedAgentConfigForm = z.object({
  agent_id: z.string().regex(/^agt_[a-zA-Z0-9_-]+$/),
  agent_version: z.coerce.number().int().positive().optional(),
  environment_id: z.string().regex(/^env_[a-zA-Z0-9_-]+$/),
  vault_ids: z.array(z.string().min(1)).optional(),
  default_repo: z.string().regex(/^[^/]+\/[^/]+$/),
  default_branch: z.string().min(1).default("main"),
  api_key: z.string().min(20),
  beta_header: z.string().optional(),
  callback_mode: z.enum(["polling", "in-prompt"]).optional(),
  observe_events: z.coerce.boolean().optional(),
});

/**
 * Brief 218 — github-action config form. The GitHub PAT is accepted as
 * plaintext at the boundary, written to the credential vault keyed
 * `runner.<projectSlug>.github_token`, and replaced with `bearer_credential_id`
 * before persist (mirrors Brief 217's pattern).
 */
const githubActionConfigForm = z.object({
  repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  workflowFile: z.string().min(1).regex(/\.ya?ml$/),
  defaultRef: z.string().min(1).default("main"),
  pat: z.string().min(20),
  callback_mode: z
    .enum(["webhook-only", "in-workflow-secret", "in-workflow"])
    .optional(),
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
  "claude-managed-agent": null, // Brief 217 — adapter wired
  "github-action": null, // Brief 218 — adapter wired
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

  // Brief 216 — claude-code-routine: validate the form shape first, then
  // resolve the project slug, then encrypt the bearer with the final
  // service-key in one step (no transient literal-key window).
  let routineCredentialId: string | null = null;
  let routineFinalConfig: Record<string, unknown> | null = null;
  let routineFormParsed:
    | (typeof claudeCodeRoutineConfigForm)["_output"]
    | null = null;
  if (kind === "claude-code-routine") {
    const cfg = claudeCodeRoutineConfigForm.safeParse(data.config);
    if (!cfg.success) {
      return NextResponse.json(
        { error: "Config validation failed", details: cfg.error.format() },
        { status: 400 }
      );
    }
    routineFormParsed = cfg.data;
  }

  // Brief 217 — claude-managed-agent: same pattern.
  let managedAgentCredentialId: string | null = null;
  let managedAgentFinalConfig: Record<string, unknown> | null = null;
  let managedAgentFormParsed:
    | (typeof claudeManagedAgentConfigForm)["_output"]
    | null = null;
  if (kind === "claude-managed-agent") {
    const cfg = claudeManagedAgentConfigForm.safeParse(data.config);
    if (!cfg.success) {
      return NextResponse.json(
        { error: "Config validation failed", details: cfg.error.format() },
        { status: 400 }
      );
    }
    managedAgentFormParsed = cfg.data;
  }

  // Brief 218 — github-action: same pattern.
  let githubActionCredentialId: string | null = null;
  let githubActionFinalConfig: Record<string, unknown> | null = null;
  let githubActionFormParsed:
    | (typeof githubActionConfigForm)["_output"]
    | null = null;
  if (kind === "github-action") {
    const cfg = githubActionConfigForm.safeParse(data.config);
    if (!cfg.success) {
      return NextResponse.json(
        { error: "Config validation failed", details: cfg.error.format() },
        { status: 400 }
      );
    }
    githubActionFormParsed = cfg.data;
  }

  const { db } = await import("../../../../../../../../../src/db");
  const { projectRunners, projects: projectsTable } = await import(
    "../../../../../../../../../src/db/schema"
  );
  const projectId = await resolveProjectId(id);
  if (!projectId) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Resolve slug ONCE up front — needed for routine credential keying.
  const projRow = await db
    .select({ slug: projectsTable.slug })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (projRow.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const projectSlug = projRow[0].slug;

  if (kind === "claude-code-routine" && routineFormParsed) {
    const { routineConfigSchema } = await import(
      "../../../../../../../../../src/adapters/claude-code-routine"
    );
    const { storeProjectCredential } = await import(
      "../../../../../../../../../src/engine/credential-vault"
    );
    // Store with the final service-key directly — no re-key window.
    routineCredentialId = await storeProjectCredential(
      `routine.${projectSlug}.bearer`,
      routineFormParsed.bearer,
    );
    routineFinalConfig = {
      endpoint_url: routineFormParsed.endpoint_url,
      bearer_credential_id: routineCredentialId,
      default_repo: routineFormParsed.default_repo,
      default_branch: routineFormParsed.default_branch,
      ...(routineFormParsed.beta_header
        ? { beta_header: routineFormParsed.beta_header }
        : {}),
    };
    const adapterValidation = routineConfigSchema.safeParse(routineFinalConfig);
    if (!adapterValidation.success) {
      // Best-effort cleanup: delete the credential we just wrote since the
      // project_runners insert won't happen.
      const { deleteCredentialById } = await import(
        "../../../../../../../../../src/engine/credential-vault"
      );
      await deleteCredentialById(routineCredentialId).catch(() => {});
      return NextResponse.json(
        {
          error: "Routine adapter rejected the constructed config",
          details: adapterValidation.error.format(),
        },
        { status: 400 }
      );
    }
  }

  if (kind === "claude-managed-agent" && managedAgentFormParsed) {
    const { managedAgentConfigSchema } = await import(
      "../../../../../../../../../src/adapters/claude-managed-agent"
    );
    const { storeProjectCredential } = await import(
      "../../../../../../../../../src/engine/credential-vault"
    );
    managedAgentCredentialId = await storeProjectCredential(
      `runner.${projectSlug}.api_key`,
      managedAgentFormParsed.api_key,
    );
    managedAgentFinalConfig = {
      agent_id: managedAgentFormParsed.agent_id,
      ...(managedAgentFormParsed.agent_version
        ? { agent_version: managedAgentFormParsed.agent_version }
        : {}),
      environment_id: managedAgentFormParsed.environment_id,
      ...(managedAgentFormParsed.vault_ids
        ? { vault_ids: managedAgentFormParsed.vault_ids }
        : {}),
      default_repo: managedAgentFormParsed.default_repo,
      default_branch: managedAgentFormParsed.default_branch,
      bearer_credential_id: managedAgentCredentialId,
      ...(managedAgentFormParsed.beta_header
        ? { beta_header: managedAgentFormParsed.beta_header }
        : {}),
      ...(managedAgentFormParsed.callback_mode
        ? { callback_mode: managedAgentFormParsed.callback_mode }
        : {}),
      ...(managedAgentFormParsed.observe_events !== undefined
        ? { observe_events: managedAgentFormParsed.observe_events }
        : {}),
    };
    const adapterValidation = managedAgentConfigSchema.safeParse(
      managedAgentFinalConfig,
    );
    if (!adapterValidation.success) {
      const { deleteCredentialById } = await import(
        "../../../../../../../../../src/engine/credential-vault"
      );
      await deleteCredentialById(managedAgentCredentialId).catch(() => {});
      return NextResponse.json(
        {
          error: "Managed-agent adapter rejected the constructed config",
          details: adapterValidation.error.format(),
        },
        { status: 400 }
      );
    }
  }

  if (kind === "github-action" && githubActionFormParsed) {
    const { githubActionConfigSchema } = await import(
      "../../../../../../../../../src/adapters/github-action"
    );
    const { storeProjectCredential } = await import(
      "../../../../../../../../../src/engine/credential-vault"
    );
    githubActionCredentialId = await storeProjectCredential(
      `runner.${projectSlug}.github_token`,
      githubActionFormParsed.pat,
    );
    githubActionFinalConfig = {
      repo: githubActionFormParsed.repo,
      workflowFile: githubActionFormParsed.workflowFile,
      defaultRef: githubActionFormParsed.defaultRef,
      bearer_credential_id: githubActionCredentialId,
      ...(githubActionFormParsed.callback_mode
        ? { callback_mode: githubActionFormParsed.callback_mode }
        : {}),
    };
    const adapterValidation = githubActionConfigSchema.safeParse(
      githubActionFinalConfig,
    );
    if (!adapterValidation.success) {
      const { deleteCredentialById } = await import(
        "../../../../../../../../../src/engine/credential-vault"
      );
      await deleteCredentialById(githubActionCredentialId).catch(() => {});
      return NextResponse.json(
        {
          error: "github-action adapter rejected the constructed config",
          details: adapterValidation.error.format(),
        },
        { status: 400 }
      );
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
      : kind === "claude-managed-agent" && managedAgentFinalConfig
        ? managedAgentFinalConfig
        : kind === "github-action" && githubActionFinalConfig
          ? githubActionFinalConfig
          : data.config;
  const persistedCredentialIds =
    kind === "claude-code-routine" && routineCredentialId
      ? [routineCredentialId, ...data.credentialIds]
      : kind === "claude-managed-agent" && managedAgentCredentialId
        ? [managedAgentCredentialId, ...data.credentialIds]
        : kind === "github-action" && githubActionCredentialId
          ? [githubActionCredentialId, ...data.credentialIds]
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
