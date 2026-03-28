# Insight-106: Prefetch-Gate-Synthesize Is the Pattern for Proactive Intelligence

**Date:** 2026-03-28
**Trigger:** Research into OpenOats meeting intelligence architecture (docs/research/openoats-meeting-intelligence.md)
**Layers affected:** L4 Awareness, L6 Human
**Status:** active

## The Insight

Real-time proactive intelligence — surfacing the right context at the right moment without being asked — requires a three-layer architecture: **prefetch** (continuously warm the cache with likely-needed context), **gate** (decide whether this moment warrants interrupting the human), and **synthesize** (stream a contextualised response from evidence).

OpenOats implements this for meeting suggestions: Layer 1 prefetches KB results on partial speech every few seconds. Layer 2 evaluates finalized utterances against a similarity threshold and conversation density metric — only passing when the KB match is strong AND the conversation moment is substantive. Layer 3 streams an LLM synthesis combining the trigger context with KB evidence.

Ditto's existing proactive engine (Brief 043) has early versions of this — `suggest-next` draws from user model dimensions + industry patterns, `detect-risks` scans for temporal and staleness signals. But these are on-demand tools the Self invokes, not a continuous pipeline. The OpenOats pattern suggests the Self's proactive intelligence should operate as a persistent background loop with explicit gating, not as tools called at specific moments. The gating layer is critical — without it, proactive suggestions become noise (the "Clippy problem").

The burst-decay throttle is equally important: even when the gate passes, suggestions must be rate-limited to respect the human's attention budget. This maps to the "management by exception" and "calm technology" patterns already identified in the HITL research.

## Implications

- The Self's proactive engine should evolve from on-demand tools to a continuous prefetch-gate-synthesize loop
- Gating needs both relevance (is this contextually useful?) and timing (is this a good moment to interrupt?) — two independent dimensions
- Throttling is an engine-level concern, not just a UX concern — the burst-decay pattern should be in the awareness layer, not the human layer
- This pattern applies beyond meetings: monitoring active processes, watching for organisational changes, detecting when knowledge becomes stale

## Where It Should Land

When mature: architecture.md Layer 4 (Awareness) section — proactive intelligence subsystem. Could also inform an ADR on attention-aware proactive systems. Relates to ADR-011 (attention model).
