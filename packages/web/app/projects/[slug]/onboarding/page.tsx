/**
 * Brief 225 + Brief 226 + Brief 228 — `/projects/:slug/onboarding`
 * Server Component.
 *
 * Renders three flow stages:
 *
 *   1. status === "analysing" — Brief 225/226 BEFORE flow. Looks up the
 *      onboarding workItem; renders the AnalyserReportBlock when present,
 *      AlertBlock when the analyser is blocked, placeholder text otherwise.
 *
 *   2. status === "active" + has retrofit workItem — Brief 228. Renders the
 *      most recent RetrofitPlanBlock inline + a "Re-run retrofit" button.
 *
 *   3. status === "active" + no retrofit workItem yet — renders just the
 *      "Re-run retrofit" button (the user kicks off retrofit explicitly).
 *
 * Returns 404 when the project doesn't exist OR
 * `DITTO_PROJECT_ONBOARDING_READY` is not "true".
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, and } from "drizzle-orm";
import type {
  AnalyserReportBlock,
  AlertBlock,
  RetrofitPlanBlock,
} from "@/lib/engine";
import { BlockRenderer } from "@/components/blocks/block-registry";
import { RerunRetrofitButton } from "./rerun-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectOnboardingPage({ params }: PageProps) {
  if (process.env.DITTO_PROJECT_ONBOARDING_READY !== "true") {
    notFound();
  }
  const { slug } = await params;

  const { db } = await import("@engine/../db");
  const { projects, workItems } = await import("@engine/../db/schema");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) {
    notFound();
  }
  if (project.status !== "analysing" && project.status !== "active") {
    notFound();
  }

  // Brief 225/226: analysing flow uses the most recent project workItem.
  // Brief 228: active flow looks for retrofit workItems specifically — they
  // carry `context.retrofitPlan` (vs the analyser's `context.analyserReport`).
  const allItems = await db
    .select({
      id: workItems.id,
      title: workItems.title,
      body: workItems.body,
      briefState: workItems.briefState,
      context: workItems.context,
      createdAt: workItems.createdAt,
    })
    .from(workItems)
    .where(eq(workItems.projectId, project.id))
    .orderBy(desc(workItems.createdAt));

  const analyserReport = pickFirst(allItems, readAnalyserReport);
  const retrofitBlock = pickFirst(allItems, readRetrofitBlock);
  const blockedAnalyser = allItems.find(
    (i) => i.briefState === "blocked" && readAnalyserReport(i.context) === null,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b border-border bg-white px-4 py-4">
        <Link href="/projects" className="text-sm text-text-secondary">
          ← Projects
        </Link>
        <span className="text-xs text-text-muted">
          {project.slug} · onboarding
        </span>
      </nav>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-bold text-text-primary">
                {project.name}
              </h1>
              <span
                className={
                  project.status === "active"
                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                    : "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                }
              >
                {project.status}
              </span>
            </div>
            <p className="text-sm text-text-muted">
              {project.status === "analysing"
                ? "Ditto is reviewing this repo before anything is committed."
                : "Ditto manages the .ditto/ substrate for this project."}
            </p>
          </div>
          {project.status === "active" && (
            <RerunRetrofitButton projectId={project.id} />
          )}
        </header>

        <section className="mt-6 space-y-4">
          {/* Brief 228 — retrofit block (active flow) */}
          {project.status === "active" && retrofitBlock && (
            <BlockRenderer block={retrofitBlock} />
          )}

          {/* Brief 226 — analyser block (analysing flow) */}
          {project.status === "analysing" && analyserReport && (
            <BlockRenderer block={analyserReport} />
          )}

          {/* Brief 225/226 — analyser blocked state */}
          {project.status === "analysing" && !analyserReport && blockedAnalyser && (
            <BlockRenderer
              block={
                {
                  type: "alert",
                  severity: "error",
                  title: "Onboarding blocked",
                  content:
                    blockedAnalyser.body ??
                    "Analyser couldn't read this repo. Try again or check the GitHub URL.",
                  actions: [{ id: "retry-onboarding", label: "Retry analysis" }],
                } satisfies AlertBlock
              }
            />
          )}

          {/* Analysing-flow placeholder */}
          {project.status === "analysing" && !analyserReport && !blockedAnalyser && (
            <article className="rounded-xl border border-border bg-white p-4 text-sm">
              <h3 className="font-medium text-text-primary">Onboarding report</h3>
              <p className="mt-2 whitespace-pre-line text-text-secondary">
                Analyser is warming up — refresh in a moment.
              </p>
            </article>
          )}

          {/* Active-flow + no retrofit yet */}
          {project.status === "active" && !retrofitBlock && (
            <article className="rounded-xl border border-border bg-white p-4 text-sm">
              <h3 className="font-medium text-text-primary">
                No retrofit yet
              </h3>
              <p className="mt-2 whitespace-pre-line text-text-secondary">
                Tap <strong>Re-run retrofit</strong> above to refresh the
                project&rsquo;s <code>.ditto/</code> substrate, or wait for
                the next scheduled run (when ADR-043&rsquo;s schedule lands).
              </p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

function pickFirst<T>(
  items: Array<{ context: unknown }>,
  reader: (ctx: unknown) => T | null,
): T | null {
  for (const item of items) {
    const v = reader(item.context);
    if (v) return v;
  }
  return null;
}

function readAnalyserReport(context: unknown): AnalyserReportBlock | null {
  if (!context || typeof context !== "object") return null;
  const ctx = context as Record<string, unknown>;
  const candidate = ctx.analyserReport;
  if (!candidate || typeof candidate !== "object") return null;
  const block = candidate as Record<string, unknown>;
  if (block.type !== "analyser_report") return null;
  return candidate as AnalyserReportBlock;
}

function readRetrofitBlock(context: unknown): RetrofitPlanBlock | null {
  if (!context || typeof context !== "object") return null;
  const ctx = context as Record<string, unknown>;
  const candidate = ctx.retrofitPlan;
  if (!candidate || typeof candidate !== "object") return null;
  const block = candidate as Record<string, unknown>;
  if (block.type !== "retrofit_plan") return null;
  return candidate as RetrofitPlanBlock;
}
