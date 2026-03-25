# Insight-097: Tool-Result-Driven UI Transitions

**Date:** 2026-03-25
**Trigger:** Brief 046 (Workspace Transitions) — connecting Self tool usage to layout changes
**Layers affected:** L6 Human
**Status:** active

## The Insight

The workspace UI can react to the Self's tool usage without a formal streaming protocol event type. By scanning completed `tool-invocation` parts in AI SDK v6 messages and mapping tool names to panel contexts via a single constant map (`TRANSITION_TOOL_MAP`), the frontend adapts its layout to match the Self's actions. This is a lightweight, zero-engine-change pattern that extends naturally from the existing `credential-request` detection approach.

The key properties: (1) a single file owns all tool→panel mappings, (2) the transition map returns typed `PanelContext` objects so the panel renderer stays a pure switch, (3) the pattern is a stepping stone to Phase 11's `context-shift` protocol events — replacing one file migrates the entire system.

## Implications

- Future Self tools that need UI responses can be added to the map without touching any component code
- Phase 11 migration to `context-shift` protocol events is isolated to replacing `transition-map.ts`
- The pattern proves that the Self can drive workspace layout without explicit "show panel X" commands — the tool's purpose implies the UI change

## Where It Should Land

Architecture.md Section 6 (Human Layer) when the context-shift protocol is formalized in Phase 11. Until then, stays as active insight.
