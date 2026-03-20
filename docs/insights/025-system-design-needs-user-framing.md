# Insight-025: System-Level Design Needs Explicit User-Level Framing

**Date:** 2026-03-19
**Trigger:** Dev PM flagged that Designer and Architect roles lacked explicit access to user personas and problem framing — all existing design docs were system-facing
**Layers affected:** L6 Human, L1 Process, dev process (meta)
**Status:** active

## The Insight

Agent OS had extensive system-level design documentation (architecture spec, human-layer primitives, trust model, process definitions) but no document that framed the product from the user's lived experience. The six human jobs, 16 UI primitives, and trust tiers were all defined — but the *person* using them was described only as an archetype ("non-technical knowledge worker") scattered across multiple docs.

This meant the Designer and Architect were making decisions based on principles and primitives but not grounded in specific people with specific problems. The risk: designing for the system's elegance rather than the user's reality. A well-designed trust control is useless if it doesn't address Sam's anxiety about silent failures. A beautiful process builder is wasted if Marcus can't get through setup in 10 minutes.

The fix was a dedicated personas document (`docs/personas.md`) that gives every role explicit access to who we're building for, what their days look like, and what emotional journey the product must serve.

## Implications

- Every design document set needs both system-level specs (what the system does) and user-level framing (who it serves and why). One without the other produces technically sound but user-disconnected design.
- The Designer role's required inputs should include personas alongside human-layer.md and architecture.md.
- Personas are hypotheses until validated by real users — they should be updated as the product encounters real people.
- This same pattern will apply within Agent OS itself: when the platform helps users define processes (Explore mode), it must frame the conversation from the user's perspective, not the system's capabilities.

## Where It Should Land

Dev process doc — Designer and Architect required inputs should reference `docs/personas.md`. The persona document itself lives alongside the other design docs as foundational input.
