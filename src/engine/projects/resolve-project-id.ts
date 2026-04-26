/**
 * Resolve a project's UUID from either an `id` UUID or a `slug` string.
 *
 * Brief 215 admin pages address projects by slug; the API routes accept
 * either. Centralised here so route helpers don't widen `db` and `projects`
 * to `any` (Brief 215 dev-review medium #2).
 */

import { eq, or } from "drizzle-orm";
import { db as appDb } from "../../db";
import { projects } from "../../db/schema";

type AnyDb = typeof appDb;

export async function resolveProjectId(
  idOrSlug: string,
  deps: { db?: AnyDb } = {},
): Promise<string | null> {
  const db = deps.db ?? appDb;
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(or(eq(projects.id, idOrSlug), eq(projects.slug, idOrSlug)))
    .limit(1);
  return rows[0]?.id ?? null;
}
