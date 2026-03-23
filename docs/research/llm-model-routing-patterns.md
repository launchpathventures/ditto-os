# Research: LLM Model Routing Patterns

**Date:** 2026-03-23
**Trigger:** Need to design model routing for Ditto's engine — per-step model selection, capability hints, multi-provider support
**Consumers:** Dev Architect (ADR for model routing), Dev Builder (engine implementation)

---

## Executive Summary

Model routing across AI frameworks follows five distinct patterns, from simple string-based registries to learned adaptive routing. No single framework covers all five of Ditto's requirements. Vercel AI SDK provides per-call model selection + provider registry + custom provider aliases. LiteLLM Router provides operational routing (load balancing, fallback, cost optimization). RouteLLM provides open-source learned routing (binary strong/weak classification). NotDiamond/OpenRouter provide ML-based multi-model routing but are cloud-only.

**Key finding:** Capability-hint resolution (mapping "fast"/"reasoning" to concrete models) is only addressed by Vercel AI SDK's `customProvider` aliasing. No framework has a first-class "hint taxonomy" — it's always user-defined aliases. Process-level learned routing from human feedback (as opposed to per-prompt classification) is not done by any existing framework.

---

## Pattern 1: Step-Level Model Selection

How frameworks let process/workflow definitions specify which model to use per step.

### Vercel AI SDK (`vercel/ai`)
- **File:** `packages/ai/src/registry/provider-registry.ts`
- **Pattern:** Provider Registry with string IDs. Models resolved via `registry.languageModel('openai:gpt-4o')` — splits on separator (default `:`) into provider ID + model ID.
- **Per-step override:** Yes. Each `generateText()` / `streamText()` call takes its own `model` parameter. No global state.
- **Code pattern:**
  ```ts
  // Each step picks its own model
  const plan = await generateText({ model: registry.languageModel('anthropic:claude-sonnet-4-5'), prompt });
  const code = await generateText({ model: registry.languageModel('openai:gpt-4o'), prompt: plan.text });
  ```
- **Tracks model used:** Yes, via OpenTelemetry spans — `ai.model.id`, `ai.model.provider`, `ai.response.model` (actual model, may differ from requested if aliased).

### LangChain / LangGraph (`langchain-ai/langchain`, `langchain-ai/langgraph`)
- **File:** `libs/core/langchain_core/runnables/configurable.py`, `libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py`
- **Pattern:** Two mechanisms:
  1. **`configurable_alternatives`** — declare alternative runnables (including models) swappable at runtime via config dict.
  2. **Dynamic callable model** — `create_react_agent(model=callable)` where callable receives `(state, runtime)` and returns a model instance.
- **Per-step override:** Yes. Each node in a LangGraph graph can use a different model. The `configurable_alternatives` pattern lets you swap at invocation time via `chain.with_config(configurable={"model": "gpt4"})`.
- **Tracks model used:** Yes, via LangSmith tracing. Each run records the model, tokens, latency. Run metadata includes `ls_model_name`.

### CrewAI (`crewAIInc/crewAI`)
- **File:** `lib/crewai/src/crewai/agent/core.py`, `lib/crewai/src/crewai/llm.py`
- **Pattern:** Per-agent model assignment. Each `Agent` has an `llm` field (string like `"anthropic/claude-3"` or `BaseLLM` instance) plus a separate `function_calling_llm` for tool calls.
- **Per-step override:** Per-agent, not per-step. Different agents in a crew use different models, but a single agent uses one model throughout. The `create_llm()` factory parses `provider/model` strings, tries native SDK first, falls back to LiteLLM.
- **Tracks model used:** Via LiteLLM's callback system when using LiteLLM backend. Native providers track via their own logging.

### AutoGen (`microsoft/autogen`)
- **File:** `python/packages/autogen-core/src/autogen_core/models/_model_client.py`
- **Pattern:** `model_client` parameter per agent. Each `AssistantAgent` gets its own `ChatCompletionClient` instance.
  ```python
  agent1 = AssistantAgent(name="planner", model_client=OpenAIChatCompletionClient(model="gpt-4"))
  agent2 = AssistantAgent(name="coder", model_client=OpenAIChatCompletionClient(model="gpt-3.5-turbo"))
  ```
