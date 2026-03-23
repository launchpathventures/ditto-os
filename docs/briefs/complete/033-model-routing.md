# Brief: Model Routing Intelligence — Self Learns Optimal Models

**Date:** 2026-03-23
**Status:** complete
**Depends on:** Brief 032 (LLM Provider Extensibility — multi-provider llm.ts)
**Unlocks:** Cost-optimized execution, per-role model specialization, Self as intelligent resource allocator

## Goal

- **Roadmap phase:** Agent Layer (L2) + Learning Layer (L5) + Cognitive Architecture (ADR-014)
- **Capabilities:** Step-level model hints in process definitions, model tracking in feedback/trust data, Self recommends optimal model routing

## Context

Brief 032 makes Ditto provider-agnostic — the user configures one provider and model. But all roles use the same model. In practice:

- PM triage works fine on a fast/cheap model (Haiku, GPT-4o-mini)
- Builder benefits from the most capable model (Opus, GPT-4o)
- Researcher needs good reasoning but not code tools (Sonnet is fine)
- The Self should be conversational and fast (Haiku or equivalent)

The trust system already tracks quality per process/role (approval rate, correction rate, edit severity). If we record which model produced each output, the system can learn: "PM with Haiku has 93% approval rate at 1/20th the cost of PM with Opus."

This is ADR-014's cognitive architecture applied to model selection — the Self as an executive function that learns resource allocation. Research (`docs/research/llm-model-routing-patterns.md`) confirms no existing framework does process-level learned routing from human feedback — this is original to Ditto.

### Three levels of model configuration (from Insight-062)

1. **User configures default** at deployment time (Brief 032) ✓
2. **Process definitions declare hints** — this brief
3. **Self learns optimal routing** — this brief

## Objective

Process steps can declare model capability hints. The trust system tracks model alongside quality. The Self recommends model changes based on accumulated evidence. The human approves.

## Non-Goals

- Auto-switching models without human approval — the human always decides
- Multi-provider per deployment (e.g., Claude for some roles, OpenAI for others) — deferred; requires multiple API keys configured simultaneously. Re-entry: when single-provider proves limiting
- Streaming / real-time model switching during a step — atomic per step
- Model fine-tuning or training — Ditto uses models as-is
- Benchmarking framework — learns from production use, not synthetic tests
- Applying initial model hints to dev role YAMLs — the system should accumulate data on the default model first; premature to set hints before evidence exists. Add hints after `generateModelRecommendations()` produces its first recommendation cycle.

## Inputs

1. `src/engine/llm.ts` — multi-provider implementation (Brief 032)
2. `src/db/schema.ts` — stepRuns table (where model data would be recorded)
3. `src/adapters/claude.ts` — adapter that calls `createCompletion()` with model
4. `src/engine/step-executor.ts` — step execution routing to adapters
5. `src/engine/harness-handlers/feedback-recorder.ts` — feedback recording
6. `src/engine/trust.ts` — trust computation (sliding window, approval rates)
7. `docs/adrs/014-agent-cognitive-architecture.md` — cognitive architecture (executive function, adaptive scaffolding)
8. `docs/research/llm-model-routing-patterns.md` — model routing research (11 projects, 5 patterns)

## Constraints

