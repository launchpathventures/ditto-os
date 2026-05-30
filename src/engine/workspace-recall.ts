/**
 * Ditto — Workspace Recall (Brief 281)
 *
 * A single read-only retrieval layer over the durable workspace records:
 * projects, processes, memories, work items, reviews, and recent activity.
 *
 * This is the shared substrate behind two surfaces:
 *   - the `search_workspace` Self tool (Mira answers "where did that go?"
 *     inline, in the conversation)
 *   - the `/api/v1/workspace/archive` route (the chat-header Archive drawer)
 *
 * Neither surface reimplements query logic. Self calls `recallWorkspace()`
 * in-process (never self-HTTP — Insight-211); the route is a thin auth
 * adapter over the same helper.
 *
 * Read-only by contract: this module never mutates state. It returns
 * normalized {@link RecallResult} records with real route shapes
 * (`/projects/[slug]`, `/process/[id]`, `/memories/[id]`) so a result is
 * always a working drill link, never an invented URL.
 *
 * Archived records are hidden unless `includeArchived` is set, so the
 * default recall surface stays focused (Brief 281 AC12).
 *
 * `projectSlug` is a true single-project restriction applied consistently
 * across every kind that can belong to a project (projects, processes,
 * work, project-scoped memories, reviews). Kinds with no reliable project
 * linkage (recent activity) are omitted when a project filter is active
 * rather than leaking cross-project rows. An unresolved slug yields no
 * results — never the unscoped set.
 *
 * Provenance: Brief 281; process-data.ts (db/schema access pattern,
 * Brief 042); api/v1/memories/[id] (process-scope → project resolution).
 */

import { db, schema } from "../db";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import type { TrustTier } from "../db/schema";

// ============================================================
// Types
// ============================================================

/** Human-facing artifact families. Labels stay human ("Projects",
 * "Processes", …) at the surface — never schema/table names. */
export type RecallKind =
  | "project"
  | "process"
  | "memory"
  | "work"
  | "review"
  | "activity";

export const ALL_RECALL_KINDS: readonly RecallKind[] = [
  "project",
  "process",
  "memory",
  "work",
  "review",
  "activity",
] as const;

/** Human label for a kind — the surface uses these, never table names. */
export const RECALL_KIND_LABEL: Record<RecallKind, string> = {
  project: "Projects",
  process: "Processes",
  memory: "Memories",
  work: "Work",
  review: "Reviews",
  activity: "Recent activity",
};

/**
 * A normalized recall row. `route` is present only when a real
 * user-facing page exists for the entity; callers must not synthesize
 * links from `id` when `route` is absent (Brief 281: no invented routes).
 */
export interface RecallResult {
  kind: RecallKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Lifecycle/status label, already humanized where it helps. */
  status?: string;
  /** ISO-8601 last-updated time, when the source carries one. */
  updatedAt?: string;
  /** Owning project slug, when the entity belongs to a project. */
  projectSlug?: string;
  /** Real route shape. Absent ⇒ no drill page exists; do not invent one. */
  route?: string;
  /** Short excerpt — used for memory/knowledge evidence. */
  evidence?: string;
  /** Source/scope evidence lines (memory scope, activity actor, …). */
  provenance?: string[];
  /** True when the entity is archived (only surfaced on request). */
  archived?: boolean;
  /** Memory scope (drives the Brief-227 scope pill on citations). */
  memoryScopeType?: "process" | "self";
  /** Memory type (correction | preference | …) for citation rendering. */
  memoryType?: string;
}

export interface RecallInput {
  /** Free-text filter, case-insensitive substring over title/subtitle/evidence. */
  query?: string;
  /** Restrict to these artifact families. Default: all. */
  kinds?: RecallKind[];
  /** Restrict to one project (slug). */
  projectSlug?: string;
  /** Restrict to this lifecycle/status value (exact, case-insensitive). */
  status?: string;
  /** Include archived/inactive records. Default: false. */
  includeArchived?: boolean;
  /** Max results returned across all kinds. Default 8, hard cap 25. */
  limit?: number;
}

export interface RecallResponse {
  results: RecallResult[];
  /** Total matched per kind BEFORE the result cap — drives "show more". */
  counts: Record<RecallKind, number>;
  /** True when more matched than were returned. */
  truncated: boolean;
  query: string | null;
  kinds: RecallKind[];
}

