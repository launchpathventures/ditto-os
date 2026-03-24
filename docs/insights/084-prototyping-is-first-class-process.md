# Insight-084: Prototyping is a First-Class Process — Get It Right Before Building

**Date:** 2026-03-24
**Trigger:** User directive: "I think we should treat prototyping now as a first-class process for the project so we can get this right before we continue."
**Layers affected:** Dev process, Phase 10, all subsequent phases
**Status:** active

## The Insight

HTML prototypes are not illustrations. They are the **design source of truth** — the thing the Architect and Builder work FROM, not the thing the Designer produces as decoration. Getting the prototypes right before building is not a nice-to-have; it's the critical gate between design and implementation.

The previous approach (design spec → brief → build) risks the Builder interpreting specs differently from the Designer's intent. With HTML prototypes:
- The visual design is **unambiguous** — it's pixels, not prose
- Interaction patterns are **testable** — open in a browser, tap through it
- The full user journey is **walkable** — from day zero through daily use
- Persona stress-testing happens **before code is written**, not after

## Process Change

Prototyping is now a gated step in the design-to-build pipeline:

```
Designer produces prototypes
  → User reviews and refines (iterative)
  → Architect validates against engine capabilities
  → Builder uses prototypes as visual reference (UI build strategy D)
  → Reviewer checks implementation against prototypes
```

No brief for web UI should be written until the relevant prototypes are approved.

## Where It Should Land

- `docs/dev-process.md` — add prototyping as a formal design phase
- Phase 10 gate — all core journey prototypes approved before Phase 10 brief finalised
- UI build strategy (`docs/research/ui-build-strategy-ux.md`) — prototypes ARE the reference