- MUST NOT auto-switch models — Self recommends, human approves
- MUST NOT require multiple providers configured — model routing works within a single provider's model family (e.g., Opus vs Sonnet vs Haiku, or GPT-4o vs GPT-4o-mini)
- MUST be backward compatible — steps without model hints use the deployment default
- MUST record model on every step run for learning (even before recommendations are active)
- MUST use `getConfiguredModel()` for the default, not `process.env.LLM_MODEL` directly (Brief 032 API)
- Model hints are HINTS, not mandates — the system resolves to the closest available model

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Capability-hint aliases | Vercel AI SDK `customProvider` (`packages/ai/src/registry/provider-registry.ts`) | Only framework with alias-to-model mapping; Ditto defines the vocabulary, not users |
| Actual-model tracking | Vercel AI SDK OpenTelemetry (`ai.response.model`) | Captures actual model used, not just requested — essential when hints resolve differently |
| Per-call model override | Vercel AI SDK, LangGraph, Mastra (per-call model param) | Industry standard — every call can specify its own model |
| Learned routing economics | RouteLLM (lm-sys/RouteLLM) | 85% cost reduction at 95% quality. Validates the economic case. Already cited in ADR-012 |
| Process-level learned routing | Original to Ditto | No framework learns model routing at the process/role level from human feedback signals |
| Trust-driven recommendations | Existing trust earning algorithm (ADR-007) | Sliding window, approval rates, evidence-based tier changes. Apply same pattern to model selection |
| Human-approved changes | Existing trust tier change pattern | System suggests, human approves. Never auto-change |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | **Modify:** Add `model` field to `stepRuns` table |
| `src/engine/llm.ts` | **Modify:** Add `model` field to `LlmCompletionResponse`. Each provider returns `response.model` (actual model used, not requested) |
| `src/engine/model-routing.ts` | **Create:** `resolveModel(hint)` hint-to-model mapping + `generateModelRecommendations()` |
| `src/adapters/claude.ts` | **Modify:** Call `resolveModel(step.config?.model_hint)` instead of `getConfiguredModel()`. Return `model` in `StepExecutionResult` |
| `src/adapters/cli.ts` | **Modify:** Return `model` in `StepExecutionResult` (CLI adapter knows its model from `getDefaultModel()`) |
| `src/engine/step-executor.ts` | **Modify:** Add `model` to `StepExecutionResult` interface |
| `src/engine/process-loader.ts` | **Modify:** Validate `model_hint` values during YAML loading |
| `src/engine/heartbeat.ts` | **Modify:** Record `model` from execution result onto stepRun row in both advance and pause UPDATE paths |
| `src/test-utils.ts` | **Modify:** Add `model TEXT` to step_runs CREATE TABLE SQL (known debt: manual sync with schema) |
| `src/engine/model-routing.test.ts` | **Create:** Tests for hint resolution and recommendation generation |

## Design

### 1. Model hints on process steps

```yaml
steps:
  - id: pm-execute
    executor: ai-agent
    agent_role: pm
    config:
      role_contract: .claude/commands/dev-pm.md
      tools: read-only
      model_hint: fast        # PM doesn't need the most capable model
```

Three hint levels:

| Hint | Meaning | Resolution example (Anthropic) | Resolution example (OpenAI) |
|------|---------|-------------------------------|----------------------------|
| `fast` | Optimize for speed and cost. Good enough for triage, classification, simple reasoning | `claude-haiku-4-5-20251001` | `gpt-4o-mini` |
| `capable` | Use the most capable model. Complex reasoning, code generation, architectural decisions | `claude-opus-4-6` | `gpt-4o` |
| `default` (or omitted) | Use the deployment default (`LLM_MODEL`) | Whatever user configured | Whatever user configured |

Only `ai-agent` steps use model hints. `cli-agent`, `script`, `human`, `integration` executors ignore them.

### 2. Model tracking through the stack

Three types need a `model` field added:

```typescript
// 1. LlmCompletionResponse — actual model used by the provider
//    (Vercel AI SDK ai.response.model pattern)
export interface LlmCompletionResponse {
  content: LlmContentBlock[];
  tokensUsed: number;
  costCents: number;
  stopReason: string | null;
  model: string;              // NEW — actual model that produced this response
}

// 2. StepExecutionResult — propagates model up to harness
interface StepExecutionResult {
  outputs: Record<string, unknown>;
  tokensUsed?: number;
  costCents?: number;
  confidence?: "high" | "medium" | "low";
  logs?: string[];
  model?: string;             // NEW — which model executed this step
}

// 3. stepRuns table — persisted for learning
model: text("model"),        // NEW — e.g., "claude-sonnet-4-6", "gpt-4o-mini"
```

Each provider implementation returns the **actual** model from the API response, not the requested model string. This follows the Vercel AI SDK `ai.response.model` pattern — the actual model may differ from requested if the provider aliases or auto-upgrades.

