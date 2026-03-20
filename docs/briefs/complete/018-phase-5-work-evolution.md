# Brief 018: Phase 5 — Work Evolution (Parent Brief)

**Date:** 2026-03-21
**Status:** ready
**Depends on:** Phase 4c (all system agents running through harness)
**Unlocks:** Phase 6 (External Integrations), Phase 10 (Web Dashboard)

## Goal

- **Roadmap phase:** Phase 5: Work Evolution Verification
- **Capabilities:** Goal decomposition, full work evolution cycle, meta-process trust earning, process template library

## Context

Phase 4c delivered four system agents running through the harness — intake-classifier, router, orchestrator, and trust-evaluator. The orchestrator is currently pass-through: it receives a classified+routed work item and triggers a single process run. It does not decompose goals, track progress across tasks, schedule around blocked items, or stop when uncertainty is too high.

The user's overnight pipeline question (2026-03-21) exposed the gap: running `aos start dev-pipeline` with the goal "execute the roadmap" hits the first trust gate and stops. A real orchestrator would route around the blocked item to independent work, exactly as a human manager would.

ADR-010 already defines the orchestrator as a "complex, persistent decision-maker" that "decomposes goals into tasks over time." Insight-045 adds: the stopping condition is orchestrator confidence, not trust gate pauses. This phase builds what the architecture already specifies.

## Objective

The orchestrator becomes a goal-directed manager. A user can enter a goal, the orchestrator decomposes it into tasks, schedules work across processes, routes around trust gate pauses to independent tasks, and stops only when its own confidence about what to do next drops too low. The full work evolution cycle is proven end-to-end. 2-3 non-coding process templates ship.

## Non-Goals

- **Cognitive model fields** (ADR-013: `cognitive_mode`, `concern`) — deferred. These are Phase 5 scope in the roadmap but have no consumer until mode-aware review framing exists. Re-entry: when enriched rejection vocabulary is built.
- **Attention model extensions** (digest mode, silence-as-feature) — deferred. Requires multiple autonomous processes generating enough data. Re-entry: when 3+ processes are running at autonomous tier.
- **Web dashboard** — Phase 10. All UX is CLI.
- **Multi-process orchestration across independent process definitions** — the orchestrator decomposes goals into tasks within a single process or across known processes. It does not discover new processes. That's Phase 11.
- **Process template marketplace** — templates are local YAML files. No sharing, no community, no registry.

## Sub-Briefs

This phase splits along a natural dependency seam:

| Brief | Name | Focus | Depends on | AC count |
|-------|------|-------|------------|----------|
| 019 | Goal-Directed Orchestrator | Engine: decomposition, scheduling, confidence stopping | Phase 4c | ~15 |
| 020 | E2E Verification + Templates | Prove cycle, ship templates, verify meta-process trust | 019 | ~12 |

**Build order:** 019 first (the engine), then 020 (prove it works).

## Inputs

1. `docs/research/goal-directed-orchestrator-patterns.md` — 12 frameworks: decomposition, scheduling, stopping patterns
2. `docs/research/phase-5-orchestrator-ux.md` — interaction spec: goal setting, decomposition visibility, progress/routing, stopping conditions, templates
3. `docs/adrs/010-workspace-interaction-model.md` — orchestrator definition, work items, meta-process layer
4. `docs/adrs/011-attention-model.md` — confidence model (categorical), per-output routing
5. `docs/insights/045-orchestrator-is-goal-directed-manager.md` — confidence as stopping condition
6. `src/engine/system-agents/orchestrator.ts` — current pass-through implementation
7. `src/engine/heartbeat.ts` — current heartbeat with dependency resolution
8. `src/db/schema.ts` — current schema (workItems, stepRuns, processRuns)

## User Experience

- **Jobs affected:** Define (goal setting), Orient (decomposition visibility, progress), Review (trust gate items), Decide (stopping conditions)
- **Primitives involved:** Process Graph (CLI tree), Activity Feed, Review Queue, Conversation Thread (resume with guidance)
- **Designer input:** `docs/research/phase-5-orchestrator-ux.md` — full interaction spec with CLI wireframes for all 5 areas
- **Process-owner perspective:** See Brief 019 and 020 for per-sub-brief UX details

## Review Process

Each sub-brief has its own review cycle. The parent brief is reviewed once (now) for phase-level coherence.

## After Completion

1. Update `docs/state.md` — Phase 5 complete
2. Update `docs/roadmap.md` — Phase 5 status to "done" (deferred items noted)
3. Phase retrospective: what worked, what surprised, what to change
4. Verify re-entry conditions for Phase 6 are met
