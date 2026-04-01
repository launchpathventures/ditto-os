# Insight-128: Uncertainty Is More Valuable Than Evidence

**Date:** 2026-04-01
**Trigger:** User feedback on Brief 067 — "I'd love to see the confidence evaluation and what the AI thinks it got wrong or needs further clarification on"
**Layers affected:** L6 Human, L2 Agent (structured confidence output)
**Status:** addressed by Brief 068 (Confidence & Trust Card) — principle active, implementation landed

## The Insight

Every AI product shows what the AI did (evidence) — sources checked, files read, steps completed. None show what the AI is unsure about (uncertainty). For outcome owners, uncertainty is the actionable signal — it tells them exactly where to focus their judgment. Evidence is the backdrop that builds baseline confidence. Lead with uncertainty, support with evidence.

The distinction:
- **Evidence** answers: "What did you base this on?" (trust backdrop)
- **Uncertainty** answers: "What should I watch out for?" (actionable signal)

When a plumber gets a quote draft, knowing "Checked supplier prices, project history, margin rules" is reassuring but passive. Knowing "Q4 copper prices unavailable — used Q3 estimates, verify before sending" is actionable — it tells them the one thing to check.

The auto-expand behavior follows from this: high confidence (no uncertainty) = quiet collapsed signal. Medium/low confidence (uncertainty present) = auto-expanded with caveats prominent. The system earns the right to be quiet by having nothing to flag.

## Implications

- Confidence assessment must be a structured output from the AI, not an afterthought
- Uncertainties must be specific and actionable (not "some data may be stale" but "Q4 pricing unavailable — used Q3 estimates")
- The UI hierarchy is: uncertainties first, then evidence, then raw activity trace (tertiary)
- This is competitive differentiation — no AI product does this for non-technical users
- False negatives (missed uncertainty) are far worse than false positives (unnecessary caution)

## Where It Should Land

Constraint for the next trust-card brief. Should inform `docs/architecture.md` L2 agent output spec and `docs/human-layer.md` AI Elements list (new ConfidenceCard component).
