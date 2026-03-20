# Brief: Phase 2c — Parallel Execution + Feedback Recording

**Date:** 2026-03-19
**Status:** complete
**Depends on:** Phase 2a, Phase 2b
**Unlocks:** Phase 3

## Goal

- **Roadmap phase:** Phase 2: Harness + Feedback Capture
- **Capabilities:** parallel_group via Promise.all, depends_on resolution, parallelGroupId on step runs, complete feedback data foundation

## Context

Phases 2a and 2b delivered the harness pipeline with trust gating, review patterns, and memory. But the heartbeat still executes steps sequentially. Phase 2c adds parallel execution (`parallel_group` in YAML) and `depends_on` resolution, completing the Phase 2 objective.

This is the least critical of the three sub-phases — many processes (especially in dogfood) are sequential. Parallel execution becomes important when process steps are independently executable (e.g., convention check + security scan running simultaneously).

Parent design: `docs/briefs/002-phase-2-harness.md` (section 5, plus depends_on parts of section 7).

## Objective

After 2c, process YAML can define `parallel_group` blocks with `depends_on` declarations. The heartbeat resolves dependencies, executes parallel groups via `Promise.all`, and handles mixed states (some steps paused, others complete within a group).

## Non-Goals

Everything in the parent brief's non-goals. Additionally:
- **Dynamic parallelism** — parallel groups are statically defined in YAML, not determined at runtime.
- **Cross-run parallelism** — this is within-run parallel execution. Running multiple process runs concurrently is a separate concern (Paperclip's `maxConcurrentRuns` pattern, deferred).

## Inputs

1. `docs/briefs/002-phase-2-harness.md` — parent design (section 5)
2. `docs/research/phase-2-harness-patterns.md` — parallel execution research (section 4)
3. `src/engine/heartbeat.ts` — heartbeat from 2a (to extend)
4. `src/engine/step-executor.ts` — step executor (to extend for groups)
5. `src/engine/process-loader.ts` — process loader (to parse parallel_group + depends_on)
6. `src/db/schema.ts` — schema (to add parallelGroupId to stepRuns)
7. `processes/feature-implementation.yaml` — reference YAML (may add parallel_group example)

## Constraints

All constraints from parent brief. Additionally:
- **Each step in a parallel group goes through the full harness pipeline** — no shortcuts. Trust gating, review patterns, and feedback recording apply per-step.
- **Failure semantics: group fails if any step fails** — Mastra pattern. No partial-success semantics.
- **Must not break sequential processes** — processes without `parallel_group` or `depends_on` continue to work exactly as before (implicit sequential ordering).

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Parallel execution (Promise.all) | Mastra `packages/core/src/workflows/handlers/control-flow.ts` | `.parallel()` uses Promise.all, merges results |
| depends_on resolution | **Original** (process-level construct) | No source has within-run depends_on as a process YAML feature |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | **Modify**: Add `parallelGroupId` (nullable text) to `stepRuns` table |
| `src/engine/process-loader.ts` | **Modify**: Parse `parallel_group` and `depends_on` from YAML. Validate: no circular dependencies, all depends_on targets exist. |
| `src/engine/heartbeat.ts` | **Modify**: Add `depends_on` resolution. Find all ready steps/groups. Execute parallel groups via `Promise.all`. Handle mixed paused/complete within a group. |
| `src/engine/step-executor.ts` | **Modify**: Add `executeParallelGroup()` — accepts step array, runs each through harness pipeline via `Promise.all`, merges results into `{ [stepId]: output }`. |
| `processes/feature-implementation.yaml` | **Modify** (optional): Add `parallel_group` example if the process has independently-executable steps. If not, leave sequential — not all processes need parallelism. |

## Design

### YAML Format

```yaml
steps:
  - id: plan
    name: Plan approach
    executor: ai-agent

  - parallel_group: review-checks
    depends_on: [plan]
    steps:
      - id: convention-check
        name: Convention compliance
        executor: ai-agent
        agent_role: reviewer
      - id: security-scan
        name: Security scan
        executor: ai-agent
        agent_role: security

  - id: human-review
    name: Human review
    depends_on: [review-checks]
    executor: human
```

### Dependency Resolution

1. The heartbeat queries completed steps (status: `approved`)
2. For each pending step/group, check if all `depends_on` targets are approved
3. If no `depends_on` declared and no `parallel_group`, steps execute in YAML order (backward compatible)
4. If `depends_on` is declared, YAML order is irrelevant — only dependency completion matters
5. Ready steps: all dependencies approved. Ready groups: group's `depends_on` all approved.

### Parallel Group Execution

1. Heartbeat identifies a ready parallel group
2. Creates `stepRuns` records for all steps in the group, each with `parallelGroupId` set to the group name
3. Calls `executeParallelGroup(steps)` which runs `Promise.all(steps.map(step => harnessPipeline.run(stepContext)))`
4. Each step goes through the full harness pipeline independently (memory assembly, execution, review patterns, trust gate, feedback recording)
5. Results merged into `{ [stepId]: { outputs, harnessDecision } }`
6. If any step fails → entire group status is `failed`, run status is `failed`
7. If any step is paused (trust gate) → group status is `waiting_review`. Other steps that completed successfully stay `approved`. Run waits for all paused steps to be reviewed.
8. Human reviews individual steps within the group via existing `pnpm cli review` / `pnpm cli approve`
9. Group advances when all its steps are `approved`

### Backward Compatibility

Processes without `parallel_group` or `depends_on`:
- Steps execute in YAML order (current behaviour)
- The heartbeat treats the absence of `depends_on` as "depends on previous step" (implicit sequential chain)
- No code path changes for sequential processes

## Acceptance Criteria

1. [ ] `stepRuns` table has `parallelGroupId` field (nullable text)
2. [ ] Process loader parses `parallel_group` and `depends_on` from YAML
3. [ ] Process loader validates: no circular dependencies, all depends_on targets exist
4. [ ] Heartbeat resolves `depends_on` before executing steps
5. [ ] Parallel groups execute via `Promise.all`
6. [ ] If any step in a parallel group fails, the group fails
7. [ ] Each step in a parallel group goes through the full harness pipeline
8. [ ] Mixed state handling: group with some paused + some approved steps shows `waiting_review`
9. [ ] Human can review individual steps within a paused parallel group
10. [ ] Group advances only when all its steps are `approved`
11. [ ] Results from parallel steps merged into `{ [stepId]: output }` for downstream steps
12. [ ] Processes without parallel_group or depends_on work exactly as before
13. [ ] `pnpm cli sync` parses parallel_group and depends_on without error
14. [ ] `pnpm run type-check` passes with zero errors
15. [ ] Roadmap updated: parallel execution and depends_on marked as done, ensemble consensus noted as deferred

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Focus areas: Mastra provenance for Promise.all pattern, backward compatibility, failure semantics, trust gate per-step in groups
3. Present work + review findings to human

## After Completion

1. Update `docs/state.md` — Phase 2 fully complete
2. Update `docs/roadmap.md` — Phase 2 status: done. Note deferred items (ensemble consensus, agent permissions).
3. Retrospective: what worked, what surprised, what to change across all three sub-phases
4. Invoke `/dev-documenter` for full session wrap-up
