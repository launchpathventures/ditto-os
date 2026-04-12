# Brief: SLM Training Data Pipeline and Provider Integration

**Date:** 2026-04-11
**Status:** draft
**Depends on:** Brief 128 (model-purpose-resolver), Brief 033 (model routing intelligence), Brief 096 (multi-provider purpose routing)
**Unlocks:** Per-customer fine-tuned SLMs; Neurometric provider integration; self-hosted SLM deployment; training data as product moat

## Goal

- **Roadmap phase:** Phase 11 (harness infrastructure) / Phase 14 (operational maturity) / new Phase 16 (SLM intelligence)
- **Capabilities:** Training data extraction from trust-labeled step runs; SLM readiness scoring; Neurometric and OpenAI-compatible SLM provider integration; evaluation pipeline for SLM quality gating; per-customer model routing overrides

## Context

Brief 128 built the model-purpose-resolver: every step execution is now classified by purpose (classification, extraction, analysis, writing, conversation). Brief 033 built model tracking on step runs and learned model recommendations. Brief 096 built multi-provider purpose-based routing.

The missing layer is: **turning accumulated step run data into fine-tuned SLMs**.

Ditto's trust system already generates labeled training data as a byproduct of normal operation (Insight-175). Every approved step run is a (system_prompt, input, output) training example with a human quality label. Every edited output captures what was wrong and what "good" looks like. Every rejected output is a negative example.

The strategic thesis: **a customer's operational data, processed through Ditto's trust system, produces training corpora that no competitor can replicate.** Fine-tuned SLMs trained on this data cost 10-100x less to run than frontier models, perform better on the specific task (distil labs showed fine-tuned Qwen3-4B beating GPT-OSS-120B on 6/8 benchmarks), and create a compounding flywheel where cost savings enable more usage, generating more training data.

### External Infrastructure: Neurometric AI

Neurometric AI (neurometric.ai) provides:
- **SLM marketplace** — 115+ task-specific models (currently prompt-library-over-Qwen3, but their fine-tuning research is real: CRM-Arena, 0.825 accuracy on lead qualification)
- **OpenClaw runtime** — Kubernetes-based SLM serving (their `clawbake` repo manages instances via CRD+operator)
- **API gateway** — proxy at `api.neurometric.ai` that logs, evaluates, and routes LLM calls (OpenAI-compatible API)
- **Flat pricing** — $2/month per model for unlimited hosted inference

Neurometric is a natural first provider for SLM hosting + fine-tuning services. The architecture must also support self-hosted (Ollama, llama.cpp) and other SLM providers (Groq, Together AI) through the same interface.

## Objective

Build the infrastructure that identifies fine-tuning opportunities from trust-labeled step run data, extracts training datasets, evaluates SLM candidates, and integrates SLM providers into the existing purpose-based routing — making the trust system a training data flywheel that compounds into a cost and quality moat.

## Non-Goals

- **Not training models ourselves** — this brief builds the data pipeline and provider integration. Actual model training is delegated to Neurometric, or done via external tools (Unsloth, Axolotl) outside Ditto. Ditto produces the training data and consumes the resulting model.
- **Not replacing frontier models for all purposes** — `conversation` and `writing` purposes remain on Claude/GPT. SLMs target `classification` and `extraction` only (Brief 128 already resolves these).
- **Not building a model training UI** — the readiness scoring and training data export are engine primitives. UI is a future phase.
- **Not self-hosting inference** — Ollama integration already exists in `llm.ts`. This brief adds Neurometric as a provider and the data pipeline that feeds fine-tuning. Self-hosted inference is a deployment decision, not an architecture one.
- **Not changing the trust system** — the trust system already produces the labels. This brief reads the data; it doesn't change how it's collected.
- **Not an auto-switching system** — SLM deployment requires human approval. The system recommends and evaluates; the human decides.

## Inputs

