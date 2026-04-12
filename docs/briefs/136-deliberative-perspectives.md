# Brief: Deliberative Perspectives — Harness Handler Implementation

**Date:** 2026-04-12
**Status:** draft
**Depends on:** ADR-028 (Deliberative Perspectives), Brief 129 (Staged Outbound Tools — for handler pattern), Brief 060 (Knowledge Compounding — for memory injection)
**Unlocks:** Perspective feedback learning (L5), Self synthesis enhancement, adaptive lens composition

## Goal

- **Roadmap phase:** Phase 11+ (Harness enrichment)
- **Capabilities:** Deliberative Perspectives harness handler, standard lens library, process declaration schema, Self synthesis integration

## Context

ADR-028 defines Deliberative Perspectives as a harness-level pattern that evaluates step output through configurable cognitive lenses before the Self synthesizes. This brief implements the MVP: the handler, 3 initial lenses, process YAML declaration, and perspective result storage.

Research grounding: Karpathy's `llm-council` (three-stage architecture), Du et al. 2023 (multi-agent debate), Self-MoA 2025 (same model, different prompts), ICLR 2025 meta-analysis (conditional invocation critical for cost/quality).

## Objective

A working `deliberative-perspectives` harness handler that: (1) reads lens configuration from process YAML, (2) invokes configured lenses in parallel, (3) collects structured perspective results, (4) makes results available to the Self for synthesis and to the trust-gate for flagging.

## Non-Goals

