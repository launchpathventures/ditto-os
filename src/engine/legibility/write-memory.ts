// stepRunId not required: pure DB wrapper, no external side effects (Insight-180 exemption)
/**
 * Ditto — Memory Write Chokepoint (Brief 198)
 *
 * Single attachment point for memory-table mutations in `src/engine/` (non-test code).
 * Future hooks (projection, observability, event emission, stricter trust enforcement)
 * attach here instead of being scattered across 8+ call-sites.
 *
 * Pure pass-through in Brief 198 — behaviour-identical to the raw `db.insert/update(schema.memories)`
 * calls it replaces. Brief 199 wires the projection hook via `options.skipProjection`.
 *
 * Provenance: Ditto-native refactor; reviewer finding on Brief 199.
 */

import { eq, type InferInsertModel } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";

type SchemaTypes = typeof schema;
export type MemoryDb = BetterSQLite3Database<SchemaTypes>;

/**
 * Full insert shape for a memory row. Mirrors `InferInsertModel` on `schema.memories`
 * so callers pass exactly the same value object they would have passed to
 * `db.insert(schema.memories).values(...)`.
 */
export type MemoryInsert = InferInsertModel<typeof schema.memories>;

/**
 * Patch shape for `updateMemory`. Partial over the insert shape because updates
 * never touch `id`; `id` is addressed separately.
 *
 * `updatedAt` is defaulted to `new Date()` when omitted so callers don't have to
 * remember to stamp every update — this matches every existing call-site.
 */
export type MemoryPatch = Partial<Omit<MemoryInsert, "id">>;

/**
 * Forward-compat options surface. Brief 198 does NOT read these; they exist so
 * Brief 199 can wire a projection call inside the helper without changing
 * any call-site.
 */
export interface WriteMemoryOptions {
  /**
   * Skip the projection hook Brief 199 will wire (e.g., for internal
   * bookkeeping writes that should not appear in the projection layer).
   * Default: false. 198 is a pass-through and ignores this flag.
   */
  skipProjection?: boolean;
}

/**
 * Insert a new memory row.
 *
 * Mirrors `db.insert(schema.memories).values(input).returning()` exactly — the
 * returned row is the one the DB produced (with id, createdAt, updatedAt, etc.
 * filled in by schema defaults).
 */
export async function writeMemory(
  db: MemoryDb,
  input: MemoryInsert,
  _options?: WriteMemoryOptions,
): Promise<typeof schema.memories.$inferSelect> {
  const [row] = await db.insert(schema.memories).values(input).returning();
  return row;
}

/**
 * Patch fields on an existing memory row addressed by id.
 *
 * Mirrors `db.update(schema.memories).set({ ...patch, updatedAt }).where(eq(id, ...))`.
 * `updatedAt` is stamped automatically if the caller doesn't supply one — every
 * pre-refactor call-site stamped it manually, so defaulting here is
 * behaviour-preserving.
 */
export async function updateMemory(
  db: MemoryDb,
  id: string,
  patch: MemoryPatch,
  _options?: WriteMemoryOptions,
): Promise<void> {
  const patchWithTimestamp: MemoryPatch =
    patch.updatedAt === undefined ? { ...patch, updatedAt: new Date() } : patch;
  await db
    .update(schema.memories)
    .set(patchWithTimestamp)
    .where(eq(schema.memories.id, id));
}

/**
 * Soft-delete: set `active: false`. Preferred over `deleteMemory` because the
 * row remains in the DB for audit / supersession history.
 */
export async function deactivateMemory(
  db: MemoryDb,
  id: string,
  _options?: WriteMemoryOptions,
): Promise<void> {
  await db
    .update(schema.memories)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(schema.memories.id, id));
}

/**
 * Hard delete: remove the row entirely. Use only when audit trail is not
 * required; prefer `deactivateMemory`.
 */
export async function deleteMemory(
  db: MemoryDb,
  id: string,
  _options?: WriteMemoryOptions,
): Promise<void> {
  await db.delete(schema.memories).where(eq(schema.memories.id, id));
}
