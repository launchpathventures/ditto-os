# Brief: Orchestrator Auto-Wiring — Goal Loop Completion

**Date:** 2026-04-01
**Status:** draft
**Depends on:** None (independent engine work — can build parallel with 069 and 063)
**Unlocks:** Autonomous multi-step goal execution — "implement these 3 briefs" works end-to-end

## Goal

- **Roadmap phase:** Phase 12: Engine Completion
- **Capabilities:** Goal decomposition auto-execution, task auto-routing, goal-level trust, pipeline chaining

## Context

Insights 132–133 identified that the orchestrator heartbeat exists but must be called explicitly. Goals decompose into tasks via `decomposeGoal()`, but tasks don't auto-route to processes or auto-execute. The universal work loop (ADR-010, ADR-015) can't complete end-to-end without manual `orchestratorHeartbeat()` invocation at each step.

The engine has all the pieces: `heartbeat()` loops within a run, `fullHeartbeat()` runs to completion, `orchestratorHeartbeat()` iterates decomposed tasks, trust gates pause for review. What's missing is the wiring between them — the automatic chain from goal → decompose → route → execute → next task → complete.

## Objective

User creates a goal ("Implement briefs 069, 070, and 063"). The orchestrator automatically decomposes it into tasks, routes each to the right process, executes in dependency order, pauses at trust gates, and resumes when approved — all without manual `orchestratorHeartbeat()` calls.

## Non-Goals