**Provider-specific implementation:**
- **Anthropic:** `model: response.model` (Anthropic API returns the model in the response object)
- **OpenAI:** `model: response.model` (OpenAI API returns the model in the response object)
- **OpenAI error path** (no choice returned, line ~360 in llm.ts): `model: request.model || configuredModel!` as fallback
- **Ollama:** inherits from OpenAI provider, same pattern

**Flow:** Provider → `LlmCompletionResponse.model` → Claude/CLI adapter → `StepExecutionResult.model` → `heartbeat.ts` → `stepRuns.model` column. The `heartbeat.ts` records model onto the `stepRuns` row alongside `tokensUsed`, `costCents`, and `confidenceLevel` in both the advance UPDATE path (~line 365) and the pause UPDATE path (~line 420).

**Self calls:** `selfConverse()` in `self.ts` (line 276) and `consult_role` in `self-delegation.ts` (line 354) both call `createCompletion()` without a model parameter. These use the deployment default. Self consultations do not create stepRun rows and are excluded from recommendation analysis — the Self is the executive function, not a measurable specialist.

### 3. Hint resolution

```typescript
// model-routing.ts
import { getConfiguredModel, getProviderName } from "./llm.js";

const MODEL_FAMILIES: Record<string, Record<string, string>> = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    capable: "claude-opus-4-6",
  },
  openai: {
    fast: "gpt-4o-mini",
    capable: "gpt-4o",
  },
  // Ollama: no family mapping — all hints resolve to default
  // because we can't assume which models the user has pulled.
};

export function resolveModel(hint: string | undefined): string {
  const defaultModel = getConfiguredModel();
  if (!hint || hint === "default") return defaultModel;

  const provider = getProviderName();
  return MODEL_FAMILIES[provider]?.[hint] || defaultModel;
}
```

**Adapter integration:** The Claude adapter (the only adapter that calls `createCompletion()`) changes one line:

```typescript
// Before (Brief 032):
const model = getConfiguredModel();

// After (Brief 033):
const model = resolveModel(step.config?.model_hint);
```

For the Self's `consult_role` tool (which calls `createCompletion()` directly without the harness): no change needed. The Self always uses the deployment default — it's the executive function, not a specialist. If a role being consulted has a model hint on its standalone YAML, that hint only applies when the role runs through the full harness via delegation, not via inline consultation.

### 4. Recommendation generation (Self learns)

After accumulating data (20+ completed step runs per role with the model recorded), the system can analyze:

```typescript
// model-routing.ts
export interface ModelRecommendation {
  processSlug: string;
  stepId: string;
  currentModel: string;
  suggestedModel: string;
  currentApprovalRate: number;
  suggestedApprovalRate: number | null;  // null if no data for suggested model
  currentAvgCostCents: number;
  suggestedAvgCostCents: number | null;
  rationale: string;
}

export async function generateModelRecommendations(
  db: DatabaseInstance
): Promise<ModelRecommendation[]> {
  // Query: stepRuns JOIN processRuns ON processRunId JOIN harnessDecisions ON stepRunId
  // Group by: (processRuns.processId, stepRuns.stepId, stepRuns.model)
  // Filter: stepRuns.status = 'approved' OR 'rejected', stepRuns.model IS NOT NULL
  //
  // For each (processId, stepId) group with 20+ completed runs:
  // 1. Calculate per-model stats: approval rate, correction rate, avg costCents
  // 2. Identify current model (most recent 5 runs — what's being used now)
  // 3. Compare against alternatives:
  //    - If a cheaper model (lower MODEL_PRICING) has comparable quality
  //      (within 5% approval rate): recommend downgrade with cost savings
  //    - If current model has low quality (<80% approval rate) and a more
  //      capable model exists: recommend upgrade with quality improvement
  // 4. Skip if only one model has been used (no comparison possible)
  // Returns recommendations for human review — advisory only
}
```

This function is advisory only — it produces `ModelRecommendation[]` that the Self can surface conversationally. No auto-switching. The human approves or declines.

**Note:** Applying recommendations is NOT in scope for this brief. This brief records the data and generates recommendations. A future brief handles the "human approves and system applies" flow (updating YAML or a runtime override table).

