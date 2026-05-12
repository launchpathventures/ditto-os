/**
 * Ditto — Drizzle Kit Configuration (Network tier — Postgres)
 *
 * Generates migrations for the centralized Ditto Network Service tier.
 * Workspace tier uses `drizzle.config.ts` (SQLite). See ADR-036 §3 + ADR-048.
 *
 * Generate migrations with:
 *   pnpm db:generate:network
 *   # equivalent: pnpm drizzle-kit generate --config=drizzle.network.config.ts
 *
 * Apply migrations (admin-time tooling; runtime uses ensureNetworkSchema):
 *   pnpm db:migrate:network
 *
 * NEVER run `pnpm db:generate` (no suffix) when intending to alter the
 * network tier. The unsuffixed scripts target `drizzle.config.ts`
 * (SQLite/workspace) and will silently produce a SQLite migration in
 * `drizzle/` even if your schema edit was on a `pgTable` in
 * `packages/core/src/db/network/schema.ts`. See `drizzle/network/README.md`.
 *
 * Insight-190 applies independently per journal: workspace journal at
 * `drizzle/meta/_journal.json`; network journal at
 * `drizzle/network/meta/_journal.json`. Resequence on conflict per tier.
 */

import { defineConfig } from "drizzle-kit";

const url = process.env.SUPABASE_DB_URL;

export default defineConfig({
  schema: "./packages/core/src/db/network/schema.ts",
  out: "./drizzle/network",
  dialect: "postgresql",
  dbCredentials: {
    url: url ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
