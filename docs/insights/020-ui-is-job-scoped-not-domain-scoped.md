# Insight-020: React Is Already Runtime Composable — Don't Over-Engineer

**Date:** 2026-03-20
**Trigger:** Research into runtime composable UI, followed by practical evaluation of whether a formal ViewSpec protocol is needed for web
**Layers affected:** L6 Human
**Status:** active

## The Insight

SDUI (Server-Driven UI) was invented to solve mobile app store deployment delays. On the web, you can deploy anytime — the core SDUI value proposition doesn't apply. React already composes at runtime: conditional rendering, data-driven props, context-based density. A formal JSON composition protocol between engine and frontend is an abstraction that adds complexity without solving a problem the web frontend actually has.

The three design principles that matter are:
1. **Jobs are the organising dimension, not domains** — no CRM screens, no accounts screens. Compose from the 16 primitives based on which job the human is performing.
2. **Trust tier modulates UI density** — supervised processes show more detail, autonomous show less. This is component props and conditional rendering, not a protocol.
3. **The 8 view compositions are defaults, not fixed screens** — the system can compose beyond them by rendering additional primitives conditionally based on process data and output type.

The Output Viewer (Primitive 6) carries most of the composability burden — it adapts to six output types at runtime. That IS runtime composition. It's just React.

A formal ViewSpec protocol becomes valuable when Agent OS needs multi-platform rendering (mobile, third-party surfaces) — Phase 13+. Until then, build good React components with clean prop interfaces.

## Implications

- Phase 10 (Web Dashboard) is simpler: build 16 React components (shadcn/ui + Tailwind), compose them in 8 Next.js pages, use data-driven rendering. No intermediate protocol.
- The Output Viewer is the most important primitive — it must be genuinely type-adaptive.
- Discipline replaces protocol: never build domain-specific screens. Always compose from the 16 primitives.
- Re-evaluate for formal composition protocol at Phase 13 (Mobile) when multi-platform rendering creates a real problem.

## Where It Should Land

ADR-009 captures the decision. Architecture spec L6 should note that view compositions are defaults, not fixed screens, and that trust tier modulates UI density. No architecture changes needed for the protocol — there isn't one yet.