1. `src/db/schema.ts` — stepRuns table (inputs, outputs, status, model, costCents, tokensUsed), feedback table (type, diff, editSeverity), processOutputs table
2. `src/engine/model-routing.ts` — `generateModelRecommendations()`, `PURPOSE_ROUTING`, `resolveProviderForPurpose()`
3. `packages/core/src/harness/handlers/model-purpose-resolver.ts` — resolves ModelPurpose per step
4. `src/engine/llm.ts` — `LlmProvider` interface, provider registry, `createCompletion()`
5. `docs/insights/175-trust-system-as-training-data-flywheel.md` — the strategic insight behind this work
6. `docs/insights/173-structural-signal-model-routing.md` — structural signal classification (feeds readiness scoring)
7. Brief 128 — model-purpose-resolver (the foundation this builds on)

## Constraints

- **Product layer for implementation, core for type contracts**: Training data extraction, readiness scoring, and eval pipeline query Ditto-specific tables (`step_runs`, `feedback`) and therefore belong in `src/engine/` (product layer). The *type definitions* (`TrainingExample`, `SlmReadinessScore`, `SlmEvalResult`) belong in `packages/core/src/learning/` as contracts that any harness consumer could implement against their own schema. This follows the DB injection principle: core defines contracts, the product layer implements them.
- **No schema changes for data capture**: The `step_runs` table already has inputs, outputs, status, model, costCents, tokensUsed. The `feedback` table has type, diff, editSeverity. No new columns needed.
- **New tables for pipeline state**: Training data exports, readiness scores, and SLM deployment records need new tables. These are Ditto product tables (in `src/db/schema.ts`), not core tables — a generic harness consumer would have different training infrastructure.
- **Provider-agnostic SLM interface**: The Neurometric provider must implement `LlmProvider` exactly like Anthropic/OpenAI/Google. No Neurometric-specific concepts leak into the routing layer.
- **OpenAI-compatible API assumption**: Both Neurometric and self-hosted SLMs (Ollama, vLLM, llama.cpp) speak the OpenAI chat completions API. The provider can be a thin wrapper over the existing OpenAI provider with a different base URL.
- **Human-gated deployment**: SLM recommendations surface through the existing model recommendations system. No auto-switching. The human approves SLM deployment per (process, step).
- **Training data privacy**: Training data export includes a mandatory scrubbing step. The export function requires a `scrubber: (text: string) => string` parameter with no default — callers must make a conscious choice. For self-hosted training, pass an identity function. For external providers like Neurometric, pass a PII scrubber. System prompts are excluded from exports to external providers by default (they may contain proprietary process logic).
- **Evaluation before deployment**: An SLM must pass an eval gate (>95% match on held-out approved examples) before it can be added to the routing table for a step.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Training data from operational feedback | Insight-175 (Ditto) | original | Novel: trust system as training data flywheel |
| Structural signal classification | Insight-173, Brief 128 | depend | Identifies which steps are SLM candidates |
| Purpose-based routing | ADR-026, Brief 096 | depend | SLMs slot into existing routing table |
| Learned model recommendations | Brief 033 | depend | Extended with "recommend fine-tuning" |
| OpenAI-compatible SLM serving | Neurometric API gateway, Ollama, vLLM | pattern | Industry standard: same API shape, different backend |
| Distillation training data generation | Stanford Alpaca, distilabel (argilla-io/distilabel) | pattern | Large model generates training examples for small model |
| SLM fine-tuning pipeline | Unsloth (unslothai/unsloth), Axolotl (OpenAccess-AI-Collective/axolotl) | pattern | Training infrastructure — Ditto produces data, these tools consume it |
| Task-specific SLM marketplace | Neurometric AI (neurometric.ai) | pattern | First SLM provider integration target |
| Evaluation harness | EleutherAI lm-evaluation-harness | pattern | Standard approach to eval gating before deployment |
| CRM-specific SLM benchmarks | Neurometric CRM-Arena | pattern | Validates fine-tuned SLMs beating frontier on narrow CRM tasks |

## What Changes (Work Products)

### Sub-brief 136: Training Data Pipeline

