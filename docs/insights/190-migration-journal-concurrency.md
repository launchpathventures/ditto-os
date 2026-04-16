# Insight-190: Migration Journal Is a Concurrency Bottleneck

**Date:** 2026-04-14
**Trigger:** Brief 152 build — drizzle migration journal (`drizzle/meta/_journal.json`) had entries referencing missing SQL files from another concurrent workspace's work, and a `0004` migration SQL file appeared without a journal entry. Reconciliation was manual and error-prone.
**Layers affected:** L1 Process (development workflow), L3 Harness (schema management)
**Status:** active

## The Insight

Drizzle's migration system uses a single `_journal.json` file as the ordered index of all migrations. When multiple workspaces (agents) work concurrently on different briefs that each require schema changes, they create conflicting journal entries. The journal is append-only and order-sensitive — two agents adding entries at idx 3 will conflict on merge.

This isn't a Drizzle limitation per se — it's the same problem as any sequential migration system (Rails, Django, Alembic) under concurrent development. The difference is that with AI agents working in parallel workspaces, the concurrency is higher and the conflict surface is larger than typical human development.

## Implications

1. **Convention needed:** Schema migrations should be batched — one workspace claims the next migration number before starting work, or migrations are generated at merge time rather than during development.
2. **Snapshot drift:** The `_journal.json` and snapshot files can drift when agents edit them independently. The snapshot for migration N must reflect the cumulative state after migrations 0..N.
3. **Test DB creation:** `createTestDb()` applies all migrations sequentially. A missing or out-of-order SQL file breaks all tests, not just the ones for the new feature.

## Where It Should Land

`docs/dev-process.md` — add a "Schema Migration Convention" section:
- Agent claims next migration number at session start (check journal, pick next idx)
- Run `drizzle-kit generate` to create properly formatted SQL + snapshot
- If `drizzle-kit generate` says "no changes" but you made schema changes, the snapshot is already ahead — create the SQL file manually and register it
- On merge conflicts in `_journal.json`, resequence idx values and verify SQL files exist for all entries
