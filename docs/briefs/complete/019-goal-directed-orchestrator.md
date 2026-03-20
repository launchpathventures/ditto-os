# Brief 019: Goal-Directed Orchestrator

**Date:** 2026-03-21
**Status:** ready (parent brief — build via sub-briefs 021 + 022)
**Depends on:** Phase 4c (Brief 014 — system agents running through harness)
**Unlocks:** Brief 020 (E2E Verification + Templates)

## Sub-Briefs

| Brief | Name | Focus | Depends on | AC count |
|-------|------|-------|------------|----------|
| 021 | Orchestrator Engine | Schema, orchestrator rewrite, heartbeat extension, tests | Phase 4c | 17 |
| 022 | Orchestrator CLI | Goal tree in status, scope negotiation in capture, format helpers | 021 | 4 |

## Goal

- **Roadmap phase:** Phase 5: Work Evolution Verification
- **Capabilities:** Goal → task decomposition, dependency-aware scheduling around trust gate pauses, confidence-based stopping condition, goal tree visibility in CLI

## Context

The orchestrator system agent (`src/engine/system-agents/orchestrator.ts`) is currently pass-through: it receives a classified+routed work item and calls `startProcessRun()`. It has no concept of goals, decomposition, or scheduling.

The heartbeat engine (`src/engine/heartbeat.ts`) executes linearly within a single process run. When a trust gate pauses a step, `fullHeartbeat()` stops the entire run. There is no mechanism to look for independent unblocked work.

This brief transforms the orchestrator from pass-through to goal-directed manager and extends the heartbeat to support work-queue scheduling across multiple spawned tasks.

## Objective

A user can enter a goal via `aos capture`. The orchestrator proposes a scope, the user confirms, the orchestrator decomposes the goal into tasks (work items with `goalAncestry`), spawns process runs for each task, and manages the work queue — routing around trust gate pauses to independent tasks. The orchestrator stops when its own confidence drops too low (Insight-045).

## Non-Goals

- **Automatic re-planning based on step outputs** — the orchestrator decomposes once at goal confirmation. Re-planning is Phase 8 (learning layer) scope.
- **Cross-process dependency inference** — tasks declare explicit dependencies. The orchestrator does not infer that task A blocks task B from context.
- **LLM-based decomposition for arbitrary goals** — Phase 5 uses process-definition-guided decomposition (see Decomposition Strategy below). LLM-based decomposition for goals with no matching process pattern is Phase 11 scope.
- **Multi-button CLI cards** — stopping condition UX uses @clack/prompts `select` calls, not rendered button rows.

## Decomposition Strategy

**How the orchestrator breaks a goal into tasks:** The orchestrator uses the assigned process definition's step list as the decomposition blueprint. Each step in the process becomes a task in the goal tree. Dependencies between tasks mirror `depends_on` declarations in the process YAML.

**Example:** A goal routed to `dev-pipeline` decomposes into: PM Triage → Researcher Scout → Designer UX → Architect Design → Builder Implement → Reviewer Check → Documenter Wrap — with the routing conditions determining which steps are actually needed.

**When no matching process exists:** The orchestrator falls back to asking the user: "I don't have a process that matches this goal. Would you like to define one, or describe what tasks are needed?" This surfaces via the Type 1 (blocked) escalation pattern.

**LLM involvement:** The orchestrator uses LLM calls (via the Claude adapter) for two specific decisions: (1) mapping goal text to an existing process definition, and (2) determining which conditional steps (route_to branches) are relevant for the specific goal. It does NOT use LLM to invent novel task decompositions.

## Inputs

1. `docs/research/goal-directed-orchestrator-patterns.md` — patterns from 12 frameworks
2. `docs/research/phase-5-orchestrator-ux.md` — interaction spec (sections 1-4)
3. `src/engine/system-agents/orchestrator.ts` — current pass-through
4. `src/engine/heartbeat.ts` — current heartbeat with dependency resolution
5. `src/db/schema.ts` — workItems table (goalAncestry, spawnedFrom, spawnedItems exist)
6. `processes/orchestrator.yaml` — orchestrator process definition
7. `docs/adrs/010-workspace-interaction-model.md` — orchestrator specification
8. `docs/adrs/011-attention-model.md` — confidence model

## Constraints

