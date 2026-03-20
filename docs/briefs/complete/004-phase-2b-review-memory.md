# Brief: Phase 2b — Review Patterns + Memory

**Date:** 2026-03-19
**Status:** complete
**Depends on:** Phase 2a
**Unlocks:** Phase 2c, Phase 3

## Goal

- **Roadmap phase:** Phase 2: Harness + Feedback Capture
- **Capabilities:** Review patterns (maker-checker, adversarial, spec-testing), memory table (ADR-003), memory assembly, feedback-to-memory bridge

## Context

Phase 2a delivered the harness pipeline skeleton with stub handlers for review patterns and memory assembly. Phase 2b replaces those stubs with real implementations. After 2b, agent outputs are reviewed by other agents before the trust gate decides, and agents receive relevant memories in their context.

Parent design: `docs/briefs/002-phase-2-harness.md` (sections 3, 4, 8 — memory schema).

## Objective

After 2b: (1) steps with `harness.review` config spawn reviewer agents that check output quality, (2) agents receive relevant memories in their system prompt before execution, (3) human edit/reject feedback creates memory records for future use.

## Non-Goals

Everything in the parent brief's non-goals, plus:
- **Parallel execution** — Phase 2c.
- **LLM-based memory reconciliation** — ADR-003 describes Mem0-style ADD/UPDATE/DELETE/NONE. Phase 2b does direct-insert. Phase 3 adds reconciliation. The builder should add a "Phased Implementation" section to ADR-003.
- **Memory consolidation/compaction** — not needed at dogfood scale (<100 memories per scope).
- **Programmatic quality validators** — spec-testing uses LLM judgment only in 2b. Programmatic validators (regex, schema checks) are Phase 3+.

## Inputs

1. `docs/briefs/002-phase-2-harness.md` — parent design (sections 3, 4, 8)
2. `docs/adrs/003-memory-architecture.md` — memory table design, assembly function
3. `docs/research/phase-2-harness-patterns.md` — review pattern research (sections 2, 5)
4. `docs/research/memory-systems.md` — memory systems research
5. `docs/insights/002-review-is-compositional.md` — review layers are composable
6. `src/engine/harness-handlers/review-pattern.ts` — stub from 2a (to replace)
7. `src/engine/harness-handlers/memory-assembly.ts` — stub from 2a (to replace)
8. `src/db/schema.ts` — current schema (to extend with memories table)
9. `src/adapters/claude.ts` — Claude adapter (reviewer agents use this)

## Constraints

All constraints from parent brief. Additionally:
- **Review pattern handler must be a drop-in replacement** for the 2a stub — same interface, different implementation.
- **Memory assembly must not break existing processes** — if no memories exist for a scope, the handler injects nothing (graceful empty state).
- **Review cost must be tracked** — every reviewer agent invocation's token cost goes into `harnessDecisions.reviewCostCents`.

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Maker-checker | antfarm `src/installer/step-ops.ts` lines 728-845 | verify_each pattern with retry + feedback injection |
| Adversarial review | antfarm verifier agent (prompting strategy on maker-checker) | Same structure, different prompt |
| Specification testing | **Original** | No source validates against quality criteria |
| Memory table (two-scope) | ADR-003, Mem0 scope filtering | scopeType + scopeId, reinforcement counting |
| Memory assembly | Letta `compile()`, Open SWE `get_agent()` | Single function composing context before invocation |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | **Modify**: Add `memories` table per ADR-003 |
| `src/engine/harness-handlers/review-pattern.ts` | **Rewrite**: Replace stub with real review pattern handler — maker-checker, adversarial, spec-testing |
| `src/engine/harness-handlers/memory-assembly.ts` | **Rewrite**: Replace stub with real memory assembly — load, merge, sort, budget, render, inject |
| `src/engine/harness-handlers/feedback-recorder.ts` | **Modify**: Add feedback-to-memory bridge — create `memories` record on edit/reject |
| `processes/feature-implementation.yaml` | **Modify**: Update `harness` field to new structured format |
| `processes/*.yaml` | **Modify**: Update any other YAML files using legacy `harness` string format |

## Design

### Review Patterns

See parent brief section 3. Three patterns, composable as layers:

**YAML format:**
```yaml
harness:
  review:
    - maker-checker
    - spec-testing
```

