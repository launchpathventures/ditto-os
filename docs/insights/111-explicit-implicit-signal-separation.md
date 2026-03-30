# Insight-111: Explicit vs Implicit Signal Separation

**Date:** 2026-03-30
**Trigger:** Brief 056 (Observability Layer) — designing interaction event system
**Layers affected:** L3 Harness (trust), L5 Learning (feedback + meta-processes)
**Status:** active — partially absorbed into architecture.md Layer 5 (Brief 056)

## The Insight

Trust computation and meta-process intelligence consume fundamentally different signal types and must be kept strictly separated.

**Explicit signals** (approve/edit/reject) are high-confidence, low-volume, and directly attributable. They are the only valid input to trust tier computation because they represent deliberate human judgment.

**Implicit signals** (viewed artifact, navigated to roadmap, time to review) are low-confidence, high-volume, and statistically meaningful only in aggregate. They reveal *how* users work — patterns, preferences, engagement — but any individual event is ambiguous. A user not opening an artifact might mean they're busy, not that the output is bad.

Mixing implicit signals into trust would create a feedback loop where UI engagement becomes a proxy for output quality — a category error. Instead, implicit signals feed meta-processes (self-improvement, project-orchestration) which propose improvements to the human. The human still decides.

## Implications

- Any future observability work (heatmaps, engagement metrics, attention tracking) follows the same rule: meta-processes consume, trust ignores.
- Meta-processes can get smarter about *what* to propose by observing implicit signals, but the trust tier gate remains pure explicit-feedback-only.
- The Self's proactive intelligence (e.g., "you haven't reviewed yesterday's output") draws from implicit signals — this is appropriate because the Self advises, it doesn't auto-advance trust.

## Where It Should Land

Already partially documented in architecture.md Layer 5 (Brief 056 addition). Should be reinforced in any future ADR that touches trust computation or meta-process design.
