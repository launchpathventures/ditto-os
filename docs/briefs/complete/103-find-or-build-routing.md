# Brief 103: Find-or-Build Routing & Goal-Level Trust

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 102 (goal-level reasoning & action boundaries)
**Unlocks:** Brief 104 (library curation pipeline)

## Goal

- **Roadmap phase:** Phase 11+ (Orchestrator Evolution)
- **Capabilities:** Build-on-gap routing, Process Model Library first-check, first-run gate, output threading across sub-goals, goal-level trust inheritance, bundled reviews

## Context

Brief 102 enables the orchestrator to decompose goals into sub-goals tagged as `find` or `build`. This brief implements what happens next: for `find` sub-goals, match to existing processes (already works via `matchTaskToProcess`). For `build` sub-goals, trigger the Build meta-process to create what's missing — using existing infrastructure (`web-search`, `generate_process`, `generate-integration`, dev roles). The Process Model Library is checked first as a cost optimization.

This brief also introduces goal-level trust (sub-processes inherit the goal's trust tier) and bundled reviews (checkpoint-based rather than per-step), solving the trust gate overload problem identified in black-hat analysis.

## Objective

Wire the Build meta-process into the orchestrator's gap-handling path, with Process Model Library as first check, first-run validation gate, output threading between sub-goals, and goal-level trust to prevent review overload.

## Non-Goals

- **Process Model Library content** — this brief uses existing templates/models as available; populating the library is separate work
- **Library curation pipeline** — Brief 104 handles AI battle-testing and admin review
- **Cross-instance model sharing** — Phase 13+
- **Budget tracking and spend management** — future brief (infrastructure for tracking spend against budget)
- **LLM routing Mode 2** (step-level conditional routing) — separate concern

## Inputs

1. `src/engine/system-agents/orchestrator.ts` — orchestrator to extend with build routing
2. `src/engine/system-agents/goal-decomposition.ts` — from Brief 102, produces sub-goals tagged find/build
3. `src/engine/self-tools/generate-process.ts` — process creation tool
4. `src/engine/self-delegation.ts` — delegation to dev roles for Build meta-process
5. `src/engine/heartbeat.ts` — goalHeartbeatLoop to extend with output threading and build-wait
6. `src/engine/web-search.ts` — research during build
7. `src/engine/industry-patterns.ts` — decomposition context
8. `processes/templates/` — existing templates (proto-Process Model Library)
9. `docs/adrs/015-meta-process-architecture.md` — Build meta-process definition
10. `docs/insights/099-process-model-library-with-app-binding.md` — library design

## Constraints

- **Build depth = 1**: orchestrator can trigger Build, Build cannot trigger Build. If Build hits a gap, it uses its tools directly (web-search, LLM reasoning) rather than spawning another orchestration cycle.
- **First-run gate**: a generated process is NOT treated as "existing capability" by the orchestrator until its first supervised run completes successfully. If first run fails, sub-goal escalates to user.
- **Process Model Library first**: before building from scratch, check if a template/model exists. Adopt + adapt is cheap; build from scratch is expensive. This is the cost amortization mechanism.
- **Goal-level trust can only RELAX** sub-process trust (consistent with session trust Brief 053). Cannot tighten beyond the process's own tier. Builder/reviewer roles and critical-tier steps cannot be relaxed.
- **Output threading is LLM-based** for V1 — the orchestrator contextually extracts relevant output from completed sub-goals and shapes it as input for dependent sub-goals. No formal schema enforcement.
- **Bundled reviews collect outputs across sub-goals** and present at natural phase boundaries (e.g., "research complete, ready to build"), not per-step. Individual feedback (approve/edit/reject) is recorded per sub-goal output within the bundle, not per bundle.
- **Build depth enforcement** uses an explicit `buildDepth` counter in the harness context, not just "the function doesn't call itself." The harness rejects any build trigger when `buildDepth >= 1`.
- **Failed builds**: when a generated process fails its first-run gate, the process is archived (not deleted — preserves learning), and the sub-goal escalates to the user with the failure evidence. Maximum 1 build retry per sub-goal before escalation.
- **Concurrent build deduplication**: before triggering build, check if another sub-goal (in any active goal) is already building a process for the same capability (keyword match). If so, wait for that build rather than duplicating.
- **Goal cancellation**: when a user cancels a goal mid-execution, all in-progress sub-goals are paused (not deleted), build-in-progress processes are abandoned (archived), and completed sub-goals and their outputs are preserved.
- **Cost observability**: log LLM cost per routing decision (find=free, model-adopt=cheap, build=expensive) to the activity log for future analysis of library ROI.
- **Process Model Library lookup** in this brief uses `templates/` (filesystem) as the initial library source. Brief 104 introduces the `processModels` DB table; when Brief 104 ships, `findProcessModel()` is updated to query the DB table instead.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Build-on-gap routing | Original to Ditto | — | No existing orchestration system routes unmatched goals to dynamic process creation |
| Library-first check | Package manager (npm registry, apt) | pattern | Check registry before building from source |
| First-run gate | Canary deployment | pattern | Validate in production before promoting to full capability |
| Goal-level trust inheritance | Session trust (Brief 053) `src/engine/session-trust.ts` | adopt | Same relax-only inheritance model, extended from run to goal scope |
| Output threading via LLM | Original to Ditto, inspired by multi-agent handoff patterns (AutoGen, Mastra) | — | LLM contextually maps outputs between autonomous process stages |
| Bundled reviews | Sprint review (Agile) | pattern | Review at iteration boundaries, not per-task |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/system-agents/orchestrator.ts` | Modify: Add `routeSubGoal()` — implements find-or-build routing per sub-goal. Extends `routeDecomposedTasks()` with build path. |
| `src/engine/system-agents/build-on-gap.ts` | Create: `triggerBuild()` function — orchestrates Build meta-process for a sub-goal (research → design → generate_process). Respects build depth=1. |
| `src/engine/system-agents/process-model-lookup.ts` | Create: `findProcessModel()` — searches templates/ for matching Process Model by industry + function keywords. Returns match with confidence. |
| `src/engine/goal-trust.ts` | Create: `GoalTrust` type, `resolveSubGoalTrust()` — resolves trust tier for sub-goal process runs (goal tier ∩ process tier = more restrictive). Extends session-trust pattern. |
| `src/engine/heartbeat.ts` | Modify: Extend `goalHeartbeatLoop()` with output threading (`threadOutputs()` — LLM extracts relevant output from completed sub-goal, shapes as input for next). Add `buildWait()` — polls for build completion before routing to built process. Add bundled review collection at phase boundaries. |
| `src/engine/output-threading.ts` | Create: `threadOutputs()` — takes completed sub-goal outputs + next sub-goal description, returns shaped inputs via LLM call. `model_hint: fast` (mapping, not reasoning). |
| `src/engine/bundled-review.ts` | Create: `collectForBundledReview()` — accumulates review-pending outputs across sub-goals. `presentBundledReview()` — presents collected outputs as single review checkpoint. |
| `src/engine/system-agents/orchestrator.test.ts` | Modify: Add tests for find-or-build routing, build-on-gap trigger, first-run gate, Process Model Library lookup |
| `src/engine/goal-trust.test.ts` | Create: Unit tests for goal trust inheritance, relax-only constraint, critical tier protection |
| `src/engine/output-threading.test.ts` | Create: Unit tests for output extraction and shaping |
| `src/engine/bundled-review.test.ts` | Create: Unit tests for review collection and checkpoint presentation |

## User Experience

- **Jobs affected:** Review (bundled checkpoint reviews), Delegate (goal with trust setting), Orient (build progress visibility)
- **Primitives involved:** ProcessProposalBlock (build proposals for user approval), StatusCardBlock (sub-goal progress with find/build indicators), ReviewCardBlock (bundled review at checkpoints)
- **Process-owner perspective:** After decomposition (Brief 102), the user sees sub-goals executing. Some match existing processes (fast). Others need building — Alex says "I need to create a process for [X]. Here's what I'd build: [preview]. Go ahead?" For budgeted goals, this happens automatically. Reviews arrive at natural checkpoints: "Research phase complete. Here's what I found across 3 sub-goals. Review?" — not 15 individual step reviews.
- **Interaction states:** Building (process generation in progress with status), awaiting first run (generated process being validated), executing (normal process execution), checkpoint review (bundled outputs for approval)
- **Designer input:** Not invoked — lightweight UX section only

## Acceptance Criteria

1. [ ] `routeSubGoal()` implements three-tier routing: (1) check Process Model Library → (2) `matchTaskToProcess` → (3) trigger Build
2. [ ] `findProcessModel()` searches `templates/` by industry + function keywords, returns match with confidence score
3. [ ] When Process Model matches, sub-goal is routed to that template's process (adopt path, cheap)
4. [ ] When `matchTaskToProcess` matches with confidence ≥ 0.6, sub-goal is routed to existing process (find path, free)
5. [ ] When neither matches, `triggerBuild()` fires the Build meta-process: web-search research → `generate_process(save=true)` → new process created
6. [ ] Build depth enforced via explicit `buildDepth` counter in harness context. Harness rejects build triggers when `buildDepth >= 1`. `triggerBuild()` does NOT call `decomposeGoal()` or `routeSubGoal()`.
7. [ ] First-run gate: after build creates a process, orchestrator starts a supervised run. Only if the run completes successfully does the sub-goal status advance to `completed`. Failed first run → process archived, sub-goal retried once, then escalated to user with failure evidence.
8. [ ] `resolveSubGoalTrust()` returns the MORE RESTRICTIVE of goal trust tier and process trust tier
9. [ ] Goal-level trust cannot relax builder/reviewer roles or critical-tier steps (consistent with Brief 053)
10. [ ] `threadOutputs()` extracts relevant output from completed sub-goal and shapes it as input for dependent sub-goal via LLM call (model_hint: fast)
11. [ ] `collectForBundledReview()` accumulates outputs from multiple sub-goals and presents as a single review checkpoint
12. [ ] Each sub-goal output within a bundled review receives individual feedback (approve/edit/reject) recorded to the feedback table — not per-bundle
13. [ ] Bundled reviews trigger at natural phase boundaries (all `find` sub-goals in a dependency tier complete, or all `build` sub-goals complete)
14. [ ] User can flag "wrong input" on a sub-goal that received threaded output, triggering re-threading from the source sub-goal's output
15. [ ] Concurrent build deduplication: before triggering build, check active goals for in-progress builds targeting the same capability (keyword match). Wait for existing build if found.
16. [ ] Goal cancellation: cancelling a goal pauses all in-progress sub-goals, archives build-in-progress processes, and preserves completed sub-goal outputs
17. [ ] All routing decisions (find, build, model-match) logged to activity log with confidence, reasoning, and LLM cost
18. [ ] Unit tests cover: find path, build path, model path, first-run gate (success and failure), failed build retry + escalation, trust inheritance, output threading, output re-threading on correction, bundled reviews with per-sub-goal feedback, concurrent build dedup, goal cancellation

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: consistency with ADR-015 (Build meta-process), trust system constraints (relax-only), existing heartbeat interfaces, process generation validation
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests for find-or-build routing
pnpm test -- --grep "find-or-build"

# Unit tests for goal trust
pnpm test -- --grep "goal trust"

# Unit tests for output threading
pnpm test -- --grep "output threading"

# Verify existing orchestrator and heartbeat tests still pass
pnpm test -- --grep "orchestrator|heartbeat"

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with find-or-build routing implementation
2. Brief 104 becomes buildable (library curation depends on processes being dynamically created)
3. Update ADR-015 — Build meta-process now has a reactive trigger from the orchestrator
4. Phase retrospective: did build-on-gap produce usable processes? Was output threading quality sufficient?
