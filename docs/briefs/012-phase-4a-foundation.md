# Brief: Phase 4a — Work Items + CLI Infrastructure

**Date:** 2026-03-20
**Status:** approved
**Depends on:** Phase 3 (complete), Brief 011 (parent)
**Unlocks:** Brief 013 (Phase 4b — human steps + capture), Brief 014 (Phase 4c — meta-processes)

## Goal

- **Roadmap phase:** Phase 4: Workspace Foundation
- **Capabilities:** `workItems` table, CLI rewrite (citty + @clack/prompts), `aos status`, `aos review`/`approve`/`edit`/`reject`, `aos sync`/`start`, `aos trust`

## Context

The existing CLI (`src/cli.ts`) is a monolithic switch statement with 10+ commands. It uses raw `process.argv` parsing, no framework. Phase 4 needs a proper CLI framework (citty for routing, @clack/prompts for interactive UX) and a new `workItems` table to make work items first-class.

This sub-brief builds the skeleton: the database table, the CLI framework, and the rewrite of existing commands into the new structure. Everything in 4b and 4c builds on this.

## Objective

After this sub-brief: `pnpm cli sync`, `pnpm cli start`, `pnpm cli status`, `pnpm cli review`, `pnpm cli approve`, `pnpm cli reject`, `pnpm cli trust` all work through the new citty framework with @clack/prompts UX. The `workItems` table exists and is populated when processes produce review-needing outputs. `aos status` shows pending tasks and process health per the Designer's spec.

## Non-Goals

- Human step executor (4b)
- `aos capture` (4b)
- `aos complete` (4b)
- System agents / meta-processes (4c)
- Per-output confidence metadata (4c)
- Goal decomposition (4c)
- The `workItems` table is created here but only used for review tasks initially. Action tasks (human steps) and goal-driven tasks come in 4b/4c.

## Inputs

1. `docs/briefs/011-phase-4-workspace-foundation.md` — parent brief
2. `docs/research/phase-4-workspace-cli-ux.md` — Designer's interaction spec
3. `docs/research/phase-4-composition-sweep.md` — CLI patterns (GitHub CLI, clack, citty)
4. `src/cli.ts` — existing CLI to rewrite
5. `src/db/schema.ts` — existing schema to extend

## Constraints

- All existing CLI commands must work identically after rewrite (backward compatible)
- `pnpm cli` must continue as the entry point (alias `aos` later or keep `pnpm cli`)
- No new npm dependencies beyond citty, @clack/prompts, and their transitive deps
- TTY-aware: interactive prompts when TTY, plain output when piped
- `--json` flag on all listing commands
- Implementation terms never appear in user-facing output

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| CLI routing framework | citty `unjs/citty` | TypeScript-first, ESM, minimal. Type-safe command definitions. |
| CLI interactive prompts | @clack/prompts `bombshell-dev/clack` | select, multiselect, autocomplete, group, task. Production-proven. |
| Aggregation dashboard pattern | GitHub CLI `pkg/cmd/status/status.go` | Parallel data loading for `status` command. |
| Factory injection | GitHub CLI `pkg/cmd/factory/default.go` | Shared CLI context (db, config, IO) injected into all commands. |
| Format polymorphism | GitHub CLI `Exporter` interface | `--json` support on all listing commands. |
| Work item schema | Paperclip `packages/db/src/schema/goals.ts` + ADR-010 | Tickets with goal ancestry. 5 work item types. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `workItems` table (type, status, content, source, goalAncestry, assignedProcess, spawnedFrom, spawnedItems, executionIds, context, timestamps). Add `workItemTypeValues`, `workItemStatusValues` type unions. Note: the existing `captures` table remains — it's a legacy table from Phase 1. In 4a, `workItems` is the new first-class table; the `captures` table is untouched. In 4b, `aos capture` will create work items instead of captures. |
| `src/cli.ts` | Rewrite: Replace switch statement with citty command routing. Each command becomes a separate function. Shared `CLIContext` with db, config references. |
| `src/cli/commands/status.ts` | Create: `aos status` command. Loads pending work items + process health in parallel. Output per Designer spec (NEEDS YOUR ATTENTION + PROCESS HEALTH + RUNNING QUIETLY sections). Supports `--all`, `--process <slug>`, `--json`. |
| `src/cli/commands/review.ts` | Create: `aos review` (list pending reviews), `aos review <id>` (show detail). Output Viewer rendering per Designer spec. |
| `src/cli/commands/approve.ts` | Create: `aos approve <id>` with optional `--edit` flag (opens $EDITOR, captures diff). Records feedback. |
| `src/cli/commands/reject.ts` | Create: `aos reject <id>` with required reason (interactive prompt or `--reason` flag). Records feedback. |
| `src/cli/commands/trust.ts` | Create: Rewrite existing trust commands into citty. `aos trust <process>`, `aos trust accept`, `aos trust reject`, `aos trust override`, `aos trust <process> --simulate <tier>`. |
| `src/cli/commands/sync.ts` | Create: Rewrite existing sync command into citty. |
| `src/cli/commands/start.ts` | Create: Rewrite existing start command into citty. When a process run starts, create a corresponding work item. |
| `src/cli/commands/heartbeat.ts` | Create: Rewrite existing heartbeat command into citty. |
| `src/cli/commands/capture.ts` | Create: Rewrite existing capture command into citty (simple note capture — redesigned in 4b). |
| `src/cli/commands/debt.ts` | Create: Rewrite existing debt command into citty. |
| `src/cli/context.ts` | Create: `CLIContext` interface with db, IO helpers, format helpers (json/table/quiet). |
| `src/cli/format.ts` | Create: Shared formatting utilities — work item line format (`#ID Type Summary / Context | Process | Age`), process health line, section headers. |
| `package.json` | Modify: Add citty, @clack/prompts dependencies. |