/**
 * Project filter resolved ONCE per `recallWorkspace` call, then threaded
 * into every collector. Resolving here (not per-kind) removes the old
 * per-collector slug lookups and the `" none"` sentinel.
 */
interface ProjectFilter {
  /** True when the caller passed a `projectSlug`. */
  active: boolean;
  /** Resolved project id, or null when `active` and the slug didn't match. */
  projectId: string | null;
  /** True when a slug was given but no project matched it. */
  unresolved: boolean;
}

// ============================================================
// Tuning
// ============================================================

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
/** Per-kind scan ceiling — bounds DB work and keeps counts honest-ish. */
const SCAN_PER_KIND = 200;
/** Memory/activity excerpt length. */
const EXCERPT_LEN = 220;

// ============================================================
// Helpers
// ============================================================

function excerpt(text: string, len = EXCERPT_LEN): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= len ? t : `${t.slice(0, len - 1)}…`;
}

function matchesQuery(r: RecallResult, q: string | null): boolean {
  if (!q) return true;
  const hay = [r.title, r.subtitle, r.evidence, r.status, ...(r.provenance ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function iso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  if (typeof d === "string") return d;
  return d.toISOString();
}

function trustTierLabel(t: TrustTier | string | null | undefined): string {
  switch (t) {
    case "critical":
      return "Check everything";
    case "spot_checked":
      return "Spot-checked";
    case "autonomous":
      return "Autonomous";
    default:
      return "Supervised";
  }
}

// ============================================================
// Per-kind collectors — each returns the full matched set (capped at
// SCAN_PER_KIND) so `counts` reflects the real match total.
//
// Every collector takes the resolved ProjectFilter. When the slug was
// given but didn't resolve, all project-scopable kinds short-circuit to
// [] so a bad slug never falls back to the unscoped set.
// ============================================================

async function recallProjects(
  input: RecallInput,
  pf: ProjectFilter,
): Promise<RecallResult[]> {
  if (pf.unresolved) return [];
  const conds = [];
  if (!input.includeArchived) conds.push(ne(schema.projects.status, "archived"));
  if (pf.active && input.projectSlug)
    conds.push(eq(schema.projects.slug, input.projectSlug));

  const rows = await db
    .select()
    .from(schema.projects)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.projects.updatedAt));

  return rows.slice(0, SCAN_PER_KIND).map((p) => ({
    kind: "project" as const,
    id: p.id,
    title: p.name,
    subtitle: p.githubRepo ?? p.slug,
    status: p.status,
    updatedAt: iso(p.updatedAt),
    projectSlug: p.slug,
    route: `/projects/${p.slug}`,
    archived: p.status === "archived",
  }));
}

async function recallProcesses(
  input: RecallInput,
  pf: ProjectFilter,
): Promise<RecallResult[]> {
  if (pf.unresolved) return [];
  // Default surface is active processes only; includeArchived widens it.
  const conds = [];
  if (!input.includeArchived) conds.push(eq(schema.processes.status, "active"));
  if (pf.projectId) conds.push(eq(schema.processes.projectId, pf.projectId));

  const rows = await db
    .select()
    .from(schema.processes)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.processes.updatedAt));

  return rows.slice(0, SCAN_PER_KIND).map((p) => {
    const def = (p.definition as Record<string, unknown>) ?? {};
    const isSystem = def.system === true;
    return {
      kind: "process" as const,
      id: p.id,
      title: p.name,
      subtitle: isSystem ? "System process" : p.description ?? undefined,
      status: `${p.status} · ${trustTierLabel(p.trustTier as TrustTier)}`,
      updatedAt: iso(p.updatedAt),
      route: `/process/${p.id}`,
      archived: p.status === "archived",
    };
  });
}

