# Brief: Deliberative Perspectives — Harness Handler Implementation

**Date:** 2026-04-12
**Status:** draft
**Depends on:** ADR-028 (Deliberative Perspectives), Brief 129 (Staged Outbound Tools — for handler pattern), Brief 060 (Knowledge Compounding — for memory injection)
**Unlocks:** Perspective feedback learning (L5), Self synthesis enhancement, adaptive lens composition

## Goal

- **Roadmap phase:** Phase 11+ (Harness enrichment)
- **Capabilities:** Deliberative Perspectives harness handler, standard lens library, process declaration schema, Self synthesis integration

## Context

ADR-028 defines Deliberative Perspectives as a four-stage harness-level pattern: Lens Composer dynamically generates lenses based on decision context → lenses evaluate in parallel → anonymized peer review cross-examination → Self synthesizes. This brief implements the MVP: the handler with all four stages, process YAML declaration, and perspective result storage.

Research grounding: Karpathy's `llm-council` (three-stage architecture with peer review), Du et al. 2023 (multi-agent debate), Self-MoA 2025 (same model, different prompts), ICLR 2025 meta-analysis (conditional invocation critical for cost/quality).

## Objective

A working `deliberative-perspectives` harness handler that: (1) reads perspective configuration from process YAML, (2) runs the Lens Composer to generate context-appropriate lenses, (3) invokes generated lenses in parallel, (4) runs anonymized peer review cross-examination, (5) collects structured perspective results, (6) makes results available to the Self for synthesis and to the trust-gate for flagging.

## Non-Goals

- Multi-round peer review (single round only — ADR-028 §3)
- Self synthesis prompt engineering (separate brief — this brief wires the data, not the UX)
- Feedback learning loop for Lens Composer improvement (L5 integration is a follow-up — this brief stores results, doesn't analyze them)
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
| `src/engine/harness-handlers/deliberative-perspectives.ts` | Create: New handler — four-stage pipeline: lens composer, parallel generation, peer review, result aggregation |
| `src/engine/harness-handlers/deliberative-perspectives.test.ts` | Create: Unit tests — canHandle conditions, lens composer output, parallel execution, peer review, result aggregation, cost tracking, flag propagation, budget degradation |
| `src/engine/harness-handlers/lens-composer.ts` | Create: Lens Composer — analyzes decision context, generates tailored lenses (stage 0) |
| `src/engine/harness-handlers/peer-review.ts` | Create: Peer Review — anonymized cross-examination of lens outputs (stage 2) |
| `src/engine/heartbeat.ts` | Modify: Register `deliberativePerspectivesHandler` at position 10 (after review-pattern, before routing) |
| `src/engine/harness-handlers/harness-config.ts` | Modify: Parse `perspectives` from step/process config alongside existing `review` parsing |

## User Experience

- **Jobs affected:** Orient (perspective signals visible in review detail), Review (richer context for approve/edit/reject decisions)
- **Primitives involved:** Review Queue (perspective drill-down, follow-up brief), Daily Brief (perspective summary for flagged items, follow-up brief)
- **Process-owner perspective:** Process owners enable `perspectives:` in process YAML with trigger conditions. They don't choose lenses — the Lens Composer generates them based on context. When running, they see Alex's synthesized recommendation (unchanged UX). On drill-down, they see individual perspective assessments including peer review revisions. Over time, the system improves which lenses the Composer generates per context.
- **Interaction states:** N/A for this brief — handler is backend-only. UI integration is follow-up.
- **Designer input:** Not invoked — lightweight UX section only. Full UX brief needed for perspective drill-down in Review Queue.

## Acceptance Criteria

1. [ ] `deliberativePerspectivesHandler` implements `HarnessHandler` interface with `canHandle` and `execute`
2. [ ] Handler runs only when `perspectives.enabled: true` is configured on the step or process definition
3. [ ] Handler respects trigger conditions: `always`, `low-confidence` (step confidence <= medium), `high-stakes` (output has outbound/external consequences), `novel-input` (deferred — AC passes if first three work)
4. [ ] **Stage 0 (Lens Composer):** Given step output + process context + user context + decision signals, generates 2-5 `GeneratedLens` objects with cognitiveFunction, systemPrompt, evaluationQuestions, and optional memoryCategories
5. [ ] Lens Composer uses `fast` model tier, targets ~200 output tokens
6. [ ] Lens Composer receives accumulated failure knowledge categories (ADR-022) so it can assign relevant memory injection to generated lenses
7. [ ] **Stage 1 (Parallel Generation):** Generated lenses invoked via `Promise.allSettled` — partial failures don't block other lenses
8. [ ] Each lens returns structured `PerspectiveResult` with lensId, cognitiveFunction, assessment, signals, confidence, costCents
9. [ ] All lenses use `fast` model tier by default via `resolveModel("fast")`
10. [ ] Memory injection: lenses with `memoryCategories` receive relevant memories from context (failure_pattern, correction, solution etc.)
11. [ ] **Stage 2 (Peer Review):** Each lens receives all other assessments anonymized as "Perspective A, B, C..." and produces a revised assessment
12. [ ] Peer review can be disabled via `peer_review: false` in process config
13. [ ] **Results:** Handler aggregates revised results into `context.reviewDetails.perspectives: PerspectiveResult[]`
14. [ ] If any lens returns a `critical` severity signal (post-peer-review), handler sets `context.reviewResult = "flag"` (respecting existing flag guard)
15. [ ] All costs (composer + lenses + peer review) accumulated in `context.reviewCostCents`
16. [ ] **Budget degradation:** If perspective layer would exceed remaining step budget, degrade gracefully: drop peer review first, then reduce lens count, then skip perspectives entirely
17. [ ] `max_lenses` config respected (default: 4, caps Lens Composer output)
18. [ ] Handler registered at correct pipeline position in `heartbeat.ts` (after review-pattern, before routing)
19. [ ] `pnpm run type-check` passes at root
20. [ ] Unit tests cover: canHandle true/false, lens composer generation, parallel execution, partial failure, peer review anonymization, cost aggregation, critical signal flagging, existing flag preservation, budget degradation
21. [ ] Smoke test: process with `perspectives: { enabled: true, trigger: "always" }` produces dynamically composed perspective results in step run output

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
#     enabled: true
#     trigger: "always"
# Run the process and verify:
# 1. Lens Composer generates context-appropriate lenses
# 2. Lenses execute in parallel and produce structured results
# 3. Peer review cross-examination produces revised assessments
# 4. Perspective results appear in step run output
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for completed items
3. Phase retrospective: what worked, what surprised, what to change
4. Follow-up briefs: Self synthesis prompt, perspective drill-down UI, feedback learning loop for Lens Composer improvement, Lens Composer prompt iteration with persona scenario testing
