# Insight-024: Design and Engineering Are Different Cognitive Modes

**Date:** 2026-03-19
**Trigger:** Research into UX/process design role for the dev flow — professional practice survey
**Layers affected:** L6 Human, L1 Process (process architecture), dev process (meta)
**Status:** active

## The Insight

Design thinking and engineering thinking are genuinely different cognitive orientations, not just different tasks:

- **Design thinking** starts with user desirability and works toward technical feasibility. It asks: "What does the user need? How should this feel? Does this serve their mental model?"
- **Engineering thinking** starts with technical feasibility and works toward desirability. It asks: "What can we build? How does this fit the architecture? What's the simplest implementation?"

When both live in the same role, engineering thinking dominates — because it's concrete, testable, and has clearer acceptance criteria. UX concerns become a checklist item rather than a primary lens.

This is the same insight that justified separating Researcher and Architect ("research gets biased toward the solution you already want to build") — applied to a different axis. The Researcher/Architect separation prevents confirmation bias in technical scouting. A Designer/Architect separation prevents feasibility bias in UX decisions.

Professional product teams overwhelmingly separate these as distinct roles. The most functional pattern is **close collaboration between specialists** (Dual-Track Agile), not sequential handoffs or blended roles.

## Implications

- The Agent OS dev process needs a dedicated design perspective — not as a checklist within the Architect role, but as a separate cognitive mode with its own skill contract
- This is especially critical for Agent OS specifically, where the core value proposition (16 primitives, Explore → Operate, implicit feedback, trust visibility) is fundamentally design work
- The same principle will apply within the platform itself: when Agent OS orchestrates processes for users, the process-definition step (L1) should be governed by user-first thinking, not implementation-first thinking
- The dev process should model what the platform will eventually enforce: separate design and engineering governance

## Where It Should Land

Dev process doc (`docs/dev-process.md`) — justification for the Designer role. Architecture spec — when the platform eventually supports process design workflows, this insight should inform how the Explore → Operate transition works (the conversation that crystallises into a process should be design-led, not engineering-led).
