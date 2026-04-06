# Brief 096: Multi-Provider Purpose-Based Model Routing

**Date:** 2026-04-06
**Status:** draft
**Depends on:** Brief 093 (Front Door Chat API — first consumer of purpose routing)
**Unlocks:** All future engine work routes by purpose instead of flat model. Front door uses best conversational model.

## Goal

- **Roadmap phase:** Phase 14: Network Agent (unblocks front door quality)
- **Capabilities:** Simultaneous multi-provider loading (Anthropic + OpenAI + Google), purpose-based routing (`conversation`/`writing`/`analysis`/`classification`/`extraction`), Google Gemini provider, Ditto-managed keys

## Context

The front door chat uses whatever single `LLM_MODEL` is configured — the same model that handles intake classification and memory extraction. This means either the front door gets a cheap model (bad first impression) or internal routing gets an expensive one (wasteful). ADR-026 designs purpose-based routing where model quality matches user proximity (Insight-157). Ditto manages all provider keys internally (Insight-158).

## Non-Goals

- **Migrating all existing callers.** This brief makes `purpose` available. Existing `model:` callers continue to work unchanged. Migration is a follow-up.
- **Per-purpose learned routing.** The `purpose` column on `stepRuns` and `generateModelRecommendations()` extension is Phase 2.
- **Removing `LLM_PROVIDER`/`LLM_MODEL`.** Backward compatible — old env vars still work as fallback. Removal is Phase 3.
- **Streaming via purpose.** `createStreamingCompletion()` gets purpose support in a follow-up.
- **OpenRouter or other aggregators.** Direct provider SDKs only for now.

## Inputs

1. `docs/adrs/026-multi-provider-purpose-routing.md` — The architectural decision
2. `docs/insights/157-layer-aware-model-routing.md` — Layer-purpose-model mapping
3. `docs/insights/158-ditto-provides-the-llm.md` — Ditto manages keys
4. `src/engine/llm.ts` — Current single-provider abstraction
5. `src/engine/model-routing.ts` — Current hint-based routing
6. `src/engine/llm-mock.ts` — Mock mode for testing

## Constraints

