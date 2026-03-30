# Insight-119: Architecture Without UX Brief Is Invisible

**Date:** 2026-03-31
**Trigger:** Brief 061 dogfood — user reported "nothing has changed in the UI" after 30 AC, 17 files, 4 Radix deps shipped
**Layers affected:** L6 Human
**Status:** active

## The Insight

Shipping an architecture upgrade (composable subcomponents, new primitives, upgraded renderers) with backward-compatible defaults means the user experience doesn't change. The backward-compatibility constraint — necessary to avoid regressions — inherently conflicts with making the work visible.

Brief 061 installed Radix Collapsible/HoverCard/ScrollArea, Shiki syntax highlighting, useControllableState, status badges, state-aware Confirmation, and 7 new composable components. All 30 acceptance criteria pass. But the default compositions preserve the old look, and the visual improvements only surface when specific component types are triggered (reasoning, tools, code blocks, citations). First dogfood: "Nothing has changed."

The lesson: **component architecture briefs and UX briefs must be paired.** The architecture brief installs the primitives (the CAN). The UX brief wires the defaults to actually use them (the DO). Shipping one without the other delivers infrastructure that's invisible to the user.

## Implications

1. Every architecture brief that touches L6 components should have a companion UX brief sequenced immediately after it — never queued separately.
2. The PM should triage architecture+UX as a single unit of work, not as independent items.
3. Brief acceptance criteria should include at least one "user-visible change" criterion, even for architecture briefs. If no user-visible change is possible, that's a signal the brief is pure infrastructure and the companion UX brief is mandatory.

## Where It Should Land

`docs/dev-process.md` — as a standing rule for L6 work. PM triage heuristic: architecture briefs that touch UI components must have a paired UX brief.
