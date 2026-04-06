# ADR-026: Multi-Provider Purpose-Based Model Routing

**Date:** 2026-04-06
**Status:** proposed
**Amends:** None (extends `llm.ts` and `model-routing.ts` patterns)

## Context

### The Problem

`llm.ts` activates ONE provider at startup via `LLM_PROVIDER` env var. All LLM calls go through that single provider. `model-routing.ts` resolves hints (`fast`/`capable`/`default`) within that one provider.

This means:
- The front door conversation (which IS the product experience) uses the same model as intake classification (which is internal routing)
- Ditto can't use Haiku for cheap internal tasks while using Sonnet for user-facing conversation
- No cross-provider routing (can't use Anthropic for conversation quality + OpenAI for cost-optimised classification)
- Users currently configure `LLM_PROVIDER` — but Ditto should manage this internally (Insight-158)

### The Insight (157)

Model quality should match user proximity to the output:

| Layer | Purpose | Model class |
|-------|---------|-------------|
| L6 — Front door, Self, outreach | `conversation`, `writing` | Best available |
| L3 — Metacognitive, quality review | `analysis` | Capable |
| L2 — Research, enrichment | `analysis` | Capable |
| L2 — Classification, routing | `classification` | Fast |
| L5 — Feedback, memory extraction | `extraction` | Fast |

### Forces

| Force | Pulls toward |
|-------|-------------|
| Front door quality = first impression | Best model for conversation |
| Internal routing = cost center | Cheapest model that works |
| Multi-provider resilience | Load all providers simultaneously |
| Simplicity for users | Zero config, Ditto manages keys |
| Simplicity for builders | Single `createCompletion()` call, purpose param |
| Cost control | Route by purpose, not flat rate |
| Learning over time | Track quality per purpose, auto-optimise |

## Decision

### 1. Five purpose classes replace model hints

```typescript
type ModelPurpose =
  | "conversation"  // User-facing dialogue (Self, front door, briefings)
  | "writing"       // Outreach, introductions, content the user's reputation depends on
  | "analysis"      // Research, review, metacognitive check — accuracy matters, voice doesn't
  | "classification" // Routing, categorisation, intent detection — fast and cheap
  | "extraction";   // Structured data extraction from text (feedback, memory, JSON parsing)
```

These map to the architecture layers (Insight-157). Process YAML uses `model_purpose` instead of `model_hint`. Backward compatible: `model_hint: fast` maps to `classification`, `model_hint: capable` maps to `analysis`.

### 2. Multiple providers loaded simultaneously

`llm.ts` initialises ALL providers that have keys configured:

```
ANTHROPIC_API_KEY=sk-ant-...  → AnthropicProvider loaded
OPENAI_API_KEY=sk-...         → OpenAIProvider loaded
GOOGLE_AI_API_KEY=...         → GoogleProvider loaded (new)
```

At least one provider must be configured. The system works with one, two, or all three. No `LLM_PROVIDER` env var — all available providers are loaded.

### 3. Purpose → provider+model routing table

A routing table maps each purpose to the best available provider+model:

```typescript
const PURPOSE_ROUTING: Record<ModelPurpose, ProviderModelPreference[]> = {
  conversation: [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro" },
  ],
  writing: [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro" },
  ],
  analysis: [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-2.5-pro" },
  ],
  classification: [
    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-2.5-flash" },
  ],
  extraction: [
    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-2.5-flash" },
  ],
};
```

Resolution: for each purpose, pick the first provider in the preference list that is loaded. This means if only OpenAI is configured, all purposes route to OpenAI models. If all three are configured, conversation goes to Anthropic (Sonnet), classification goes to Anthropic (Haiku), etc.

### 4. `createCompletion()` gains a `purpose` parameter

```typescript
export async function createCompletion(
  request: LlmCompletionRequest & { purpose?: ModelPurpose },
): Promise<LlmCompletionResponse>
```

- If `purpose` is set: route to the best provider+model for that purpose
- If `purpose` is not set: use `model` field (backward compatible), or fall back to `"analysis"` as default
- If `model` is explicitly set: use that model directly (override, for tests and power users)

Callers migrate from `model: resolveModel(hint)` to `purpose: "classification"`. The `resolveModel()` function remains for backward compatibility but internally maps hints to purposes.

### 5. Google provider added

New `GoogleProvider` class using `@google/generative-ai` SDK. Same pattern as OpenAI/Anthropic providers: implements `LlmProvider` interface, translates Ditto types to/from SDK types, tracks cost.

### 6. Ditto manages all keys

`.env.example` updated:

```
# LLM Providers — Ditto manages these internally
# At least one must be configured. All configured providers are loaded.
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
```

No `LLM_PROVIDER` or `LLM_MODEL` env vars. These are replaced by the routing table. For BYOK/self-hosted, users can override individual keys.

### 7. Learned routing extends to purposes

`generateModelRecommendations()` in `model-routing.ts` evolves:
- Track `purpose` on each `stepRun` (new column)
- Compare quality and cost per purpose across providers
- Recommend provider+model changes per purpose (not just per step)
- Still advisory only — no auto-switching for MVP

## Provenance

| Pattern | Source | What we adapted |
|---------|--------|----------------|
| Provider abstraction with multi-backend | Vercel AI SDK `customProvider` | Multiple providers simultaneously, not just aliases within one |
| Purpose-based routing | RouteLLM (UC Berkeley, 85% cost reduction) | Purpose classes instead of per-query difficulty estimation |
| Preference list fallback | DNS resolution order, load balancer failover | First available provider wins |
| Cost tier tracking | OpenRouter pricing API | Per-model cost tiers for comparison |
| Learned routing | Ditto existing `model-routing.ts` | Extended from per-step to per-purpose |

## Consequences

**What becomes easier:**
- Front door uses the best conversational model automatically — no config
- Internal tasks use cheap models automatically — no per-step hint management
- Adding a new provider is one class + routing table entry
- Cost is optimised by default for every new process
- Resilience: if one provider is down, purposes fall back to next preference

**What becomes harder:**
- More API keys to manage (three providers vs one)
- Routing table needs maintenance when new models release
- Cost tracking spans multiple providers (different billing cycles)
- Testing needs to handle multi-provider scenarios

**What stays the same:**
- `createCompletion()` interface (additive change — `purpose` is optional)
- Process YAML structure (additive — `model_purpose` alongside `model_hint`)
- Test infrastructure (mock mode bypasses routing entirely)
- Existing callers that use `model:` directly continue to work

## Notes and Clarifications

**Ollama:** `OllamaProvider` remains available as a single-provider override via `LLM_PROVIDER=ollama`. It does not participate in purpose routing because the available models are user-dependent. When `LLM_PROVIDER=ollama` is set, all purposes route to the configured `LLM_MODEL` (same as today).

**Tool-use workloads:** Self operations that involve tool-use loops (reading files, executing commands) map to `analysis`. These need a capable model for judgment but not the best conversational voice.

**Runtime failover vs startup detection:** For MVP, "available" means "API key configured at startup." If a provider is configured but experiencing an outage, the call fails and the caller handles the error. Runtime failover (retry with next provider on 5xx) is a future enhancement.

**Routing table intentionally identical for conversation/writing/analysis:** All three map to the same capable models for MVP. As model capabilities are evaluated, `writing` may diverge (e.g., models with better creative output). The table is a code constant — easy to update.

## Security Considerations

Multiple provider API keys in the same environment increases blast radius if the environment is compromised. Mitigations:

- **Key rotation:** All provider keys should be rotatable without service restart (environment variable reload). Deferred to deployment maturity.
- **Scoping:** Use provider-scoped keys where available (e.g., Anthropic workspace keys). Deferred.
- **Network Service keys serve all workspaces** (per ADR-025). A compromised key affects all users. This is the same model as any multi-tenant SaaS (Cursor, Notion AI) and is accepted.
- **No keys in code or git.** Keys only in environment variables / deployment secrets.

## Migration Path

1. **Phase 1 (Brief 096):** Add Google provider. Load all configured providers simultaneously. Add `purpose` parameter. Wire routing table. Update `.env.example`. Backward compatible: existing `model`/`model_hint` still work.
2. **Phase 2 (follow-up):** Migrate all callers from `model: resolveModel(hint)` to `purpose: "..."`. Add `purpose` column to `stepRuns`. Extend `generateModelRecommendations()` for per-purpose tracking.
3. **Phase 3 (follow-up):** Remove `LLM_PROVIDER`/`LLM_MODEL` env vars. Remove `resolveModel()` backward compat. Clean up single-provider code paths.
