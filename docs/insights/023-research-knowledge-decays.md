# Insight-023: Research Knowledge Decays Without Persistence

**Date:** 2026-03-19
**Trigger:** Phase 2 research session — detailed pattern analysis across 7 source projects existed only in conversation context with no persistent home
**Layers affected:** Meta (Development Process), L5 Learning
**Status:** active

## The Insight

The development process has four types of durable knowledge: decisions (ADRs), work plans (briefs), design principles (insights), and framework evaluations (landscape.md). But the most expensive knowledge to produce — detailed pattern research across source projects — had no persistent form. It existed only in conversation and evaporated at session end.

This is the same problem Agent OS solves for its users. The harness captures implicit feedback (edits, corrections, approvals) so that operational knowledge compounds over time. But our own development process was losing its most valuable input: the "how does project X implement pattern Y" findings that inform every architectural decision.

The pattern generalises: any system that produces knowledge through investigation (not just execution) needs a persistence layer for that investigation, not just for the decisions that result from it. Recording only decisions is like recording only test results without the test code — you know what passed but can't re-run or build on the analysis.

## Implications

**For the development process (Meta):** Research reports become a first-class artifact type alongside ADRs, briefs, and insights. The Dev Researcher writes to `docs/research/`, not just to conversation. This mirrors how the harness will capture feedback from execution — making the implicit explicit and durable.

**For the learning layer (L5):** When the harness is built, it should apply this same principle. The harness doesn't just record approve/reject decisions — it records the analysis that led to them. Which review pattern was applied, what the reviewer found, what alternatives were considered. Decision context, not just decision outcomes.

**For composition over invention:** Research reports ARE the evidence base for the "build from" principle. Without them, "composition over invention" degrades to "we vaguely remember seeing this somewhere." With them, every borrowed pattern has a traceable, re-examinable source.

## Where It Should Land

- **ADR-002** captures the specific decision (already written alongside this insight)
- **Architecture spec (L5 Learning):** When expanding the learning layer design, include "investigation persistence" as a principle — the system should capture not just what was decided but what was analysed
- **Dev process (docs/dev-process.md):** Add research reports to the artifact inventory