- **Per-step override:** Per-agent. Different agents use different clients.
- **Tracks model used:** Yes. `ChatCompletionClient` maintains `_total_usage` and `_actual_usage` (prompt + completion tokens). Also logs `LLMCall` events via Python's `EVENT_LOGGER_NAME`.
- **Model capability metadata:** `ModelInfo` TypedDict records capabilities: `vision`, `function_calling`, `json_output`, `family`, `structured_output`. Used for feature detection, not routing.

### Mastra (`mastra-ai/mastra`)
- **File:** `packages/core/src/llm/model/gateway-resolver.ts`, `examples/agent/src/mastra/agents/index.ts`
- **Pattern:** Three model specification modes:
  1. Static: `model: openai('gpt-4o-mini')`
  2. String: `model: 'openai/gpt-4o-mini'` (parsed by `parseModelRouterId`)
  3. **Dynamic callable:** `model: ({ requestContext }) => { ... return openai('gpt-4o'); }` — runtime model selection based on request context.
- **Per-step override:** Yes, per-agent with dynamic callable support for runtime decisions.
- **Tracks model used:** Inherits from Vercel AI SDK telemetry (Mastra builds on AI SDK).

---

## Pattern 2: Hint/Capability-Based Resolution

How frameworks map abstract capability needs to concrete model IDs.

### Vercel AI SDK — Custom Provider Aliases
- **File:** `content/docs/03-ai-sdk-core/45-provider-management.mdx`
- **Pattern:** `customProvider` creates named aliases that map capability hints to concrete models:
  ```ts
  const anthropic = customProvider({
    languageModels: {
      fast: anthropic('claude-haiku-4-5'),
      writing: anthropic('claude-sonnet-4-5'),
      reasoning: wrapLanguageModel({
        model: anthropic('claude-sonnet-4-5'),
        middleware: defaultSettingsMiddleware({
          settings: { providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 32000 } } } },
        }),
      }),
    },
    fallbackProvider: anthropic,
  });
  // Usage: registry.languageModel('anthropic > reasoning')
  ```
- **Key insight:** The hint taxonomy is user-defined, not framework-defined. Users create their own `fast`, `reasoning`, `writing` aliases. The framework provides the mechanism (customProvider + registry) but not the vocabulary.

### AutoGen — ModelInfo for Feature Detection
- **Pattern:** `ModelInfo` TypedDict with `family`, `vision`, `function_calling`, `json_output`, `structured_output`. Used for capability checking (can this model do X?) rather than routing (which model should I use for X?).
- Static classification methods: `is_claude()`, `is_gemini()`, `is_openai()`.
- Not used for routing decisions — just for feature gating.

### OpenRouter — Model Variants as Capability Hints
- **Pattern:** Append suffixes to model IDs: `:free`, `:extended`, `:exacto` (tool-calling optimized), `:thinking` (extended reasoning), `:online` (web search), `:nitro` (speed).
- These are more like operational modifiers than capability hints, but `:thinking` and `:exacto` map to capability needs.
- Usage: `model: "anthropic/claude-sonnet-4:thinking"`

### Gap Identified
No framework provides a canonical capability taxonomy. Everyone rolls their own. A standardized set of hints (`fast`, `capable`, `reasoning`, `vision`, `cheap`) mapped to provider-specific models would be valuable. Ditto could define this as part of its process spec.

---

## Pattern 3: Model Tracking

How frameworks record which model produced which output for later analysis.

### Vercel AI SDK — OpenTelemetry Spans
- **File:** `content/docs/03-ai-sdk-core/60-telemetry.mdx`
- Per-call telemetry with: `ai.model.id`, `ai.model.provider`, `ai.response.model` (actual model used), `ai.usage.promptTokens`, `ai.usage.completionTokens`, `ai.response.msToFirstChunk`, `ai.response.msToFinish`.
- Custom metadata attachable: `functionId`, arbitrary key-value pairs.
- **Key detail:** `ai.response.model` captures the *actual* model (may differ from requested if provider aliased or auto-routed).

### LiteLLM — Callback-Based Tracking
- Per-deployment stats: `total_calls`, `fail_calls`, `success_calls`, latency.
- Redis-backed for production (TPM/RPM tracking across instances).
- Cooldown system: deployments exceeding `allowed_fails` get temporarily removed.

### AutoGen — Usage Accounting
- Dual tracking: `_total_usage` (cumulative) and `_actual_usage` (API-reported).
- Event logging via `LLMCall` event type.

### OpenRouter — Response Metadata
- `model` field in API response reveals which model actually handled the request (critical for auto-routing).
- Activity dashboard for per-request model visibility.