- The orchestrator remains a system agent running through the harness pipeline (Insight-044: `script` executor + `systemAgent` config). It does not become a special-cased engine component.
- Goal decomposition uses existing `workItems` table fields (`goalAncestry`, `spawnedFrom`, `spawnedItems`). No new tables for decomposition — the schema already supports it.
- The heartbeat's existing dependency resolution (`findNextWork()`) is extended, not replaced. Sequential processes without goals work exactly as before.
- Trust gate behaviour is unchanged — the innovation is in the orchestrator's response to gate pauses, not in the gate itself.
- All new code must have integration tests (Brief 017 pattern: real SQLite, mocked Anthropic SDK).

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Plan-track-replan loop | LangGraph plan-and-execute `Planner → Executor → Replanner` | Cleanest separation of planning from execution. Adapted: our orchestrator does plan + track, heartbeat does execute |
| Completion-order processing | Temporal Selectors `workflow.Selector` | Purest "route around blocked items" pattern. Adapted: our orchestrator checks work queue for unblocked tasks when one pauses |
| Composable stopping conditions | AutoGen `TerminationCondition` with AND/OR composition | Richest stopping system found. Adapted: we use two conditions composed with OR: confidence-low OR all-tasks-complete |
| File-based plan tracking | Manus AI `todo.md` pattern | Durable state that survives context loss. Adapted: our decomposition is stored in workItems table, not a file |
| Four-way escalation taxonomy | Multi-tier confidence routing (Section 3.3 of research) | Maps blocked/uncertain/error/complete to distinct routing. Adapted: Phase 5 ships types 1 (blocked) and 3 (error); types 2 (uncertain) and 4 (aggregate) deferred to web dashboard |
| Manager-outside-the-pool | CrewAI hierarchical process `manager_agent` | Orchestrator is not a worker — it schedules workers. Already in ADR-010 |
| Goal ancestry | ADR-010, Paperclip `goals.ts` | Work items link to parent goals. Already in schema |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/system-agents/orchestrator.ts` | Rewrite: goal decomposition, task spawning, work-queue management, confidence-based stopping |
| `src/engine/heartbeat.ts` | Modify: add `orchestratorHeartbeat()` — wrapper that iterates over spawned task process runs, calling `fullHeartbeat()` on each unblocked task. Does NOT modify the inner heartbeat loop — existing linear execution is unchanged |
| `src/db/schema.ts` | Modify: add `decomposition` field on workItems (JSON: task list with dependencies and status). Add `orchestratorConfidence` on processRuns |
| `src/cli/commands/capture.ts` | Modify: goal-type work items trigger scope negotiation flow before orchestration |
| `src/cli/commands/status.ts` | Modify: add goal tree view showing decomposed tasks with status, dependencies, "your attention needed" |
| `src/cli/format.ts` | Modify: add `formatGoalTree()` helper for CLI tree rendering |
| `processes/orchestrator.yaml` | Modify: update description to reflect goal-directed behaviour |
| `src/engine/system-agents/orchestrator.test.ts` | Create: integration tests for decomposition, scheduling, confidence stopping |
| `src/engine/heartbeat.test.ts` | Modify: add tests for orchestrator heartbeat, route-around-paused behaviour |

## User Experience

- **Jobs affected:** Define (goal setting + scope confirmation), Orient (goal tree, progress), Decide (stopping conditions)
- **Primitives involved:** Quick Capture (goal entry), Process Graph (CLI goal tree), Review Queue (paused items)
- **Designer input:** `docs/research/phase-5-orchestrator-ux.md` sections 1-4
- **Process-owner perspective:** The user enters a goal. The orchestrator proposes a scope (what it will do, what it won't, what it needs). The user confirms. Work begins. `aos status` shows a tree of tasks with progress. When a task pauses at a trust gate, the orchestrator continues on independent tasks. When the orchestrator is uncertain, it surfaces the situation with a clear explanation and options. The user makes decisions from their phone or desk.
- **Interaction states:**

| State | What user sees | Trigger |
|-------|---------------|---------|
| Goal classifying | "Classifying..." | `aos capture` with goal-type input |
| Scope proposal | Proposed scope card with confirm/adjust/cancel | Orchestrator analyses goal |
| Scope confirmed | "Starting work on: [goal]" | User confirms |
| Decomposition in progress | Goal tree populating in `aos status` | Orchestrator spawning tasks |
| Work in progress | Tree with ✓/●/○ markers, "Your attention: N items" | Heartbeat executing tasks |
| Task paused | "⏸ awaiting review" inline in tree | Trust gate pause |
| Route-around active | "Routed around [task] — working on [other task]" | Orchestrator found independent work |
| Blocked (Type 1) | "Needs your input: [specific request]" | Task needs human input |
| Error (Type 3) | "API failure. Retry/Skip/Cancel" | System error after retries |
| Goal complete | "Goal achieved: [summary]" | All tasks complete |
| Orchestrator stopped | "Remaining work needs your judgment" | Confidence dropped to low |

- **Deferred UX (Phase 10):** Type 2 (uncertain — choose between options with pros/cons). This needs richer interaction than CLI select prompts. Shipped in web dashboard.
- **In-scope escalation types:** Type 1 (blocked — specific input needed), Type 3 (error — system failure), Type 4 (aggregate uncertainty — too many open questions to proceed). Type 4 is the natural CLI expression of the confidence stopping condition (Insight-045) and has a wireframe in the UX spec.

## Acceptance Criteria

### Goal Decomposition
1. [ ] `aos capture "Build out Phase 5"` classifies as `goal` and triggers scope negotiation (not direct routing)
2. [ ] Orchestrator proposes scope: included items, excluded items with reasons, estimated task count, needs from human
3. [ ] User can confirm, adjust (add/remove items), or cancel scope before work begins
4. [ ] On confirmation, orchestrator creates child work items with `goalAncestry` linking back to parent goal and `spawnedFrom` set
5. [ ] Child work items have explicit dependencies (stored in `decomposition` field on parent work item)
6. [ ] Parent work item `spawnedItems` array is populated with child IDs

### Work-Queue Scheduling
7. [ ] `orchestratorHeartbeat()` executes the next unblocked task (dependencies met, not paused at trust gate)
8. [ ] When a task pauses at a trust gate, the orchestrator finds and executes the next independent task (no dependency on paused task)
9. [ ] Route-around decisions are logged in the activity table with reasoning
10. [ ] `aos status` shows which tasks were routed around and why

### Confidence-Based Stopping
11. [ ] Orchestrator tracks its own confidence as it decomposes and schedules (high/medium/low — categorical, matching ADR-011)
12. [ ] When orchestrator confidence drops to `low`, the process pauses with the appropriate escalation type: Type 1 (blocked — specific input needed), Type 3 (error — system failure), or Type 4 (aggregate uncertainty — remaining work has too many open questions)
13. [ ] Type 4 escalation message includes: tasks completed so far, remaining tasks with open questions, why the orchestrator can't proceed, and options (resume with guidance, reduce scope, pause goal)
14. [ ] The escalation message for Types 1 and 3 includes: what was being worked on, why it stopped, what would unblock it

### CLI Experience
15. [ ] `aos status` for a goal shows a tree: goal → tasks → subtasks with ✓/●/○/⏸ status markers
16. [ ] Tree includes "Your attention needed: N items" summary line
17. [ ] Tree includes "Progress: X/Y tasks complete" summary line

### Tests
18. [ ] Integration tests: orchestrator decomposes a goal into tasks with correct goalAncestry
19. [ ] Integration tests: orchestratorHeartbeat routes around a paused task to an independent task
20. [ ] Integration tests: orchestrator stops when confidence is low (Type 4 escalation)
21. [ ] All existing tests continue to pass (no regression in linear process execution)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/010-workspace-interaction-model.md`
2. Review agent checks: Does the orchestrator match ADR-010's specification? Does confidence stopping match ADR-011? Does the heartbeat extension break existing process execution? Are the CLI changes consistent with the existing status command?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Sync process definitions
pnpm cli sync

# 2. Capture a goal
pnpm cli capture "Set up invoice reconciliation process"
# Expect: classified as 'goal', scope proposal shown

# 3. Confirm scope (interactive)
# Expect: orchestrator creates child work items

# 4. Check status
pnpm cli status
# Expect: goal tree with tasks, dependencies, progress

# 5. Run heartbeat
pnpm cli heartbeat <run-id>
# Expect: tasks execute, paused tasks are routed around

# 6. Run tests
pnpm test
# Expect: all tests pass including new orchestrator tests
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — mark goal decomposition as done
3. Move to Brief 020 (E2E Verification + Templates)
