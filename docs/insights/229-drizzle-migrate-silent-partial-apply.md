# Insight-229: Drizzle migrate() Silently Leaves DB in Half-Applied State on Mid-Sequence Failure

**Date:** 2026-05-12
**Trigger:** Provisioning `launchpath` workspace on the live `ditto-network` service. The seed endpoint (`/api/v1/network/seed`) returned 500 with `SqliteError: no such column: "applied_project_ids"`. Symptom traced to migration `0012_projects_runners` failing at `DROP TABLE processes` with `SqliteError: FOREIGN KEY constraint failed`, despite the migration wrapping the recreate in `PRAGMA foreign_keys=OFF` / `ON`. Instrumentation logged the DrizzleError but boot continued; the network DB was left with idx 11 applied (10 of 18 migrations) and silently served broken responses for hours. The 5 later migrations (0012–0017) never landed, so `projects`, `bridge_jobs`, `applied_project_ids`, and `content_block` were all missing.

**Layers affected:** L3 Harness (schema management, boot lifecycle)
**Status:** partially absorbed by Brief 267 (2026-05-12). Workspace-tier migration failures now halt boot, and strict health checks workspace + Network schema journal state. The table-recreate migration defensiveness and persistent-volume migration rehearsal pieces remain active.

## The Insight

Drizzle's `migrate()` runs each `--> statement-breakpoint`-separated statement as a discrete unit. SQLite `PRAGMA foreign_keys` is **connection-scoped**, not statement-scoped: if Drizzle's internal driver opens a fresh connection between the `PRAGMA foreign_keys=OFF` statement and the `DROP TABLE` statement (or if any concurrent connection has `foreign_keys=ON`), the DROP runs under FK enforcement and fails with `SQLITE_CONSTRAINT_FOREIGNKEY`. better-sqlite3 normally keeps the PRAGMA within a single connection, but Drizzle's migrate() abstraction over the driver does not document this guarantee.

When the migration fails mid-sequence, Drizzle throws but **does not roll back the partial state**. Worse, the calling code in `packages/web/instrumentation.ts` catches the throw, logs `Schema sync failed: ...`, and **proceeds to start the application**. The DB is now stuck at idx ≈10 forever — subsequent boots re-attempt the same failing migration, log the same error, and continue serving broken responses to clients. There is no automatic backoff, no halt-on-failure, no operator alarm.

This is a "fail open on a corruption-class error" pattern. The application *appears healthy* — the process is up, `/api/healthz` returns 200, the DB is "connected" — but the schema is silently behind, and any endpoint touching post-failure tables returns 500. From the outside this looks like a transient bug or a routing problem, not a half-applied migration.

## Implications

1. **Migration failures must halt boot, not log-and-continue.** A schema integrity failure is a deployment failure. The right behavior is: throw out of `instrumentation.ts`, fail the container's startup probe, let the orchestrator roll back to the previous deployment. The current swallow lets the broken deployment serve traffic.
2. **Table-recreate migrations need defensive `PRAGMA` re-issuance.** Any migration that uses the SQLite table-rename pattern (`CREATE __new_X`, `INSERT FROM X`, `DROP X`, `ALTER __new_X RENAME TO X`) should explicitly `PRAGMA foreign_keys=OFF` immediately before each statement that depends on FK suspension, not once at the top. Or wrap the whole block in `BEGIN EXCLUSIVE` so the driver cannot reopen a connection mid-sequence.
3. **Deep health check must include "schema is at expected idx."** Today `/api/healthz?deep=true` checks DB connectivity + seed presence + network reachability. It does not verify that `select max(idx) from drizzle_migrations` matches the expected head. A migration regression is invisible to the LB until something downstream queries a missing column.
4. **The "fresh-DB" path masks this class of bug in dev.** Local testing uses `createTestDb()` which always migrates onto an empty DB — migration 0012's recreate succeeds because there are no FK dependents yet. The bug only manifests on persistent volumes carrying older data (which is exactly what production looks like). CI runs the migration suite in dev mode and gives a false PASS.

## Where It Should Land

- **Brief: "Migration failures must halt boot."** Edit `packages/web/instrumentation.ts` to rethrow on `Schema sync failed` so the orchestrator surfaces the failure. The container should crashloop on a broken migration, not serve broken responses.
- **Brief: "Add schema-idx assertion to deep health."** `/api/healthz?deep=true` should compare the live `drizzle_migrations` row count against a baked-in expected value (or against `import("drizzle/meta/_journal.json").entries.length`). Mismatch → 503 with `schema: behind`.
- **ADR amendment to ADR-018 (or wherever the health-check contract lives):** add "schema integrity" as a deep-health dimension alongside seed + network.
- **Insight-190 cross-reference:** the journal concurrency insight already flagged that the journal is fragile under parallel development. This insight is its operational twin — once the migrations land in main, the *runtime* path to applying them is also fragile. Both should be addressed together.

## Workaround Used (this session)

Because the failed migration left the network DB at idx ≈10 and no production data was present (0 registered users), the resolution was to wipe `/app/data/ditto.db*` via `railway ssh --service ditto-network rm` and redeploy. Migrations then applied cleanly onto an empty DB. **This is not a generally available fix** — once users exist, wiping the volume destroys data. A production-safe fix requires fixing the migration itself (defensive PRAGMA + BEGIN EXCLUSIVE wrap) or rolling forward via a hand-written follow-up migration that completes the broken 0012 transition idempotently.