### Portkey — Trace IDs
- Config IDs and Trace IDs follow requests through fallback chains.
- Logs show which target (provider+model) ultimately handled each request.

---

## Pattern 4: Learned Routing / Cost Optimization

How frameworks learn optimal model routing from production feedback data.

### RouteLLM — Open-Source Learned Routing (lm-sys/RouteLLM)
- **Pattern:** Open-source framework for cost-effective LLM routing trained on Chatbot Arena preference data. Multiple classifier types: similarity-weighted ranking (SW), matrix factorization (MF), BERT-based, causal LLM classifier.
- **How it works:** Binary router decides per-prompt whether to use a "strong" model or "weak" model based on predicted quality gap. Cost threshold parameter controls the tradeoff.
- **Results:** 85% cost reduction on MT Bench, 45% on MMLU, maintaining 95% of GPT-4 performance. 40% cheaper than commercial routing services.
- **Adaptive:** Trained on existing preference data (Chatbot Arena). Can be retrained on custom data. Not continuously adaptive at runtime.
- **Limitation:** Python-only. Binary routing (strong vs weak) — no multi-model routing. Requires training data. Runtime classification approach differs from Ditto's declarative process-level approach.
- **Ditto context:** Already cited in ADR-012 as provenance for cost-based cascade routing. Validates the economic case for model routing.

### NotDiamond — ML-Based Routing (cloud service)
- **File:** `Not-Diamond/notdiamond-python/notdiamond/toolkit/custom_router.py`
- **Pattern:** Train a custom router on labeled data. `fit()` method takes datasets per provider (prompt + response + score), uploads to NotDiamond's API, returns a `preference_id`.
- **Routing:** `model_select()` API call with the trained `preference_id`. Algorithm is server-side black box.
- **Evaluation:** `eval()` method compares router's selections against all providers on metrics: average score, cost, latency.
- **Adaptive:** Yes, but requires explicit retraining with new data. Not continuous.
- **Limitation:** Core algorithm not open — it's a cloud service.

### OpenRouter Auto — NotDiamond-Powered
- Model ID: `openrouter/auto`. Meta-model evaluates each prompt and routes to one of 33+ candidate models.
- Pricing: pass-through (you pay the rate of whichever model handles it).
- No user-side training or customization visible.

### LiteLLM Router — Operational Optimization
- **Cost-based routing:** Cross-references deployments with internal pricing database, routes to cheapest healthy deployment.
- **Latency-based routing:** Maintains cache of response times, routes to fastest. Configurable TTL and buffer.
- **Semantic auto-routing:** `AutoRouter` uses `SemanticRouter` with embeddings to match user intent to predefined routes. Not learned — routes are static, defined in config.
- **Not adaptive:** Strategies are rule-based (lowest cost, lowest latency, round-robin). No ML or feedback loop.

### Landscape
RouteLLM provides open-source learned routing with strong benchmarks but uses per-prompt binary classification (strong vs weak). NotDiamond extends this to multi-model with custom training but is cloud-only. LiteLLM optimizes for operational metrics (cost, latency), not output quality. Ditto's approach (process-declared hints + feedback-driven recommendations) is distinct from all three — it learns at the process/role level from human feedback, not per-prompt from synthetic benchmarks.

---

## Pattern 5: Multi-Provider Model Families

How frameworks handle the same capability hint across different providers.

### Vercel AI SDK — Provider Registry + Custom Provider (strongest pattern)
- Registry maps provider prefixes to provider instances: `{ anthropic, openai, google }`.
- Custom providers create cross-provider aliases:
  ```ts
  const myProvider = customProvider({
    languageModels: {
      'text-medium': gateway('anthropic/claude-3-5-sonnet-20240620'),
      'text-small': gateway('openai/gpt-5-mini'),
    },
  });
  ```
- The alias layer (`text-medium`, `text-small`) abstracts away the provider. Callers use `myProvider.languageModel('text-medium')` without knowing it's Anthropic.
- **Provider switching:** Change one line in the alias definition. All callers unaffected.

### LiteLLM — Unified Interface with Provider Prefixes
- All providers accessed via `litellm.completion(model="anthropic/claude-3-sonnet")`.
- Provider detected from prefix. 100+ providers supported.
- Router groups: multiple deployments of "the same" model grouped under one name (e.g., `gpt-3.5-turbo` backed by both Azure and OpenAI deployments with load balancing).