| File | Action |
|------|--------|
| `packages/core/src/learning/types.ts` | Create: Type contracts — `TrainingExample`, `TrainingDataExport`, `SlmReadinessScore` (engine-generic interfaces) |
| `packages/core/src/learning/index.ts` | Create: Module exports (types only) |
| `packages/core/src/index.ts` | Modify: Export learning module |
| `src/engine/training-data.ts` | Create: Training data extraction implementation — queries step_runs + feedback, formats as JSONL |
| `src/engine/readiness-scorer.ts` | Create: SLM readiness scoring implementation — queries step_runs for volume, consistency, cost |
| `src/db/schema.ts` | Modify: Add `slm_training_exports` table |
| `src/engine/model-routing.ts` | Modify: Extend `generateModelRecommendations()` with fine-tuning candidate detection |
| Tests | Create: Unit tests for extraction, scoring, recommendations |

### Sub-brief 137: SLM Provider Integration + Eval Pipeline

| File | Action |
|------|--------|
| `src/engine/llm.ts` | Modify: Add OpenAI-compatible SLM provider factory (Neurometric, Groq, self-hosted — same shape, different base URL + API key) |
| `src/engine/model-routing.ts` | Modify: Support per-(process, step) routing overrides for deployed SLMs |
| `src/engine/eval-pipeline.ts` | Create: Run held-out examples through candidate SLM, compare to approved outputs, produce accuracy score. Receives LlmProvider via parameter injection. |
| `src/engine/slm-deployment.ts` | Create: Manage SLM deployment lifecycle (candidate → evaluating → promoted → retired) |
| `src/db/schema.ts` | Modify: Add `slm_deployments` table |
| Tests | Create: Unit tests for provider, routing overrides, eval pipeline, lifecycle transitions |

## Design

### 1. Training Data Extraction (`src/engine/`, types in `packages/core/`)

The extractor queries step_runs joined with feedback to produce training examples:

```typescript
interface TrainingExample {
  /** Unique ID for deduplication */
  id: string;
  /** The process and step this example came from */
  processSlug: string;
  stepId: string;
  /** The purpose class (classification, extraction, etc.) */
  purpose: ModelPurpose;
  /** System prompt used for this step */
  systemPrompt: string;
  /** Input to the step (the user/context message) */
  input: string;
  /** Output from the step (the approved response) */
  output: string;
  /** Whether this was directly approved or edited-then-approved */
  label: "approved" | "edited";
  /** If edited, the final (corrected) output — this is the training target */
  correctedOutput?: string;
  /** Model that produced the original output */
  sourceModel: string;
  /** Timestamp */
  createdAt: Date;
}

interface TrainingDataExport {
  processSlug: string;
  stepId: string;
  purpose: ModelPurpose;
  examples: TrainingExample[];
  /** Format: instruction-tuning JSONL compatible with OpenAI fine-tuning API (messages array per line) */
  format: "jsonl";
  /** Stats */
  totalExamples: number;
  approvedCount: number;
  editedCount: number;
  rejectedCount: number; // negative examples, excluded from training by default
}
```

**Key design decisions:**
- For edited outputs, the **corrected output** is the training target (not the original). This means the SLM learns from human corrections — the highest-quality signal.
- Rejected outputs are tracked but excluded from training data by default. They could be used for DPO (Direct Preference Optimization) training in future.
- The extractor is parameterized by (processSlug, stepId) — training data is per-task, not per-process.
- A mandatory `scrubber: (text: string) => string` parameter runs over all text fields before export. No default — callers must consciously choose identity (self-hosted) or PII removal (external). System prompts are excluded from external exports by default.

### 2. SLM Readiness Scoring (`src/engine/`, types in `packages/core/`)

A pure function that scores each (process, step) pair for SLM fine-tuning readiness:

