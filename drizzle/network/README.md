# Network-tier Drizzle migrations (Postgres / Supabase)

This directory holds **Postgres** migrations for the centralized Ditto Network
Service tier (Brief 263, ADR-036 §3, ADR-048).

The workspace tier (SQLite / better-sqlite3) lives under `drizzle/` (no
`network/` subdirectory). The two trees are independent: separate journal,
separate snapshot, separate dialect.

## Generate a migration

You changed `packages/core/src/db/network/schema.ts`:

```bash
pnpm db:generate:network
```

Equivalent to:
`pnpm drizzle-kit generate --config=drizzle.network.config.ts`.

This writes `0000_*.sql` (or the next index) to this directory and updates
`meta/_journal.json` + `meta/0NNN_snapshot.json`.

## Apply a migration

Runtime applies migrations automatically via `ensureNetworkSchema()` in
`src/db/network-db.ts` at first network-DB access. Manual application
(admin tooling, ad-hoc backfills):

```bash
pnpm db:migrate:network
```

Requires `SUPABASE_DB_URL` (production-shaped Postgres connection string).
The local test database uses `SUPABASE_DB_URL_TEST` and is reset by
`withNetworkDbTransaction` per-test rollback (see
`src/db/network-db-test-helpers.ts`).

## Why two trees

ADR-036 separates per-workspace data (SQLite, lives with the workspace) from
network-tier data (centralized Postgres). The two have different lifecycles,
different operational owners, and incompatible dialects. Combining them into
one migration tree would require dialect-aware tooling that doesn't exist;
splitting them is the simpler invariant.

## What NOT to do

| Don't | Why |
|---|---|
| `pnpm db:generate` for a network schema change | Targets `drizzle.config.ts` (SQLite). Will silently emit a `CREATE TABLE` to the workspace tree using SQLite syntax for your `pgTable` definition. |
| Manually edit `meta/_journal.json` | Drizzle owns this. Resequence `idx` only on merge conflict per Insight-190; do not invent entries. |
| Add an entry without the matching SQL file | Insight-190 — every journal entry needs a sibling `NNNN_*.sql`. |
| Cross-import workspace schema files into `packages/core/src/db/network/` | No-engine-import invariant (Brief 263 AC #8 — guarded by test in `src/db/network-db.test.ts`). |
| Add `.references()` from a network table to a workspace table | Cross-tier joins forbidden (ADR-036 §3) — soft references via plain text columns only. |

## Files

- `0000_ordinary_tomas.sql` — initial 8-table network schema (people, interactions, networkUsers, adminFeedback, networkTokens, managedWorkspaces, upgradeHistory, upgradeWorkspaceResults).
- `0001_colorful_molten_man.sql` — Brief 264 client-lane `network_job_requests` table.
- `meta/_journal.json` — Drizzle's serial registry of applied migrations for this tree.
- `meta/0NNN_snapshot.json` — Drizzle's snapshot of the schema state as of each migration.
