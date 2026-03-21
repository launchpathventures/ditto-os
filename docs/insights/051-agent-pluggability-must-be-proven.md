# Insight-051: Agent Pluggability Must Be Proven, Not Claimed

**Date:** 2026-03-21
**Trigger:** External review. The README says "agents are pluggable" but only one adapter (Claude) exists for LLM execution. The `cli.ts` adapter spawns `claude -p`. The `claude.ts` adapter calls the Anthropic API. The `script.ts` adapter runs deterministic scripts. No non-Claude LLM has been tested.
**Layers affected:** L2 Agent
**Status:** active

## The Insight

"Agents are pluggable" is an architectural claim that requires validation. Adding one alternative LLM adapter (e.g., OpenAI, Ollama) would:

1. **Stress-test the adapter abstraction.** Does the `AdapterContext` interface work for non-Claude models? Are there Claude-specific assumptions baked into the harness?
2. **Surface whether the 10 role-based system prompts are structurally meaningful.** If the same prompts produce comparable quality from a different model, the role system is doing real structural work. If quality degrades significantly, the prompts may be Claude-optimised rather than role-optimised.
3. **Validate the model routing design (ADR-012).** Trust-modulated model routing assumes models are interchangeable at different quality/cost points. One alternative adapter tests this assumption.

This doesn't require supporting five providers — just one alternative that stress-tests the abstraction. Ollama (local, free) or OpenAI (different prompt conventions) would both serve.

## Implications

- A second adapter is a small code investment (~200 lines) with high validation value
- Should be done before ADR-012's model routing design is built
- Results inform whether role-based prompts need provider-specific variants

## Where It Should Land

- **roadmap.md** — add as a validation task before Phase 7
- Brief scope: one adapter, one process run, compare outputs
