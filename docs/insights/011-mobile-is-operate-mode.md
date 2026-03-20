# Insight-011: Mobile Is Operate Mode

**Date:** 2026-03-19
**Trigger:** Designer research into mobile/remote Agent OS experience — mapping the six human jobs to mobile surfaces
**Layers affected:** L6 Human, L1 Process
**Status:** active

## The Insight

The architecture defines two coexisting modes: Explore (discovery, refinement, conversation) and Operate (execution, monitoring, review, decisions). These modes map cleanly to device context:

- **Desktop** serves both Explore and Operate
- **Mobile** serves Operate only, with Capture as the bridge to Explore

This is not a limitation — it's a natural fit. Process creation (Explore) requires sustained attention, complex editing, and dual-pane layouts. Process operation (Operate) requires decisions, status awareness, and context capture — all of which work on a phone.

The practical consequence: only 7 of the 16 UI primitives need mobile adaptation (Daily Brief, Review Queue, Output Viewer, Feedback Widget, Quick Capture, Process Card glance, Improvement Card). The remaining 9 are desktop-only without loss of function.

The process owner's mobile day is about keeping the decision pipeline flowing: orient (what happened?), review (is this right?), capture (here's context), and simple decide (apply this improvement?). They don't define, delegate, or deeply analyse from their phone.

## Implications

- Mobile design scope is bounded — not all 16 primitives, not all 8 views
- The mobile view composition is a single scrollable screen (Brief + Queue + Health + Capture), not a navigation-heavy app
- Push notifications with action buttons are the primary mobile surface — many decisions can be made without opening the app
- The "Edit @ desk" pattern (see Insight-012) bridges mobile Operate to desktop Explore when mobile can't handle the full interaction
- The mobile surface does not need the Conversation Thread, Process Builder, or Process Graph — this dramatically simplifies both the mobile build and the runtime requirements

## Where It Should Land

Architecture spec — L6 Human Layer should formalise the Explore/Operate device mapping. The roadmap's Phase 12 (Mobile) should scope against this insight. The Phase 9 (Web Dashboard) should design responsive breakpoints with this in mind — mobile is not "shrunk desktop" but "Operate Mode only."
