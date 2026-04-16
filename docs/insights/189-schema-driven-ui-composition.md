# Insight-189: Schema-Driven UI Composition — Declare the View, Not the Code

**Date:** 2026-04-14
**Trigger:** Brief 154 — Adaptive Workspace Views implementation
**Layers affected:** L6 Human, L1 Process
**Status:** active

## The Insight

Domain-specific workspace experiences can be created entirely from declarative schemas that combine existing block types with context queries — no custom React components, no deploys, no code changes. A `CompositionSchema` of ~20 lines of JSON produces the same quality output as a hand-written TypeScript composition function, because the real complexity lives in the block registry and composition context, not in the per-view assembly logic.

The key enabler is that the composition context is already rich enough (work items, processes, feed items, active runs) to power most domain views through simple filter/sort/limit queries. A "Clients" view is just work items filtered by type + people filtered by relationship. A "Tickets" view is work items filtered by a different type. The block primitives (table, metric, status card, action) are domain-agnostic — they render consultants, properties, and support tickets identically.

This also proves that processes can produce their own UI surface. When `generate_process` registers a companion view, the process becomes self-documenting: it creates the tracking interface alongside the automation. The process-to-view link (`sourceProcessId`) means completion events automatically refresh the relevant workspace surface.

## Implications

1. **New processes should consider companion views.** The Self's delegation guidance should prompt: "Does this process warrant a dedicated workspace view?" This is now mechanically possible via `companionView` on `GenerateProcessInput`.
2. **The block registry is the UI framework.** Every new block type automatically becomes available to adaptive views. Block type additions have multiplicative value.
3. **Migration path exists for built-in compositions.** The 8 built-in TypeScript composition functions could eventually be replaced by schemas, but there's no urgency — they work and the adaptive path is additive.
4. **Rate limiting is essential for push-based views.** A runaway process could flood the workspace with blocks. The 20/min/user limit was a Day 1 constraint, not an afterthought.

## Where It Should Land

When mature: architecture.md Layer 6 section should describe the dual composition model (code-driven built-ins + schema-driven adaptive views) and the process-to-view registration pattern. The workspace push rate limiting belongs in a security/reliability section.