async function recallMemories(
  input: RecallInput,
  pf: ProjectFilter,
): Promise<RecallResult[]> {
  if (pf.unresolved) return [];
  const conds = [];
  if (!input.includeArchived) conds.push(eq(schema.memories.active, true));

  const rows = (
    await db
      .select()
      .from(schema.memories)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.memories.updatedAt))
  ).slice(0, SCAN_PER_KIND);

  // Batch process-scope → project resolution (was an N+1: two awaited
  // queries per memory). One IN query for the scoped processes, one for
  // their projects, then map in memory.
  const procScopeIds = [
    ...new Set(
      rows.filter((m) => m.scopeType === "process").map((m) => m.scopeId),
    ),
  ];
  const procRows = procScopeIds.length
    ? await db
        .select({
          id: schema.processes.id,
          projectId: schema.processes.projectId,
        })
        .from(schema.processes)
        .where(inArray(schema.processes.id, procScopeIds))
    : [];
  const procToProjectId = new Map(
    procRows.map((p) => [p.id, p.projectId ?? null] as const),
  );
  const projectIds = [
    ...new Set(
      [...procToProjectId.values()].filter((v): v is string => !!v),
    ),
  ];
  const projRows = projectIds.length
    ? await db
        .select({ id: schema.projects.id, slug: schema.projects.slug })
        .from(schema.projects)
        .where(inArray(schema.projects.id, projectIds))
    : [];
  const projIdToSlug = new Map(projRows.map((p) => [p.id, p.slug] as const));

  const out: RecallResult[] = [];
  for (const m of rows) {
    const projectId =
      m.scopeType === "process"
        ? procToProjectId.get(m.scopeId) ?? null
        : null;
    const projectSlug = projectId
      ? projIdToSlug.get(projectId) ?? undefined
      : undefined;

    // Single-project restriction: a process-scope memory belongs to its
    // process's project; a self-scope memory belongs to a project only
    // when it's a Brief-227 hybrid that lists that project. Full
    // self-scope memories are global, not project artifacts — excluded
    // when a project filter is active.
    if (pf.projectId) {
      const appliesToProject =
        (m.scopeType === "process" && projectId === pf.projectId) ||
        (m.scopeType === "self" &&
          Array.isArray(m.appliedProjectIds) &&
          m.appliedProjectIds.includes(pf.projectId));
      if (!appliesToProject) continue;
    }

    const provenance = [
      `Scope: ${m.scopeType === "process" ? "Process" : "Self"}`,
      `Type: ${m.type}`,
      `Source: ${m.source}`,
      `Confidence: ${Math.round((m.confidence ?? 0) * 100)}%`,
      `Reinforced ×${m.reinforcementCount ?? 1}`,
    ];
    if (projectSlug) provenance.push(`Project: ${projectSlug}`);

    out.push({
      kind: "memory",
      id: m.id,
      title: excerpt(m.content, 80),
      subtitle: `${m.type} · ${m.scopeType === "process" ? "process scope" : "self scope"}`,
      status: m.active ? undefined : "inactive",
      updatedAt: iso(m.updatedAt),
      projectSlug,
      route: `/memories/${m.id}`,
      evidence: excerpt(m.content),
      provenance,
      archived: !m.active,
      memoryScopeType: m.scopeType === "process" ? "process" : "self",
      memoryType: m.type,
    });
  }
  return out;
}

async function recallWork(
  input: RecallInput,
  pf: ProjectFilter,
): Promise<RecallResult[]> {
  if (pf.unresolved) return [];
  // Active work by default. Archived/closed surfaced only on request.
  const activeStatuses = ["intake", "routed", "in_progress", "waiting_human"] as const;
  const conds = [];
  if (!input.includeArchived)
    conds.push(
      or(
        eq(schema.workItems.status, "intake"),
        eq(schema.workItems.status, "routed"),
        eq(schema.workItems.status, "in_progress"),
        eq(schema.workItems.status, "waiting_human"),
      ),
    );
  if (pf.projectId) conds.push(eq(schema.workItems.projectId, pf.projectId));

  const rows = await db
    .select()
    .from(schema.workItems)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.workItems.updatedAt));

  return rows.slice(0, SCAN_PER_KIND).map((w) => {
    // Drill to the assigned process when one exists; work items have no
    // standalone page, so no route is invented otherwise (Brief 281 AC10).
    const route = w.assignedProcess ? `/process/${w.assignedProcess}` : undefined;
    const isActive = (activeStatuses as readonly string[]).includes(w.status);
    return {
      kind: "work" as const,
      id: w.id,
      title: w.title ?? excerpt(w.content, 100),
      subtitle: w.type,
      status: w.status,
      updatedAt: iso(w.updatedAt),
      route,
      archived: !isActive,
    };
  });
}

