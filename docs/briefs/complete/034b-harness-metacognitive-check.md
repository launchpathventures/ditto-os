# Brief: Harness-Level Metacognitive Check

**Date:** 2026-03-23
**Status:** ready
**Depends on:** None (independent of Brief 034a — touches different subsystem)
**Unlocks:** Trust-calibrated self-review for all agents, foundation for cognitive architecture Phase A2 (orchestrator reflection)

## Goal

- **Roadmap phase:** Cognitive Architecture A1 (Cognitive Toolkit) — extends to all agents via harness
- **Capabilities:** Post-execution self-review handler in the harness pipeline, auto-enabled for supervised trust tier

## Context

Every agent in Ditto goes through the harness pipeline: memory assembly, step execution, review patterns, routing, trust gate, feedback recording. Review patterns (maker-checker, adversarial, spec-testing) provide external oversight — a second perspective checks the output. But there is no internal oversight — no mechanism for an agent to check its own reasoning before the external review.

Insight-063 identifies this as a gap: great managers use both an internal loop (metacognition — checking your own thinking) and an external loop (teammate feedback). The harness currently only has the external loop (review patterns). This brief adds the internal loop as a harness handler.

The key distinction: review patterns are **maker-checker** (a second perspective challenges the output). The metacognitive check is **self-review** (same role's lens, catching its own contradictions, unsupported assumptions, and scope drift). Different purpose, different position in the pipeline, complementary.

## Objective

A new harness handler runs after step execution and before review patterns. It performs a fast LLM self-check of the agent's output against its input and context. Auto-enabled for `supervised` trust tier (new agents always self-check). Opt-in for higher trust tiers via `harness.metacognitive: true` in process YAML.

## Non-Goals

- Self-correction or automatic retry — if the check finds issues, it flags for human review; it does not re-execute the step (review-pattern handler already handles retries)
- Deep analysis or multi-turn reasoning — this is a fast, single-pass check using a cheap model
- Replacing review patterns — metacognitive check and review patterns are complementary, not alternatives
- Self-consultation for the Conversational Self — that's Brief 034a
- Cognitive toolkit content (mental models, reflection prompts) — that's Cognitive Architecture A1 proper
- Metacognitive memory (learning from self-check patterns over time) — deferred to Phase B1

## Inputs

1. `src/engine/harness.ts` — `HarnessHandler` and `HarnessContext` interfaces
2. `src/engine/harness-handlers/review-pattern.ts` — existing review handler pattern (same interface, reference for LLM call structure)
3. `src/engine/harness-handlers/trust-gate.ts` — trust tier access pattern (`context.trustTier`)
4. `src/engine/heartbeat.ts` lines 52-59 — pipeline registration order
5. `src/engine/llm.ts` — `createCompletion()`, `extractText()`
6. `src/engine/process-loader.ts` — `StepDefinition` type (where `harness` field is parsed)
7. `docs/adrs/014-agent-cognitive-architecture.md` — executive function, metacognitive monitoring concepts
8. `docs/insights/063-self-oversight-two-loops.md` — design rationale

## Constraints

- MUST use the existing `HarnessHandler` interface — no new pipeline abstraction
- MUST run AFTER step-execution and BEFORE review-pattern in the pipeline
- MUST auto-enable for `supervised` and `critical` trust tiers without requiring YAML opt-in (maximum oversight tiers)
- MUST be opt-in for `spot_checked` and `autonomous` trust tiers via `harness.metacognitive: true`
- MUST use a cheap/fast LLM call — `maxTokens: 512`, terse prompt. Consultation is internal overhead, not a work product.
- MUST NOT re-execute the step — if issues found, set `reviewResult = 'flag'` to force human review
- MUST NOT change the existing review-pattern handler behavior — additive only
- MUST record check cost in `context.reviewCostCents` (additive with any review pattern cost)
- MUST extract `parseHarnessConfig()` to shared `harness-config.ts` — both handlers import from there, preventing duplicate parsing
- MUST guard review-pattern handler: if `context.reviewResult` is already `'flag'` (from metacognitive check), preserve it — do not overwrite to `'pass'`
- MUST merge `context.reviewDetails` in review-pattern handler (spread existing + add) — do not replace

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| HarnessHandler interface | `src/engine/harness.ts` (Phase 2a) | Existing handler pattern — composition over invention |
| LLM self-check call | `src/engine/harness-handlers/review-pattern.ts` spec-testing pattern | Same shape: take output + criteria, call LLM, parse verdict |
| Trust-tier gating | `src/engine/harness-handlers/trust-gate.ts` | Existing pattern for reading trust tier from context |
| Metacognitive monitoring concept | ADR-014 Phase A2 (orchestrator reflection) | "Between process steps, the orchestrator evaluates: Is this approach converging?" — same concept applied per-step |
| Auto-enable for supervised | ADR-007 (trust earning) — supervised = always reviewed | New agents get maximum oversight. Metacognitive check is the internal layer of that oversight. |
| Pipeline registration | `src/engine/heartbeat.ts` lines 52-59 | Existing registration pattern — add handler in sequence |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/harness-handlers/metacognitive-check.ts` | **Create:** New harness handler. `canHandle()` returns true if trust tier is `supervised` OR step has `harness.metacognitive: true`. `execute()` calls `createCompletion()` with step output + input as context, metacognitive prompt, `maxTokens: 512`. Parses verdict: clean → continue, issues → `context.reviewResult = 'flag'`. Records cost. |
| `src/engine/heartbeat.ts` | **Modify:** Import and register `metacognitiveCheckHandler` in pipeline — after `stepExecutionHandler`, before `reviewPatternHandler`. |
| `src/engine/harness-handlers/harness-config.ts` | **Create:** Shared harness field parser. Extracts `parseHarnessConfig()` from review-pattern.ts. Returns `{ review: string[], metacognitive: boolean }`. Both review-pattern and metacognitive-check handlers import from here. |
| `src/engine/harness-handlers/review-pattern.ts` | **Modify:** Import `parseHarnessConfig()` from `harness-config.ts` (remove local copy). Guard `context.reviewResult`: if already `'flag'`, preserve it. Merge `context.reviewDetails` (spread existing + add) rather than replace. |
| `src/engine/harness-handlers/metacognitive-check.test.ts` | **Create:** Tests for the handler. |

## User Experience

- **Jobs affected:** Review (the human sees flagged items from metacognitive checks alongside regular review items)
- **Primitives involved:** Review Queue (flagged items appear here, same as trust gate flags)
- **Process-owner perspective:** For supervised processes, the human sees fewer obviously-wrong outputs reaching review — the agent caught its own contradictions before external review. For autonomous processes, no change unless opted in. The mechanism is invisible — the human doesn't see "metacognitive check ran," they see better output quality.
- **Interaction states:** N/A — uses existing review queue for flagged items
- **Designer input:** Not invoked — lightweight UX section only. No new UI surfaces.

## Acceptance Criteria

1. [ ] `metacognitiveCheckHandler` implements `HarnessHandler` interface with `canHandle()` and `execute()`
2. [ ] `canHandle()` returns `true` when trust tier is `supervised` or `critical` (maximum oversight tiers)
3. [ ] `canHandle()` returns `true` when step has `harness.metacognitive: true` (regardless of trust tier)
4. [ ] `canHandle()` returns `false` for `spot_checked`/`autonomous` without explicit opt-in
5. [ ] `execute()` calls `createCompletion()` with: step output as user content, metacognitive prompt as system, `maxTokens: 512`
6. [ ] Metacognitive prompt instructs: check for unsupported assumptions, missing edge cases, scope creep beyond input, contradictions with provided context
7. [ ] When check finds issues: `context.reviewResult` set to `'flag'`, issues recorded in `context.reviewDetails.metacognitive`
8. [ ] When check is clean: pipeline continues unchanged (no modification to `context.reviewResult`)
9. [ ] Check cost added to `context.reviewCostCents`
10. [ ] Handler registered in pipeline AFTER `stepExecutionHandler` and BEFORE `reviewPatternHandler`
11. [ ] Handler skips (returns context unchanged) when `context.stepResult` is null or `context.stepError` is set
12. [ ] `harness` field parsing recognizes `metacognitive: true` alongside existing `review: [...]`
13. [ ] Review-pattern handler preserves a prior `'flag'` in `context.reviewResult` — if metacognitive check already flagged, review-pattern does NOT overwrite to `'pass'`
14. [ ] Review-pattern handler merges `context.reviewDetails` (spread existing + add new) rather than replacing — metacognitive check details survive through to feedback-recorder
15. [ ] All existing tests pass (no regression in review-pattern, trust-gate, or heartbeat tests)
16. [ ] New tests: handler runs for supervised and critical tiers, skips for autonomous, flags issues correctly, passes clean output, records cost, skips on step error, flag survives through review-pattern handler

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Is the handler correctly positioned in the pipeline (after execution, before review)? Does it respect the HarnessHandler interface? Is the trust-tier gating correct? Does it compose with review patterns rather than replacing them? Is the LLM call appropriately lightweight?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Run tests
pnpm test

# Verify type-check passes
pnpm run type-check

# Live smoke test (requires configured LLM + a supervised process):
# 1. Start a process run with a supervised step
# 2. Observe: metacognitive check runs after step execution
# 3. Check harnessDecisions table — reviewDetails should include metacognitive field
# 4. Start a process run with an autonomous step (no opt-in)
# 5. Observe: metacognitive check does NOT run
# 6. Add harness.metacognitive: true to an autonomous step YAML
# 7. Observe: metacognitive check runs for that step
```

## Benchmark Criteria (Insight-064)

This handler must justify its place in the pipeline with data. After 50 supervised runs with the metacognitive check active, evaluate:

1. **Flag rate** — % of steps where the check flags issues. If 0% after 50+ runs, it's dead weight.
2. **True positive rate** — of flagged steps, % where human agreed (rejected or edited).
3. **Catch rate** — steps flagged by metacognitive check but passed by review patterns. Unique catches = the handler's reason to exist.
4. **False positive rate** — flagged steps the human approved unchanged.

**Decision threshold:**
- Catch rate > 5%: keep and consider expanding to more tiers
- Catch rate < 2% with flag rate < 5%: demote to opt-in only across all tiers
- False positive rate > 30%: tune the prompt or cut the handler

Data sources: `stepRuns` (reviewResult, reviewDetails.metacognitive), `activities` (feedback records), human approve/edit/reject actions. Benchmark is a correlation query, not new infrastructure.

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` — add Metacognitive Check row to harness capabilities, cross-reference with Cognitive Architecture A1
3. Phase retrospective: does the metacognitive check catch real issues? What false positive rate? Is 512 tokens sufficient for the check?
4. Insight-063 status → "absorbed" (both 034a and 034b shipped)
5. Consider: should existing dev pipeline steps opt in to metacognitive checking for autonomous roles?
