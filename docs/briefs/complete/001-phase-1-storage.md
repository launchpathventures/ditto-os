# Brief: Phase 1 — Storage (Postgres → SQLite)

**Date:** 2026-03-18
**Status:** complete
**Depends on:** none
**Unlocks:** Phase 2

## Goal

- **Roadmap phase:** Phase 1: Storage
- **Capabilities:** SQLite via Drizzle ORM, WAL mode, auto-create DB, agent identity fields, process loader update

## Context

The current engine uses Postgres via Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`). This requires a running Postgres server — too heavy for dogfood. The architecture calls for zero-setup: `pnpm cli sync` should work immediately on a fresh clone.

The data model in `schema.ts` is correct (what to store). The storage driver is what's wrong.

## Objective

Replace Postgres with SQLite so the engine runs with zero infrastructure setup. Only `pnpm install` + `ANTHROPIC_API_KEY` needed.

## Non-Goals

- Do not redesign the data model — this is a driver swap, not a schema rethink
- Do not build migration tooling — for dogfood, `push` (destructive sync) is fine
- Do not implement budget enforcement — schema tracks costs, enforcement is Phase 2+
- Do not rewrite the CLI — it just needs to work with the new DB connection

## Inputs

1. `docs/architecture.md` — Layer 1 (Process), Layer 2 (Agent), data model requirements
2. `docs/landscape.md` — Storage section: better-sqlite3 recommendation, Drizzle SQLite patterns, antfarm schema reference
3. `src/db/schema.ts` — Current Postgres schema (338 lines). This is the WHAT — keep the data model, change the HOW.
5. `src/db/index.ts` — Current Postgres connection (16 lines)
6. `src/engine/process-loader.ts` — Uses DB, needs to work after swap
7. `src/engine/heartbeat.ts` — Uses DB heavily, needs to work after swap
8. `src/cli.ts` — Uses DB queries, needs to work after swap

## Constraints

- **Do not change the data model** — same tables, same columns, same relationships. Only change the dialect.
- **Zero setup** — DB file auto-created at `data/agent-os.db` on first run. No migration commands needed for dogfood.
- **WAL mode** — Enable WAL pragma for performance (antfarm pattern).
- **Agent identity fields** — Add to `agents` table: `ownerId`, `organisationId`, `permissions` (JSON), `provenance` (text). Nullable for now, present for governance readiness.
- **Composition** — Use Drizzle (already in deps) + better-sqlite3 (new dep). Don't invent.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| SQLite + WAL + JSON context | antfarm `/src/db.ts` | Zero-setup matches dogfood goal. Proven in production agent pipelines. |
| Drizzle SQLite schema patterns | `remuspoienar/bun-elysia-drizzle-sqlite` | Production example of exact stack (Drizzle + better-sqlite3 + sqliteTable) |
| better-sqlite3 driver | npm: 4.6k dependents | Synchronous API, mature, Drizzle-supported. antfarm uses it. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Rewrite: `pgTable` → `sqliteTable`, `pgEnum` → text + TS unions, `uuid` → text + randomUUID, `jsonb` → text mode:'json', `timestamp` → integer (epoch ms). Add agent identity fields. |
| `src/db/index.ts` | Rewrite: better-sqlite3 connection, WAL mode, auto-create data dir |
| `drizzle.config.ts` | Update: dialect to `"sqlite"`, path to `./data/agent-os.db` |
| `package.json` | Remove `postgres`, add `better-sqlite3` + `@types/better-sqlite3` |
| `.gitignore` | Add `data/` |
| `docs/adrs/001-sqlite.md` | Write ADR using template |

## Acceptance Criteria

1. [ ] `pnpm install` succeeds (no Postgres dependency)
2. [ ] `pnpm cli sync` loads all 5 YAML process definitions into SQLite
3. [ ] `pnpm cli status` displays processes from SQLite
4. [ ] `pnpm run type-check` passes
5. [ ] No Postgres references remain in code
6. [ ] `data/agent-os.db` is auto-created and gitignored
7. [ ] ADR-001 is written with provenance

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: schema matches architecture data model, all tables preserved, agent identity fields present, no over-engineering
3. Present work + review findings to human for approval

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed items
3. Phase retrospective: what worked, what surprised, what to change
4. Write ADR-001 (included in work products above)
