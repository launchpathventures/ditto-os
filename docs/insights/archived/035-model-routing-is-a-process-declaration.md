# Insight-035: Model Routing Is a Process Declaration, Not a Runtime Decision

**Date:** 2026-03-20
**Trigger:** Human question during context management research — "in what case would a process orchestration agent hand different steps to different models depending on their strengths?"
**Layers affected:** L1 Process, L2 Agent, L3 Harness
**Status:** absorbed into ADR-012

## The Insight

Different process steps have fundamentally different computational needs. An invoice extraction step needs cheap, fast pattern matching (Haiku). A relationship nurturing step needs deep contextual reasoning (Opus). A code review step needs balanced reasoning (Sonnet). Routing everything through the same model either wastes money on simple tasks or underperforms on complex ones.

The process definition is the natural place to declare this — it already declares the executor type per step (`ai-agent`, `script`, `rules`, `human`). Adding a model tier or model preference per step is architecturally consistent. The harness resolves the declaration to a specific model at invocation time (using the adapter pattern).

This connects to three other insights:
- **Insight-033 (process declares context shape):** The process declares both what context goes in AND what model processes it. These are two sides of the same coin — a cheap model with rich context is different from an expensive model with lean context.
- **Insight-034 (context assembly in harness, not adapter):** Model selection happens in the harness; the adapter handles format translation for whichever model is selected.
- **Insight-003 (learning overhead is a dial):** Model selection is another dial — the system can start with an expensive model (supervised, earning trust) and downgrade to a cheaper one as trust is earned.

## The Trust Connection

Trust-modulated model routing is Original to Agent OS: as a process step earns trust (consistent quality, low correction rate), the harness could recommend downgrading to a cheaper model — the same way it recommends trust tier upgrades. The human approves the model change. If quality degrades, the harness auto-reverts (like trust downgrades).

This creates a compound optimisation: trust → cheaper model → lower cost AND trust → less review → less human overhead. The system gets cheaper AND better over time.

## Implications

**For process definitions (L1):** Steps gain an optional `model` or `model_tier` field (e.g., `fast`, `balanced`, `reasoning`). The harness maps tiers to specific models via the adapter. Tiers are preferable to specific model names — they survive model changes.

**For the adapter pattern (L2):** The adapter interface accepts a model parameter. Multiple adapters can serve the same harness (Claude adapter for Anthropic models, OpenAI adapter for GPT models, etc.).

**For the harness (L3):** Model selection is a harness decision, informed by: (1) the process definition's declared model tier, (2) the step's trust level, (3) budget constraints, (4) model availability.

**For cost optimisation:** A 70/20/10 split (fast/balanced/reasoning) across process steps cuts costs by ~60% vs running everything on the balanced model. This is the single largest cost optimisation available.

## Where It Should Land

- **Architecture spec (L1):** Process step definition gains optional `model_tier` field
- **Architecture spec (L2):** Adapter interface accepts model parameter
- **Architecture spec (L3):** Harness resolves model tier to specific model + adapter
- **Roadmap:** Model routing is a Phase 4 or Phase 6 capability (depends on when multi-model support is needed)
