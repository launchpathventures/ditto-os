# Brief 165: Proactive Suggestions — Dedup, Pattern Detection, Coverage Agent

**Date:** 2026-04-14
**Status:** draft
**Depends on:** none
**Unlocks:** System-driven workspace expansion

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-10.1 + MP-10.2 + MP-10.3)
- **Capabilities:** No duplicate suggestions, detect recurring ad-hoc work, periodic coverage gap analysis

## Context

`suggest_next` tool generates suggestions but has three gaps:

1. **MP-10.1:** May suggest processes that already exist ("You should set up invoicing" when it's already running).
2. **MP-10.2:** No detection of ad-hoc work becoming repetitive. User creates 5 similar work items but system never proposes formalizing the pattern.
3. **MP-10.3:** Coverage-agent (12th system agent, defined in architecture) is not yet implemented.

## Objective

1. Dedup check before suggesting — filter out suggestions matching active processes.
2. Detect work item clustering — after 3+ similar items, propose process formalization.
3. Implement coverage-agent for periodic gap analysis against industry patterns.

## Non-Goals

- Redesigning the suggestion UI (uses existing SuggestionBlock)
- Industry-specific process libraries (uses existing template library)

## Inputs

1. `src/engine/self-tools/` — `suggest_next` tool
2. `src/engine/system-agents/` — system agent patterns
3. `src/db/schema/engine.ts` — work items table, processes table
4. `docs/architecture.md` — coverage-agent specification
5. `docs/meta-process-roadmap.md` — MP-10.1, MP-10.2, MP-10.3 specs

## Constraints

- Dedup must compare suggestion intent against active process slugs AND descriptions (fuzzy match)
- Clustering must use semantic similarity, not just exact keyword match
- Coverage-agent must be a proper system agent (ADR-008 pattern)

## Provenance

- `src/engine/self-tools/` `suggest_next` tool — existing suggestion generation
- ADR-008 system agent pattern — existing pattern for coverage-agent implementation
- `docs/architecture.md` coverage-agent specification — existing architecture for 12th system agent
- Zapier "recommended apps" — pattern for gap analysis against industry templates

## What Changes

| Path | Action | What |
|------|--------|------|
| `src/engine/self-tools/` (`suggest_next`) | Modify | Dedup check against active processes before generating suggestions |
| `src/engine/self-tools/` (new clustering module) | Create | Pattern detection for recurring ad-hoc work items |
| `src/engine/system-agents/coverage-agent.ts` | Create | Periodic gap analysis system agent (ADR-008 pattern) |

## User Experience

- **Jobs:** Orient (receive relevant suggestions), Decide (accept or dismiss)
- **Primitives:** SuggestionBlock, Daily Brief
- **Scenario:** Process-owner creates 3 similar quote requests → system proposes "You've created 3 quote requests — want a quoting process?"
- **Interaction states:** suggestion presented → accepted (creates process) or dismissed (30-day cooldown)
- **Designer input:** Not invoked — uses existing SuggestionBlock

## Engine Scope

Product (suggestions and coverage analysis are Ditto-specific)

## Acceptance Criteria

### MP-10.1 — Dedup Check
1. [ ] `suggest_next` queries active processes before generating suggestions
2. [ ] Suggestions matching existing process slugs or descriptions are filtered out
3. [ ] Fuzzy matching handles variants ("invoicing" ≈ "invoice-generation")

### MP-10.2 — Reactive-to-Repetitive Detector
4. [ ] Work items scanned for clustering patterns (semantic similarity)
5. [ ] After 3+ similar items, system proposes: "You've created 3 quote requests. Want a quoting process?"
6. [ ] Proposal uses `generate_process` with template matching from the cluster

### MP-10.3 — Coverage Agent
7. [ ] Coverage-agent implemented as system agent (ADR-008 pattern)
8. [ ] Runs periodically (configurable schedule)
9. [ ] Compares user's active processes against industry patterns from template library
10. [ ] Surfaces gaps as suggestions: specific, not generic

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "suggest\|coverage\|cluster"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with completion status
2. Update `docs/roadmap.md` — MP-10.1, MP-10.2, MP-10.3 status
3. Run `/dev-documenter` for session wrap-up
