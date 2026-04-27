"use client";

/**
 * /projects/[slug]/runners — Brief 215 per-project runner admin.
 *
 * Mobile-first: ≥44pt taps, no horizontal scroll. Cloud kinds (claude-code-
 * routine, claude-managed-agent, github-action, e2b-sandbox) are visible but
 * disabled with kind-specific tooltips per AC #12.
 */

import Link from "next/link";
import { use, useEffect, useState } from "react";

const RUNNER_KINDS = [
  { value: "local-mac-mini", label: "Local Mac mini", note: null as string | null },
  { value: "claude-code-routine", label: "Claude Code Routine", note: null as string | null },
  { value: "claude-managed-agent", label: "Claude Managed Agent", note: null as string | null },
  { value: "github-action", label: "GitHub Action", note: null as string | null },
  { value: "e2b-sandbox", label: "E2B sandbox", note: "E2B sandbox — deferred" },
] as const;

/**
 * Brief 218 §D16 — copy-pasteable workflow YAML template. Source of truth is
 * `docs/runner-templates/dispatch-coding-work.yml`; the in-page string keeps
 * the admin form self-contained for the "Copy template" button. If the
 * template file is updated, refresh this constant in lockstep.
 */
const DISPATCH_CODING_WORK_YML = `# Ditto runner template — Brief 218 §D16
# Paste this into .github/workflows/dispatch-coding-work.yml in your repo.
name: Ditto — Dispatch coding work

on:
  workflow_dispatch:
    inputs:
      work_item_id:        { type: string,  required: true,  description: "Ditto work item ID" }
      work_item_body:      { type: string,  required: true,  description: "The coding task description" }
      harness_type:        { type: choice,  required: true,  options: [catalyst, native, none] }
      stepRunId:           { type: string,  required: true,  description: "Insight-180 audit ID" }
      callback_url:        { type: string,  required: false, description: "Optional Ditto status webhook URL" }
      dev_review_skill_url:
        type: string
        required: false
        description: "URL to .catalyst/skills/dev-review/SKILL.md (used when harness_type != catalyst)"

jobs:
  dispatch:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Fetch /dev-review skill (native projects only)
        if: \${{ inputs.harness_type != 'catalyst' && inputs.dev_review_skill_url != '' }}
        run: |
          mkdir -p .catalyst/skills/dev-review
          curl -fsSL "\${{ inputs.dev_review_skill_url }}" -o .catalyst/skills/dev-review/SKILL.md
      - name: Run Claude Code with the work-item body
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          # Replace with your preferred Claude Code invocation.
          # Example: pipe the work-item body as the prompt and have it open a PR.
          echo "\${{ inputs.work_item_body }}" | npx @anthropic-ai/claude-code -y --print --skill /dev-review
      - name: Optional callback to Ditto status webhook
        if: \${{ inputs.callback_url != '' }}
        env:
          # In 'in-workflow-secret' callback mode the bearer is in the repo secret;
          # in 'in-workflow' mode the token is already in the callback_url query string.
          DITTO_RUNNER_BEARER: \${{ secrets.DITTO_RUNNER_BEARER }}
        run: |
          AUTH=""
          if [ -n "$DITTO_RUNNER_BEARER" ]; then AUTH="Authorization: Bearer $DITTO_RUNNER_BEARER"; fi
          curl -X POST "\${{ inputs.callback_url }}" \\
            -H "$AUTH" \\
            -H "Content-Type: application/json" \\
            -d "{
              \\"state\\": \\"shipped\\",
              \\"runnerKind\\": \\"github-action\\",
              \\"externalRunId\\": \\"\${{ github.run_id }}\\",
              \\"stepRunId\\": \\"\${{ inputs.stepRunId }}\\"
            }"
`;

interface Runner {
  id: string;
  kind: string;
  mode: string;
  enabled: boolean;
  configJson: Record<string, unknown>;
  lastHealthStatus: string;
  lastHealthCheckAt: number | null;
}