```typescript
interface SlmReadinessScore {
  processSlug: string;
  stepId: string;
  purpose: ModelPurpose;
  /** Readiness score 0-100 */
  score: number;
  /** Individual signal scores */
  signals: {
    volume: { count: number; threshold: number; score: number };
    consistency: { approvalRate: number; threshold: number; score: number };
    purposeFit: { purpose: ModelPurpose; isSlmSuitable: boolean; score: number };
    costImpact: { currentAvgCostCents: number; estimatedSlmCostCents: number; score: number };
    structuralSimplicity: { avgInputTokens: number; avgOutputTokens: number; score: number };
  };
  /** Human-readable recommendation */
  recommendation: "not_ready" | "approaching" | "ready" | "strong_candidate";
  /** Estimated monthly cost savings if SLM deployed */
  estimatedMonthlySavingsCents: number;
}
```

**Thresholds (configurable, sensible defaults):**
- Volume: 1,000 approved examples = ready, 5,000 = strong candidate
- Consistency: >90% approval rate = ready, >95% = strong candidate
- Purpose fit: only `classification` and `extraction` score > 0
- Cost impact: current cost > $0.005/call scores; current cost > $0.01/call scores higher
- Structural simplicity: avg input < 2000 tokens AND avg output < 500 tokens scores higher (SLMs handle short, structured tasks best)

### 3. SLM Provider Factory (`src/engine/`)

Since Neurometric, Groq, Together AI, and self-hosted SLMs all speak the OpenAI chat completions API, the provider is a factory over the existing OpenAI provider:

```typescript
interface SlmProviderConfig {
  name: string;          // e.g., "neurometric", "groq", "local-ollama"
  baseUrl: string;       // e.g., "https://api.neurometric.ai", "http://localhost:11434/v1"
  apiKey: string;
  defaultModel: string;  // e.g., "qwen2.5-1.5b-inbox-triage"
  /** Models available on this provider */
  models: string[];
  /** Cost per million tokens (0 for flat-rate providers like Neurometric) */
  pricing?: { inputPerM: number; outputPerM: number };
}
```

This reuses the OpenAI provider's message translation, tool format conversion, and response parsing — only `baseUrl` and `apiKey` differ. The factory produces an `LlmProvider` that plugs directly into the existing multi-provider system.

### 4. Per-Customer Routing Overrides (`src/engine/`)

The routing table today is static (`PURPOSE_ROUTING`). For deployed SLMs, we need per-(process, step) overrides:

```typescript
interface SlmDeployment {
  id: string;
  processSlug: string;
  stepId: string;
  /** The SLM provider and model */
  provider: string;     // e.g., "neurometric"
  model: string;        // e.g., "qwen2.5-1.5b-inbox-triage-acme-corp"
  /** Deployment status */
  status: "candidate" | "evaluating" | "promoted" | "retired";
  /** Eval results */
  evalAccuracy?: number;
  evalExamples?: number;
  /** Production tracking (once promoted) */
  productionApprovalRate?: number;
  productionRunCount?: number;
  /** Timestamps */
  createdAt: Date;
  promotedAt?: Date;
  retiredAt?: Date;
}
```

**Routing override logic** (extends `resolveProviderForPurpose`):

```
1. Check SlmDeployment for (processSlug, stepId) with status = "promoted"
   → If found, return that provider + model
2. Fall through to normal PURPOSE_ROUTING
```

Shadow mode (run both SLM and frontier model, compare results) is deferred to a follow-up brief. For v1, the eval pipeline provides sufficient quality gating before promotion.

### 5. Evaluation Pipeline (`src/engine/`)

Before an SLM is promoted, it must pass an eval gate:

```
1. Hold out 20% of approved examples as eval set (not used in training)
2. Run each eval example through the candidate SLM
3. For classification tasks: compare exact label match (accuracy)
4. For extraction tasks: compare structured output field match (F1 score per field)
5. Require >95% accuracy for promotion
6. Log all eval results for audit
```

The eval pipeline is engine-generic — any harness consumer could evaluate a candidate model against their approved step run data.

### 6. Deployment Lifecycle

