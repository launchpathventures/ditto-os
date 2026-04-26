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
  { value: "claude-managed-agent", label: "Claude Managed Agent", note: "Managed Agents — coming in sub-brief 217" },
  { value: "github-action", label: "GitHub Action", note: "GitHub Actions — coming in sub-brief 218" },
  { value: "e2b-sandbox", label: "E2B sandbox", note: "E2B sandbox — deferred" },
] as const;

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

                  <button
                    onClick={() => onTestDispatch(r.kind)}
                    className="mt-3 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary"
                    style={{ minHeight: 44 }}
                  >
                    Test dispatch
                  </button>
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
