# Brief 299: `parent_run_id` Orchestrator Attribution (P3)

**Date:** 2026-05-30
**Status:** draft
**Depends on:** Brief 296 (parent). Independent of 297/298.
**Unlocks:** queryable decomposed-goal run trees (recursive join).

## Goal

- **Roadmap phase:** Engine Hardening — Agent-Brain Transfer (Brief 296).
- **Capabilities:** P3 — a real `parent_run_id` column on `process_runs` so orchestrator-spawned child runs attribute to their parent and a full goal tree is a recursive query.

## Context

`process_runs` has no `parent_run_id`. Orchestrator-spawned child runs attribute only via `work_items.execution_ids` (a JSON array) — you cannot rebuild a decomposed-goal trace with a recursive query. Ditto already does exactly this for chains via `delayed_runs.created_by_run_id`; mirror that pattern. ProcessOS keeps parent attribution as a real column (not JSON) precisely so "all descendants of run X" is a join.

## Objective

A decomposed-goal run's full tree is queryable via `parent_run_id` (recursive join), surfaced in `ditto status` / review output.

## Non-Goals

- Do not remove or change `work_items.execution_ids` — keep both linkages.
- No web trace-view UI in this brief (CLI/review surface is enough; web is a later renderer).

## Inputs

1. `docs/briefs/296-agent-brain-transfer-parent.md` — parent.
2. `.context/attachments/A7hasF/pasted_text_2026-05-30_23-39-22.txt` — P3 build detail.
3. `packages/core/src/db/schema.ts` — `process_runs`; `delayed_runs.created_by_run_id` as the pattern to mirror.
4. `src/engine/heartbeat.ts` — where the orchestrator calls `startProcessRun()` for a child.
5. `src/cli.ts` — `ditto status` output surface.

## Constraints

- **Engine scope: both** — column in `packages/core/src/db/schema.ts`; orchestrator wiring in `src/engine/heartbeat.ts`.
- **Migration (Insight-190):** add `parent_run_id` via `drizzle-kit generate`; check the engine journal for the next free idx (currently 19) at build time; verify SQL + snapshot land for the entry. Resequence on conflict.
- FK → `process_runs.id`, **nullable**, `ON DELETE SET NULL`; add a partial index for descendant queries.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Real-column parent attribution | ProcessOS/Catalyst Mastra port | pattern | Real column (not JSON) so descendant-of-X is a join |
| Mirror existing chain linkage | Ditto `delayed_runs.created_by_run_id` | pattern | Same shape already in the codebase |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | Modify: add `parent_run_id` to `process_runs` (FK nullable, ON DELETE SET NULL) + partial index |
| `drizzle/00XX_*.sql` + snapshot | Create: migration (idx checked per Insight-190) |
| `src/engine/heartbeat.ts` | Modify: write `parent_run_id` on orchestrator-spawned child runs; keep `work_items` linkage |
| `src/cli.ts` (or review output) | Modify: surface the run tree |
| `*.test.ts` | Create: recursive-descendants query + child attribution |

## User Experience

- **Jobs affected:** Orient, Review — see the full tree behind a decomposed goal.
- **Primitives involved:** Run/step records.
- **Process-owner perspective:** "what did this goal actually spawn?" is answerable in one query.
- **Interaction states:** CLI/review tree output.
- **Designer input:** Not invoked.

## Acceptance Criteria

1. [ ] `process_runs` has `parent_run_id` (FK → `process_runs.id`, nullable, `ON DELETE SET NULL`) + partial index.
2. [ ] Migration SQL + snapshot exist; journal idx is correct and verified (Insight-190).
3. [ ] Orchestrator-spawned child runs write `parent_run_id` in `heartbeat.ts`; `work_items.execution_ids` linkage is retained.
4. [ ] A recursive query returns all descendants of a given run; a vitest proves a 3-level tree resolves.
5. [ ] `ditto status` / review output renders the tree for a decomposed goal.
6. [ ] Deleting a parent run sets children's `parent_run_id` to NULL (no orphan-FK error).
7. [ ] Root + core type-check pass.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md`.
2. Verify: migration coherence (Insight-190); FK/ON DELETE semantics; both linkages preserved; recursive query correctness.
3. Present work + findings to human.

## Smoke Test

```bash
pnpm exec drizzle-kit check
pnpm vitest run <the parent_run_id test file>
pnpm ditto status   # tree visible for a decomposed-goal run
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` (Phase 3).
3. Retrospective.