```
                 readiness score
                 triggers alert
                      │
                      ▼
    ┌─────────┐  human approves  ┌────────────┐
    │ not_ready│───────────────▶  │  candidate  │
    └─────────┘   training        └──────┬─────┘
                                         │
                                   training done,
                                   model available
                                         │
                                         ▼
                                  ┌────────────┐
                                  │ evaluating  │──── eval fails ──▶ retired
                                  └──────┬─────┘
                                         │
                                    eval passes (>95% accuracy)
                                    + human approves promotion
                                         │
                                         ▼
                                  ┌────────────┐
                                  │  promoted   │──── drift detected ──▶ retired
                                  └──────┬─────┘      (approval rate drops >10%
                                         │             below baseline for 50+ runs)
                                   ongoing monitoring
                                   via step_runs data
```

Shadow mode (run both SLM and frontier model in parallel for A/B comparison) is a follow-up brief when v1 proves value.

### 7. Schema Additions (`src/db/schema.ts`)

```typescript
/** SLM training data exports — tracks what was exported and when */
slmTrainingExports: {
  id: text PK
  processSlug: text
  stepId: text
  purpose: text (ModelPurpose)
  exampleCount: integer
  format: text ("jsonl")
  exportPath: text         // file path or external URI
  scrubberUsed: text       // "none" | "pii" | custom name
  createdAt: timestamp
}

/** SLM deployments — tracks candidate → eval → shadow → promoted lifecycle */
slmDeployments: {
  id: text PK
  processSlug: text
  stepId: text
  provider: text           // e.g., "neurometric"
  model: text              // e.g., "qwen2.5-1.5b-inbox-triage-acme-corp"
  status: text             // "candidate" | "evaluating" | "promoted" | "retired"
  trainingExportId: text FK → slmTrainingExports
  evalAccuracy: real
  evalF1: real
  evalExamples: integer
  productionRunCount: integer
  productionApprovalRate: real
  retiredReason: text
  createdAt: timestamp
  promotedAt: timestamp
  retiredAt: timestamp
}
```

## User Experience

- **Jobs affected:** Orient (readiness alerts surface in briefings), Decide (human approves/rejects SLM deployment)
- **Primitives involved:** Suggestion blocks (readiness recommendation), status indicators (SLM deployment lifecycle)
- **Process-owner perspective:** The system tells you "Your inbox triage step has 2,340 approved examples at 96% consistency — it's ready for a custom model that would cost 50x less." You approve the training, the system evaluates the result, and if it passes, the step silently switches to the cheaper model. You see cost go down in your process metrics. If quality drifts, the system auto-retires the SLM and falls back to the frontier model.
- **Interaction states:** N/A for this brief (engine primitives). UI for readiness dashboard is a future brief.
- **Designer input:** Not invoked — no user-facing changes in this brief. UI for SLM management is a follow-up.

## Acceptance Criteria

### Sub-brief 136: Training Data Pipeline

1. [ ] `TrainingExample`, `TrainingDataExport`, and `SlmReadinessScore` type contracts exist in `packages/core/src/learning/types.ts`
2. [ ] `extractTrainingData(db, processSlug, stepId, scrubber)` exists in `src/engine/training-data.ts`, queries step_runs + feedback, returns `TrainingDataExport`
3. [ ] `scrubber` parameter is mandatory (no default) — callers must provide an explicit function
4. [ ] System prompts are excluded from exports when `excludeSystemPrompts: true` is set (default for external providers)
5. [ ] Edited outputs use the corrected output as training target, not the original
6. [ ] Rejected outputs are tracked in stats but excluded from training examples
7. [ ] JSONL export format uses OpenAI chat fine-tuning schema: each line is `{"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}`
8. [ ] `scoreSlmReadiness(db, processSlug, stepId)` exists in `src/engine/readiness-scorer.ts`
9. [ ] Readiness scoring uses 5 signals: volume, consistency, purpose fit, cost impact, structural simplicity
10. [ ] Only `classification` and `extraction` purposes score > 0 for purpose fit
11. [ ] `generateModelRecommendations()` extended with `type: "fine_tune_candidate"` recommendations when readiness score is "ready" or "strong_candidate"
12. [ ] `slm_training_exports` table added to `src/db/schema.ts` with all specified columns
13. [ ] Unit tests cover: extraction with approved-only data, extraction with edited data (corrected output used), readiness scoring at each threshold, scrubber application
14. [ ] `pnpm run type-check` passes at root

