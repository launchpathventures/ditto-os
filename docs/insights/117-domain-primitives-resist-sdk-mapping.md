# Insight-117: Domain Primitives Resist SDK Mapping

**Date:** 2026-03-30
**Trigger:** Brief 061 design — user challenged mapping ProcessProposalBlock to AI Elements Plan component
**Layers affected:** L6 Human
**Status:** active

## The Insight

Not every ContentBlock renderer benefits from adopting an SDK component, even when the visual similarity is high. ProcessProposal looks like Plan (both show a title + ordered steps with status) but serves a fundamentally different purpose: it's a domain primitive with approve/adjust actions and step execution status (done/current/pending) that represents a real business process being proposed — not a generic "here's my plan" display.

The test for SDK adoption on a block renderer is: **does the SDK component's interaction model match the block's semantic purpose?** If the block has domain-specific actions, state transitions, or meanings that the SDK component doesn't model, forcing the mapping adds overhead without benefit and obscures the domain semantics.

## Implications

When auditing block renderers for SDK adoption, categorise each as:
- **Rendering match** (SDK component IS the right renderer) — e.g., CodeBlock→Shiki, ReasoningTrace→ChainOfThought
- **Partial match** (SDK component provides useful primitives but doesn't own the block) — compose SDK pieces into the renderer
- **Domain original** (block has semantics the SDK cannot model) — keep Ditto-original, don't force the mapping

## Where It Should Land

Architecture spec Layer 6 section — guideline for when to adopt vs when to build original. Could inform future block renderer audits.
