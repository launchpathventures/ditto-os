# Insight-118: Backward-Compatible Composable Migration

**Date:** 2026-03-30
**Trigger:** Brief 061 review — FLAG 4 identified that rewriting components to composable subcomponents could break existing consumers
**Layers affected:** L6 Human
**Status:** active

## The Insight

When migrating a monolithic component to a composable subcomponent pattern (Provider + named subcomponents), the default export must maintain backward compatibility. Existing consumers (e.g., `message.tsx` importing `<Reasoning>`) should work without modification. The composable subcomponents are additional named exports for future custom compositions.

This is the "widen the interface, don't break it" principle: the old API becomes a convenience wrapper over the new composable API. Migration is then incremental — consumers opt in to the composable pattern when they need custom layouts, rather than being forced to rewrite on day one.

## Implications

Every component rewrite in Brief 061 (Reasoning, Tool, Confirmation, PromptInput) must export both:
1. A default composition that matches the current props/behavior (backward-compatible)
2. Named subcomponents for composable usage (new capability)

This pattern should be standard for all future component architecture upgrades.

## Where It Should Land

Brief constraints (already added to Brief 061). Could become a standing convention in CLAUDE.md or dev-process.md for component upgrades.