## User Experience

- **Jobs affected:** Orient (`status`), Review (`review`/`approve`/`edit`/`reject`), Define (`sync`/`start`), Delegate (`trust`)
- **Primitives involved:** Daily Brief (P1 — text), Process Card (P2 — via status), Review Queue (P5), Output Viewer (P6), Feedback Widget (P7), Trust Control (P11)
- **Designer input:** `docs/research/phase-4-workspace-cli-ux.md` — Scenarios 1, 2, 5. Interaction states for `aos status`, `aos review`, `aos trust`.

## Acceptance Criteria

1. [ ] `workItems` table exists in schema with all ADR-010 fields (type, status, content, source, goalAncestry, assignedProcess, spawnedFrom, spawnedItems, executionIds, context, timestamps)
2. [ ] `pnpm cli sync` works through citty (backward compatible with existing behavior)
3. [ ] `pnpm cli start <process>` works through citty AND creates a work item of type `task`
4. [ ] `pnpm cli status` shows NEEDS YOUR ATTENTION section with pending review items as work items in `#ID Type Summary / Context | Process | Age` format
5. [ ] `pnpm cli status` shows PROCESS HEALTH section with all processes showing trust tier, run count, and health indicator
6. [ ] `pnpm cli status` with `--all` flag shows RUNNING QUIETLY section for autonomous/spot-checked processes (digest per ADR-011)
7. [ ] `pnpm cli status` with no pending items shows "Nothing needs your attention right now." (silence principle)
8. [ ] `pnpm cli status --json` returns structured JSON with `pending`, `processHealth`, and `runningQuietly` arrays
9. [ ] `pnpm cli review <id>` shows full output detail with checks passed/failed and approve/edit/reject actions
10. [ ] `pnpm cli approve <id>` records approval feedback and advances process. `pnpm cli approve <id> --edit` opens $EDITOR and captures diff. `pnpm cli edit <id>` is an alias for `pnpm cli approve <id> --edit` (implement as citty alias within `approve.ts`, not a separate command file)
11. [ ] `pnpm cli reject <id>` requires reason (interactive prompt or `--reason` flag) and records rejection feedback
12. [ ] `pnpm cli trust <process>` shows trust state, metrics, upgrade eligibility (rewrite of existing, not new functionality)
13. [ ] All commands are TTY-aware: interactive prompts when TTY, plain output when piped
14. [ ] `pnpm run type-check` passes with zero errors

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Reviewer checks: schema compliance with ADR-010, CLI output matches Designer spec, backward compatibility preserved, no implementation terms in user-facing output
3. Present work + review to human

## Smoke Test

```bash
# Fresh start
pnpm cli sync
pnpm cli status
# Expected: "Welcome to Agent OS" or process list with no pending items

# Start a run
pnpm cli start code-review
pnpm cli status
# Expected: work item appears in NEEDS YOUR ATTENTION as Review type

# Review flow
pnpm cli review <id>
# Expected: full output detail with checks
pnpm cli approve <id>
# Expected: "✓ Approved. [Process] continuing."

# JSON output
pnpm cli status --json | head -20
# Expected: valid JSON with pending array

# Trust (backward compat)
pnpm cli trust code-review
# Expected: trust state display (same data as before, new formatting)
```

## After Completion

1. Update `docs/state.md` with 4a completion
2. Proceed to Brief 013 (Phase 4b)