- **Backward compatible.** Existing `model:` parameter, `LLM_PROVIDER`/`LLM_MODEL` env vars, and `model_hint` in process YAML all continue to work. Nothing breaks.
- **At least one provider must be configured.** If zero keys are set and `MOCK_LLM` is not true, `initLlm()` throws with a clear setup message listing all three options.
- **Mock mode bypasses routing entirely.** `MOCK_LLM=true` still works as before — no provider keys needed.
- **Google provider uses `@google/generative-ai` SDK.** Same implementation pattern as Anthropic/OpenAI providers.
- **Routing table is code, not config.** The purpose→provider+model mapping is a TypeScript constant, not a database table or YAML file. Updated when new models release.
- **No new database tables.** This brief is pure engine code.
- **Ollama continues to work.** `LLM_PROVIDER=ollama` remains as a single-provider override. Ollama does not participate in purpose routing (user-dependent models). When set, all purposes route to the configured `LLM_MODEL`.
- **Google provider MVP is completion + tool calling.** System prompt handling (`systemInstruction`) and function declarations must work. Streaming is deferred.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Multi-provider abstraction | Vercel AI SDK `customProvider` | pattern | Simultaneous backends, not just aliases |
| Purpose-based routing | RouteLLM (UC Berkeley) | pattern | Route by intent, not per-query difficulty |
| Preference list fallback | DNS resolution, LB failover | pattern | First available provider wins |
| Google Generative AI SDK | `@google/generative-ai` npm | depend | Official Google SDK for Gemini models |
| Ditto-native types | Existing `llm.ts` | existing | No SDK types leak beyond providers |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/llm.ts` | Modify: (1) Add `GoogleProvider` class implementing `LlmProvider` (completion + tool calling + system prompt via `systemInstruction` + cost tracking). (2) Add Google models to `MODEL_PRICING` (gemini-2.5-pro, gemini-2.5-flash). (3) Change `initLlm()` to load ALL providers with configured keys (not just one). (4) Add `purpose?: ModelPurpose` to `LlmCompletionRequest`. (5) Route `createCompletion()` to best provider+model based on purpose. (6) Keep backward compat: `model:` override, `LLM_PROVIDER`/`LLM_MODEL` fallback, `OllamaProvider` unchanged. |
| `src/engine/model-routing.ts` | Modify: (1) Add `ModelPurpose` type and `PURPOSE_ROUTING` table. (2) Add `resolveProviderForPurpose(purpose)` → `{ provider, model }`. (3) Map old hints to purposes: `fast`→`classification`, `capable`→`analysis`, `default`→`analysis`. (4) Keep `resolveModel()` working (backward compat). |
| `src/engine/llm.ts` (tests in existing test file) | Modify: Add tests for multi-provider loading, purpose routing, fallback behaviour, Google provider. |
| `src/engine/model-routing.ts` (tests in existing test file) | Modify: Add tests for purpose resolution, hint-to-purpose mapping, preference list fallback. |
| `src/engine/network-chat.ts` | Modify: Add `purpose: "conversation"` to the `createCompletion()` call (one-line change — first consumer). |
| `.env.example` | Modify: Add `GOOGLE_AI_API_KEY`, update comments to reflect multi-provider model, remove single-provider guidance. |
| `package.json` | Modify: Add `@google/generative-ai` dependency. |

## User Experience

- **Jobs affected:** None directly — this is engine infrastructure. Users experience better front door conversation quality and lower costs on internal operations.
- **Designer input:** Not invoked — no UI changes.

## Acceptance Criteria

1. [ ] `initLlm()` loads all providers with configured API keys. With `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` set, both providers are available.
2. [ ] `initLlm()` works with only one provider configured (e.g., only `ANTHROPIC_API_KEY`).
3. [ ] `initLlm()` throws a clear error when zero providers are configured and `MOCK_LLM` is not true.
4. [ ] `createCompletion({ purpose: "conversation", ... })` routes to the first available provider in the `conversation` preference list.
5. [ ] `createCompletion({ purpose: "classification", ... })` routes to a fast/cheap model (Haiku, 4o-mini, or Flash).
6. [ ] `createCompletion({ model: "specific-model", ... })` overrides purpose routing and uses the specified model directly (backward compat).
7. [ ] `createCompletion({ ... })` with no `purpose` and no `model` falls back to the `analysis` purpose (reasonable default).
8. [ ] `LLM_PROVIDER=anthropic` + `LLM_MODEL=claude-sonnet-4-6` still work as fallback when no purpose is specified (backward compat for existing callers).
9. [ ] `GoogleProvider` class handles text completion with `systemInstruction` for system prompts, returns `LlmCompletionResponse` with correct token count and cost.
10. [ ] `GoogleProvider` supports tool calling via `functionDeclarations` (Ditto `LlmToolDefinition` → Google format translation).
11. [ ] `MODEL_PRICING` includes Google models (`gemini-2.5-pro`, `gemini-2.5-flash`) with correct input/output token costs.
12. [ ] `MOCK_LLM=true` bypasses all routing and returns mock responses (unchanged behaviour).
13. [ ] `LLM_PROVIDER=ollama` still works as a single-provider override — all purposes route to the configured `LLM_MODEL` (backward compat).
14. [ ] `resolveModel("fast")` still works and returns the fast model for the first available provider (backward compat).
15. [ ] `resolveProviderForPurpose("conversation")` returns the best available provider+model, falling back through the preference list if top choice is unavailable.
16. [ ] The front door chat (`network-chat.ts`) uses `purpose: "conversation"` in its `createCompletion()` call.
17. [ ] `.env.example` documents all three provider keys with clear multi-provider guidance.
18. [ ] `@google/generative-ai` is added to `package.json` dependencies.
19. [ ] `docs/architecture.md` updated with the layer-purpose-model mapping table from Insight-157.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/026-multi-provider-purpose-routing.md`
2. Review agent checks: Is the routing table correct (best models per purpose)? Is backward compatibility truly preserved? Is the Google provider implementation consistent with Anthropic/OpenAI patterns? Is the fallback behaviour sound? Are security implications of multi-key storage addressed?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# === Multi-provider loading ===

# Set both Anthropic and OpenAI keys
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...

pnpm dev

# Front door chat should use Anthropic Sonnet (conversation purpose)
curl -X POST http://localhost:3000/api/v1/network/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": null, "context": "front-door"}'
# Expect: High-quality Alex response (Sonnet-level conversation)

# === Single provider fallback ===

# Only OpenAI
unset ANTHROPIC_API_KEY
export OPENAI_API_KEY=sk-...

# Restart dev server
pnpm dev

# Should still work — falls back to OpenAI for all purposes
curl -X POST http://localhost:3000/api/v1/network/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "sessionId": null, "context": "front-door"}'
# Expect: Response from GPT-4o (conversation purpose, OpenAI fallback)

# === Mock mode ===
export MOCK_LLM=true
# Should work without any API keys (existing behaviour unchanged)
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/architecture.md` — add the layer-purpose-model mapping table
3. Follow-up: migrate all `model: resolveModel(hint)` callers to `purpose: "..."`
4. Follow-up: add `purpose` column to `stepRuns` for learned routing
