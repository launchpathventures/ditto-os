# Insight-013: Human Jobs vs Human Skills — Two Distinct Axes

**Date:** 2026-03-19
**Trigger:** Designer discussion about where "Taste" fits in the six human jobs framework
**Layers affected:** L6 Human, L5 Learning
**Status:** active

## The Insight

The six human jobs (Orient, Review, Define, Delegate, Capture, Decide) describe **what** the human does. But the human also brings **skills** — cognitive capabilities that modulate the quality of each job:

- **Taste** — subjective quality judgment ("this tone isn't right")
- **Creative thinking** — novel approaches ("what if we structured this differently?")
- **Critical thinking** — finding hidden assumptions ("this proposal ignores X")
- **Domain expertise** — contextual knowledge ("this won't work in our market because...")

These are not additional jobs. They are a separate axis — skills get **applied to** jobs:

| | Taste | Critical thinking | Creative thinking |
|---|---|---|---|
| **Review** | "This tone isn't right" | "This logic has a flaw" | — |
| **Define** | "The process should feel like X" | "This step is unnecessary" | "What if we approached it this way?" |
| **Decide** | "This improvement doesn't match our standards" | "This proposal has a hidden assumption" | "There's a better option not listed" |

Jobs are universal — every Agent OS user performs the same six jobs. Skills vary by person — one user's taste is different from another's, one user's domain expertise covers different ground.

## Implications

- The Learning Layer (L5) is essentially **encoding human skills into the harness over time**. Correction patterns capture taste. "Teach this" crystallises taste into a rule. The compound effect is skills being gradually transferred from human to harness.
- The harness handles what the human has already taught it. The human keeps applying their skills to the novel and ambiguous cases.
- This suggests the feedback capture system should be aware that corrections come from different skill axes — a taste correction ("wrong tone") is a different kind of signal from a critical thinking correction ("wrong logic"). Both are valuable but feed different parts of the learning model.
- Agent memory (L2) might eventually encode learned skills per process: "this process owner values conciseness over completeness" (taste) vs "this process owner always checks for edge cases" (critical thinking).

## Where It Should Land

Human-layer doc — the six human jobs section should acknowledge that skills are a separate axis. Architecture spec L5 (Learning Layer) — correction pattern extraction should consider skill-type as a dimension. This may also inform how the Feedback Widget's "Teach this" categorises learned rules.
