# Insight 170 — Token Efficiency Optimizations

**Status:** Implemented
**Date:** 2026-04-09
**Source:** Engine-wide analysis of token consumption patterns

## Discovery

Deep analysis of the engine revealed 20-30% of input tokens per LLM call were avoidable. The primary waste sources:

1. **Static prompts re-sent without caching** — cognitive core + tool definitions sent fresh every turn
2. **Unconditional context injection** — delegation guidance, onboarding, and full process instructions loaded regardless of user state or conversation stage
3. **Verbose tool schemas** — 18 tools with 150-300 char descriptions each (~900 tokens/call)
4. **Thinking budget overallocation** — 8192 tokens for all tasks including simple chat
5. **Memory metadata overhead** — confidence/reinforcement scores on every memory
6. **Tool result bloat** — full delegation output injected as context for next turn
7. **Session history accumulation** — no summarization of older turns
8. **Cognitive framework overlap** — self.md restating core.md principles

## Optimizations Implemented

### 1. Anthropic Prompt Caching (`cache_control` breakpoints)
- Added `cacheBreakpoints` to `LlmCompletionRequest`
- `buildAnthropicSystemContent()` splits system prompt at breakpoints with `cache_control: { type: "ephemeral" }`
- Self conversation marks cognitive framework end as cache breakpoint
- **Impact:** ~40-60% input cost reduction on cache hits (static prefix cached)

### 2. Adaptive Thinking Budget
- `THINKING_BUDGET_BY_PURPOSE` maps model purpose → thinking tokens
- conversation: 2048, classification: 0, analysis: 4096, extraction: 1024
- **Impact:** 2-4K fewer output tokens per simple conversation turn

### 3. Conditional Delegation Guidance
- Compact (~150 tokens) for established users (completeness > 0.5)
- Full (~800 tokens) for new users learning the workspace
- Async-specific compact for inbound surface
- **Impact:** ~400-600 tokens saved per established user turn

### 4. Minified Tool Descriptions
- All 18 tool descriptions reduced to ≤100 chars (from 150-300)
- Property-level descriptions trimmed to essentials
- Behavioral guidance moved to delegation guidance section
- **Impact:** ~300-400 tokens saved per Self LLM call

### 5. Compact Memory Rendering
- Type abbreviations: correction→c, preference→p, context→x, skill→s, solution→sol
- Metadata (confidence, reinforcement) only shown for low-confidence (<0.7) memories
- **Impact:** ~100-200 tokens saved per step with 20+ memories

### 6. Onboarding Gate
- Onboarding guidance skipped for established users (completeness > 0.5)
- **Impact:** ~300 tokens saved per established user turn

### 7. Overflow Priority Fix
- Old: memories dropped first (most valuable personalization)
- New: onboarding → delegation → memories (least to most valuable)
- **Impact:** Better quality under budget pressure

### 8. Tool Result Truncation
- Large tool results capped at 2000 chars (~500 tokens)
- Full output already emitted as content blocks to the user
- Truncation marker: `[truncated, N chars total]`
- **Impact:** ~500-2000 tokens saved per delegation turn

### 9. Stage-Gated Front Door Instructions
- `inferConversationStage()` detects stage from session state
- Only current + next stage instructions loaded (vs all 5)
- `ConversationStage` type exported for callers
- **Impact:** ~600-800 tokens saved per front door call

### 10. Session History Summarization
- Conversations > 6 turns: older turns summarized extractively
- Summary: first sentence of each turn, joined as compact abstract
- Recent 6 turns kept verbatim within remaining budget
- **Impact:** ~500-1000 tokens saved after turn 5

### 11. Cognitive Framework Deduplication
- Removed self.md sections that restate core.md principles:
  - "Three jobs" preamble (covered by consultative protocol)
  - "Language" table (covered by "Domain language over technical language")
  - "When to Speak vs Silent" (covered by "Silence over noise" heuristic)
- **Impact:** ~200-300 tokens saved per Self call

## Combined Estimate

**30-50% total token cost reduction** across all surfaces, with prompt caching as the single biggest lever.

## What Was NOT Cut

- Cognitive core (800 tokens) — judgment that prevents costly mistakes
- House Values — non-negotiable behavioral guardrails
- Metacognitive Checks — prevents assumption-driven errors
- Memory content (not metadata) — personalization that drives quality
- User model — shapes every response

## Architecture Principle

Token efficiency is a first-class concern, not an afterthought. Every context section should justify its token cost with measurable quality impact. When in doubt, gate on user state rather than including unconditionally.
