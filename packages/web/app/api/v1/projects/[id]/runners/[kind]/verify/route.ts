/**
 * Verify-with-API endpoint — Brief 217 §D8 + Brief 218 §D7.
 *
 *   POST /api/v1/projects/:id/runners/:kind/verify
 *
 * Manual-only live API probe. Per kind:
 *  - `claude-managed-agent`: `GET /v1/agents/{agent_id}` against Anthropic.
 *  - `github-action`: `GET /repos/{owner}/{repo}/actions/workflows` against
 *    GitHub. `actions:read` scope is sufficient — verifies the PAT can list
 *    the configured repo's workflows without firing a dispatch.
 *
 * Updates `project_runners.last_health_status` to one of:
 *   - "healthy"          — 200 OK
 *   - "unauthenticated"  — 401 / 403
 *   - "unreachable"      — non-2xx other / network error
 *
 * NEVER fired automatically (rate-limit / cost). Health checks (called from
 * the dispatcher's pre-dispatch path) remain config-validity only.
 *
 * `local-mac-mini`, `claude-code-routine`, `e2b-sandbox` return 501 — verify
 * is per-kind opt-in.
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

const ENDPOINT_BASE = "https://api.anthropic.com";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id, kind } = await params;

  if (!isKnownKind(kind)) {
    return NextResponse.json({ error: `Unknown runner kind: ${kind}` }, { status: 400 });
  }

  if (kind !== "claude-managed-agent" && kind !== "github-action") {
    return NextResponse.json(
      {
        error: `Verify-with-API for ${kind} not implemented (only claude-managed-agent and github-action are supported).`,
      },
      { status: 501 },
    );
  }

  const { db } = await import("../../../../../../../../../../src/db");
  const { projects, projectRunners } = await import(
    "../../../../../../../../../../src/db/schema"
  );
  const { getCredentialById } = await import(
    "../../../../../../../../../../src/engine/credential-vault"
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
      and(
        eq(projectRunners.projectId, projectRows[0].id),
        eq(projectRunners.kind, kind),
      ),
    )
    .limit(1);
  if (runnerRow.length === 0) {
    return NextResponse.json({ error: "Runner config not found" }, { status: 404 });
  }

  if (kind === "claude-managed-agent") {
    const { managedAgentConfigSchema } = await import(
      "../../../../../../../../../../src/adapters/claude-managed-agent"
    );
    const cfg = managedAgentConfigSchema.safeParse(runnerRow[0].configJson);
    if (!cfg.success) {
      await db
        .update(projectRunners)
        .set({ lastHealthCheckAt: new Date(), lastHealthStatus: "unauthenticated" })
        .where(eq(projectRunners.id, runnerRow[0].id));
      return NextResponse.json(
        {
          status: "unauthenticated",
          reason: `config invalid: ${cfg.error.message}`,
        },
        { status: 200 },
      );
    }

    const credential = await getCredentialById(cfg.data.bearer_credential_id);
    if (!credential) {
      await db
        .update(projectRunners)
        .set({ lastHealthCheckAt: new Date(), lastHealthStatus: "unauthenticated" })
        .where(eq(projectRunners.id, runnerRow[0].id));
      return NextResponse.json(
        { status: "unauthenticated", reason: "API key credential not in vault" },
        { status: 200 },
      );
    }

    const betaHeader =
      cfg.data.beta_header ??
      process.env.MANAGED_AGENT_BETA_HEADER ??
      "managed-agents-2026-04-01";

    let probeStatus: "healthy" | "unauthenticated" | "unreachable" = "unreachable";
    let reason: string | null = null;
    try {
      const res = await fetch(`${ENDPOINT_BASE}/v1/agents/${cfg.data.agent_id}`, {
        method: "GET",
        headers: {
          "x-api-key": credential.value,
          "anthropic-beta": betaHeader,
        },
      });
      if (res.ok) {
        probeStatus = "healthy";
      } else if (res.status === 401 || res.status === 403) {
        probeStatus = "unauthenticated";
        reason = `Anthropic returned ${res.status}`;
      } else {
        probeStatus = "unreachable";
        reason = `Anthropic returned ${res.status}`;
      }
    } catch (e) {
      probeStatus = "unreachable";
      reason = e instanceof Error ? e.message : String(e);
    }

    await db
      .update(projectRunners)
      .set({ lastHealthCheckAt: new Date(), lastHealthStatus: probeStatus })
      .where(eq(projectRunners.id, runnerRow[0].id));

    return NextResponse.json({ status: probeStatus, reason });
  }

  // kind === "github-action" — Brief 218 §D7.
  const { githubActionConfigSchema } = await import(
    "../../../../../../../../../../src/adapters/github-action"
  );
  const cfg = githubActionConfigSchema.safeParse(runnerRow[0].configJson);
  if (!cfg.success) {
    await db
      .update(projectRunners)
      .set({ lastHealthCheckAt: new Date(), lastHealthStatus: "unauthenticated" })
      .where(eq(projectRunners.id, runnerRow[0].id));
    return NextResponse.json(
      {
        status: "unauthenticated",
        reason: `config invalid: ${cfg.error.message}`,
      },
      { status: 200 },
    );
  }
  const credential = await getCredentialById(cfg.data.bearer_credential_id);
  if (!credential) {
    await db
      .update(projectRunners)
      .set({ lastHealthCheckAt: new Date(), lastHealthStatus: "unauthenticated" })
      .where(eq(projectRunners.id, runnerRow[0].id));
    return NextResponse.json(
      { status: "unauthenticated", reason: "GitHub PAT not in vault" },
      { status: 200 },
    );
  }
  const [owner, repo] = cfg.data.repo.split("/");
  let probeStatus: "healthy" | "unauthenticated" | "unreachable" = "unreachable";
  let reason: string | null = null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credential.value}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (res.ok) {
      probeStatus = "healthy";
    } else if (res.status === 401 || res.status === 403) {
      probeStatus = "unauthenticated";
      reason = `GitHub returned ${res.status}`;
    } else {
      probeStatus = "unreachable";
      reason = `GitHub returned ${res.status}`;
    }
  } catch (e) {
    probeStatus = "unreachable";
    reason = e instanceof Error ? e.message : String(e);
  }
  await db
    .update(projectRunners)
    .set({ lastHealthCheckAt: new Date(), lastHealthStatus: probeStatus })
    .where(eq(projectRunners.id, runnerRow[0].id));
  return NextResponse.json({ status: probeStatus, reason });
}
