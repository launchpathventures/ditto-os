# Insight-176: Deliberative Perspectives, Not a Council of Agents

**Date:** 2026-04-12
**Trigger:** Exploring Karpathy's "council of agents" concept and whether diverse agent personalities (expansionist, contrarian, first-principles thinker, executor, chairman) would level up Alex's decision quality. Research into multi-agent debate patterns (Du et al. 2023, Mixture-of-Agents, AutoGen sparse topologies, ICLR 2025 meta-analysis) revealed both the genuine value and the sharp constraints.
**Layers affected:** L2 Agent (cognitive context assembly), L3 Harness (new handler pattern), L5 Learning (perspective feedback), L6 Human (synthesis presentation)
**Status:** active

## The Insight

The council-of-agents concept — multiple AI personalities deliberating before synthesis — has genuine value for complex decisions. Karpathy's `llm-council` demonstrates the pattern: parallel generation → anonymized peer review → chairman synthesis. Academic research (Du et al. 2023) shows multi-agent debate improves factuality and reasoning. The question isn't whether diverse perspectives help — they do — but how they map onto Ditto's architecture.

Three existing insights constrain the design decisively:

1. **Insight-159 (Self IS Alex):** The user talks to one entity. There is no scenario where the user sees a committee debating. The council is internal cognitive machinery — the user sees Alex, who has thought deeply.

2. **Insight-165 (Mode Extensions Are Judgment Shifts):** Perspectives are cognitive calibration, not persona switches. "Risk assessor" is a cognitive function; "cautious pessimist" is a personality. The former is evaluable and composable; the latter is vibes.

3. **Insight-002 (Review Is Compositional):** Perspectives are a composable layer in the review stack, not a replacement for existing patterns. They run alongside maker-checker, adversarial, and spec-testing.

The critical research finding (ICLR 2025 meta-analysis): current multi-agent debate methods **fail to consistently outperform** single-agent strategies like Self-Consistency when applied to well-defined problems. Where they shine is ambiguous, high-stakes decisions where blind spots are the risk — exactly the decisions Alex faces when framing goals, evaluating processes, or making strategic choices.

This means: perspectives are not a universal quality mechanism. They are a **decision-enrichment pattern** for specific contexts — complex, ambiguous, consequence-bearing decisions where the risk is in what you didn't consider, not in what you computed wrong.

The architectural implication: **Deliberative Perspectives** is a harness-level pattern (like review patterns), not a cognitive mode (like connecting/selling). It's declared on processes, composable with existing review layers, and governed by trust and feedback like everything else. The Self synthesizes perspective outputs the way a good executive synthesizes advisor input — incorporating the strongest arguments, noting dissent, and making one clear recommendation.

## Implications

1. **Ensemble Consensus evolves.** The architecture spec (Layer 3) defines Ensemble Consensus as "multiple agents produce independently, compare for divergence." Deliberative Perspectives is the richer version: instead of N agents doing the same task, N cognitive lenses evaluating from different angles. The ensemble slot in the architecture becomes the perspectives slot.

2. **Cost must be gated.** Research shows 4.3x average token amplification per perspective. Five perspectives on every step is prohibitive. Perspectives must be conditional: declared per-process, gated by decision complexity, and respecting trust tiers (autonomous processes that have proven reliable don't need five perspectives on routine outputs).

3. **Sparse topology beats all-to-all.** AutoGen research shows sparse communication outperforms dense. Perspectives should see the original output and optionally 1-2 neighboring perspectives, not all of them. The chairman (Self) sees everything; individual lenses see less.

4. **Same model, different prompts works.** Self-MoA research (2025) shows a single strong model with role-differentiated prompts can outperform mixed-model ensembles. This simplifies implementation — perspectives are prompt variations on the same LLM, not different providers.

5. **Feedback shapes composition.** Which perspectives the user engages with (implicit signal) and which align with their final decisions (explicit signal) should feed back into perspective selection per process type. If the Contrarian never adds value for content review, the system should learn to drop it.

6. **Cap rounds at 1.** Research shows diminishing returns after 2-3 debate rounds. For a harness pattern (not a research tool), single-pass perspectives with chairman synthesis is the right trade-off.

## Where It Should Land

- **ADR-028** — Full architectural decision for Deliberative Perspectives as a harness pattern
- **Architecture spec (L3)** — Replace "Ensemble Consensus" row with "Deliberative Perspectives" in the review patterns table
- **Brief 136** — Implementation brief for the harness handler and process declaration schema
- **ADR-022 integration** — Accumulated failure knowledge (failure_pattern, overconfidence_pattern) should be injected into the Contrarian and Historian perspectives