### 5. Process loader validation

The process loader validates `model_hint` during YAML loading:

```typescript
const VALID_HINTS = ["fast", "capable", "default"];

// In step validation:
if (step.config?.model_hint && !VALID_HINTS.includes(step.config.model_hint)) {
  errors.push(`Step "${step.id}": invalid model_hint "${step.config.model_hint}". Valid: ${VALID_HINTS.join(", ")}`);
}
```

Only validated on `ai-agent` steps. Other executor types ignore it silently.

## User Experience

- **Jobs affected:** Orient (model routing recommendations surface via Self), Decide (approve model changes — future brief)
- **Primitives involved:** Daily Brief (recommendations can surface here)
- **Process-owner perspective:** The user initially configures one model. Ditto records which model runs each step. Over time, `generateModelRecommendations()` identifies opportunities to use cheaper/faster models without quality loss. The Self presents these conversationally. No action required until the user is ready.
- **Interaction states:** N/A — recommendations are conversational (via Self), not UI primitives
- **Designer input:** Not invoked — no user-facing UI changes. Recommendations are text via the Self.

## Acceptance Criteria

1. [ ] `stepRuns` table has `model` text field recording which model executed each step
2. [ ] `LlmCompletionResponse` includes `model` field; all three providers (Anthropic, OpenAI, Ollama) populate it
3. [ ] `StepExecutionResult` includes optional `model` field
4. [ ] Process YAML supports optional `config.model_hint` field (`fast`, `capable`, `default`)
5. [ ] Process loader validates `model_hint` values; rejects invalid hints with clear error
6. [ ] `resolveModel()` correctly maps hints to provider-specific models for Anthropic, OpenAI, Ollama
7. [ ] Steps without `model_hint` use the deployment default (backward compatible)
8. [ ] Step-execution harness handler records model from execution result onto stepRun row
9. [ ] `generateModelRecommendations()` produces recommendations from accumulated data (20+ runs threshold)
10. [ ] Recommendations include: process slug, step ID, current model, suggested model, quality comparison, cost comparison, rationale
11. [ ] No auto-switching — recommendations are advisory only, returned as data
12. [ ] `pnpm test` passes, `pnpm run type-check` produces 0 errors

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Model hints are truly optional (no breakage for existing processes)
   - `LlmCompletionResponse.model` populated by all providers (not just Anthropic)
   - Model recorded on every step run (not just hinted ones)
   - Recommendation logic is sound (threshold-based, evidence-driven)
   - No auto-switching anywhere (human approves all changes)
   - Trust data integrity preserved (model field doesn't break existing trust computation)
   - Hint resolution is extensible (new providers can add model families)
   - Self consultation path unchanged (uses default, not hints)
   - CLI adapter reports model in StepExecutionResult
   - heartbeat.ts records model in both advance and pause UPDATE paths
   - test-utils createTables SQL includes model field

## Smoke Test

```bash
# 1. Run with model hints
# Edit dev-pm-standalone.yaml to add config.model_hint: fast
pnpm run dev-bot

# 2. Send: "what should we work on?"
# Expected: PM executes on the fast model (e.g., Haiku)
# Expected: stepRun record includes model: "claude-haiku-4-5-20251001"

# 3. Check model tracking:
# Query stepRuns table — every recent run should have model populated
# (even ones without model_hint should show the deployment default)

# 4. Verify backward compatibility:
# Process without model_hint uses deployment default
pnpm cli start --process dev-pipeline
# Expected: uses LLM_MODEL from env, recorded on stepRun

# 5. Test recommendation generation (requires 20+ runs):
# After accumulating data, call generateModelRecommendations()
# Expected: array of recommendations (may be empty if insufficient data)
```

## After Completion

1. Update `docs/state.md` — model routing intelligence active
2. Update `docs/roadmap.md` — Cognitive Architecture section: model routing items as done
3. Update `docs/architecture.md` — Layer 2: model hint resolution, Layer 5: model tracking in feedback
4. Update ADR-012 — add model routing cost implications (RouteLLM economics, hint-based resolution)
5. Retrospective: implementation complexity, test coverage, any surprises
