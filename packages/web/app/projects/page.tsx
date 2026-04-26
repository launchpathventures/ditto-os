"use client";

/**
 * /projects — Brief 215 admin index.
 *
 * Lists all projects with slug, name, github_repo, default_runner_kind, status.
 * Mobile-first: ≥44pt taps, no horizontal scroll. Empty-state CTA links to
 * /projects/new.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface Project {
  id: string;
  slug: string;
  name: string;
  githubRepo: string | null;
  harnessType: string;
  defaultRunnerKind: string | null;
  status: string;
  updatedAt: number;
}

function timeAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ProjectsIndex() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setProjects(d.projects))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b border-border bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold text-vivid">
            ditto
          </Link>
          <span className="text-sm text-text-muted">/</span>
          <span className="text-sm font-medium text-text-primary">Projects</span>
        </div>
        <Link
          href="/projects/new"
          className="rounded-lg bg-vivid px-4 py-2 text-sm font-semibold text-white"
          style={{ minHeight: 44 }}
        >
          New project
        </Link>
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {projects === null && !error && (
          <p className="text-sm text-text-muted">Loading…</p>
        )}

        {projects && projects.length === 0 && (
          <div className="rounded-xl border border-border bg-white p-6 text-center">
            <h2 className="text-lg font-semibold text-text-primary">No projects yet</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Create your first project to start dispatching work.
            </p>
            <Link
              href="/projects/new"
              className="mt-4 inline-block rounded-lg bg-vivid px-4 py-2 text-sm font-semibold text-white"
              style={{ minHeight: 44 }}
            >
              Create your first project
            </Link>
          </div>
        )}

        {projects && projects.length > 0 && (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.slug}`}
                  className="block rounded-xl border border-border bg-white p-4 hover:border-vivid"
                  style={{ minHeight: 44 }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-semibold text-text-primary">{p.name}</h3>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-text-muted">
                    {p.slug}
                    {p.githubRepo ? ` · ${p.githubRepo}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">
                      harness: {p.harnessType}
                    </span>
                    {p.defaultRunnerKind && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">
                        runner: {p.defaultRunnerKind}
                      </span>
                    )}
                    <span className="ml-auto">updated {timeAgo(p.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