- Multi-round debate between lenses (ADR-028 §9 explicitly excludes this)
- Self synthesis prompt engineering (separate brief — this brief wires the data, not the UX)
- Feedback learning loop (L5 integration is a follow-up — this brief stores results, doesn't analyze them)
- Custom user-defined lenses (standard library only in MVP)
- Web UI for perspective drill-down (follow-up brief)

## Inputs

1. `docs/adrs/028-deliberative-perspectives.md` — Full architectural decision
2. `docs/insights/176-deliberative-perspectives-not-council.md` — Design discovery and constraints
3. `src/engine/harness-handlers/review-pattern.ts` — Pattern to follow for handler structure
4. `src/engine/harness-handlers/metacognitive-check.ts` — Pattern for conditional invocation by trust tier
5. `src/engine/heartbeat.ts` lines 80-99 — Handler registration and pipeline order
6. `packages/core/src/harness/harness.ts` — HarnessHandler interface, HarnessContext type
7. `docs/adrs/022-critical-evaluation-and-homeostatic-quality.md` — Failure knowledge memory categories for injection

## Constraints

- Handler must follow existing `HarnessHandler` interface (no core changes)
- Lenses must use `fast` model tier by default (Brief 033 `resolveModel("fast")`)
- Parallel lens invocation (Promise.allSettled, not sequential)
- Must compose with existing review patterns — if review-pattern already flagged, perspectives still run on the retried output
- Must not modify `context.reviewResult` to weaken an existing flag (same guard as review-pattern.ts line 339-342)
- Total perspective cost tracked in `context.reviewCostCents`
- No changes to `packages/core/` — perspectives are product-layer (Ditto opinions, not engine primitives)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Handler pattern (canHandle/execute/context) | `src/engine/harness-handlers/review-pattern.ts` | pattern | Proven composable handler structure in this codebase |
| Parallel invocation with graceful degradation | Karpathy `llm-council` Stage 1 | pattern | Latency = slowest lens, not sum. Partial failures don't block. |
| Structured signal extraction | ADR-022 failure pattern categories | pattern | Consistent signal taxonomy across harness evaluation mechanisms |
| Conditional invocation by trust/confidence | `metacognitive-check.ts` trust-tier gating | pattern | Proven cost-control pattern in this codebase |
| LLM-as-evaluator prompting | `review-pattern.ts` spec-testing prompt | adopt | JSON-structured evaluation response pattern already working |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/harness-handlers/deliberative-perspectives.ts` | Create: New handler — lens invocation, parallel execution, result collection |
| `src/engine/harness-handlers/deliberative-perspectives.test.ts` | Create: Unit tests — canHandle conditions, lens invocation, result aggregation, cost tracking, flag propagation |
| `src/engine/harness-handlers/lenses/` | Create: Directory for standard lens definitions |
| `src/engine/harness-handlers/lenses/contrarian.ts` | Create: Contrarian lens — risk assessment, assumption challenging, failure knowledge injection |
| `src/engine/harness-handlers/lenses/first-principles.ts` | Create: First Principles lens — reductive analysis, foundational reasoning |
| `src/engine/harness-handlers/lenses/executor.ts` | Create: Executor lens — pragmatic sequencing, feasibility assessment |
| `src/engine/harness-handlers/lenses/index.ts` | Create: Standard lens registry — lookup by id, extensible |
| `src/engine/heartbeat.ts` | Modify: Register `deliberativePerspectivesHandler` at position 10 (after review-pattern, before routing) |
| `src/engine/harness-handlers/harness-config.ts` | Modify: Parse `perspectives` from step/process config alongside existing `review` parsing |

## User Experience

- **Jobs affected:** Orient (perspective signals visible in review detail), Review (richer context for approve/edit/reject decisions)
- **Primitives involved:** Review Queue (perspective drill-down, follow-up brief), Daily Brief (perspective summary for flagged items, follow-up brief)
- **Process-owner perspective:** Process owners configure `perspectives:` in process YAML. When running, they see Alex's synthesized recommendation (unchanged UX). On drill-down, they see individual perspective assessments. Over time, the system suggests adding/removing lenses based on value.
- **Interaction states:** N/A for this brief — handler is backend-only. UI integration is follow-up.
- **Designer input:** Not invoked — lightweight UX section only. Full UX brief needed for perspective drill-down in Review Queue.

## Acceptance Criteria

1. [ ] `deliberativePerspectivesHandler` implements `HarnessHandler` interface with `canHandle` and `execute`
2. [ ] Handler runs only when `perspectives.lenses` is configured on the step or process definition
3. [ ] Handler respects trigger conditions: `always`, `low-confidence` (step confidence <= medium), `novel-input` (deferred — AC passes if `always` and `low-confidence` work)
4. [ ] Three standard lenses implemented: contrarian, first-principles, executor
5. [ ] Lenses run in parallel via `Promise.allSettled` — partial failures don't block other lenses
6. [ ] Each lens returns structured `PerspectiveResult` with assessment, signals, confidence, costCents
7. [ ] Lenses use `fast` model tier by default via `resolveModel("fast")`
8. [ ] Contrarian lens injects `failure_pattern` and `overconfidence_pattern` memories from context when available
9. [ ] Handler aggregates results into `context.reviewDetails.perspectives: PerspectiveResult[]`
10. [ ] If any lens returns a `critical` severity signal, handler sets `context.reviewResult = "flag"` (respecting existing flag guard)
11. [ ] All lens costs accumulated in `context.reviewCostCents`
12. [ ] Handler registered at correct pipeline position in `heartbeat.ts` (after review-pattern, before routing)
13. [ ] `pnpm run type-check` passes at root
14. [ ] Unit tests cover: canHandle true/false, parallel execution, partial failure, cost aggregation, critical signal flagging, existing flag preservation
15. [ ] Smoke test: process with `perspectives: { lenses: ["contrarian"], trigger: "always" }` produces perspective results in step run output

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/028-deliberative-perspectives.md`
2. Review agent checks: handler follows existing patterns, no core changes, cost governance enforced, composable with review-pattern, trust-gate sees flags
3. Present work + review findings to human for approval

## Smoke Test

```bash
# After implementation, run type check
pnpm run type-check

# Run unit tests
pnpm test -- --grep "deliberative-perspectives"

# Manual: add to a test process YAML
# harness:
#   perspectives:
#     lenses: ["contrarian"]
#     trigger: "always"
# Run the process and verify perspective results appear in step run output
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed items
3. Phase retrospective: what worked, what surprised, what to change
4. Follow-up briefs: Self synthesis prompt, perspective drill-down UI, feedback learning loop, additional lenses (expansionist, customer-advocate, historian, simplifier)