- Cross-goal coordination (multiple goals competing for resources)
- Automatic trust tier promotion during goal execution
- Goal progress UI (Brief 073's composition engine handles rendering)
- Parallel goal execution (one goal at a time for v1)
- Goal cancellation with rollback (cancel stops, no undo)
- LLM-based task routing (rule-based + keyword matching for v1; LLM routing in v2)

## Inputs

1. `docs/adrs/010-workspace-interaction-model.md` — work item lifecycle, orchestrator agent
2. `docs/adrs/015-meta-process-architecture.md` — four meta-processes, Goal Framing → Build → Execute → Feedback
3. `docs/insights/132-autonomous-build-loop-is-the-product.md` — engine gaps identified
4. `docs/insights/133-one-loop-not-special-cases.md` — universal loop confirmed, orchestrator gaps
5. `src/engine/heartbeat.ts` — fullHeartbeat(), orchestratorHeartbeat(), findNextWork()
6. `src/engine/system-agents/orchestrator.ts` — executeOrchestrator(), decomposeGoal()
7. `src/engine/self-delegation.ts` — start_pipeline, create_work_item, approve_review handlers

## Constraints

- MUST NOT change `heartbeat()` or `fullHeartbeat()` signatures (backward compatible)
- MUST NOT bypass trust gates — orchestrator respects all trust tier decisions
- MUST NOT auto-execute if no process matches a decomposed task (escalate to user)
- MUST log all orchestrator routing decisions to activity log
- MUST handle partial completion (some tasks done, some paused, some failed)
- MUST support goal-level pause — user can halt all child runs
- MUST handle dependency ordering — blocked tasks wait for dependencies
- MUST route around paused tasks to execute unblocked work (existing orchestratorHeartbeat pattern)
- All existing tests pass (453+ unit, 14 e2e)
- `pnpm run type-check` passes

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Workflow orchestration with deps | Temporal workflow engine | pattern | Proven model for dependency-aware task chaining |
| Suspend/resume with serialized state | Mastra `control-flow.ts` | adopt | Already used in heartbeat human step suspend |
| Goal decomposition | ADR-010 orchestrator design | extend | Architecture already defines this; brief fills gaps |
| orchestratorHeartbeat loop | `heartbeat.ts` existing implementation | extend | Working code; needs auto-trigger and routing |
| Task routing by process match | `router.yaml` process definition | extend | Process exists but isn't wired to decomposition |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/heartbeat.ts` | Modify: add `goalHeartbeatLoop(goalWorkItemId, trustOverrides?)` — continuously calls `orchestratorHeartbeat()` until goal completes/pauses/fails. Add `resumeGoal(goalWorkItemId)` for resuming after approval. |
| `src/engine/system-agents/orchestrator.ts` | Modify: after `decomposeGoal()`, auto-invoke `goalHeartbeatLoop()`. Add routing logic — for each decomposed task, match to available process by slug or keyword. Handle "no match" → escalate. Add `goalTrustOverrides` parameter. |
| `src/engine/self-delegation.ts` | Modify: update `create_work_item` — when type is "goal", auto-trigger orchestrator. Add `pause_goal(goalWorkItemId)` tool. Update `approve_review` — after approving a child run step, trigger goalHeartbeatLoop to check for newly unblocked tasks. |
| `src/engine/system-agents/router.ts` | Modify: implement task-to-process matching — keyword matching against process names/descriptions + slug exact match. Return `{ processSlug, confidence, reasoning }`. |
| `src/engine/heartbeat.test.ts` | Modify: add ≥5 tests for goalHeartbeatLoop (happy path, partial completion, pause, escalation, dependency ordering) |
| `src/engine/system-agents/orchestrator.test.ts` | Modify: add ≥3 tests for auto-routing (match found, no match escalation, confidence threshold) |

## User Experience

- **Jobs affected:** Delegate, Orient, Review
- **Primitives involved:** Trust Control (goal-level), Activity Feed (orchestrator decisions), Review Queue (trust gate pauses)
- **Process-owner perspective:** You state a goal. Ditto breaks it into tasks, figures out which process handles each, and starts executing. You only get involved at trust gates (review/approve) or when Ditto can't figure out what process to use. Between your approvals, work continues automatically on unblocked tasks.
- **Interaction states:**
  - **Goal created:** Work item in "intake" → orchestrator auto-triggers
  - **Decomposing:** Tasks created as children, dependencies mapped
  - **Executing:** Unblocked tasks run through fullHeartbeat, paused tasks wait
  - **Trust gate pause:** Specific task paused, other tasks continue if unblocked
  - **Escalation:** Task can't route to a process → user asked to assign manually
  - **Partial completion:** Some tasks done, goal status reflects mix
  - **Complete:** All tasks done → goal marked completed
- **Designer input:** Not invoked — pure engine work. UI rendering handled by Brief 073.

## Acceptance Criteria

1. [ ] `goalHeartbeatLoop(goalId)` continuously orchestrates until goal completes or all tasks are paused/failed
2. [ ] After `decomposeGoal()`, orchestrator automatically starts `goalHeartbeatLoop()` — no manual call needed
3. [ ] Decomposed tasks match to processes by slug exact match or keyword matching against process name/description; auto-route only when router confidence ≥ "medium" (≥0.6)
4. [ ] If no process matches or router confidence < "medium", task status set to "waiting_human" with routing escalation context
5. [ ] Trust gates in child runs pause the specific task, not the entire goal
6. [ ] `orchestratorHeartbeat` routes around paused tasks to execute unblocked tasks (existing behavior preserved)
7. [ ] After `approve_review()` on a child run step, `goalHeartbeatLoop` checks for newly unblocked tasks and continues
8. [ ] `pause_goal()` tool added — halts all active child runs, prevents new ones from starting
9. [ ] Goal-level trust overrides parameter applies to all child process runs — can only LOWER trust (tighten oversight), never ELEVATE (consistent with ADR-007: trust never auto-upgrades)
10. [ ] All orchestrator routing decisions logged to activity log with reasoning
11. [ ] Goal status reflects partial completion: tracks completed/paused/failed/pending counts
12. [ ] Dependency ordering enforced: task B with `dependsOn: [taskA]` doesn't start until task A completes
13. [ ] All existing tests pass (453+ unit, 14 e2e), `pnpm run type-check` passes
14. [ ] ≥5 new tests for goalHeartbeatLoop (happy path, partial, pause, escalation, deps)
15. [ ] ≥3 new tests for task-to-process routing (match, no match, slug match)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review checks: Does this respect ADR-010 work item lifecycle? Does trust enforcement match ADR-007? Are orchestrator decisions auditable? Is the routing logic deterministic and testable? Are escalations surfaced correctly?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Create a goal via CLI or Self conversation:
#    "Implement brief 069 then brief 070"
# 2. Verify: orchestrator creates 2 child tasks with dependency (070 depends on 069)
# 3. Verify: task 1 (069) auto-routes to dev-pipeline process
# 4. Verify: fullHeartbeat runs on task 1's process run
# 5. Verify: task 1 pauses at trust gate (supervised tier)
# 6. Approve task 1's review gate
# 7. Verify: task 2 (070) automatically starts after task 1 approval
# 8. Verify: task 2 pauses at its own trust gate
# 9. Approve task 2 → verify goal marked completed
# 10. Verify: activity log shows routing decisions for both tasks

# Integration test:
pnpm test -- --grep "goalHeartbeatLoop"
pnpm test -- --grep "orchestrator.*routing"
```

## After Completion

1. Update `docs/state.md` — Orchestrator auto-wiring complete
2. Update `docs/roadmap.md` — Phase 12 engine completion milestone
3. ADR-010 implementation validated: orchestrator → router → heartbeat chain works end-to-end
4. Foundation for "Ditto builds itself" use case (meta-process dogfooding)
5. Pattern available for any multi-step goal, not just dev pipeline
