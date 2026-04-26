/**
 * Seed projects at engine boot — idempotent.
 *
 * Brief 215 §"What Changes" / file `projects/seed-on-boot.ts`. AC #19: if
 * the projects table is empty on engine startup, insert the rows from
 * `getSeedProjects()`. Otherwise no-op. Bearer hash is NOT generated here —
 * Brief 223's `POST /api/v1/projects` route is the bearer-generation surface.
 */

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db as appDb } from "../../db";
import * as schema from "../../db/schema";
import { projects } from "../../db/schema";
import { getSeedProjects } from "./seed-data";

type AnyDb = BetterSQLite3Database<typeof schema>;

export async function seedProjectsOnBoot(deps: { db?: AnyDb } = {}): Promise<{
  seeded: boolean;
  inserted: number;
}> {
  const db = (deps.db ?? appDb) as AnyDb;

  // Wrap in a transaction so concurrent boots cannot both observe an empty
  // table and double-insert. The slug UNIQUE constraint also defends, but the
  // transaction makes the check + insert atomic for cleaner semantics.
  return db.transaction((tx) => {
    const existing = tx.select({ id: projects.id }).from(projects).limit(1).all();
    if (existing.length > 0) {
      return { seeded: false, inserted: 0 };
    }

    const seeds = getSeedProjects();
    tx.insert(projects)
      .values(
        seeds.map((s) => ({
          slug: s.slug,
          name: s.name,
          githubRepo: s.githubRepo,
          defaultBranch: s.defaultBranch,
          harnessType: s.harnessType,
          briefSource: s.briefSource ?? undefined,
          briefPath: s.briefPath ?? undefined,
          defaultRunnerKind: s.defaultRunnerKind ?? undefined,
          fallbackRunnerKind: s.fallbackRunnerKind ?? undefined,
          runnerChain: s.runnerChain ?? undefined,
          deployTarget: s.deployTarget ?? undefined,
          status: s.status,
        }))
      )
      .run();

    return { seeded: true, inserted: seeds.length };
  });
}
