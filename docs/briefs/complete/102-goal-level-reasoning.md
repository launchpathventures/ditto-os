# Brief 102: Goal-Level Reasoning & Action Boundaries

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 101 (parent design), Brief 098 (continuous operation)
**Unlocks:** Brief 103 (find-or-build routing)

## Goal

- **Roadmap phase:** Phase 11+ (Orchestrator Evolution)
- **Capabilities:** LLM-powered goal decomposition into sub-goals, dimension map clarity assessment, system-enforced action boundaries per relationship stage

## Context

The orchestrator (Brief 021/022) currently decomposes goals by mapping 1:1 to a single process's step list. This works for "reconcile my invoices" (clear process match) but fails for "build me a freelance consulting business" (requires multiple processes, some non-existent). The orchestrator needs to reason at the goal level — decomposing into sub-goals rather than process steps — and assess whether it has enough clarity to decompose well.

Additionally, the same reasoning should run regardless of context (front door, workspace, budgeted workspace), with system-enforced action boundaries determining what Alex can do. Currently, action boundaries are implicit in the conversation (prompt-level), not enforced by the harness.

## Objective

Enable the orchestrator to decompose goals into sub-goals using LLM reasoning (with structured knowledge inputs), assess clarity via a dimension map before decomposing, and enforce action boundaries through tool availability per context.

## Non-Goals

- **Find-or-build routing** — this brief decomposes goals into sub-goals tagged as `find` or `build`; Brief 103 implements the actual find-or-build behaviour
- **Process Model Library integration** — Brief 103 adds library-first checking
- **Goal-level trust** — Brief 103 adds trust inheritance
- **Library curation** — Brief 104
- **Replacing the existing 1:1 decomposition** — the simple path (goal maps to one process) continues to work as a fast path within the new system

## Inputs

1. `src/engine/system-agents/orchestrator.ts` — current decomposition logic to extend
2. `src/engine/system-agents/router.ts` — `matchTaskToProcess` for process inventory
3. `src/engine/industry-patterns.ts` — industry patterns for decomposition context
4. `src/engine/web-search.ts` — research capability for context enrichment
5. `src/engine/self.ts` — Self's tool definitions (action boundary context)
6. `docs/architecture.md` — meta-process architecture, cognitive framework
7. `docs/adrs/015-meta-process-architecture.md` — Goal Framing meta-process constraints
8. `.context/goal-seeking-orchestration-design.md` — design conversation conclusions

## Constraints

