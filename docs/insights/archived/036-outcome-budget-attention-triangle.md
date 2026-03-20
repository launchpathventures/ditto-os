# Insight-036: The Outcome-Budget-Attention Triangle

**Date:** 2026-03-20
**Trigger:** Human insight during context/token efficiency research — "the tradeoff for the human is if they want fewer interruptions, they need to increase the spend per outcome, like CPC"
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L5 Learning, L6 Human
**Status:** absorbed into ADR-012

## The Insight

Every process has three competing constraints that the user implicitly trades off:

```
        OUTCOME QUALITY
             ▲
            / \
           /   \
          /     \
         /  The  \
        / system  \
       / optimises \
      /  this space \
     ▼───────────────▼
  BUDGET ($)      ATTENTION (time)
```

- **Outcome quality** — how good does the output need to be?
- **Budget ($)** — how much money can be spent per outcome?
- **Attention (time)** — how much human time should this consume?

The user sets their constraints; the system optimises within them. This mirrors the CPC (cost-per-click) model in advertising: higher bid = more platform optimisation on your behalf = less manual work. Lower bid = cheaper but requires more hands-on management.

In Agent OS terms:

| User wants | System does |
|-----------|-------------|
| Low attention + high quality | Uses expensive models, rich context, autonomous execution → costs more |
| Low budget + high quality | Uses cheap models, lean context, supervised execution → costs human time |
| Low attention + low budget | Accepts lower quality or waits for trust earning to bring costs down |
| All three constrained | System reports whether it's achievable, proposes tradeoffs |

The critical dynamic: **the system earns its way down the cost curve over time.** A process starts expensive (untrusted, needs rich context, expensive model). As trust is earned, three cost levers compound:

1. Trust → less review (saves human time)
2. Trust → cheaper model (saves tokens)
3. Learning → better prompts, fewer retries (saves tokens)
4. Caching → stable prompt prefixes (saves tokens)
5. Context optimisation → leaner assembly (saves tokens)

Month 1: $50/outcome (Opus, supervised, full context). Month 6: $8/outcome (Haiku, autonomous, cached). Same quality. The meta-processes did the optimisation work.

## The Budget-as-Goal Model

Current architecture treats budget as a spending limit (Paperclip pattern: alert at 80%, stop at 100%). This insight reframes budget as an **outcome contract** — a goal that meta-processes actively optimise toward.

The self-improvement meta-process (Phase 9) already scans for quality improvements. Adding cost-per-outcome as a signal means it also scans for efficiency improvements: "This process delivers the same quality with Haiku as it did with Sonnet — suggest model downgrade."

No existing system tracks cost-per-outcome or treats budget as a target for meta-process optimisation. Existing budget controls are guardrails (don't exceed), not goals (actively reduce). This is Original to Agent OS.

## The Interface Implication

The user shouldn't configure trust tiers, model tiers, and context profiles separately. They should express their constraints naturally:

- "I want invoices reconciled accurately. I don't want to spend more than $30/month. I'll review a sample weekly."
- "I want leads nurtured well. Budget isn't the concern — I just don't want to think about it."
- "I want code reviewed thoroughly. I'll review every output myself to keep costs down."

The system maps these to the right combination of trust tier, model tier, context profile, and review pattern. The Trust Control primitive (Primitive 11) in the human layer already shows the current tier and how it was earned — extending it to show the cost trajectory and tradeoff options is natural.

## Implications

**For process definitions (L1):** Processes gain a budget field that represents an outcome contract, not just a spending cap. Cost-per-outcome is tracked alongside quality metrics.

**For the harness (L3):** The harness optimises within the budget-attention-quality triangle. Model selection, context depth, and review pattern are all levers the harness can adjust (with human approval for changes).

**For the learning layer (L5):** Cost-per-outcome becomes a first-class metric alongside output quality, process efficiency, and outcome impact. The self-improvement meta-process uses it as a signal.

**For the human layer (L6):** The Trust Control primitive shows not just trust level but the cost trajectory — "this process cost $50/outcome in month 1 and $12/outcome now." The Daily Brief summarises cost trends alongside quality trends. The user never sees "model tier" or "context budget" — they see "importance" and "monthly spend."

**For system agents (ADR-008):** Cost optimisation needs an explicit owner in the system agent roster. The current ten system agents focus on quality (trust-evaluator, improvement-scanner) and routing (intake-classifier, router, orchestrator). None explicitly owns cost-per-outcome tracking, model tier recommendations, or cost trajectory surfacing. Options:
1. Extend `improvement-scanner`'s mandate from quality improvements to quality + cost improvements
2. Extend `trust-evaluator` to recommend model tier downgrades alongside trust tier upgrades (since both are earned-through-data)
3. Add an 11th system agent (e.g., `cost-optimizer`) dedicated to cost-per-outcome

The same agent (or responsibility) should also inform process setup. When a user defines a new process in Explore mode, the system should surface the attention-cost tradeoff: "Based on similar processes, this will cost roughly $X/month at your chosen quality level. Want me to start with a cheaper model and see if quality holds?" This is where the user interface to all the underlying complexity (context engineering, model routing, caching) lives — the system translates the user's importance/budget preferences into harness configuration. The complexity is the system's problem; the user's problem is "how important is this and how much will I pay."

## Where It Should Land

- **Architecture spec (L2):** Budget-as-outcome-contract in agent harness model (alongside existing budget-as-limit)
- **Architecture spec (L3):** Harness optimises model, context, review within budget-attention-quality triangle
- **Architecture spec (L5):** Cost-per-outcome as fourth feedback signal (alongside output quality, process efficiency, outcome impact)
- **Architecture spec (L6):** Trust Control shows cost trajectory; Daily Brief shows cost trends; Explore mode surfaces cost estimates during process setup
- **ADR-008:** Evaluate whether cost optimisation is a new system agent or an extension of trust-evaluator / improvement-scanner
- **Roadmap:** Cost-per-outcome tracking could start as early as Phase 4 (schema field), with meta-process optimisation in Phase 9
