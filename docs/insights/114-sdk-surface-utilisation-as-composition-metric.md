# Insight-114: SDK Surface Utilisation as Composition Metric

**Date:** 2026-03-30
**Trigger:** Audit of AI SDK v6 and AI Elements usage in Ditto's chat implementation. Found ~15-20% of available API surface used despite the SDK being a declared dependency. 5 components hand-built, 12 components missing, 14 of 17 useChat options unused, tool confirmation rendered but not wired.
**Layers affected:** L6 Human (conversation rendering, interaction capabilities), L2 Agent (Self streaming protocol)
**Status:** active

## The Insight

"Composition over invention" (Principle 1) has a measurable signal: **SDK surface utilisation**. When a project declares a dependency but uses only 15-20% of its API surface while hand-building equivalent functionality, the composition principle is being violated. The violation isn't in choosing the wrong SDK — it's in paying the dependency cost without extracting the dependency value.

This is distinct from over-engineering. The AI SDK's `stop()`, `regenerate()`, `addToolApprovalResponse()`, `dataPartSchemas`, and `experimental_throttle` are not speculative features — they are standard chat capabilities that users expect. Not using them creates both a UX gap (no abort, no retry, no type safety) and a maintenance burden (hand-built alternatives that diverge from the protocol).

AI Elements extends this further: the shadcn-style ownership model means "adopt" is zero-risk. You install source, you own it, you modify it. The only cost is the initial read-and-adapt cycle. The cost of NOT adopting is maintaining parallel implementations that miss upstream improvements.

**The metric:** For any declared dependency, track (features used / features relevant). When this ratio drops below 50% and hand-built alternatives exist, it's a composition violation worth auditing.

## Implications

- Every brief that touches conversation UI should check AI Elements for an existing component before designing custom
- The `useChat` API surface should be treated as a capability catalogue, not just a streaming hook
- Server-side streaming utilities (`onFinish`, `consumeStream`, `transient`) are infrastructure, not features — they prevent data loss and improve type safety
- Tool confirmation via `addToolApprovalResponse()` maps directly to trust tiers — this is architecture-level alignment, not just a UI feature

## Where It Should Land

- Architecture spec: Layer 6 should reference AI Elements as the component catalogue for conversation UI (alongside json-render for process outputs)
- Brief for adoption sprint: component-by-component migration plan
- Review checklist: consider adding "SDK utilisation check" as a sub-item under Composition Check (#3)
