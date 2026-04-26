"use client";

/**
 * /projects/[slug] — Brief 215 project detail (mobile-first).
 *
 * Tabs: Overview, Runners, Activity (placeholder for sub-brief 221's metrics).
 */

import Link from "next/link";
import { use, useEffect, useState } from "react";

interface Project {
  id: string;
  slug: string;
  name: string;
  githubRepo: string | null;
  defaultBranch: string;
  harnessType: string;
  briefSource: string | null;
  briefPath: string | null;
  defaultRunnerKind: string | null;
  fallbackRunnerKind: string | null;
  runnerChain: string[] | null;
  deployTarget: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/projects/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setProject(d.project))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [slug]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b border-border bg-white px-4 py-4">
        <Link href="/projects" className="text-sm text-text-secondary">
          ← Projects
        </Link>
        {project && (
          <Link
            href={`/projects/${project.slug}/runners`}
            className="rounded-lg bg-vivid px-3 py-1.5 text-sm font-semibold text-white"
            style={{ minHeight: 44 }}
          >
            Runners
          </Link>
        )}
      </nav>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!project && !error && <p className="text-sm text-text-muted">Loading…</p>}

        {project && (
          <>
            <header>
              <div className="flex items-baseline gap-3">
                <h1 className="text-xl font-bold text-text-primary">{project.name}</h1>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
                  {project.status}
                </span>
              </div>
              <p className="text-sm text-text-muted">{project.slug}</p>
            </header>

            <section className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Overview
              </h2>
              <dl className="rounded-xl border border-border bg-white p-4 text-sm">
                <Row label="GitHub repo" value={project.githubRepo} />
                <Row label="Default branch" value={project.defaultBranch} />
                <Row label="Harness type" value={project.harnessType} />
                <Row label="Default runner" value={project.defaultRunnerKind} />
                <Row label="Fallback runner" value={project.fallbackRunnerKind} />
                <Row label="Brief source" value={project.briefSource} />
                <Row label="Brief path" value={project.briefPath} />
                <Row label="Deploy target" value={project.deployTarget} />
              </dl>
            </section>

            <section className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                Recent dispatches
              </h2>
              <p className="text-sm text-text-muted">
                Sub-brief 221 surfaces runner-dispatch metrics here.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-1.5 last:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value ?? "—"}</dd>
    </div>
  );
}
