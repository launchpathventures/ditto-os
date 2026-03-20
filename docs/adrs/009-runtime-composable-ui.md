# ADR-009: Runtime Composable UI — Design Principles

**Date:** 2026-03-20
**Status:** proposed

## Context

Agent OS defines 16 domain-agnostic UI primitives and 8 view compositions. The question: should Agent OS build a formal runtime UI composition protocol (ViewSpec JSON, composition function, component registry) for its web dashboard?

**Research findings** (see `docs/research/runtime-composable-ui.md`):
- **SDUI** (Airbnb, Lyft, DoorDash, Netflix) is production-proven — but was invented primarily to solve **mobile app store deployment delays**. On the web, you can deploy anytime. The core SDUI value proposition doesn't apply.
- **A2UI** (Google, Dec 2025) is the first protocol for agent-driven UI composition. Sound architecture, but early (v0.9) and solves a multi-platform problem Agent OS doesn't have yet.
- **React already composes at runtime.** Conditional rendering based on data, trust tier, and process context is standard React — no intermediate JSON protocol needed.

**The key realisation:** The 16 primitives are React components. Composing them based on context is just React. The Output Viewer (Primitive 6) already adapts to six output types. Trust-aware density is `if (trustTier === 'supervised')` in the component. Data-driven rendering is props. A formal ViewSpec protocol between engine and frontend is an abstraction layer that adds complexity without solving a problem the web frontend actually has.

**When formal composition DOES earn its keep:**
- **Multi-platform rendering** — when iOS, Android, and web must render from the same backend description (Phase 13: Mobile)
- **Third-party surfaces** — rendering inside Slack (Block Kit), Teams (Adaptive Cards), or other platforms
- **Agent-emitted UI** — when agents compose views the developer never anticipated (Phase 11+), though the Output Viewer's type system already handles most of this

## Decision

### 1. No ViewSpec Protocol for Phase 10

Build the web dashboard with standard React component architecture. The 16 primitives are React components (shadcn/ui + Tailwind). The 8 view compositions are React pages that import and render the right primitives based on data. No intermediate JSON protocol. No composition function. No ViewSpec renderer.

This is the minimum that works: good components, data-driven rendering, React's natural composition model.

### 2. Three Design Principles Govern All UI Composition

These principles are durable regardless of whether a formal protocol exists:

**Principle A: Jobs are the organising dimension, not domains.**

The 16 primitives map to six human jobs. Views are composed around jobs. There is no "CRM screen" or "accounts screen" — there is the Review job rendering the right data for the right process. When a reconciliation process needs human review, the Review view shows the Output Viewer with a data table, the Feedback Widget for corrections, and the Review Queue filtered to that process. The primitives are the same; the data differs.

This is already how the architecture works. It needs no new mechanism — just discipline in not building domain-specific screens.

**Principle B: Trust tier modulates UI density.**

| Tier | What the human sees |
|------|-------------------|
| **Supervised** | Maximum detail. Every output in queue. Full process cards. All actions visible. |
| **Spot-checked** | Moderate. Sampled outputs highlighted. Collapsed cards with expand-on-demand. |
| **Autonomous** | Minimum. Exceptions only. Summary cards. Actions only on degradation. |
| **Critical** | Same as supervised + audit indicators (evidence trail always visible). |

In React, this is component props and conditional rendering. Not a protocol.

**Principle C: The 8 view compositions are defaults, not fixed screens.**

The 8 views in the architecture spec are good starting points. But the system should be able to compose views beyond them — for example, a process-specific review view that shows the Data View alongside the Output Viewer when the process produces tabular data. In React, this is a page component that looks at the process's output type and renders additional primitives conditionally. Again, not a protocol — just well-structured components.

### 3. Defer Formal Composition Protocol to Multi-Platform (Phase 13+)

When Agent OS needs to render on mobile (Phase 13) or inside third-party surfaces, re-evaluate. At that point:
- A2UI may have matured (v1.0+) and could be adopted directly
- The 16 primitives will have been battle-tested as React components, making it clear which abstractions are actually needed
- A formal protocol (ViewSpec or A2UI) will solve a real problem: one backend, multiple rendering targets

**Re-entry condition:** Phase 13 (Mobile) or whenever Agent OS needs to render UI outside of its own Next.js frontend.

### 4. The Output Viewer Is the Key Composability Primitive

The Output Viewer (Primitive 6) is where most runtime adaptivity actually happens. It already adapts to six output types:

| Output type | Renders as |
|-------------|-----------|
| Text | Rich text with inline editing, diff highlighting |
| Data | Table with flagged cells, sortable, filterable |
| Visual | Image preview with annotation overlay |
| Code | Syntax-highlighted with line-level comments |
| Action | Action log (what was done, to what, when, result) |
| Decision | Reasoning trace (input → steps → conclusion) |

This IS runtime composition — the system doesn't know at build time whether a process will produce text or data. The Output Viewer resolves this at runtime based on the output's type. No additional protocol needed.

When someone asks "can the system compose an accounts ledger?", the answer is: a reconciliation process produces data-type output. The Output Viewer renders it as a table with flagged discrepancies. The Feedback Widget captures corrections. The Review Queue shows it alongside other items. Standard React rendering from process data.

### 5. What Phase 10 Builders Should Know

- Build the 16 primitives as reusable React components with clear prop interfaces
- Build the 8 views as Next.js pages that compose primitives based on data
- Make trust tier available as context (React Context or prop) so primitives can adjust density
- Make the Output Viewer genuinely type-adaptive — this is the most important primitive
- Do NOT build a ViewSpec renderer, composition function, or JSON protocol
- Do NOT build domain-specific screens — if you're tempted to build an "accounts view" or "HR view", stop and compose from the 16 primitives instead

## Provenance

- **SDUI component registry pattern:** Airbnb Ghost Platform, Slack Block Kit, Google A2UI — studied for architectural patterns, not adopted as a protocol. The insight (trusted component catalog, server-decides-what / client-decides-how) informs how we think about the 16 primitives.
- **A2UI protocol:** Google (Apache 2.0) — architecturally aligned but deferred. Re-evaluate at Phase 13.
- **Trust-aware UI density:** Original — no surveyed system adjusts UI density based on earned trust tiers.
- **Jobs as organising principle:** Original — no surveyed system maps from human jobs to view composition. Already embedded in the 16 primitives design.
- **React conditional rendering:** Standard React architecture — the web framework already provides runtime composition.

## Consequences

**What becomes easier:**
- Phase 10 is simpler — build React components, not a protocol
- No abstraction layer to maintain between engine and frontend
- Standard React patterns — any React developer can contribute
- Trust-aware density is component logic, not a protocol concern

**What becomes harder:**
- If/when multi-platform is needed, the composition logic lives in React code and must be extracted into a protocol. This is deliberate: extract when you know, not before.
- Third-party surface rendering (Slack, Teams) will require a separate rendering path — but those platforms already have their own protocols (Block Kit, Adaptive Cards).

**What new constraints this introduces:**
- The 16 primitives must have clean, well-documented prop interfaces — they ARE the composition API
- Discipline required: no domain-specific screens. Every view composes from the 16 primitives.
- The Output Viewer must be genuinely type-adaptive — it carries most of the composability burden

**Follow-up decisions needed:**
- [ ] Phase 10 brief should specify the 16 primitive component interfaces (props, states, responsive behaviour)
- [ ] Phase 13 should re-evaluate A2UI adoption when multi-platform rendering is needed
- [ ] If agents need to emit UI beyond what the Output Viewer handles, re-evaluate the need for a formal protocol
