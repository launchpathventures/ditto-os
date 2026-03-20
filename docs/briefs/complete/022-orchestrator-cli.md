# Brief 022: Orchestrator CLI

**Date:** 2026-03-21
**Status:** complete
**Depends on:** Brief 021 (Orchestrator Engine)
**Unlocks:** Brief 020 (E2E Verification + Templates)

## Goal

- **Roadmap phase:** Phase 5: Work Evolution Verification
- **Capabilities:** Goal tree visibility in CLI status, scope negotiation in capture, escalation display

## Context

Brief 021 delivers the orchestrator engine — decomposition, scheduling, and confidence stopping. This brief wires it into the CLI so users can see goal trees, confirm scope before execution, and see escalation messages.

## Objective

`aos capture` triggers scope negotiation for goals. `aos status` shows a goal tree with task progress, route-around explanations, and "your attention needed" summary. Orchestrator escalations display as structured messages with actionable options.

## Non-Goals

- **Engine logic** — Brief 021 handles all orchestrator and heartbeat changes
- **Web dashboard** — Phase 10
- **Type 2 escalation UX** (choose between options with pros/cons) — deferred to web dashboard

## Inputs

1. Brief 021 output — orchestrator engine with decomposition and scheduling
2. `docs/research/phase-5-orchestrator-ux.md` — interaction spec sections 1-4
3. `src/cli/commands/capture.ts` — current auto-classification pipeline
4. `src/cli/commands/status.ts` — current status command
5. `src/cli/format.ts` — current format utilities

## Constraints

- Uses @clack/prompts for interactive flows (scope confirm/adjust/cancel, escalation options)
- Goal tree uses Unicode box-drawing characters consistent with existing CLI output
- `--json` flag on status includes goal tree data
- Non-goal work items flow through capture unchanged (task fast-path preserved)

## Provenance

| What | Source | Adaptation |
|------|--------|------------|
| Tree rendering | npm `cli-tree` patterns, GitHub CLI issue hierarchy | Unicode box drawing for goal → task relationships |
| Scope confirmation | @clack/prompts confirm pattern | Existing capture.ts interactive fallback pattern extended |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/cli/commands/capture.ts` | Modify: goal-type items trigger scope negotiation (propose → confirm/adjust/cancel) before orchestration |
| `src/cli/commands/status.ts` | Modify: detect goal work items with `spawnedItems`, render goal tree view |
| `src/cli/format.ts` | Modify: add `formatGoalTree()` and `formatEscalation()` helpers |

## User Experience

- **Jobs affected:** Define (scope confirmation), Orient (goal tree), Decide (escalation display)
- **Designer input:** `docs/research/phase-5-orchestrator-ux.md` sections 1-4
- **Interaction states:** See Brief 019 interaction state table

## Acceptance Criteria

1. [ ] `aos capture "Build out Phase 5"` detects goal type and shows scope proposal: included items, excluded items with reasons, estimated task count, needs from human
2. [ ] User can confirm (proceed), adjust (re-enter modified goal), or cancel scope via @clack/prompts
3. [ ] Non-goal work items (`task`, `question`, etc.) bypass scope negotiation — existing flow unchanged
4. [ ] `aos status` for a goal shows tree: goal → tasks with ✓ (complete) / ● (running) / ○ (waiting) / ⏸ (paused) markers
5. [ ] Tree shows dependency information: "waiting (depends on X)"
6. [ ] Tree shows route-around information: "Routed around [task] — working on [other]"
7. [ ] Status includes "Your attention needed: N items" summary line
8. [ ] Status includes "Progress: X/Y tasks complete" summary line
9. [ ] Orchestrator escalation messages (Types 1, 3, 4) display as structured cards with actionable options via @clack/prompts select
10. [ ] `aos status --json` includes goal tree data in JSON output

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review checks: CLI output consistent with existing patterns? Scope negotiation uses @clack correctly? Goal tree readable at terminal widths ≥80?
3. Present work + review to human

## Smoke Test

```bash
# 1. Sync
pnpm cli sync

# 2. Capture a goal (requires Brief 021 engine running)
pnpm cli capture "Set up invoice reconciliation process"
# Expect: scope proposal shown, confirm/adjust/cancel prompt

# 3. Check status
pnpm cli status
# Expect: goal tree with tasks, progress, attention summary

# 4. Type check
pnpm run type-check
# Expect: clean
```

## After Completion

1. Update `docs/state.md` with what changed
2. Move to Brief 020 (E2E Verification + Templates)
