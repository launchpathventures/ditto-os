"use client";

/**
 * /projects/new — Brief 215 new-project form (mobile-first).
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const RUNNER_KINDS = [
  { value: "local-mac-mini", label: "Local Mac mini", enabled: true },
  { value: "claude-code-routine", label: "Claude Code Routine", enabled: false, note: "coming in sub-brief 216" },
  { value: "claude-managed-agent", label: "Claude Managed Agent", enabled: false, note: "coming in sub-brief 217" },
  { value: "github-action", label: "GitHub Action", enabled: false, note: "coming in sub-brief 218" },
  { value: "e2b-sandbox", label: "E2B sandbox", enabled: false, note: "deferred" },
] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [githubRepo, setGithubRepo] = useState("");
  const [harnessType, setHarnessType] = useState<"catalyst" | "native" | "none">("none");
  const [defaultRunnerKind, setDefaultRunnerKind] = useState<string>("local-mac-mini");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          githubRepo: githubRepo || undefined,
          harnessType,
          defaultRunnerKind,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      router.push(`/projects/${j.project.slug}/runners`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b border-border bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="text-sm text-text-secondary">
            ← Projects
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="text-xl font-bold text-text-primary">New project</h1>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Name</span>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              style={{ minHeight: 44 }}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-text-secondary">Slug</span>
            <input
              required
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              pattern="[a-z][a-z0-9-]{1,63}"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
            <span className="mt-1 block text-xs text-text-muted">
              lowercase a-z 0-9 -, starts with a letter
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-text-secondary">GitHub repo</span>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
              style={{ minHeight: 44 }}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-text-secondary">Harness type</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["catalyst", "native", "none"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                    harnessType === t ? "border-vivid bg-vivid-subtle" : "border-border bg-white"
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <input
                    type="radio"
                    name="harnessType"
                    value={t}
                    checked={harnessType === t}
                    onChange={() => setHarnessType(t)}
                    className="hidden"
                  />
                  <span className="capitalize text-sm">{t}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-text-secondary">Default runner</legend>
            <div className="mt-2 space-y-2">
              {RUNNER_KINDS.map((k) => (
                <label
                  key={k.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                    defaultRunnerKind === k.value ? "border-vivid bg-vivid-subtle" : "border-border bg-white"
                  } ${k.enabled ? "" : "cursor-not-allowed opacity-60"}`}
                  style={{ minHeight: 44 }}
                  aria-disabled={!k.enabled}
                  title={k.enabled ? undefined : (k as any).note}
                >
                  <input
                    type="radio"
                    name="defaultRunnerKind"
                    value={k.value}
                    checked={defaultRunnerKind === k.value}
                    onChange={() => setDefaultRunnerKind(k.value)}
                    disabled={!k.enabled}
                  />
                  <div>
                    <span className="block text-sm font-medium">{k.label}</span>
                    {!k.enabled && (
                      <span className="block text-xs text-text-muted">{(k as any).note}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-vivid px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            {submitting ? "Creating…" : "Create project"}
          </button>
        </form>
      </main>
    </div>
  );
}
