# Brief 021: Orchestrator Engine

**Date:** 2026-03-21
**Status:** complete
**Depends on:** Phase 4c (Brief 014 — system agents running through harness)
**Unlocks:** Brief 022 (Orchestrator CLI)

## Goal

- **Roadmap phase:** Phase 5: Work Evolution Verification
- **Capabilities:** Goal → task decomposition engine, dependency-aware scheduling around trust gate pauses, confidence-based stopping condition

## Context

See parent Brief 019 for full context. This sub-brief delivers the engine core: schema changes, orchestrator rewrite from pass-through to goal-directed, heartbeat extension for work-queue scheduling, and integration tests.

## Objective

The orchestrator system agent decomposes goals into tasks using process step lists as blueprints, spawns child work items with dependencies, and manages a work queue that routes around trust gate pauses. The orchestrator stops when its own confidence drops to low.

## Non-Goals

- **CLI changes** — Brief 022 handles capture scope negotiation, goal tree in status, format helpers
- Everything listed in Brief 019 Non-Goals

## Decomposition Strategy

(See Brief 019 for full strategy)

**Summary:** Process step list = task blueprint. Each step becomes a child work item. Dependencies mirror `depends_on` in YAML. LLM used only for mapping goal text to process and determining which conditional branches apply. Fallback: ask user when no matching process exists.

## Inputs

1. `src/engine/system-agents/orchestrator.ts` — current pass-through (84 lines)
2. `src/engine/heartbeat.ts` — current heartbeat with dependency resolution (960 lines)
3. `src/db/schema.ts` — workItems table (goalAncestry, spawnedFrom, spawnedItems already exist)
4. `processes/orchestrator.yaml` — orchestrator process definition
5. `src/test-utils.ts` — test infrastructure patterns
6. `docs/adrs/010-workspace-interaction-model.md` — orchestrator specification
7. `docs/adrs/011-attention-model.md` — confidence model (categorical)
8. Brief 019 — parent brief with full provenance table and constraints

## Constraints

- Orchestrator remains a system agent (Insight-044: `script` executor + `systemAgent` config)
- Uses existing `workItems` fields (`goalAncestry`, `spawnedFrom`, `spawnedItems`). Adds `decomposition` JSON field.
- Adds `orchestratorConfidence` to `processRuns`
- `findNextWork()` is extended, not replaced. Existing linear process execution unchanged.
- Trust gate behaviour unchanged — innovation is orchestrator's response to pauses
- All new code has integration tests (Brief 017 pattern: real SQLite, mocked Anthropic SDK)

## Provenance

See Brief 019 provenance table. Key patterns for this sub-brief:

| What | Source | Adaptation |
|------|--------|------------|
| Plan-track loop | LangGraph Planner → Executor | Orchestrator plans + tracks, heartbeat executes |
| Completion-order processing | Temporal Selectors | `orchestratorHeartbeat()` checks for unblocked tasks when one pauses |
| Composable stopping | AutoGen TerminationCondition | Two conditions with OR: confidence-low OR all-tasks-complete |
| Manager-outside-pool | CrewAI hierarchical | Orchestrator schedules workers, doesn't execute |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: add `decomposition` field on workItems (JSON). Add `orchestratorConfidence` on processRuns |
| `src/test-utils.ts` | Modify: add new columns to `createTables` SQL |
| `src/engine/system-agents/orchestrator.ts` | Rewrite: goal decomposition, task spawning, work-queue management, confidence tracking |
| `src/engine/heartbeat.ts` | Modify: add `orchestratorHeartbeat()` — wrapper that iterates spawned task process runs, calling `fullHeartbeat()` on each unblocked one. Inner loop unchanged |
| `processes/orchestrator.yaml` | Modify: update description to reflect goal-directed behaviour |
| `src/engine/system-agents/orchestrator.test.ts` | Create: integration tests |
| `src/engine/heartbeat.test.ts` | Modify: add orchestrator heartbeat tests |

## Acceptance Criteria

### Goal Decomposition
1. [ ] Orchestrator receives a goal-type work item with an assigned process and decomposes it into child work items
2. [ ] Child work items have `goalAncestry` linking back to parent goal and `spawnedFrom` set to parent ID
3. [ ] Child work items have explicit dependencies stored in the parent's `decomposition` field (JSON: task list with IDs, dependencies, and status)
4. [ ] Parent work item `spawnedItems` array is populated with child IDs
5. [ ] Each child work item corresponds to a step in the assigned process definition
6. [ ] Conditional steps (route_to branches) are included with a flag indicating they may be skipped at runtime

### Work-Queue Scheduling
7. [ ] `orchestratorHeartbeat(goalWorkItemId)` iterates spawned child tasks and calls `fullHeartbeat()` on each unblocked one
8. [ ] When a child task's process run pauses at a trust gate, `orchestratorHeartbeat` skips it and executes the next independent task (no dependency on paused task)
9. [ ] Route-around decisions are logged in the activity table with action `orchestrator.route-around` and reasoning metadata
10. [ ] `orchestratorHeartbeat` returns a result summarising: tasks completed, tasks paused, tasks remaining, overall goal status

### Confidence-Based Stopping
11. [ ] Orchestrator tracks confidence on the goal's process run (`orchestratorConfidence` field): high (all clear), medium (some uncertainty), low (too uncertain to proceed)
12. [ ] Confidence drops to `low` when: no unblocked tasks remain and some tasks are paused/failed, OR the orchestrator encounters an error it can't resolve
13. [ ] When confidence is `low`, orchestrator returns an escalation result with type (blocked/error/aggregate_uncertainty), what was being worked on, why it stopped, and what would unblock it
14. [ ] Type 4 (aggregate uncertainty) escalation includes: tasks completed, remaining tasks with open questions, options for the human

### Tests
15. [ ] Integration test: orchestrator decomposes a 3-step process into 3 child work items with correct goalAncestry and dependencies
16. [ ] Integration test: orchestratorHeartbeat routes around a paused task to an independent task
17. [ ] Integration test: orchestrator returns low-confidence escalation when all remaining tasks are blocked
18. [ ] All existing tests pass (pnpm test — no regression)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/010-workspace-interaction-model.md`
2. Review checks: Does orchestrator match ADR-010? Does confidence match ADR-011? Does heartbeat extension break existing execution?
3. Present work + review to human

## Smoke Test

```bash
# Run tests (primary verification for engine brief)
pnpm test
# Expect: all tests pass including new orchestrator + heartbeat tests

# Type check
pnpm run type-check
# Expect: clean
```

## After Completion

1. Update `docs/state.md` with what changed
2. Move to Brief 022 (Orchestrator CLI)