Parser accepts both legacy (`harness: maker-checker`) and new structured format.

**Maker-checker:** Spawn reviewer agent via Claude adapter with reviewer system prompt. Reviewer receives: step output + step verification criteria + process quality_criteria. Returns `pass` / `flag` / `retry`. On `retry`, re-execute the step with reviewer feedback injected (max retries: 2, configurable).

**Adversarial:** Same as maker-checker. The only difference is the reviewer's system prompt is specifically prompted to find flaws and argue against the output. Structurally identical — a configuration flag on maker-checker, not a separate implementation.

**Spec-testing:** Single LLM call. Receives: step output + process `quality_criteria` list. Returns pass/fail per criterion. Any failure → `flag`. All criteria via LLM judgment (no programmatic validators in 2b).

**Layer execution:** Layers run in order. Any `retry` → re-execute step. Any `flag` → mark for human review (overrides trust gate sampling). All `pass` → trust gate sampling applies normally.

### Memory Assembly

See parent brief section 4. Replaces stub with:

1. Load agent-scoped memories (`scope_type = 'agent'`, `scope_id = agentId`, `active = true`)
2. Load process-scoped memories (`scope_type = 'process'`, `scope_id = processId`, `active = true`)
3. Sort by `reinforcementCount DESC, confidence DESC`
4. Budget: top-N within 2000 token allocation (4 chars/token estimate)
5. Render as structured text block (see parent brief section 4 for format)
6. Inject into adapter's system prompt context

### Memory Schema

Per ADR-003. New `memories` table:

```
memories
├── id: text (UUID)
├── scopeType: text ("agent" | "process")
├── scopeId: text
├── type: text ("correction" | "preference" | "context" | "skill")
├── content: text
├── source: text ("feedback" | "human" | "system")
├── sourceId: text (nullable — FK to feedback.id)
├── reinforcementCount: integer (default 1)
├── lastReinforcedAt: integer (timestamp_ms)
├── confidence: real (0.0-1.0)
├── active: integer (boolean, default true)
├── createdAt: integer (timestamp_ms)
├── updatedAt: integer (timestamp_ms)
```

### Feedback-to-Memory Bridge

When the feedback recorder processes feedback of type `edit` or `reject`:
1. Create a `memories` record with `source: 'feedback'`, `sourceId: feedback.id`, `type: 'correction'`, `confidence: 0.3`, `scopeType: 'process'`, `scopeId: processId`
2. The memory content is the human's comment (for reject) or a summary of the diff (for edit)
3. No LLM extraction — direct insert from the feedback record
4. If a similar memory already exists (exact content match), increment `reinforcementCount` instead of creating a duplicate

## Acceptance Criteria

1. [ ] `memories` table exists in schema and syncs via `drizzle-kit push`
2. [ ] Review pattern handler supports maker-checker: spawns reviewer agent, processes pass/flag/retry
3. [ ] Review pattern handler supports adversarial: maker-checker with adversarial system prompt
4. [ ] Review pattern handler supports spec-testing: LLM validates output against quality_criteria
5. [ ] Review patterns are composable: `[maker-checker, spec-testing]` runs both in order
6. [ ] Maker-checker retry works: on `retry`, step re-executes with feedback (up to max retries)
7. [ ] YAML parser accepts both legacy `harness: string` and new `harness.review: [list]` formats
8. [ ] Memory assembly loads agent-scoped + process-scoped memories, renders into prompt text
9. [ ] Memory assembly respects configurable token budget (default 2000 tokens)
10. [ ] Memory assembly gracefully handles zero memories (no error, no empty block injected)
11. [ ] Feedback recorder creates `memories` record (type: correction) on edit/reject feedback
12. [ ] Duplicate memory detection: same content increments reinforcementCount
13. [ ] Review cost tracked in `harnessDecisions.reviewCostCents`
14. [ ] `pnpm run type-check` passes with zero errors
15. [ ] Existing CLI commands still work

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Focus areas: ADR-003 compliance, review pattern provenance (antfarm), memory assembly correctness, feedback capture completeness
3. Present work + review findings to human

## After Completion

1. Update `docs/state.md` — Phase 2b complete, review patterns and memory working
2. Update `docs/roadmap.md` — mark review patterns, memory table, memory assembly as done
3. Add "Phased Implementation" section to ADR-003
4. Phase 2c is now unblocked