async function recallReviews(pf: ProjectFilter): Promise<RecallResult[]> {
  if (pf.unresolved) return [];
  // "Waiting for review" = process runs paused at a review gate. Drill to
  // the process page (real route); the token /review/[token] surface is
  // for external recipients, not workspace-owner recall.
  const conds = [eq(schema.processRuns.status, "waiting_review")];
  if (pf.projectId) conds.push(eq(schema.processes.projectId, pf.projectId));

  const runs = await db
    .select({
      id: schema.processRuns.id,
      processId: schema.processRuns.processId,
      status: schema.processRuns.status,
      startedAt: schema.processRuns.startedAt,
      processName: schema.processes.name,
    })
    .from(schema.processRuns)
    .innerJoin(schema.processes, eq(schema.processRuns.processId, schema.processes.id))
    .where(and(...conds))
    .orderBy(desc(schema.processRuns.startedAt))
    .limit(SCAN_PER_KIND);

  return runs.map((r) => ({
    kind: "review" as const,
    id: r.id,
    title: r.processName,
    subtitle: "Waiting for your review",
    status: "waiting_review",
    updatedAt: iso(r.startedAt),
    route: `/process/${r.processId}`,
  }));
}

async function recallActivity(pf: ProjectFilter): Promise<RecallResult[]> {
  // Activities carry no reliable project linkage (only entityType /
  // entityId). When the caller scoped to a project, omit the kind rather
  // than leak cross-project rows.
  if (pf.active) return [];

  const rows = await db
    .select()
    .from(schema.activities)
    .orderBy(desc(schema.activities.createdAt))
    .limit(SCAN_PER_KIND);

  return rows.map((a) => {
    // Only link activities whose entity has a real page.
    const route =
      a.entityType === "process" && a.entityId
        ? `/process/${a.entityId}`
        : undefined;
    return {
      kind: "activity" as const,
      id: a.id,
      title: a.description ? excerpt(a.description, 100) : a.action,
      subtitle: a.action,
      updatedAt: iso(a.createdAt),
      route,
      provenance: [`Actor: ${a.actorType}${a.actorId ? ` (${a.actorId})` : ""}`],
    };
  });
}

// ============================================================
// Public entry point
// ============================================================

/**
 * Search/list durable workspace artifacts. Pure read — no mutation.
 *
 * The same call backs both the Self `search_workspace` tool and the
 * Archive drawer route, so the two surfaces can never drift.
 */
export async function recallWorkspace(
  input: RecallInput = {},
): Promise<RecallResponse> {
  const kinds =
    input.kinds && input.kinds.length > 0
      ? input.kinds.filter((k) => ALL_RECALL_KINDS.includes(k))
      : [...ALL_RECALL_KINDS];
  const q = input.query?.trim().toLowerCase() || null;
  const statusFilter = input.status?.trim().toLowerCase() || null;
  const limit = Math.min(
    Math.max(1, input.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  // Resolve the project slug ONCE — every collector reuses this.
  const slug = input.projectSlug?.trim() || undefined;
  const pf: ProjectFilter = { active: !!slug, projectId: null, unresolved: false };
  if (slug) {
    const [proj] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug))
      .limit(1);
    if (proj?.id) pf.projectId = proj.id;
    else pf.unresolved = true;
  }

  const collectors: Record<RecallKind, () => Promise<RecallResult[]>> = {
    project: () => recallProjects(input, pf),
    process: () => recallProcesses(input, pf),
    memory: () => recallMemories(input, pf),
    work: () => recallWork(input, pf),
    review: () => recallReviews(pf),
    activity: () => recallActivity(pf),
  };

  const counts = {
    project: 0,
    process: 0,
    memory: 0,
    work: 0,
    review: 0,
    activity: 0,
  } as Record<RecallKind, number>;

  // Collect + filter per kind. counts[] reflects matched totals so the
  // surface can offer "show more" / refine instead of dumping.
  const perKind: Record<string, RecallResult[]> = {};
  for (const kind of kinds) {
    const raw = await collectors[kind]();
    const filtered = raw.filter(
      (r) =>
        matchesQuery(r, q) &&
        (!statusFilter ||
          (r.status ?? "").toLowerCase().includes(statusFilter)),
    );
    counts[kind] = filtered.length;
    perKind[kind] = filtered;
  }

  // Interleave round-robin across kinds so one noisy family can't crowd
  // out the rest within the cap.
  const results: RecallResult[] = [];
  let idx = 0;
  let added = true;
  while (results.length < limit && added) {
    added = false;
    for (const kind of kinds) {
      const bucket = perKind[kind];
      if (bucket && idx < bucket.length) {
        results.push(bucket[idx]);
        added = true;
        if (results.length >= limit) break;
      }
    }
    idx++;
  }

  const totalMatched = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    results,
    counts,
    truncated: totalMatched > results.length,
    query: q,
    kinds,
  };
}