- Existing 1:1 decomposition path MUST remain as fast path (goal + process slug → step decomposition)
- Goal-level decomposition activates when work item is type `goal` or `outcome` AND no process slug is pre-assigned (or the orchestrator determines multi-process decomposition is warranted)
- Dimension map assessment MUST list explicit assumptions in the decomposition output
- Action boundaries MUST be enforced at the tool level (harness `resolvedTools`), not prompt level
- LLM reasoning call for decomposition uses `model_hint: capable` (not fast — quality matters here)
- Web-search calls during decomposition are optional and capped (max 2 per decomposition)
- Sub-goal count should be reasonable (target 3-8 sub-goals; if more, consider grouping)
- The decomposition must include dependency ordering between sub-goals
- Front-door person-research MUST be limited to publicly available information only — no workspace data, no authenticated API calls. The front-door visitor has no workspace and no authenticated relationship
- Clarity assessment (dimension map) is driven by the Self (Goal Framing meta-process) and passed to the orchestrator as input. The orchestrator does not drive the consultative conversation — it receives the assessed dimensions and decomposes. This preserves ADR-015's boundary: Self owns Goal Framing, orchestrator owns Execution

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Goal decomposition via LLM | LangGraph plan-and-execute | pattern | Plan step produces sub-goals, execute step runs them |
| Dimension map for clarity | Consultative selling (MEDDIC/BANT-inspired) | pattern | Structured qualification adapted from sales to goal clarity assessment |
| Action boundaries via tool sets | Capability-based security (RBAC on tools) | pattern | Proven access control pattern |
| Assumptions listing | Hypothesis-driven planning | pattern | Forces explicit unknowns, enables correction |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/system-agents/orchestrator.ts` | Modify: Add `decomposeGoal()` function alongside existing `executeOrchestrator()`. New LLM-powered decomposition path for multi-process goals. Existing path untouched as fast path. |
| `src/engine/system-agents/goal-decomposition.ts` | Create: Goal decomposition logic — dimension map assessment, LLM decomposition prompt, sub-goal generation, assumption extraction |
| `src/engine/system-agents/dimension-map.ts` | Create: `DimensionMap` type, `assessClarity()` function, `isDecompositionReady()` threshold check |
| `src/engine/action-boundaries.ts` | Create: `ActionBoundary` type, `getToolSetForContext()` function that returns available tools per relationship stage |
| `src/engine/system-agents/orchestrator.test.ts` | Modify: Add tests for goal-level decomposition, dimension map assessment, action boundary enforcement |
| `src/engine/system-agents/goal-decomposition.test.ts` | Create: Unit tests for decomposition logic, assumption extraction, sub-goal dependency ordering |
| `src/engine/action-boundaries.test.ts` | Create: Unit tests for tool set enforcement per context |

## User Experience

- **Jobs affected:** Orient (seeing sub-goal breakdown), Decide (approving assumptions)
- **Primitives involved:** StatusCardBlock (sub-goal list with dependencies), AlertBlock (assumption review)
- **Process-owner perspective:** User states a goal. If clarity is insufficient, Alex asks focused questions (1-2, not 10). Once clear enough, Alex presents a decomposition: "Here's how I'd approach this — [sub-goals with dependencies]. I'm assuming [explicit assumptions]. Anything I should know?" The user corrects assumptions or approves. At the front door, the decomposition IS the value demonstration.
- **Interaction states:** Conversational (clarity gathering) → Plan preview (sub-goal breakdown with assumptions) → Approved (execution begins in Brief 103)
- **Designer input:** Not invoked for this brief. However, the front-door decomposition presentation (where the plan IS the sales pitch) MUST have Designer input before build. Invoke `/dev-designer` for front-door decomposition UX before implementing the front-door rendering path.

## Acceptance Criteria

1. [ ] `decomposeGoal()` produces `GoalDecomposition` with sub-goals, dependencies, assumptions, and confidence
2. [ ] Each sub-goal is tagged as `find` (existing process likely matches) or `build` (no match expected)
3. [ ] `assessClarity()` evaluates 6 dimensions (outcome, assets, constraints, context, infrastructure, risk tolerance) and returns `DimensionMap`
4. [ ] `isDecompositionReady()` returns false when outcome dimension is `unknown` or `vague`
5. [ ] When `isDecompositionReady()` returns false, the orchestrator returns a structured "needs clarity" result with specific questions mapped to unclear dimensions
6. [ ] Decomposition prompt includes: goal description, dimension map context, existing process inventory (slugs + descriptions), industry patterns for matched industry, and web-search results (if called)
7. [ ] Assumptions are extracted as explicit strings in the decomposition output (not buried in reasoning)
8. [ ] Sub-goal count is bounded (3-8 target; >8 triggers grouping into phases)
9. [ ] Existing 1:1 decomposition path works unchanged when goal has a pre-assigned process slug
10. [ ] `getToolSetForContext("front_door")` returns research-only tools (web-search, person-research limited to public information only, draft_plan) — no generate_process(save=true), no start_pipeline, no budget tools, no access to workspace data
11. [ ] `getToolSetForContext("workspace")` returns full workspace tools including generate_process and start_pipeline
12. [ ] `getToolSetForContext("workspace_budgeted")` returns workspace tools plus budget allocation tools
13. [ ] Action boundary is determined from workspace/session state, not from prompt instructions
14. [ ] Web-search calls during decomposition are capped at 2 per decomposition call
15. [ ] `GoalDecomposition` type lives in `packages/core/` (engine primitive — could be used by ProcessOS)
16. [ ] `ActionBoundary` type lives in `src/engine/` (Ditto product layer — references workspace/relationship concepts)
17. [ ] Unit tests cover: simple goal (fast path), complex goal (multi-sub-goal), clarity insufficient (needs questions), front-door action boundary, workspace action boundary, front-door person-research limited to public data

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: consistency with ADR-015 (Goal Framing meta-process), ADR-010 (work items as entry point), existing orchestrator interfaces, trust system untouched
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests for goal decomposition
pnpm test -- --grep "goal decomposition"

# Unit tests for action boundaries
pnpm test -- --grep "action boundaries"

# Verify existing orchestrator tests still pass (fast path unchanged)
pnpm test -- --grep "orchestrator"

# Type check
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with goal-level reasoning implementation
2. Brief 103 becomes buildable (find-or-build routing depends on sub-goal decomposition)
3. Phase retrospective: did the decomposition quality meet expectations? Are the dimension map dimensions sufficient?