### Sub-brief 137: SLM Provider Integration + Eval Pipeline

1. [ ] `createSlmProvider(config: SlmProviderConfig)` factory exists in `src/engine/llm.ts`
2. [ ] Factory produces an `LlmProvider` that uses OpenAI-compatible API with configurable baseUrl
3. [ ] Neurometric provider loadable via `NEUROMETRIC_API_KEY` + `NEUROMETRIC_BASE_URL` env vars
4. [ ] `slm_deployments` table added to `src/db/schema.ts` with all specified columns
5. [ ] `evaluateSlmCandidate(db, deploymentId, provider)` in `src/engine/eval-pipeline.ts` runs held-out examples through SLM, produces accuracy score. `provider` (LlmProvider) is injected, not imported.
6. [ ] Eval pipeline uses deterministic holdout: examples with `id` hash mod 5 === 0 form the eval set (20%, reproducible, no overlap with training)
7. [ ] Classification eval uses exact label match; extraction eval uses field-level F1
8. [ ] Per-(process, step) routing override reads from `slm_deployments` where status = "promoted"
9. [ ] SLM deployment lifecycle state machine enforced: candidate → evaluating → promoted (or retired at any stage)
10. [ ] Promotion from evaluating → promoted requires both eval pass (>95%) AND human approval
11. [ ] Retirement auto-triggers if production approval rate drops >10% absolute below pre-SLM baseline for 50+ runs (e.g., baseline 95% → retires at <85%)
12. [ ] Fallback: retired SLM transparently falls back to normal PURPOSE_ROUTING (no user impact)
13. [ ] Unit tests cover: provider creation, routing override, lifecycle transitions, retirement trigger, fallback, eval holdout determinism
14. [ ] `pnpm run type-check` passes at root

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Type contracts only in `packages/core/src/learning/` — no imports from `src/`, no DB queries, no Ditto product concepts
   - All implementation (extraction, scoring, eval, deployment) stays in `src/engine/`
   - Provider integration reuses existing `LlmProvider` interface exactly
   - Training data extraction reads existing schema — no new capture required
   - Privacy: scrubber is mandatory parameter with no default; system prompts excludable
   - Security: API keys handled via env vars, never stored in DB; exportPath is local filesystem only
   - Trust model: SLM deployment requires human approval at both training and promotion gates
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type check passes
pnpm run type-check

# Training data extraction tests pass
pnpm test -- training-data

# Readiness scoring tests pass
pnpm test -- readiness-scorer

# SLM provider tests pass
pnpm test -- slm-provider

# Eval pipeline tests pass
pnpm test -- eval-pipeline

# Verify learning module exported from core
grep -n "learning" packages/core/src/index.ts

# Verify schema tables exist
grep -n "slm_training_exports\|slm_deployments" src/db/schema.ts
```

## After Completion

1. Update `docs/state.md` with the new learning infrastructure
2. Update `docs/roadmap.md` — add Phase 16 (SLM Intelligence) or extend Phase 11
3. Update `docs/architecture.md` L5 (Learning Layer) to include training data accumulation
4. Capture Insight-175 absorption into architecture
5. **Write ADR** for the training data pipeline architectural decision (new learning module, SLM provider pattern, deployment lifecycle)
6. **Follow-up brief: Shadow mode** — run both SLM and frontier model in parallel for A/B comparison before promotion. Deferred from v1 to reduce complexity.
7. **Follow-up brief: SLM Management UI** — dashboard showing readiness scores, deployment status, cost savings per step. Serves the Orient and Decide human jobs.
8. **Follow-up brief: Neurometric marketplace integration** — browse and deploy pre-trained SLMs from Neurometric's marketplace for common tasks (before custom fine-tuning generates enough data)
9. **Follow-up brief: DPO training from rejected outputs** — use rejected outputs as negative examples for Direct Preference Optimization training, further improving SLM quality
10. Phase retrospective: did the readiness thresholds prove accurate? Were the signals sufficient?