export default function ProjectRunnersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [runners, setRunners] = useState<Runner[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRunners() {
    try {
      const r = await fetch(`/api/v1/projects/${slug}/runners`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setRunners(d.runners);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    loadRunners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function onTestDispatch(kind: string) {
    try {
      const r = await fetch(`/api/v1/projects/${slug}/runners/${kind}/test`, {
        method: "POST",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      await loadRunners();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onVerifyWithApi(kind: string) {
    try {
      const r = await fetch(`/api/v1/projects/${slug}/runners/${kind}/verify`, {
        method: "POST",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      await loadRunners();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onToggle(kind: string, enabled: boolean) {
    try {
      const r = await fetch(`/api/v1/projects/${slug}/runners/${kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadRunners();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b border-border bg-white px-4 py-4">
        <Link href={`/projects/${slug}`} className="text-sm text-text-secondary">
          ← Project
        </Link>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-vivid px-3 py-1.5 text-sm font-semibold text-white"
          style={{ minHeight: 44 }}
        >
          Add runner
        </button>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-xl font-bold text-text-primary">Runners</h1>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {runners && runners.length === 0 && !showAdd && (
          <p className="mt-4 text-sm text-text-muted">
            No runners configured. Tap “Add runner” to wire one.
          </p>
        )}

        {runners && runners.length > 0 && (
          <ul className="mt-4 space-y-3">
            {runners.map((r) => {
              const meta = RUNNER_KINDS.find((k) => k.value === r.kind);
              return (
                <li key={r.id} className="rounded-xl border border-border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-text-primary">
                        {meta?.label ?? r.kind}
                      </h3>
                      <p className="text-xs text-text-muted">
                        {r.mode} · health: {r.lastHealthStatus}
                      </p>
                    </div>
                    <label
                      className="flex shrink-0 items-center gap-2"
                      style={{ minHeight: 44 }}
                    >
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => onToggle(r.kind, e.target.checked)}
                      />
                      <span className="text-xs text-text-secondary">enabled</span>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => onTestDispatch(r.kind)}
                      className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary"
                      style={{ minHeight: 44 }}
                    >
                      Test dispatch
                    </button>
                    {(r.kind === "claude-managed-agent" ||
                      r.kind === "github-action") && (
                      <button
                        onClick={() => onVerifyWithApi(r.kind)}
                        className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary"
                        style={{ minHeight: 44 }}
                      >
                        Verify with API
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showAdd && (
          <AddRunnerForm
            slug={slug}
            existingKinds={new Set((runners ?? []).map((r) => r.kind))}
            onCancel={() => setShowAdd(false)}
            onSaved={async () => {
              setShowAdd(false);
              await loadRunners();
            }}
          />
        )}
      </main>
    </div>
  );
}

function AddRunnerForm(props: {
  slug: string;
  existingKinds: Set<string>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<string>("local-mac-mini");
  const [deviceId, setDeviceId] = useState("");
  const [tmuxSession, setTmuxSession] = useState("");
  const [sshHost, setSshHost] = useState("");
  const [sshUser, setSshUser] = useState("");
  const [credentialId, setCredentialId] = useState("");
  // Brief 216 — claude-code-routine form fields.
  const [routineEndpoint, setRoutineEndpoint] = useState("");
  const [routineBearer, setRoutineBearer] = useState("");
  const [routineRepo, setRoutineRepo] = useState("");
  const [routineBranch, setRoutineBranch] = useState("main");
  // Brief 217 — claude-managed-agent form fields.
  const [maAgentId, setMaAgentId] = useState("");
  const [maAgentVersion, setMaAgentVersion] = useState("");
  const [maEnvironmentId, setMaEnvironmentId] = useState("");
  const [maVaultIds, setMaVaultIds] = useState("");
  const [maRepo, setMaRepo] = useState("");
  const [maBranch, setMaBranch] = useState("main");
  const [maApiKey, setMaApiKey] = useState("");
  const [maObserveEvents, setMaObserveEvents] = useState(false);
  const [maCallbackMode, setMaCallbackMode] =
    useState<"polling" | "in-prompt">("polling");
  // Brief 218 — github-action form fields.
  const [gaRepo, setGaRepo] = useState("");
  const [gaWorkflowFile, setGaWorkflowFile] = useState("dispatch-coding-work.yml");
  const [gaDefaultRef, setGaDefaultRef] = useState("main");
  const [gaPat, setGaPat] = useState("");
  const [gaCallbackMode, setGaCallbackMode] =
    useState<"webhook-only" | "in-workflow-secret" | "in-workflow">(
      "webhook-only",
    );
  const [gaShowTemplate, setGaShowTemplate] = useState(false);
  const [gaTemplateCopied, setGaTemplateCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const config: Record<string, unknown> =
        kind === "local-mac-mini"
          ? {
              deviceId,
              tmuxSession: tmuxSession || undefined,
              sshHost: sshHost || undefined,
              sshUser: sshUser || undefined,
              credentialId: credentialId || undefined,
            }
          : kind === "claude-code-routine"
            ? {
                endpoint_url: routineEndpoint,
                bearer: routineBearer,
                default_repo: routineRepo,
                default_branch: routineBranch || "main",
              }
            : kind === "claude-managed-agent"
              ? {
                  agent_id: maAgentId,
                  agent_version: maAgentVersion ? Number(maAgentVersion) : undefined,
                  environment_id: maEnvironmentId,
                  vault_ids: maVaultIds
                    ? maVaultIds
                        .split(",")
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0)
                    : undefined,
                  default_repo: maRepo,
                  default_branch: maBranch || "main",
                  api_key: maApiKey,
                  callback_mode: maCallbackMode,
                  observe_events: maObserveEvents,
                }
              : kind === "github-action"
                ? {
                    repo: gaRepo,
                    workflowFile: gaWorkflowFile,
                    defaultRef: gaDefaultRef || "main",
                    pat: gaPat,
                    callback_mode: gaCallbackMode,
                  }
                : {};
      const r = await fetch(`/api/v1/projects/${props.slug}/runners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, config }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-4 rounded-xl border border-border bg-white p-4"
    >
      <h2 className="text-base font-semibold text-text-primary">Add runner</h2>

      <fieldset>
        <legend className="text-sm font-medium text-text-secondary">Kind</legend>
        <div className="mt-2 space-y-2">
          {RUNNER_KINDS.map((k) => {
            const disabled = k.note !== null || props.existingKinds.has(k.value);
            return (
              <label
                key={k.value}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  kind === k.value ? "border-vivid bg-vivid-subtle" : "border-border bg-white"
                } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                style={{ minHeight: 44 }}
                aria-disabled={disabled}
                title={k.note ?? (props.existingKinds.has(k.value) ? "Already configured" : undefined)}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={kind === k.value}
                  disabled={disabled}
                  onChange={() => setKind(k.value)}
                />
                <div>
                  <span className="block text-sm font-medium">{k.label}</span>
                  {k.note && <span className="block text-xs text-text-muted">{k.note}</span>}
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {kind === "local-mac-mini" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Device ID</span>
            <input
              required
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              From the bridge pairing flow.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">tmux session</span>
            <input
              type="text"
              value={tmuxSession}
              onChange={(e) => setTmuxSession(e.target.value)}
              placeholder="optional — e.g., ditto-runner"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">SSH host</span>
            <input
              type="text"
              value={sshHost}
              onChange={(e) => setSshHost(e.target.value)}
              placeholder="optional"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">SSH user</span>
            <input
              type="text"
              value={sshUser}
              onChange={(e) => setSshUser(e.target.value)}
              placeholder="optional"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Credential ID</span>
            <input
              type="text"
              value={credentialId}
              onChange={(e) => setCredentialId(e.target.value)}
              placeholder="optional — pointer into credential vault"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
        </div>
      )}

      {kind === "claude-code-routine" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Routine endpoint URL</span>
            <input
              required
              type="url"
              value={routineEndpoint}
              onChange={(e) => setRoutineEndpoint(e.target.value)}
              placeholder="https://api.anthropic.com/v1/claude_code/routines/<trigger_id>/fire"
              className="mt-1 block w-full overflow-x-auto rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Copy from the Anthropic Routines page after you create the trigger.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Bearer token</span>
            <input
              required
              type="password"
              autoComplete="off"
              value={routineBearer}
              onChange={(e) => setRoutineBearer(e.target.value)}
              placeholder="sk-ant-oat01-…"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Stored encrypted in the credential vault. Plaintext is never persisted.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Default repo</span>
            <input
              required
              type="text"
              value={routineRepo}
              onChange={(e) => setRoutineRepo(e.target.value)}
              placeholder="owner/repo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Default branch</span>
            <input
              type="text"
              value={routineBranch}
              onChange={(e) => setRoutineBranch(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
        </div>
      )}

      {kind === "claude-managed-agent" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Agent ID</span>
            <input
              required
              type="text"
              value={maAgentId}
              onChange={(e) => setMaAgentId(e.target.value)}
              placeholder="agt_…"
              className="mt-1 block w-full overflow-x-auto rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Create the Agent in Anthropic&rsquo;s web UI or via the <code>ant</code> CLI, then paste the ID here.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Agent version (optional)</span>
            <input
              type="number"
              min={1}
              value={maAgentVersion}
              onChange={(e) => setMaAgentVersion(e.target.value)}
              placeholder="recommended for stability"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Environment ID</span>
            <input
              required
              type="text"
              value={maEnvironmentId}
              onChange={(e) => setMaEnvironmentId(e.target.value)}
              placeholder="env_…"
              className="mt-1 block w-full overflow-x-auto rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Vault IDs (optional, comma-separated)</span>
            <input
              type="text"
              value={maVaultIds}
              onChange={(e) => setMaVaultIds(e.target.value)}
              placeholder="vault_a, vault_b"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Default repo</span>
            <input
              required
              type="text"
              value={maRepo}
              onChange={(e) => setMaRepo(e.target.value)}
              placeholder="owner/repo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Default branch</span>
            <input
              type="text"
              value={maBranch}
              onChange={(e) => setMaBranch(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Anthropic API key</span>
            <input
              required
              type="password"
              autoComplete="off"
              value={maApiKey}
              onChange={(e) => setMaApiKey(e.target.value)}
              placeholder="sk-ant-…"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Stored encrypted in the credential vault. Plaintext is never persisted.
            </span>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-text-secondary">Callback mode</legend>
            <div className="mt-2 space-y-2">
              {[
                { value: "polling", label: "Polling (default)" },
                { value: "in-prompt", label: "In-prompt callback (advanced)" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    maCallbackMode === opt.value
                      ? "border-vivid bg-vivid-subtle"
                      : "border-border bg-white"
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <input
                    type="radio"
                    name="ma-callback-mode"
                    value={opt.value}
                    checked={maCallbackMode === opt.value}
                    onChange={() =>
                      setMaCallbackMode(opt.value as "polling" | "in-prompt")
                    }
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label
            className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2"
            style={{ minHeight: 44 }}
          >
            <input
              type="checkbox"
              checked={maObserveEvents}
              onChange={(e) => setMaObserveEvents(e.target.checked)}
            />
            <span className="text-sm text-text-secondary">
              Stream session events into the activity log (SSE; off by default)
            </span>
          </label>
        </div>
      )}

      {kind === "github-action" && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Repo</span>
            <input
              required
              type="text"
              value={gaRepo}
              onChange={(e) => setGaRepo(e.target.value)}
              placeholder="owner/repo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              May differ from the project&rsquo;s default GitHub repo (per Brief 218 §D12).
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Workflow file</span>
            <input
              required
              type="text"
              value={gaWorkflowFile}
              onChange={(e) => setGaWorkflowFile(e.target.value)}
              placeholder="dispatch-coding-work.yml"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              The file under <code>.github/workflows/</code> to dispatch.
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Default ref</span>
            <input
              type="text"
              value={gaDefaultRef}
              onChange={(e) => setGaDefaultRef(e.target.value)}
              placeholder="main"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">GitHub PAT</span>
            <input
              required
              type="password"
              autoComplete="off"
              value={gaPat}
              onChange={(e) => setGaPat(e.target.value)}
              placeholder="ghp_…"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Needs <code>actions:write</code> + <code>contents:read</code> scope on the repo. Stored encrypted in the credential vault.
            </span>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-text-secondary">Callback mode</legend>
            <div className="mt-2 space-y-2">
              {[
                { value: "webhook-only", label: "Webhook-only (default; safest)" },
                {
                  value: "in-workflow-secret",
                  label: "In-workflow w/ repo secret (paste DITTO_RUNNER_BEARER once)",
                },
                {
                  value: "in-workflow",
                  label:
                    "In-workflow w/ ephemeral token (NOT log-masked — risk acceptance)",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    gaCallbackMode === opt.value
                      ? "border-vivid bg-vivid-subtle"
                      : "border-border bg-white"
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <input
                    type="radio"
                    name="ga-callback-mode"
                    value={opt.value}
                    checked={gaCallbackMode === opt.value}
                    onChange={() =>
                      setGaCallbackMode(
                        opt.value as
                          | "webhook-only"
                          | "in-workflow-secret"
                          | "in-workflow",
                      )
                    }
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            {gaCallbackMode === "in-workflow" && (
              <p className="mt-2 text-xs text-amber-700">
                Per-dispatch ephemeral tokens may appear in workflow logs (GitHub does not auto-mask
                workflow_dispatch inputs). Tokens are one-trip and per-dispatch; the long-lived bearer
                via &quot;in-workflow-secret&quot; is preferred for callback-heavy workflows.
              </p>
            )}
          </fieldset>
          <div className="rounded-lg border border-border bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-secondary">
                Workflow template
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGaShowTemplate((v) => !v)}
                  className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
                  style={{ minHeight: 44 }}
                >
                  {gaShowTemplate ? "Hide" : "Show"} template
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(DISPATCH_CODING_WORK_YML);
                      setGaTemplateCopied(true);
                      setTimeout(() => setGaTemplateCopied(false), 2000);
                    } catch {
                      setGaTemplateCopied(false);
                    }
                  }}
                  className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
                  style={{ minHeight: 44 }}
                >
                  {gaTemplateCopied ? "Copied!" : "Copy template"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Paste this into <code>.github/workflows/dispatch-coding-work.yml</code> in your repo, then commit and push.
            </p>
            {gaShowTemplate && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-white p-3 text-xs">
                <code>{DISPATCH_CODING_WORK_YML}</code>
              </pre>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-lg bg-vivid px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{ minHeight: 44 }}
        >
          {submitting ? "Saving…" : "Save runner"}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="flex-1 rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium"
          style={{ minHeight: 44 }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
