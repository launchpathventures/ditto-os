# Brief: Model Purpose Resolver Handler

**Date:** 2026-04-11
**Status:** draft
**Depends on:** ADR-026 (multi-provider purpose-based routing)
**Unlocks:** Automatic cost optimization per step; spend-ceiling-aware degradation; trust-tier cost compounding; SLM provider on-ramp (Groq/Llama as future `classification`/`extraction` provider)

## Goal

- **Roadmap phase:** Phase 11 (harness infrastructure) / Phase 14 (operational maturity)
- **Capabilities:** Automatic model tier selection per process step; cost-aware execution; trust-as-cost-lever

## Context

Today, model selection in Ditto works at two levels:

1. **Explicit purpose** — calling code passes `purpose` on `LlmCompletionRequest` (e.g., Self uses `conversation`, intake classifier uses `classification`)
2. **Default fallback** — if no purpose is set, the active provider's default model is used

The gap is in **process step execution**. When the harness runs a step, the adapter picks the model — but it has no structured way to derive the right purpose from the step's own metadata. Every step gets the same model unless the adapter hardcodes a purpose. This means:

- A simple routing step burns the same tokens as a complex research step
- A ghost-mode email (user's reputation at stake) uses the same model as an internal classification
- An autonomous process with 95% approval rate uses the same expensive model as a supervised process still earning trust

NeurometricAI's approach (classifying API calls by structural shape — tools present? JSON output? token ratio?) demonstrates that you don't need a separate classifier to right-size model selection. The metadata is already there. In Ditto's case, the `StepDefinition` carries all the signals needed.

### SLM Research Context (April 2026)

Research into the SLM landscape (Neurometric, Groq, Together AI, OpenRouter, self-hosted options) established three findings that shape this brief:

1. **Neurometric's 115 "task-specific SLMs" are Qwen3-4B-Instruct with different system prompts** — not fine-tuned models. Their genuine fine-tuning work (CRM-Arena, 0.825 accuracy on lead qualification) is research, not shipped product. No independent benchmarks exist.

2. **Fine-tuned SLMs genuinely beat frontier models on narrow structured tasks** — distil labs showed a fine-tuned Qwen3-4B beating GPT-OSS-120B on 6/8 benchmarks; Apollo.io classifies ~1M emails/day with FastText, not LLMs. But this requires curated training data, an eval pipeline, and ongoing model maintenance.

3. **At Ditto's current volume, Haiku 4.5 ($0.50-1.00/1M tokens) is already SLM-priced.** The cost gap between Haiku and Groq's Llama 3.1 8B ($0.05/1M) is material only at hundreds of thousands of classifications per day. The bigger cost lever today is routing Sonnet-tier steps to Haiku where structurally safe — which is exactly what this handler does.

**The SLM on-ramp:** This handler creates the extension point for SLM providers. When volume or eval data justifies it, a follow-up brief adds Groq (OpenAI-compatible API, $0.05/1M, 840 tok/sec) as a provider and maps `classification`/`extraction` purposes to Llama 3.1 8B. One routing table change, no architecture change. The handler doesn't need to know about SLMs — it resolves purpose, and the routing table handles provider selection.

## Objective

A harness handler that runs before step-execution, reads the step definition's structural signals, and resolves the optimal `ModelPurpose` — making model tier selection automatic, cost-aware, and trust-informed, with zero annotation burden on process authors.

## Non-Goals

- **Not a model selector** — this handler resolves `ModelPurpose`, not a specific model. The existing `PURPOSE_ROUTING` table + `resolveProviderForPurpose()` handle provider/model selection downstream.
- **Not a spend ceiling** — `spend-ceiling.ts` remains the circuit breaker for front-door abuse. This handler is about right-sizing, not hard limits.
- **Not process-author-facing** — no new YAML fields required. The handler reads existing fields. An optional `config.purpose` override exists for edge cases.
- **Not a recommendation engine** — `generateModelRecommendations()` already handles learned routing from feedback data. This handler is the structural complement (shape-based, not history-based).
- **Not changing the LLM provider layer** — no changes to `src/engine/llm.ts` or provider implementations.
- **Not adding SLM providers** — Groq/Together/self-hosted SLMs are a follow-up brief. This handler resolves purpose; the routing table maps purpose to provider. Decoupled by design.

## Inputs

1. `packages/core/src/harness/` — harness pipeline, handler interface, context type
2. `packages/core/src/llm/index.ts` — `ModelPurpose` type, `MODEL_PURPOSES` const
3. `src/engine/model-routing.ts` — `PURPOSE_ROUTING`, `resolveProviderForPurpose()`
4. `src/engine/spend-ceiling.ts` — current spend status
5. `docs/insights/173-structural-signal-model-routing.md` — the design insight behind this work
6. `docs/insights/170-token-efficiency-optimizations.md` — existing token efficiency patterns

## Constraints

- **Engine-first**: The handler itself and the `resolvedModelPurpose` context field belong in `packages/core/` (any harness consumer benefits). The signal-to-purpose mapping table is engine-generic.
- **No new step YAML fields**: The handler must work with existing `StepDefinition` fields. Process authors should not need to annotate model preferences.
- **Override escape hatch**: `step.config.purpose` (already a `Record<string, unknown>`) allows explicit override. Handler checks this first and short-circuits.
- **Must not break existing behavior**: If the handler cannot determine a purpose, it leaves `resolvedModelPurpose` as `null` and the existing fallback chain in `createCompletion()` applies.
- **Trust data is optional**: The handler must work without trust history (new processes). Trust-based downgrading is an enhancement, not a requirement.
- **No additional LLM calls**: The purpose resolution must be pure logic — structural signal inspection only.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Structural signal classification | NeurometricAI `skills/neurometric/SKILL.md` | pattern | Pragmatic task→model mapping via call shape, not semantics. Their marketplace is prompt-library-over-Qwen3-4B, but the classification heuristic pattern transfers. |
| Purpose-based routing | ADR-026 (Ditto) | depend | Existing architecture this handler feeds into |
| Harness handler pattern | `packages/core/src/harness/` | depend | Existing pipeline extension point |
| Trust-as-cost-lever | Insight-173 (Ditto) | original | Novel: high-trust processes can safely use cheaper models |
| SLM benchmark evidence | distil labs (12 SLMs, 8 tasks), Apollo.io (email classification) | pattern | Fine-tuned 4B models beat 120B on narrow tasks; validates that `classification`/`extraction` purposes can safely route to smaller models. Informs the follow-up SLM provider brief. |
| Volume-based model routing | Groq, OpenRouter, Together AI | pattern | OpenAI-compatible APIs at $0.05/1M tokens. When volume justifies, these become providers in `PURPOSE_ROUTING` for cheap purposes — no handler changes needed. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/harness/harness.ts` | Modify: Add `resolvedModelPurpose: ModelPurpose \| null` to `HarnessContext` |
| `packages/core/src/harness/handlers/model-purpose-resolver.ts` | Create: The handler |
| `packages/core/src/harness/index.ts` | Modify: Export the new handler |
| `packages/core/src/harness/handlers/model-purpose-resolver.test.ts` | Create: Unit tests |
| `src/engine/harness.ts` | Modify: Register handler in pipeline (before step-execution) |
| `src/engine/harness-handlers/step-adapter-bridge.ts` or equivalent | Modify: Read `context.resolvedModelPurpose` and pass as `purpose` to `createCompletion()` |

## Design

### Handler: `model-purpose-resolver`

**Position in pipeline:** After routing, before trust-gate and step-execution.

**Resolution logic (in priority order):**

```
1. EXPLICIT OVERRIDE
   If step.config.purpose is set and is a valid ModelPurpose → use it, done.

2. NON-LLM EXECUTOR
   If step.executor is 'script', 'integration', or 'human' → set null, done.
   (These don't make LLM calls — no purpose needed.)

3. SENDING IDENTITY SIGNAL
   If step.sendingIdentity === 'principal' → 'writing'
   (User's professional reputation is at stake.)

4. ROUTING SIGNAL
   If step has route_to conditions → 'classification'
   (This step is a router/classifier by definition.)

5. TOOL + OUTPUT SIGNAL
   If step declares tools (step.config.tools or resolvedTools !== null)
   AND step.outputs contains entries ending in '_data', '_json', '_record', '_list',
   or step.config.response_format is set → 'extraction'
   (Concrete heuristic: tools + structured naming convention = extraction task.)

6. TRUST-TIER SIGNAL (cost optimization)
   If trustTier === 'autonomous' AND step has no sendingIdentity:
     - If step agent_role suggests analysis → 'classification' (downgrade)
     - Otherwise → 'analysis' (safe middle ground)

7. AGENT ROLE SIGNAL
   If step.agent_role contains research/analysis/review keywords → 'analysis'
   If step.agent_role contains write/draft/compose keywords → 'writing'
   If step.agent_role contains classify/route/triage keywords → 'classification'

8. MODEL HINT BACKWARD COMPAT
   If step.config.model_hint is set:
     - 'fast' → 'classification'
     - 'capable' → 'analysis'
     - 'default' → 'analysis'
   (Superseded by config.purpose but honored for existing process YAMLs.)

9. DEFAULT
   → 'analysis' (safe middle ground — capable but not premium)
```

**Note on `conversation` purpose:** The `conversation` purpose is deliberately excluded from the resolution chain. It is reserved for the Self conversational interface (L6 Human Layer), which sets it explicitly. Process steps never resolve to `conversation` — they are executing work, not having a dialogue with the user.

**Note on pipeline ordering:** This handler reads `stepDefinition.sendingIdentity` (the YAML declaration), not `context.sendingIdentity` (which is set by the identity-router handler). This means the handler is safe to register at any position relative to Brief 116 handlers. The recommended position is after routing (which may determine that the step is skipped) and before trust-gate (so the resolved purpose is available for any future cost-aware trust decisions).

### Cost Pressure Modifier (optional, can be deferred)

When spend status indicates pressure (>80% of daily ceiling), the handler can apply a one-tier downgrade to purposes where the step has review patterns configured:

- `writing` → `analysis` (review will catch quality issues)
- `analysis` → `classification` (only if step has adversarial or ensemble review)
- `conversation` → never downgraded (user-facing)
- `extraction` → already cheapest tier

This is an enhancement, not required for v1.

### Context Field

```typescript
// Added to HarnessContext
resolvedModelPurpose: ModelPurpose | null;
```

`null` means "handler couldn't determine — use existing fallback chain." This preserves backward compatibility.

### How Step Execution Consumes It

The step execution adapter reads `context.resolvedModelPurpose` and passes it as `purpose` on the `LlmCompletionRequest`. If `null`, behavior is unchanged. If set, the existing `createCompletion()` resolution chain handles provider+model selection.

## User Experience

- **Jobs affected:** None directly — this is an infrastructure optimization invisible to the user
- **Primitives involved:** None
- **Process-owner perspective:** Processes run at the same quality but cost less. Autonomous processes cost less than supervised ones (a visible benefit of earning trust). No action required from the process owner.
- **Interaction states:** N/A
- **Designer input:** Not invoked — no user-facing changes

## Acceptance Criteria

1. [ ] `HarnessContext` in `packages/core/` has `resolvedModelPurpose: ModelPurpose | null` field
2. [ ] `model-purpose-resolver` handler exists in `packages/core/src/harness/handlers/`
3. [ ] Handler runs before `step-execution` in the pipeline
4. [ ] `step.config.purpose` override is respected as highest priority
5. [ ] Non-LLM executors (`script`, `integration`, `human`) resolve to `null`
6. [ ] `sendingIdentity: 'principal'` resolves to `writing`
7. [ ] Steps with `route_to` conditions resolve to `classification`
8. [ ] Default resolution is `analysis` when no signals match
9. [ ] `null` resolution preserves existing fallback behavior (no regression)
10. [ ] Step execution adapter passes `resolvedModelPurpose` as `purpose` on `LlmCompletionRequest`
11. [ ] `config.model_hint` backward compat maps `fast`→`classification`, `capable`→`analysis`
12. [ ] `conversation` purpose is never resolved by the handler (no process step maps to it)
13. [ ] Unit tests cover all 9 resolution paths with at least one test each
14. [ ] Unit tests verify priority ordering (e.g., explicit override beats sendingIdentity signal)
15. [ ] `pnpm run type-check` passes at root (core + app)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Handler is in `packages/core/` (engine-generic, not Ditto-specific)
   - No Ditto product concepts leak into core (no Self, personas, network references)
   - Resolution logic is deterministic and pure (no LLM calls, no DB queries)
   - `HarnessContext` extension is backward-compatible (`null` default)
   - Pipeline ordering is correct (after routing, before step-execution)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type check passes
pnpm run type-check

# Unit tests pass
pnpm test -- model-purpose-resolver

# Verify handler is registered in pipeline
grep -n "model-purpose-resolver" src/engine/harness.ts

# Verify context field exists
grep -n "resolvedModelPurpose" packages/core/src/harness/harness.ts
```

## After Completion

1. Update `docs/state.md` with the new handler
2. Update `docs/roadmap.md` — note model purpose resolver as done
3. **Follow-up brief: SLM provider integration** — Add Groq as a provider in `src/engine/llm.ts` (OpenAI-compatible, trivial). Map `classification` and `extraction` purposes to Llama 3.1 8B in `PURPOSE_ROUTING`. Gate on: (a) volume exceeding ~10K classifications/day where Haiku cost becomes material, or (b) eval data showing Llama 3.1 8B matches Haiku accuracy on our specific classification tasks. Not needed until one of these triggers is met.
4. **Follow-up brief: learned routing feedback loop** — Wire `generateModelRecommendations()` to propose purpose overrides for specific process+step combinations based on approval rate and cost data. The handler already supports `config.purpose` override; the recommendation engine would suggest values for process authors to adopt.
5. Consider: spend-ceiling cost pressure modifier (future brief if v1 proves value)
6. Consider: opt-out detection as rules-based (Apollo pattern — FastText/regex handles 99%+ of cases, LLM only for ambiguous). This is a process design change, not a handler change, but the research supports it.
7. Phase retrospective: did structural signals map cleanly? Any surprising gaps?
