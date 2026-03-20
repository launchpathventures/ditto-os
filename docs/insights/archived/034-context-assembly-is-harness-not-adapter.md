# Insight-034: Context Assembly Belongs in the Harness, Not the Adapter

**Date:** 2026-03-20
**Trigger:** Human feedback during context management research — "mindful of not building agent os just around claude but being open to any model"
**Layers affected:** L2 Agent, L3 Harness
**Status:** absorbed into ADR-012

## The Insight

Context assembly (what goes into the prompt, how it's ordered, how it's budgeted) must live in the harness layer, not in the adapter. The adapter's job is format translation — mapping the assembled context to the model's API format. The harness's job is context engineering — deciding what information the agent needs.

Currently Agent OS splits this responsibility: `memory-assembly.ts` (harness) assembles memory, but `claude.ts` (adapter) composes the system prompt and decides tool inclusion. This couples context decisions to Claude's API format.

If Agent OS supports multiple models (Claude, GPT, Gemini, open-source, scripts), each adapter would need to duplicate context assembly logic — or worse, each would make different context decisions, producing inconsistent agent behaviour across models.

The fix: the harness assembles a **model-agnostic context object** (identity, memories, tools, task content, instructions). Each adapter maps this to its model's format (system prompt composition, tool schema format, caching strategy). Prompt caching becomes an adapter-level optimisation, not a harness-level concern.

## Implications

**For the adapter pattern (L2):** The adapter interface expands from `invoke(prompt)` to `invoke(contextObject)` where the context object is structured and model-agnostic. Each adapter translates: Anthropic uses `cache_control` + `tool_use`, OpenAI uses function calling + automatic prefix caching, a script adapter ignores most of it.

**For the harness pipeline (L3):** Memory assembly, tool resolution, and context budgeting all live in the harness. The adapter receives the assembled context and only handles format translation and model-specific optimisations.

**For model routing (L2):** When a process step is assigned to a specific model (or the harness selects a model), the context object is the same — only the adapter changes. This makes model routing a clean swap.

## Where It Should Land

- **Architecture spec (L2):** Adapter interface gains a structured context input (not raw prompt string)
- **Architecture spec (L3):** Harness pipeline owns all context assembly
- **Phase 4 brief:** Refactor adapter interface to receive structured context
