# Brief 263: Network Tier Postgres Migration — Schema Split + Supabase Cutover

**Date:** 2026-05-08
**Status:** draft
**Depends on:** Brief 262 (Network/Workspace Tier Reclassification — `reviewPages`, `documents`, `documentContent` moved to workspace-tier files) shipped; ADR-048 (Network Tier Postgres Migration — Execution) accepted; ADR-036 §3 file-split prescription (originally co-traveling with Brief 202, never executed — this brief executes it).
**Unlocks:** Sub-brief 255 (lands AFTER 263 to write against final dialect) and the rest of the parent Brief 254 decomposition (256, 257, 258, 259, 260, 261). Also unlocks future network-tier features (Postgres-only capabilities like JSONB, partial indexes, LISTEN/NOTIFY become available — not used in v1, but the door is open).
**Replaces build position:** This sub-brief is the second build in the parent Brief 254 chain (after 262 reduces the network surface to 8 tables). Build order becomes: **262 → 263 → 255 → 256 ∥ 258 → 257 → 259 → 260 → 261**.

## Goal

- **Roadmap phase:** Phase 14 — Network Agent (infrastructure foundation; precedes all other Phase 14 work after 262)
- **Capabilities:** One integration seam — the database layer. Two coordinated changes that share the same file-touch surface and must land atomically:
  1. **File split.** Network schema moves out of `src/db/schema/network.ts` (now reduced to 8 tables post-262) into `packages/core/src/db/network/` per ADR-036 §3. Workspace schema (`src/db/schema/engine.ts`, `frontdoor.ts`, `product.ts`, plus the new homes for the 262-relocated tables) stays exactly where it is.
  2. **Dialect swap.** Network schema converts from `sqliteTable` (drizzle-orm/sqlite-core) to `pgTable` (drizzle-orm/pg-core). Connection swaps from `better-sqlite3` to `postgres-js` (Drizzle's recommended Supabase driver). The single `db` instance becomes two: `db` (workspace, SQLite, unchanged) and `networkDb` (network, Postgres, new). All importers of network symbols change from `db.select().from(networkUsers)` to `networkDb.select().from(networkUsers)`.

The brief is bundled because the file split and dialect swap touch the same code paths; doing them sequentially would mean two passes through the same files. Single integration seam, single sub-brief.

## Context

Per ADR-048, the migration is fired pre-trigger because the marginal cost has collapsed: no FTS5 to port (verified zero), no production data to migrate (network tier serves zero production users), and Supabase already wired in `.env` for Storage. Six of the seven Brief 254 sub-briefs touch the network schema; designing them against SQLite knowing we'll dialect-swap soon is paying the schema-design cost twice.

Brief 262 (prerequisite) reduced the network-tier surface from 11 tables to 8 by reclassifying `reviewPages`, `documents`, `documentContent` to workspace-tier schema files. This brief assumes 262 has shipped; the 8 tables addressed here are: `people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`.

The work has two intertwined seams:

- **Schema layer.** 8 `pgTable` declarations to write (one per network-tier table from the 262-cleaned subset), plus all referenced enum value tuples and the cross-tier soft reference to `processRuns` (currently a SQLite FK on the `interactions` table at `network.ts:166`; converted to a plain `text` column with no FK constraint per ADR-036 §3). Conversion is mechanical (sqliteTable → pgTable; `text`, `integer`, `real` Drizzle column factories swap dialect-side; defaults and indexes carry over) but every column and the cross-tier reference must be reviewed.
- **Connection layer.** `src/db/index.ts` currently exports a single `db` instance backed by `better-sqlite3`. The change introduces a second instance `networkDb` backed by `drizzle(postgres(SUPABASE_DB_URL))`. Files that import network symbols need a one-symbol substitution at each call site (`db` → `networkDb` for network-table operations). Files that mix workspace and network operations need both imports.

The brief is sized at the upper bound of Insight-004 (one integration seam, ~14 ACs, single PR). If during implementation the file-touch scope grows beyond a single review-cycle session, the sub-brief may be split into 263a (schema split + tree setup; old `db` still used for network — not yet cut over) and 263b (cutover all importers + delete old SQLite path). Implementer flags this if needed; the default attempt is single-brief.

## Objective

After Brief 263 ships:

- `packages/core/src/db/network/schema.ts` exists with all 8 network tables (`people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`) converted to `pgTable`, all enum value tuples preserved, the cross-tier reference `interactions.processRunId` rewritten as a plain `text` column with no FK and a header comment documenting it (cross-tier FKs are not enforced at the DB level — they become application-layer joins per ADR-036 §3 "No queries may join across the Network/Workspace boundary").
- `src/db/network-db.ts` exports `networkDb` — a Drizzle instance backed by postgres-js, connecting to Supabase Postgres via `SUPABASE_DB_URL` — and `ensureNetworkSchema()` — a boot-time helper that runs `migrate(networkDb, { migrationsFolder: "drizzle/network" })` from `drizzle-orm/postgres-js/migrator`.
- `drizzle.network.config.ts` exists with `dialect: "postgresql"` and points at the new schema path.
- `drizzle/network/` directory exists with a baseline migration generated from the `pgTable` schema. `ensureNetworkSchema()` applies it successfully against an empty Supabase Postgres database in the existing project on first boot.
- `src/db/schema/network.ts` is deleted (or replaced with a one-line `throw` re-export marker for safety against stale imports — implementer's choice).
- All files that referenced network symbols via the workspace `db` instance now use `networkDb`. Type-check passes; tests pass.
- `pnpm dev` boots cleanly in both deployment modes (`DITTO_DEPLOYMENT=public` and the workspace mode); the workspace tier connects to local SQLite, the network tier connects to Supabase Postgres.
- Network DB query timing is instrumented at a lightweight level — sufficient telemetry to detect ADR-048 §(d) trigger #1 (sustained latency regression) within the first 30 days post-deploy.
- Test fixture strategy is committed: tests touching `networkDb` use a `SUPABASE_DB_URL_TEST` connection (separate test database in the same Supabase project) with a per-test transactional rollback helper exported from `src/db/network-db-test-helpers.ts`.
- `.env.example` documents the new `SUPABASE_DB_URL` and `SUPABASE_DB_URL_TEST` env vars.
- ADR-036 status header lifted from `proposed` to `accepted`; ADR-048 status lifted from `proposed` to `accepted` in the same commit.
- `docs/architecture.md` reflects dual-tier dialect (lines 1133, 1147–1148, 1218 already updated; this brief verifies and reflows the stray Real-time/Mobile rows at lines 1167–1168 back into the Tech Stack table).
- `CLAUDE.md` "Schema migrations" section extends to two Drizzle journals.
- `docs/landscape.md` Supabase Postgres evaluation row added (current state: not present; this brief adds it).

## Non-Goals

- **No workspace tier changes.** Workspace stays terminal SQLite per ADR-036 §1. The brief does not touch `src/db/schema/engine.ts`, `frontdoor.ts`, `product.ts`, or `src/db/index.ts`'s SQLite connection logic. The only edit to `src/db/index.ts` is to remove `network` from the schema spread (since network schema files no longer live under `src/db/schema/`).
- **No Postgres-specific features added in v1.** No JSONB columns, no partial indexes, no LISTEN/NOTIFY, no advisory locks, no materialized views. Schema is a 1-to-1 dialect conversion. Postgres-specific features can be adopted in later sub-briefs as they earn their keep.
- **No data migration logic.** Pre-launch network DB has no production rows; the migration is empty-tables. If any local-dev fixtures depend on persisted network rows, they must be re-seeded against the new Postgres DB. Test fixtures that use `networkUsers` etc. will create rows fresh in test-database setup.
- **No FTS5 → tsvector port.** Already verified zero FTS5 usage. If full-text-search is needed later, it lands directly in Postgres `tsvector`. Not this brief.
- **No connection pool tuning beyond defaults.** postgres-js's default pool size is fine for v1. Tune in a later brief if telemetry shows contention.
- **No new vendor onboarding beyond what's already wired.** Supabase project already exists (used for Storage); we're using its Postgres tier. No Neon, no self-hosted Postgres, no PgBouncer-as-separate-service.
- **No test-time Postgres container infrastructure.** v1 tests use the dev/staging Supabase Postgres OR a developer-local Postgres container chosen at developer discretion. Standardizing to a Docker-based test database is a follow-up if test flakiness becomes a problem (see §Follow-up Considerations).
- **No migration of `frontdoor.ts` or `product.ts` to network tier.** Those tables are workspace-tier per current shape. Re-tiering is out of scope.

## Inputs

1. `docs/briefs/262-network-workspace-tier-reclassification.md` — prerequisite. Confirm 262 has shipped (`reviewPages`, `documents`, `documentContent` no longer in `network.ts`) before starting this brief.
2. `docs/adrs/048-network-postgres-migration-supabase.md` — the supersession ADR. Acceptance status defines what this brief implements.
3. `docs/adrs/036-database-tier-strategy.md` — parent ADR. §3 file-split prescription is executed here.
4. `docs/adrs/025-centralized-network-service.md` — defines the network tier as architecturally separate; this brief enforces that at the dialect/file level.
5. `docs/adrs/001-sqlite.md` — workspace tier reference; reaffirmed unchanged.
6. `src/db/schema/network.ts` (post-262, 8 tables) — current source of truth for network schema. Converted in this brief.
7. `src/db/index.ts` — current single-DB connection. Workspace half stays; network spread removed.
8. `drizzle.config.ts` — current single Drizzle config. Stays as workspace config.
9. `.env` and `.env.example` — Supabase project URL/key already present; add new connection-string vars.
10. `package.json` — add `postgres` (postgres-js driver). Existing `drizzle-orm` and `drizzle-kit` already support pg dialect.
11. `docs/insights/190-migration-journal-concurrency.md` — Drizzle journal resequence rule; now applies to both journals.
12. `docs/insights/043-architect-owns-adr-accuracy.md` — drives ADR-036 status update.
13. `docs/insights/180-step-run-invocation-guard.md` — confirm no new side-effecting harness functions land in this brief (per Architect's brief-skill mandate).
14. `CLAUDE.md` — "Schema migrations (Insight-190)" section needs to mention dual journals.
15. `docs/architecture.md` — lines 1133, 1147–1148, 1218 already updated; lines 1167–1168 (stray Real-time/Mobile rows) need reflow into the Tech Stack table.
16. `docs/landscape.md` — Supabase Postgres evaluation row missing; add as part of this brief.

## Constraints

- **Single-PR atomicity required.** The brief lands as a single PR. Schema split alone (without dialect swap) leaves the `network.ts` content homeless; dialect swap alone (without schema split) leaves a `pgTable` in `src/db/schema/` next to `sqliteTable` siblings — confusing and error-prone. Atomic.
- **Workspace tier untouched.** No edits to workspace schema files. No edits to `src/db/index.ts`'s SQLite connection block. The only line that changes in `src/db/index.ts` is the schema-spread import (removing `network` so that the workspace `db` instance no longer types-check against network tables — that's a feature: it forces call sites to use `networkDb`).
- **All FKs to `process_runs` from network tables become cross-tier soft references.** Per ADR-036 §3 already-stated constraint. In Postgres, the `processRunId` column on network tables is just a `text` column with no FK constraint to a Postgres `process_runs` table (which doesn't exist on the Postgres side — `processRuns` is workspace-tier SQLite). Document this in the network schema file with a header comment so future contributors don't add a FK constraint by reflex.
- **No SQLite-specific column types or pragma assumptions.** SQLite's permissive type system (text-or-anything-goes) does not survive the swap. Postgres is strict. Implementation must verify column types are precise: `integer` for ms timestamps becomes Postgres `bigint`; SQLite `real` becomes Postgres `double precision` (or `real` if 4-byte precision is fine — pick consistently); `text` stays `text`. JSON-as-text columns stay `text` for v1 (no JSONB conversion in this brief).
- **Drizzle schema declarations must stay 1-to-1 in shape with current shape.** Same column names, same NOT NULL flags, same default values, same indexes. The brief is a port, not a redesign. Schema redesign happens in later briefs if/when needed.
- **Insight-190 (migration journal concurrency) applies to both journals.** Workspace journal at `drizzle/meta/_journal.json`; network journal at `drizzle/network/meta/_journal.json`. Each tier independently subject to resequence-on-conflict on parallel session merges.
- **`networkDb` connection must reuse Supabase project credentials, not duplicate them.** New env var `SUPABASE_DB_URL` is the connection string; it is derivable from the existing `SUPABASE_URL` + the database password from the Supabase project dashboard. Document the derivation in `.env.example` (commented placeholder + link to the Supabase dashboard's "Connection string" section).
- **All `networkDb` usage must include a graceful-failure test.** Postgres unavailability is now a real failure mode. The connection helper must surface a clean error when Supabase is unreachable; the API routes that touch `networkDb` must return a structured 503 (or equivalent) rather than crashing the process. Test asserts this behavior with a fake closed connection.
- **Test fixture strategy: shared Supabase test database + per-test transactional rollback.** Tests that touch `networkDb` connect via `SUPABASE_DB_URL_TEST` (a separate test database within the same Supabase project, OR the dev database with a `test_*` schema prefix — implementer chooses; same project, different namespace). A helper `withNetworkDbTransaction(testFn)` exported from `src/db/network-db-test-helpers.ts` opens a transaction, runs the test body, and rolls back at teardown — preventing cross-test pollution. No `pg-mem`, no Docker container, no separate Supabase project for v1; if test flakiness emerges, escalate per §Follow-up Considerations.
- **No deferred test migration.** Every test that currently writes to network tables via `db` must be updated in this brief to write via `networkDb` using the helper. No "TODO: migrate this test in a follow-up." If a test is genuinely orphaned (the underlying feature is no longer used), delete it; do not leave half-migrated tests behind.
- **No new harness side-effecting functions.** Per Insight-180: any function producing external side effects (publishing, payments, webhooks) must require `stepRunId` for invocation-guarded execution. This brief introduces no such functions — it only adds DB connection plumbing and instrumentation. If during implementation the scope expands to include side-effecting code, the implementer flags it and the constraint applies.
- **Lightweight network query timing instrumentation.** Wrap the postgres-js client with a thin query-timing hook (postgres-js exposes a `debug` callback / can be wrapped via `prepare`+`execute`). Slow queries above a threshold (default: 100ms) log at WARN level with operation name and duration. Sufficient to detect ADR-048 §(d) trigger #1 (sustained latency regression) within the first 30 days post-deploy. No metrics-pipeline integration in v1; logs are enough at this scale.
- **CLAUDE.md update required.** The "Schema migrations (Insight-190)" section currently assumes one journal; extends to two. Same edit also notes the cross-tier no-FK rule briefly.
- **`networkDb` exported from `src/db/network-db.ts` (not from `src/db/index.ts`).** Importers explicitly type their dependency on the network tier rather than going through a fan-in barrel. Mirrors the engine/product layer separation already used elsewhere in the codebase.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Two-tier database strategy (SQLite workspace + Postgres network) | ADR-036 (parent) | Original | Composes file-per-tenant principle with named-trigger migration framework |
| Pre-trigger execution rationale | ADR-048 | Original | This brief is the implementation of ADR-048 |
| postgres-js driver choice for Supabase | Drizzle ORM official Supabase docs | Pattern | Drizzle's documented Supabase recipe |
| `pgTable` factory and column type mappings | Drizzle ORM `drizzle-orm/pg-core` | Depend | Drizzle library; already in package.json |
| Cross-tier soft references (no FK enforcement) | ADR-036 §3 | Original | "No queries may join across the Network/Workspace boundary" |
| Drizzle journal-resequence on conflict | Insight-190 | Pattern | Established Ditto pattern; now applies to both journals |
| ADR-status hygiene (super-in-part rather than wholesale supersede) | Insight-043 | Pattern | Architect owns ADR accuracy |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `package.json` | Modify: add `"postgres"` to dependencies (postgres-js driver). Verify Drizzle versions support pg dialect (already do, per pinned versions). |
| `src/db/schema/network.ts` | Delete (or convert to a single-line throw re-export marker that fails noisily on import — implementer's choice; default to delete). Post-262 this file declares 8 tables; all 8 move to `packages/core/src/db/network/schema.ts`. |
| `packages/core/src/db/network/schema.ts` | Create: full network schema converted from `sqliteTable` → `pgTable`. **8 tables**: `people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`. All 17 enum value tuples preserved (`personVisibilityValues`, `journeyLayerValues`, `personTrustLevelValues`, `personaValues`, `personSourceValues`, `interactionTypeValues`, `interactionChannelValues`, `interactionModeValues`, `interactionOutcomeValues`, `networkUserStatusValues`, `workspaceStatusValues`, `healthStatusValues`, `upgradeStatusValues`, `canaryResultValues`, `upgradeTriggeredByValues`, `workspaceUpgradeResultValues`, `upgradeHealthCheckResultValues`). The single cross-tier FK column (`interactions.processRunId` at current `network.ts:166`) is rewritten as a plain `text` column with no `.references(...)`. Header comment documents the cross-tier soft-reference rule (ADR-036 §3). Indexes preserved. Column types audited per Postgres semantics (Drizzle `integer` for ms timestamps stays `integer` in Drizzle but maps to Postgres `bigint` — verify with `pnpm drizzle-kit generate` and inspect the SQL). The file does **not** import from `src/db/schema/engine.ts` (verification grep in AC #8). |
| `packages/core/src/db/network/index.ts` | Create: re-exports the schema tables and value tuples. All consumers import from `@ditto/core/db/network` (or the workspace-relative path). |
| `drizzle.network.config.ts` | Create: Drizzle Kit config — `dialect: "postgresql"`, `schema: "./packages/core/src/db/network/schema.ts"`, `out: "./drizzle/network"`, `dbCredentials.url: process.env.SUPABASE_DB_URL`. |
| `drizzle/network/` | Create: directory. First baseline migration generated by `pnpm drizzle-kit generate --config=drizzle.network.config.ts`. Migration SQL inspected to confirm correct Postgres column types, NOT NULLs, defaults, no cross-tier FKs, indexes. |
| `src/db/network-db.ts` | Create: imports `postgres` from postgres-js, `drizzle` from `drizzle-orm/postgres-js`, the network schema from `@ditto/core/db/network`. Exports `networkDb` (Drizzle instance bound to the Supabase Postgres connection) and `ensureNetworkSchema()` — which calls `migrate(networkDb, { migrationsFolder: "drizzle/network" })` from `drizzle-orm/postgres-js/migrator`. The boot path (e.g., where `ensureSchema()` is currently called) is updated to also call `ensureNetworkSchema()`. Connection-failure handling: clean error at boot if the connection cannot be established; structured 503 from API routes that depend on the connection at runtime. Wraps the postgres-js client with a thin query-timing hook that logs slow queries (>100ms) at WARN level. |
| `src/db/network-db.test.ts` | Create: tests for `networkDb` export shape, schema-import resolution, graceful-503 surfacing on connection failure, and the no-engine-import invariant (verifies `packages/core/src/db/network/schema.ts` has zero imports from `src/db/schema/engine.ts`). |
| `src/db/network-db-test-helpers.ts` | Create: exports `withNetworkDbTransaction(testFn)` — opens a transaction on `SUPABASE_DB_URL_TEST`, runs the body, rolls back at teardown. Used by every test that touches network tables. |
| `src/db/index.ts` | Modify: update the boot path so it calls both `ensureSchema()` (workspace SQLite, unchanged) and `ensureNetworkSchema()` (network Postgres, new). Remove `network` from the workspace `import * as schema from "./schema"` such that the workspace `db` instance does NOT type-check against network tables. The SQLite connection block (better-sqlite3 instantiation, WAL pragma, FK pragma) is byte-identical pre/post. |
| `src/db/schema/index.ts` | Modify: remove the `export * from "./network"` line. Network schema is no longer exported from the workspace barrel. |
| All files referencing network symbols (~30+ files) | Modify: each file replaces `db.select().from(<networkTable>)` (and equivalents — `insert`, `update`, `delete`, transaction wrappers) with `networkDb.select().from(<networkTable>)`. Files that mix workspace and network operations import both `db` and `networkDb`. Implementation pass: grep the 8-symbol set, walk each file, do the substitution. Type-check after each batch; commit in logical chunks if helpful. Representative files include: `src/engine/network-chat.ts`, `src/engine/network-seed.ts`, `src/engine/inbound-email.ts`, `src/engine/relationship-pulse.ts`, `src/engine/admin-oversight.ts`, `src/engine/notify-user.ts`, `src/engine/self-tools/network-tools.ts`, `src/engine/workspace-provisioner.ts`, `packages/web/app/api/v1/network/**/route.ts`, plus their test counterparts. |
| `.env.example` | Modify: add `SUPABASE_DB_URL=` (with derivation comment + Supabase dashboard link) and `SUPABASE_DB_URL_TEST=` (separate test database within the same project). |
| `.env` | Modify (locally only — not committed): same env vars added to dev environment. The PR does not commit `.env`; it only commits `.env.example`. |
| `docs/adrs/036-database-tier-strategy.md` | Modify: status header lifted from `proposed` to `accepted`. Already-applied "Updated 2026-05-08" line confirmed (§2 superseded-in-part by ADR-048; §3 executed via Brief 262 + 263). |
| `docs/adrs/048-network-postgres-migration-supabase.md` | Modify: status moves from `proposed` to `accepted` in the same commit. Brief 262 reference updated to "Briefs 262 + 263" (262 reclassification, 263 migration). Table count "11" replaces any erroneous "12" reference. |
| `docs/architecture.md` | Verify: lines 1133, 1147–1148, 1218 already updated (during ADR-048 design). This brief reflows the stray Real-time/Mobile rows (currently at lines 1167–1168, dangling after the Model Routing section break) back into the Tech Stack table at lines 1141–1151. |
| `CLAUDE.md` | Modify: "Schema migrations (Insight-190)" section — extend to mention two journals. New text: "Workspace journal at `drizzle/meta/_journal.json`; network journal at `drizzle/network/meta/_journal.json`. Each tier independently subject to resequence-on-conflict on parallel session merges. Generate workspace migrations with `pnpm drizzle-kit generate`; generate network migrations with `pnpm drizzle-kit generate --config=drizzle.network.config.ts`. Cross-tier FKs are forbidden (ADR-036 §3 + ADR-048)." Also update the "Engine Core" section to note that network schema lives in `packages/core/src/db/network/`. |
| `docs/landscape.md` | Modify: add a Supabase Postgres evaluation row near the database/storage discussion (currently at lines ~419–423). Note: Storage already wired via ADR-031; Postgres adds via connection string; Drizzle-supported via postgres-js; rollback triggers in ADR-048 §(d). |
| `docs/state.md` | Updated by `/dev-documenter` post-approval (not directly by this brief's implementation; Documenter checkpoint covers it). The Architect's state.md update happens before the build (per dev-architect skill); Documenter's update happens post-build. |

## User Experience

This brief is below the user-visible surface — no UX work. Layer 6 surfaces are unchanged in shape. The user does not see this change unless something breaks.

- **Jobs affected:** None directly. Indirectly: every Layer 6 surface that reads from network tables (the network landing chat, the visitor `/people/[handle]` profile, the public profile-as-chat, etc.) continues to function identically; only the underlying connection differs.
- **Primitives involved:** None. No UI primitives change.
- **Process-owner perspective:** Tim does not see this; the only Tim-visible artefact is potentially a slightly different error UI if the Supabase Postgres host is unreachable (clean 503 instead of crash) — but in v1 that's a degraded-mode test case, not a normal user state.
- **Interaction states:** N/A.
- **Designer input:** Not required for this brief.

## Acceptance Criteria

1. [ ] **Brief 262 prerequisite confirmed.** `pnpm exec rg "^export const \\w+ = sqliteTable" src/db/schema/network.ts | wc -l` returns `8` before this brief begins. Verified in PR description.
2. [ ] **ADR statuses lifted.** `docs/adrs/036-database-tier-strategy.md` status moves from `proposed` to `accepted`. `docs/adrs/048-network-postgres-migration-supabase.md` status moves from `proposed` to `accepted`. Both edits land in the same PR as this brief's code changes.
3. [ ] **postgres-js dependency added.** `package.json` lists `postgres` (postgres-js driver). `pnpm install` runs cleanly. Drizzle versions support pg dialect (already pinned).
4. [ ] **Network schema converted to pgTable.** `packages/core/src/db/network/schema.ts` exists with **8 `pgTable` declarations** (`people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`). All 17 enum value tuples preserved. All indexes preserved. The `interactions.processRunId` column is a plain `text` column with no `.references(...)`. Header comment documents the cross-tier soft-reference rule.
5. [ ] **Network Drizzle config + migration tree + boot-time apply.** `drizzle.network.config.ts` exists (`dialect: "postgresql"`, schema path `./packages/core/src/db/network/schema.ts`, output `./drizzle/network`, credentials from `SUPABASE_DB_URL`). `pnpm drizzle-kit generate --config=drizzle.network.config.ts` produces SQL in `drizzle/network/`. Manual inspection confirms correct Postgres types (no SQLite type leakage). The boot path calls `ensureNetworkSchema()` from `src/db/network-db.ts` (which wraps `migrate(networkDb, { migrationsFolder: "drizzle/network" })` from `drizzle-orm/postgres-js/migrator`); on first boot against an empty Supabase Postgres DB the migration applies successfully. Both `drizzle/meta/_journal.json` (workspace) and `drizzle/network/meta/_journal.json` (network) exist; PR description notes Insight-190 resequence-on-conflict applies to each independently.
6. [ ] **`networkDb` instance + graceful 503.** `src/db/network-db.ts` exports `networkDb` and `ensureNetworkSchema()`. A test asserts that when `networkDb` operations fail because the Postgres connection is unavailable, API routes (e.g., `packages/web/app/api/v1/network/handle/route.ts`) return a structured 503 with a non-leaking error body — not a 500 crash. The test uses a fake closed connection (postgres-js connection rejection), not a real outage.
7. [ ] **Workspace `db` no longer types against network tables.** `src/db/schema/index.ts` no longer exports network schema. Attempting `db.select().from(networkUsers)` produces a TypeScript error. Verification: implementer demonstrates the type error in PR description.
8. [ ] **No-engine-import invariant.** A unit test asserts that `packages/core/src/db/network/schema.ts` has zero imports from `src/db/schema/engine.ts`, `src/db/schema/frontdoor.ts`, or `src/db/schema/product.ts`. The cross-tier reference (`interactions.processRunId`) is a plain `text` column, not a typed reference. Test fails if a contributor reflexively adds a typed FK to a workspace-tier table or imports a workspace schema symbol into the network schema file.
9. [ ] **All importers cut over.** Every file that previously called `db.select().from(<networkTable>)` (or `insert`/`update`/`delete`/transaction wrappers) now calls `networkDb`. Verification grep — for each of the 8 symbols (`people`, `interactions`, `networkUsers`, `adminFeedback`, `networkTokens`, `managedWorkspaces`, `upgradeHistory`, `upgradeWorkspaceResults`): `pnpm exec rg "\\bdb\\.(select|insert|update|delete|transaction)\\b[^)]*\\.from\\(<symbol>\\)" src packages` returns zero matches. The same grep with `networkDb` returns the expected file matches. PR description summarizes the per-symbol counts.
10. [ ] **Test fixture helper present and used.** `src/db/network-db-test-helpers.ts` exports `withNetworkDbTransaction(testFn)`. Every test that writes to network tables uses this helper. `pnpm exec rg "withNetworkDbTransaction" src packages` returns the expected matches; `pnpm exec rg "\\bnetworkDb\\.(insert|update|delete)\\b" --type ts src packages | rg -v "withNetworkDbTransaction|network-db\\.test\\.ts"` returns zero matches outside helper-wrapped contexts.
11. [ ] **Network query timing instrumentation.** `networkDb` is constructed with a query-timing hook that logs slow queries (>100ms threshold) at WARN level. Test demonstrates the hook fires on a synthetic slow query. Sufficient telemetry to detect ADR-048 §(d) trigger #1 within the first 30 days post-deploy.
12. [ ] **`pnpm dev` boots cleanly in both deployment modes.** With `DITTO_DEPLOYMENT=public`, the network landing route renders against Supabase Postgres. In workspace mode, the workspace tier connects to local SQLite and the workspace boots. Both DBs reachable. Tests pass: `pnpm test` is green; no skipped tests for "TODO: migrate later"; orphaned tests deleted not stubbed.
13. [ ] **Type-check passes.** `pnpm run type-check` exits zero across the monorepo.
14. [ ] **`.env.example` + documentation surface updated.** `.env.example` has `SUPABASE_DB_URL=` and `SUPABASE_DB_URL_TEST=` placeholders with derivation comments. `docs/architecture.md` lines 1167–1168 (stray Real-time/Mobile rows) reflowed back into the Tech Stack table at lines 1141–1151. `CLAUDE.md` "Schema migrations (Insight-190)" section mentions both journals; "Engine Core" section mentions network schema lives in `packages/core/src/db/network/`. `docs/landscape.md` has a Supabase Postgres evaluation row added (currently absent — verified by grep before this brief).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + ADR-036 + ADR-048 + Insight-190 + Insight-043 + Insight-180 + this brief.
2. Review agent checks:
   - Brief 262 prerequisite: `network.ts` is at 8 tables before this brief begins (verify in PR description).
   - Schema split: all 8 network tables migrated, no SQLite-specific types leaked into Postgres SQL, indexes preserved, 17 enum value tuples present.
   - Dialect swap: postgres-js used (not raw `pg`), Drizzle pg-core imports correct, column types audited (esp. `integer` for ms timestamps → Postgres `bigint`).
   - Connection layer: `networkDb` constructed correctly, graceful 503 tested, query-timing hook fires on synthetic slow query, env vars documented.
   - Cutover completeness: per-symbol greps (8 symbols) return zero `db.from(<symbol>)` matches; all importers use `networkDb`.
   - No-engine-import invariant: test asserts `packages/core/src/db/network/schema.ts` does not import from any `src/db/schema/*.ts` file.
   - Test fixture: `withNetworkDbTransaction` helper used by every network-touching test; `SUPABASE_DB_URL_TEST` documented; no `pg-mem` or Docker dependency added.
   - ADR hygiene: ADR-036 + ADR-048 statuses both lifted to `accepted` in same commit; no orphan supersession references.
   - Documentation: architecture.md table reflow, CLAUDE.md dual-journal + Engine Core update, landscape.md Supabase Postgres row added.
   - Insight-180: no new harness side-effecting functions introduced.
   - Workspace tier: untouched. The diff against `src/db/index.ts` removes only the network schema spread; the SQLite connection block is byte-identical pre/post.
3. Present sub-brief + review findings to human.

## Smoke Test

```bash
# Pre-flight: confirm Brief 262 prerequisite
pnpm exec rg "^export const \\w+ = sqliteTable" src/db/schema/network.ts | wc -l
# EXPECTED: 8

# Pre-flight: env
cp .env.example .env
# Edit .env: set SUPABASE_DB_URL and SUPABASE_DB_URL_TEST to the Supabase project's Postgres connection strings.

pnpm install
pnpm run type-check                          # PASS

# Workspace tier — unchanged
pnpm test src/engine/feedback-recorder.test.ts   # PASS (workspace-only smoke)

# Network tier — new shape
pnpm drizzle-kit generate --config=drizzle.network.config.ts
# VERIFY: drizzle/network/0000_*.sql exists with CREATE TABLE statements using PostgreSQL types
# VERIFY: drizzle/network/meta/_journal.json has one entry

# First boot applies the network migrations via ensureNetworkSchema()
DITTO_DEPLOYMENT=public pnpm dev &
sleep 5
# VERIFY (Supabase dashboard SQL editor): all 8 tables created (people, interactions, networkUsers, adminFeedback, networkTokens, managedWorkspaces, upgradeHistory, upgradeWorkspaceResults).
kill %1

# Cutover completeness — per-symbol greps must return zero workspace-`db` matches
for symbol in people interactions networkUsers adminFeedback networkTokens managedWorkspaces upgradeHistory upgradeWorkspaceResults; do
  count=$(pnpm exec rg "\\bdb\\.(select|insert|update|delete|transaction)\\b[^)]*\\.from\\($symbol\\)" src packages | wc -l)
  echo "$symbol: $count"
  # EXPECTED: each = 0
done

# All network usage is via networkDb
pnpm exec rg "\\bnetworkDb\\." src packages | wc -l
# EXPECTED: > 0 across the file footprint

# No-engine-import invariant: network schema must not import from workspace schema
pnpm exec rg "from .*src/db/schema/(engine|frontdoor|product)" packages/core/src/db/network/
# EXPECTED: zero matches

# Test-helper coverage: every network write outside network-db.test.ts uses withNetworkDbTransaction
pnpm exec rg "\\bnetworkDb\\.(insert|update|delete)\\b" --type ts src packages \
  | rg -v "withNetworkDbTransaction|network-db\\.test\\.ts|network-db-test-helpers\\.ts"
# EXPECTED: zero matches (every write is helper-wrapped)

# Tests
pnpm test src/db/network-db.test.ts              # PASS (graceful 503 + no-engine-import + slow-query log)
pnpm test src/engine/network-chat.test.ts        # PASS (uses withNetworkDbTransaction)
pnpm test src/engine/relationship-pulse.test.ts  # PASS
pnpm test src/engine/network-seed.test.ts        # PASS

# End-to-end
DITTO_DEPLOYMENT=public pnpm dev
# Open http://localhost:3000/network/chat (or whichever route reads network tables)
# VERIFY: route renders. Network-tier reads succeed against Postgres.

pnpm dev  # workspace mode
# VERIFY: workspace boots. Workspace-tier reads succeed against SQLite.

# Final
pnpm run type-check  # PASS
pnpm test            # PASS
```

## After Completion

1. Update `docs/state.md` — Brief 263 complete; network tier on Supabase Postgres; ADR-048 accepted; ADR-036 §2 superseded-in-part, §3 executed; build order for parent Brief 254 chain is now 262 → 263 → 255 → 256 ∥ 258 → 257 → 259 → 260 → 261.
2. Update `docs/roadmap.md` — Phase 14 prerequisites (262 reclassification + 263 migration) marked complete; Phase 14 sub-brief sequence reflects new build order.
3. Verify `docs/architecture.md` updates persisted (lines 1133, 1147–1148, 1218 + reflowed 1167–1168). Documenter confirms.
4. Confirm `docs/landscape.md` Supabase Postgres evaluation row exists.
5. Capture insight if the migration surfaces a generalizable principle (likely candidate: "ADRs that name a trigger framework also implicitly name a pre-trigger override path; document the override path in the trigger framework itself" — defer until 263 ships and the experience is fresh).
6. Phase retrospective entry: did pre-trigger migration actually save the design-against-final-shape cost ADR-048 §Why-Now claimed it would? Read sub-briefs 256–261 retrospectively and confirm.

## Follow-up Considerations

- **Test-time Postgres ergonomics.** v1 uses `SUPABASE_DB_URL_TEST` (separate test database in the same Supabase project) with per-test transactional rollback. If tests become slow or flaky, follow-up brief stands up a local Docker Postgres for tests + isolated Supabase test database for CI. Revisit if tests degrade.
- **Connection pooling.** postgres-js's default pool size is fine for a small team during v1. If concurrent web request volume grows past the default pool, tune in a follow-up brief. Telemetry first.
- **Latency telemetry maturation.** v1 ships with WARN-level slow-query logging only — sufficient to detect ADR-048 §(d) trigger #1 by hand. If load grows or trigger watch becomes a regular cadence, instrument proper p95 telemetry (Vercel Analytics, OpenTelemetry, or Supabase native pg_stat_statements export) in a follow-up brief.
- **JSONB migrations.** Some columns currently stored as `text` containing JSON could be JSONB. Migration to JSONB is a follow-up — only when a query benefits.
- **Postgres-specific features.** LISTEN/NOTIFY for real-time updates, advisory locks for distributed coordination, partial indexes for hot-path queries, materialized views for analytics. All available; none used in v1. Adopt as they earn their keep.
- **CI/CD secrets.** `SUPABASE_DB_URL` and `SUPABASE_DB_URL_TEST` must be configured in Railway environment variables (per memory `project_deployment_railway`). Implementation pass adds the env vars to Railway alongside the dev `.env` change.
