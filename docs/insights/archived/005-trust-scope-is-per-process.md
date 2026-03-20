# Insight-005: Trust Scope Is Per-Process, Not Per-Executor

**Date:** 2026-03-19
**Trigger:** Phase 2a review — reviewer flagged that script steps flow through the trust gate identically to AI steps
**Layers affected:** L3 Harness
**Status:** absorbed into architecture.md L3 + trust gate implementation (Phase 3 complete)

## The Insight

The trust tier is configured per-process, and the harness pipeline applies uniformly to all non-human steps regardless of executor type (ai-agent, script, handoff). This means a supervised process will pause for human review even on deterministic script steps that always produce the same output.

This is a deliberate design choice: the trust tier reflects the human's confidence in the *process*, not in individual executors. A newly-created process is supervised because the human hasn't validated that the overall flow works — including the script steps producing the expected inputs for downstream steps.

However, as trust increases (spot-checked, autonomous), it may make sense for deterministic steps to skip the trust gate entirely since their outputs are reproducible. This is a Phase 3+ refinement — the trust gate could check executor type and auto-advance scripts in higher trust tiers.

## Implications

- Phase 2a behaviour is correct: uniform trust enforcement validates the whole pipeline
- Phase 3 trust earning could differentiate: scripts might "earn trust" faster or be exempt from sampling
- The process YAML could eventually support per-step trust overrides (e.g., `always_review: false` for scripts)

## Where It Should Land

Architecture spec L3 trust tier section, as a clarification. Possibly an ADR if per-step trust overrides are introduced.