### CrewAI — LiteLLM Fallback
- Native providers (OpenAI, Anthropic, Google, Bedrock) tried first via pattern matching on model string.
- Falls back to LiteLLM for everything else, inheriting its 100+ provider support.
- `_infer_provider_from_model()` maps model names to providers using hardcoded constants.

### Portkey Gateway — Target-Based Multi-Provider
- **File:** `src/services/conditionalRouter.ts`
- Targets define provider + model pairs. Strategy (fallback, loadbalance, conditional) routes across them.
- Conditional routing based on metadata: `{ 'metadata.user_plan': { $eq: 'paid' } }` routes to different providers.
- Weight-based load balancing across providers: 80% to cheap model, 20% to premium.
- Supports nested strategies (a fallback target can itself be a load-balanced group).

### Mastra — Vercel AI SDK Providers
- Builds on Vercel AI SDK's provider system. `parseModelRouterId` splits `gateway/provider/model` strings.
- Supports OpenAI-compatible endpoints via `createOpenAICompatible()` for self-hosted models.

---

## Synthesis: Patterns Applicable to Ditto's Requirements

### Requirement Coverage Map

| Ditto Requirement | Applicable Patterns | Source Projects |
|---|---|---|
| Per-step model selection in process definitions | Model param per call; dynamic callable model | Vercel AI SDK, LangGraph, Mastra |
| Capability hints ("fast", "capable") | User-defined alias mapping; model variant suffixes | Vercel AI SDK customProvider, OpenRouter suffixes |
| Single-provider model families (Brief 033 scope) | Model family resolution within a provider | All frameworks support this implicitly; Vercel AI SDK's alias layer is most explicit |
| Model tracking per output | OpenTelemetry spans; callback-based stats; dual usage accounting | Vercel AI SDK, LiteLLM, AutoGen |
| Learned routing from feedback | Binary strong/weak classification; ML-based multi-model; operational metrics | RouteLLM, NotDiamond, LiteLLM Router |
| Fallback/resilience | Cooldown on failures; fallback chains; conditional routing | LiteLLM Router, Portkey |

### Gaps Where No Existing Solution Fits

1. **Process-level learned routing from human feedback** — All learned routing operates per-prompt (RouteLLM, NotDiamond). No framework learns at the process/role level from accumulated human approval/edit/reject signals. Ditto's trust system already has this data; applying it to model selection is original.
2. **Canonical hint vocabulary** — No framework defines a standard set of capability hints. Everyone rolls their own aliases.
3. **Single-provider model family resolution** — Frameworks either ignore this (all models are explicit) or go full multi-provider. The middle ground (routing within one provider's model family based on hints) is not a solved pattern.

---

## Source Index

| Project | Key Files | Per-Step Model | Tracks Model | Adaptive Routing |
|---|---|---|---|---|
| Vercel AI SDK | `packages/ai/src/registry/provider-registry.ts` | Yes (per-call) | Yes (OpenTelemetry) | No |
| LangChain | `libs/core/langchain_core/runnables/configurable.py` | Yes (configurable_alternatives) | Yes (LangSmith) | No |
| LangGraph | `libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py` | Yes (dynamic callable) | Yes (LangSmith) | No |
| CrewAI | `lib/crewai/src/crewai/agent/core.py`, `lib/crewai/src/crewai/llm.py` | Per-agent only | Via LiteLLM callbacks | No |
| AutoGen | `python/.../models/_model_client.py` | Per-agent only | Yes (usage + event log) | No |
| Mastra | `packages/core/src/llm/model/gateway-resolver.ts` | Yes (dynamic callable) | Via AI SDK telemetry | No |
| LiteLLM | `litellm/router.py`, `litellm/router_strategy/auto_router/auto_router.py` | N/A (infra layer) | Yes (Redis-backed stats) | Cost/latency only |
| RouteLLM | `lm-sys/RouteLLM` | N/A (routing layer) | Via classifier | Yes (open-source, binary strong/weak) |
| NotDiamond | `notdiamond/toolkit/custom_router.py` | N/A (routing service) | Server-side | Yes (ML, cloud-only) |
| OpenRouter | API: `model: "openrouter/auto"` | N/A (routing service) | Yes (response.model) | Yes (via NotDiamond) |
| Portkey | `src/services/conditionalRouter.ts` | Via conditional routing | Yes (trace IDs) | No |
