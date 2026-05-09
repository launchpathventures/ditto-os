/**
 * @ditto/core — Network Schema (Postgres tier)
 *
 * Re-exports the network-tier tables and value tuples. Consumers import
 * from `@ditto/core/db/network` (or via the workspace-relative path
 * `packages/core/src/db/network`). The schema is bound to a Postgres
 * connection in `src/db/network-db.ts` (workspace-tier app code).
 */

export * from "./schema.js";
