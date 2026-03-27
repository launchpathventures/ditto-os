# Insight-100: Critical Evaluation as a Persistent Cognitive Disposition — The Inner Critic

**Date:** 2026-03-25 (revised 2026-03-25 after research + review)
**Trigger:** Waymo CEO's description of their agentic architecture: Command agent (≈ Self), Simulator (edge case hardening), Critic (feedback to command agent). Parallel drawn to human executive function — the inner critic as the filter that guards against hallucination, optimism bias, and overconfidence. Research report: `docs/research/critic-incentives-hallucination.md`. First review flagged the entity framing as too heavy; research confirmed the capability is real but should live in existing architectural homes.
**Layers affected:** L2 Agent (context assembly), L3 Harness (verification handlers), L4 Awareness (cross-process failure correlation), L5 Learning (failure pattern accumulation), Cognitive Framework (ADR-015)
**Status:** active — absorbed into ADR-022

## The Insight

### The Principle (revised)

Every healthy cognitive system has three dispositions in tension:

| Disposition | Character | Ditto home | Faces |
|-------------|-----------|------------|-------|
| **Optimistic/Generative** | Warm, helpful, guiding | The Self (ADR-016) | Outward (human) |
| **Critical/Evaluative** | Skeptical, truth-seeking | Orchestrator executive function + Harness verification | Inward (outputs) |
| **Strategic/Adaptive** | Monitoring, sequencing | Orchestrator (ADR-014) | Across (execution flow) |

The Self asks: "What should we do? How can I help?"
The Critic asks: "Is this actually true? Where could this be wrong?"
The Orchestrator asks: "Is this approach working? What should we try next?"

Remove any one and the system degrades. Without the critical disposition → overconfidence, hallucination, positivity bias.

### What's Missing (the genuine gap)

Research confirmed (docs/research/critic-incentives-hallucination.md, Finding #6): **No production system combines persistent failure pattern memory with runtime evaluation in a multi-process context.** This is the real gap. Existing per-output checks (metacognitive self-check, review patterns, trust gate) don't accumulate cross-output, cross-process knowledge about what tends to go wrong.

### The Critic Is a Capability, Not an Entity

The first version of this insight proposed the Critic as a new system-level entity at the same tier as the Self. Review and research showed this is architecturally over-heavy. The critical disposition is better delivered as:

1. **Accumulated failure knowledge** in process-scoped and agent-scoped memory (not a new memory scope) — tagged with `category: failure_pattern` for targeted retrieval
2. **The Orchestrator's executive function** (ADR-014) enriched with critical evaluation during its reflection cycle — weighing optimistic Self signals against accumulated failure data
3. **New harness verification handlers** — conditional hallucination detection and step-level verification, informed by accumulated failure patterns
4. **The Feedback & Evolution meta process** (ADR-015) as the home for cross-process failure correlation

**Key research finding:** Self-critique without external grounding fails (Reflexion EMNLP 2025 caveat). The critical function must be grounded in external evidence — user corrections, connected data, independent verification — not just "think about whether this is good." Same-model, same-context evaluation has +10-25% self-enhancement bias (LLM-as-Judge research).

### The Waymo Parallel (contextualised)

Waymo's Command/Simulator/Critic architecture inspired this insight. The parallel holds conceptually but the domain transfer is limited — Waymo operates in a safety-critical, real-time domain; Ditto operates in knowledge work with human trust gates. The valuable takeaway is the **three-disposition model** and the principle that the critical function must be **persistent and accumulating**, not per-action.

### Three Concrete Examples of What Accumulated Critical Knowledge Enables

1. "This quote says 3 hours for bathroom tile work. The last 4 bathroom quotes were all corrected upward. Inject caution: 'Bathroom labour estimates have historically been low — verify this estimate against recent corrections.'"

2. "The Self is suggesting Rob expand to invoicing. But quoting correction rate is still 20% and Rob hasn't mentioned invoicing as a pain point. The expansion suggestion should be held until the first process is stable."

3. "The briefing says 'everything running smoothly' but correction rate increased 15% this week. The harness should flag the discrepancy between the Self's narrative and the actual quality data."

### Connection to Incentives (Insight-099)

The critical disposition is the **avoidance pole** of the homeostatic incentive model (Insight-099). The Self provides approach signals (opportunity, expansion, optimism). The critical function provides avoidance signals (caution, failure patterns, grounding). The Orchestrator maintains homeostatic balance between the two. Neither pole should dominate.

## Implications

- **Failure patterns stored in existing memory scopes** with categorical tags — no new memory scope needed. Process-scoped for "this process tends to underestimate bathroom labour." Agent-scoped for "this agent tends to hallucinate when making claims about data it hasn't retrieved."
- **Orchestrator reflection cycle enriched** with accumulated failure data — the existing ADR-014 §2 reflection already evaluates progress and friction. Adding failure pattern retrieval to this cycle gives it the critical disposition.
- **Verification must be contextually independent of production** — different model or provider, fresh context, independently generated criteria (CoVe Factor+Revise, AgentCoder independence principle).
- **Conditional checking is essential for efficiency** — not every output needs hallucination detection. Two-stage: fast pre-classifier decides IF checking is needed, detailed check only when warranted (HaluGate pattern, 72% efficiency gain).
- **Step-level signals more valuable than output-level** — PRM evidence shows step-by-step verification dramatically outperforms final-output evaluation. The harness should evaluate at each process step, not just the final output.
- **The critical function's results should be visible**, not invisible. When the system challenges its own output based on failure patterns, surface this in the Activity Feed. "Ditto flagged this because similar outputs have been corrected 4 times" is more transparent than hiding the machinery.

## Where It Should Land

- **ADR-022: Critical Evaluation and Homeostatic Quality** — the architectural decision capturing both the critical disposition and the homeostatic incentive model
- **ADR-014 update** — reference ADR-022 for the critical evaluation enrichment to the orchestrator's executive function
- **ADR-015 update** — Feedback & Evolution identified as the meta-process home for cross-process failure correlation
- **architecture.md** — add critical evaluation + homeostatic quality as a cross-cutting concern
