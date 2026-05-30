/**
 * Brief 281 — workspace-recall.ts helper tests.
 *
 * Real SQLite (createTestDb), no mocks of query logic. Asserts the shared
 * recall contract both surfaces (Self tool + Archive route) depend on:
 * kind filtering, query filtering, archived hiding, project scoping,
 * real route shapes, and the round-robin cap / truncation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../test-utils";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema =
    await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

const { recallWorkspace } = await import("./workspace-recall");
const schema = await import("../db/schema");

beforeEach(async () => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;

  // Projects — one active, one archived.
  await testDb.insert(schema.projects).values([
    { slug: "acme", name: "Acme Revamp", status: "active" },
    { slug: "old-thing", name: "Old Thing", status: "archived" },
  ]);
  const [acme] = await testDb
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, "acme"));

  // Processes — one active (in acme), one archived.
  await testDb.insert(schema.processes).values([
    {
      name: "Quoting Process",
      slug: "quoting",
      definition: {},
      status: "active",
      trustTier: "spot_checked",
      projectId: acme.id,
    },
    {
      name: "Retired Flow",
      slug: "retired-flow",
      definition: {},
      status: "archived",
    },
  ]);
  const [quoting] = await testDb
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, "quoting"));

  // Memory — process-scoped, resolves to acme.
  await testDb.insert(schema.memories).values({
    scopeType: "process",
    scopeId: quoting.id,
    type: "preference",
    content: "Prefer concise Q3 planning summaries with numbers up front.",
    source: "conversation",
  });

  // Work item — active, no project (legacy content row).
  await testDb.insert(schema.workItems).values({
    type: "task",
    status: "in_progress",
    content: "Draft the Q3 planning memo",
    source: "capture",
  });

  // Review — a process run waiting on review.
  await testDb.insert(schema.processRuns).values({
    processId: quoting.id,
    status: "waiting_review",
    triggeredBy: "test",
    startedAt: new Date(),
  });

  // Activity — process-scoped (gets a route) + a non-routable one.
  await testDb.insert(schema.activities).values([
    {
      action: "process_run_completed",
      description: "Quoting Process completed run",
      actorType: "system",
      entityType: "process",
      entityId: quoting.id,
    },
    {
      action: "memory_reinforced",
      description: "A memory was reinforced",
      actorType: "system",
    },
  ]);
});

afterEach(() => {
  cleanup();
});

describe("recallWorkspace", () => {
  it("returns artifacts across all kinds with real route shapes", async () => {
    const resp = await recallWorkspace({ limit: 25 });
    const byKind = (k: string) =>
      resp.results.filter((r) => r.kind === k);

    expect(byKind("project")[0].route).toBe("/projects/acme");
    expect(byKind("process")[0].route).toMatch(/^\/process\/[\w-]+$/);
    expect(byKind("memory")[0].route).toMatch(/^\/memories\/[\w-]+$/);
    expect(byKind("review")[0].route).toMatch(/^\/process\/[\w-]+$/);
    // Memory resolves process scope → owning project slug.
    expect(byKind("memory")[0].projectSlug).toBe("acme");
  });

  it("hides archived projects/processes by default, surfaces on request", async () => {
    const def = await recallWorkspace({ kinds: ["project", "process"], limit: 25 });
    const titles = def.results.map((r) => r.title);
    expect(titles).toContain("Acme Revamp");
    expect(titles).not.toContain("Old Thing");
    expect(titles).not.toContain("Retired Flow");

    const all = await recallWorkspace({
      kinds: ["project", "process"],
      includeArchived: true,
      limit: 25,
    });
    const allTitles = all.results.map((r) => r.title);
    expect(allTitles).toContain("Old Thing");
    expect(allTitles).toContain("Retired Flow");
  });

  it("filters by free-text query across title/evidence", async () => {
    const resp = await recallWorkspace({ query: "Q3 planning", limit: 25 });
    expect(resp.results.length).toBeGreaterThan(0);
    for (const r of resp.results) {
      const hay = `${r.title} ${r.subtitle ?? ""} ${r.evidence ?? ""}`.toLowerCase();
      expect(hay).toContain("q3 planning");
    }
    expect(resp.query).toBe("q3 planning");
  });

  it("restricts a kind by project slug", async () => {
    const resp = await recallWorkspace({
      kinds: ["process"],
      projectSlug: "acme",
      limit: 25,
    });
    expect(resp.results).toHaveLength(1);
    expect(resp.results[0].title).toBe("Quoting Process");
  });

  it("applies projectSlug consistently across project-scopable kinds (review Finding 2)", async () => {
    // The seeded memory is process-scoped → resolves to acme.
    const inAcme = await recallWorkspace({
      kinds: ["memory"],
      projectSlug: "acme",
      limit: 25,
    });
    expect(inAcme.results.map((r) => r.kind)).toEqual(["memory"]);

    // …and is NOT returned when scoped to a different project — the old
    // behaviour leaked it because memory ignored projectSlug.
    const inOther = await recallWorkspace({
      kinds: ["memory"],
      projectSlug: "old-thing",
      limit: 25,
    });
    expect(inOther.results).toHaveLength(0);
    expect(inOther.counts.memory).toBe(0);
  });

  it("omits non-project-scopable kinds (activity) when a project filter is active", async () => {
    const resp = await recallWorkspace({
      kinds: ["activity"],
      projectSlug: "acme",
      limit: 25,
    });
    expect(resp.results).toHaveLength(0);
    expect(resp.counts.activity).toBe(0);
  });

  it("returns nothing when the projectSlug does not resolve (no unscoped fallback)", async () => {
    const resp = await recallWorkspace({
      projectSlug: "no-such-project",
      limit: 25,
    });
    expect(resp.results).toHaveLength(0);
    const total = Object.values(resp.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("carries memory scope + type for the citation scope pill (review Finding 4)", async () => {
    const resp = await recallWorkspace({ kinds: ["memory"], limit: 25 });
    const mem = resp.results.find((r) => r.kind === "memory");
    expect(mem).toBeDefined();
    expect(mem!.memoryScopeType).toBe("process");
    expect(mem!.memoryType).toBe("preference");
    expect(mem!.projectSlug).toBe("acme");
  });

  it("only links activities whose entity has a real page", async () => {
    const resp = await recallWorkspace({ kinds: ["activity"], limit: 25 });
    const routed = resp.results.filter((r) => r.route);
    const unrouted = resp.results.filter((r) => !r.route);
    expect(routed.length).toBe(1);
    expect(routed[0].route).toMatch(/^\/process\/[\w-]+$/);
    expect(unrouted.length).toBe(1);
  });

  it("caps results and reports truncation + per-kind counts", async () => {
    const resp = await recallWorkspace({ limit: 2 });
    expect(resp.results.length).toBeLessThanOrEqual(2);
    expect(resp.truncated).toBe(true);
    const total = Object.values(resp.counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(resp.results.length);
  });
});
