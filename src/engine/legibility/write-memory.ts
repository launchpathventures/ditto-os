// stepRunId not required: pure DB wrapper, no external side effects (Insight-180 exemption)
/**
 * Ditto — Memory Write Chokepoint (Brief 198)
 *
 * Single attachment point for every memory write in the Ditto engine.
 * All non-test `db.insert/update/delete(schema.memories)` call-sites route
 * through this module so future features (projection, observability, event
 * emission, stricter trust enforcement) have exactly one place to hook.
 *
 * Design principles:
 * - Zero behaviour change. The helper mirrors existing Drizzle call shapes.
 * - The DB is injected as the first parameter so tests can pass a test DB
 *   and so the helper does not couple to a specific connection module.
 * - No hidden magic: callers pass the same fields they would pass to
 *   the underlying Drizzle insert / update calls against the memories table.
 *
 * Hook surfaces for future briefs:
 * - `options.skipProjection` (default `false`) — reserved for Brief 199's
 *   projection call. 198 ships the parameter dormant; 199 wires the
 *   projection inside this helper AFTER the DB write returns and the
 *   trust gate has cleared. Callers that explicitly opt out of projection
 *   (e.g. bulk seed imports, tests routed through the helper) set
 *   `skipProjection: true`.
 *
 * Test-file exemption:
 * - `*.test.ts` files deliberately write memories via raw DB calls. They
 *   are testing at the DB layer by design — tests own their own setup
 *   fixtures and must not depend on the chokepoint they exercise. See
 *   `README.md` in this directory for the full rationale.
 *
 * Provenance: original Ditto chokepoint-helper pattern (Brief 198).
 */

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "../../db";
import { memories as memoriesTable } from "../../db/schema";

/**
 * The Drizzle DB type accepted by the chokepoint.
 * We name it after the schema (not a specific connection) so production
 * `db` and test DBs created via `createTestDb()` in `src/test-utils.ts`
 * are both accepted without contortion. Mirrors the pattern used by
 * `src/engine/model-routing.ts` etc.
 */
export type MemoryWriteDb = BetterSQLite3Database<typeof schema>;

/** Inferred insert shape for the `memories` table. */
export type MemoryInsert = typeof memoriesTable.$inferInsert;

/** Inferred select shape (the row returned after an insert). */
export type MemoryRow = typeof memoriesTable.$inferSelect;

/**
 * Patch shape for updates. Mirrors the `.set({...})` argument of a Drizzle
 * update against `schema.memories`. We use a `Partial` of the insert shape
 * since every updatable column is part of the insert surface (timestamps
 * are explicitly included because callers pass them today).
 */
export type MemoryUpdatePatch = Partial<MemoryInsert>;

/**
 * Options reserved for forward-compat. Brief 198 defines the surface but
 * does not consume it. Brief 199 wires the projection call using
 * `skipProjection`.
 */
export interface WriteMemoryOptions {
  /**
   * When true, skip the Brief 199 projection hook (filesystem write +
   * safety filter) for this write. Default: `false`. 198 does NOT wire
   * projection — this flag is dormant until 199 ships.
   */
  skipProjection?: boolean;
}

/**
 * Insert a new memory row.
 *
 * Mirrors `db.insert(memoriesTable).values(input).returning()` and
 * returns the inserted row so callers can read generated ids / timestamps.
 *
 * @param db - the Drizzle DB (production `db` or a test DB)
 * @param input - the memory row to insert (matches schema shape)
 * @param options - forward-compat hook surface (Brief 199 consumes `skipProjection`)
 */
export async function writeMemory(
  db: MemoryWriteDb,
  input: MemoryInsert,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options?: WriteMemoryOptions,
): Promise<MemoryRow> {
  const [row] = await db.insert(memoriesTable).values(input).returning();
  return row;
}

/**
 * Update an existing memory row by id.
 *
 * Mirrors `db.update(memoriesTable).set(patch).where(eq(memoriesTable.id, id))`.
 * The caller is responsible for supplying `updatedAt` when the existing
 * call-sites did so (behaviour-preserving refactor: we do not silently
 * stamp timestamps the caller did not originally stamp).
 */
export async function updateMemory(
  db: MemoryWriteDb,
  id: string,
  patch: MemoryUpdatePatch,
): Promise<void> {
  await db.update(memoriesTable).set(patch).where(eq(memoriesTable.id, id));
}

/**
 * Soft-deactivate a memory (set `active: false` and bump `updatedAt`).
 *
 * Existing supersession / decay call-sites always flip `active: false`
 * alongside an `updatedAt: new Date()` stamp. This helper preserves that
 * shape exactly.
 */
export async function deactivateMemory(
  db: MemoryWriteDb,
  id: string,
): Promise<void> {
  await db
    .update(memoriesTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(memoriesTable.id, id));
}

/**
 * Hard-delete a memory by id.
 *
 * Provided for completeness of the chokepoint surface. No current
 * call-site hard-deletes memories, but future hooks (retention sweeps,
 * user-initiated deletion) will need a single attachment point.
 */
export async function deleteMemory(
  db: MemoryWriteDb,
  id: string,
): Promise<void> {
  await db.delete(memoriesTable).where(eq(memoriesTable.id, id));
}
