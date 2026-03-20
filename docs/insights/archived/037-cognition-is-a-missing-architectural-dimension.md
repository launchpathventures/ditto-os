# Insight-037: Cognition Is a Missing Architectural Dimension

**Date:** 2026-03-20
**Trigger:** Strategic research into human cognition models — PM question "what are you missing about how humans think?"
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L5 Learning, L6 Human (cross-cutting, like attention model)
**Status:** active

## The Insight

Agent OS models work flow (processes, steps, harness) and work governance (trust, feedback, attention) but does not model **how humans think through work**. The architecture has no concept of cognitive mode, expertise level, tacit knowledge, abstraction level, challenge orientation, stakes awareness, or relational context — seven dimensions that shape every human judgment.

This is not a feature gap — it's a **missing architectural dimension**, analogous to how the attention model (ADR-011) was a missing dimension before it was named. Trust tiers determine oversight rate. The attention model determines oversight form. A cognitive model would determine **what kind of human thinking is being requested** and adapt the system's behaviour accordingly.

The gap is visible in the review experience: Agent OS presents every output with the same approve/edit/reject flow, regardless of whether the output needs analytical checking (invoice reconciliation), creative judgment (brand copy), strategic evaluation (improvement proposal), or intuitive gut-check (quote review by an expert). These are fundamentally different cognitive acts, and the system treats them identically.

No system in our surveyed landscape (docs/landscape.md + 8-area cognitive science and HCI literature review) implements cognitive modeling for work oversight. Cognitive science has the theory (Dreyfus, Klein, Kahneman, Polanyi, Simon, Weick, Edmondson). Applying it to the human-agent collaboration problem appears to be genuinely original territory.

## Implications

- Processes and steps could declare their **cognitive mode** (analytical, creative, critical, strategic) — informing how review is framed, what feedback signals are captured, and how the learning layer processes corrections.
- The harness could select review patterns based on cognitive mode: spec-testing for analytical work, a new "taste review" pattern for creative work.
- The learning layer could operate at different abstraction levels: concrete corrections (current), pattern recognition (Phase 8), structural insights and strategic proposals (new capability).
- Entity memory (temporal knowledge graph) could provide the relational context that shapes human judgment — who's involved, their history, their trajectory.
- Stakes profiles could modulate review depth — calibrating cognitive load to impact.
- The review UX could signal what kind of thinking is needed and adapt accordingly.

## Where It Should Land

This is substantial enough to warrant an ADR — potentially as significant as ADR-010 (workspace interaction model) or ADR-011 (attention model). The Architect should evaluate whether this becomes:

1. A new **cross-cutting concern** in the architecture (like attention model, like governance) — a "cognitive model" section
2. Enrichments to existing layers (L1 gains cognitive mode declarations, L3 gains mode-aware review patterns, L5 gains abstraction escalation, L6 gains adaptive review UX)
3. A phased roadmap addition (some dimensions are Phase 4-actionable, others are Phase 8+)

The seven dimensions should NOT all be built at once. They interact, and the right sequencing matters. But naming them as an architectural concept ensures they're not lost as ad-hoc feature requests.
