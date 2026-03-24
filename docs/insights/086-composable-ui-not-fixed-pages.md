# Insight-086: Composable UI, Not Fixed Pages — The Self Composes the Experience

**Date:** 2026-03-24
**Trigger:** Prototype review revealed that fixed page designs (Home, Tasks, Processes) contradict Ditto's core principle. The Self should compose the UI dynamically from universal components based on what's happening — not render pre-designed pages.
**Layers affected:** L6 Human (fundamental interaction model), L2 Process (catalog rendering), ADR-009 (component catalog), Conversational Self
**Status:** active — redirects Phase 10 design approach

## The Realisation

13 static HTML prototypes established the visual identity, emotional journey, and key moments. But they hit a wall: static pages can't convey navigation, transitions, or composability. More importantly, designing fixed pages (Home page, Tasks page, Processes page) contradicts Ditto's architecture.

**Ditto doesn't have pages. It has compositions.**

The Self decides what the user needs to see based on:
- What they just asked for (chat input)
- What needs their attention (inbox items)
- Where they navigated to (sidebar click)
- What process is active
- What knowledge exists or is missing

It assembles the appropriate components from a universal catalog and renders them in the centre canvas. The same canvas shows a morning brief, a quote review, a process map, or a guided intake — depending on context.

## The Stable Frame

```
┌──────────┬────────────────────────┬──────────────┐
│          │                        │              │
│   Nav    │   Centre Canvas        │    Ditto     │
│          │   (Self composes       │   (always    │
│  Where   │    from universal      │    present,  │
│  you go  │    components based    │    thinking, │
│          │    on context)         │    scanning, │
│          │                        │    suggesting│
│          │                        │              │
│          ├────────────────────────┤              │
│          │   Talk to Ditto...     │              │
└──────────┴────────────────────────┴──────────────┘
```

- **Left:** Navigation. Static. Where you go.
- **Centre:** Canvas. Dynamic. Whatever the Self composes.
- **Right:** Ditto. Always present. Contextual thinking + proactive suggestions.
- **Bottom:** Chat input. Always available. The universal entry point.

## What Changes

**Before:** Design each page (Home, Inbox, Tasks, Projects, Processes, Knowledge, Process Detail, etc.)
**After:** Design the component catalog + composition rules. The Self assembles pages from components.

## What The Component Catalog Needs

Two categories:

**Display components** — Show information:
- Text block (Ditto's voice — greeting, explanation, narrative)
- Data card (structured data — quote details, process metrics)
- Review item (something needing human judgment — with actions)
- Process visualization (steps, agents, connections, health)
- Knowledge reference (what was used, with freshness)
- Progress indicator (where you are in a journey)
- Alert/nudge (something to be aware of)
- History list (past runs, past outputs)
- Metric row (key numbers at a glance)

**Input components** — Gather information:
- Select card (single choice from options)
- Tag picker (multi-select with suggestions)
- Comparison card (A vs B)
- Text input (short text with context)
- Guided fields (sub-fields with labels)
- Confirmation card (review + approve/adjust)
- File upload
- Voice capture

**Each component:**
- Has a clear purpose and data shape
- Can render in the centre canvas at any size
- Composes with any other component
- The Self chooses which ones, in what order, with what data

## Composition Examples

**Rob opens Home:**
Self composes: text-block (greeting) → review-item (Henderson) → review-item (Wilson) → metric-row (process health) → alert (copper prices)

**Rob clicks "Processes":**
Self composes: process-visualization (map of all processes, their connections, agents, health)

**Rob starts typing "Henderson customer called about adding hot water":**
Self composes: data-card (existing Henderson quote) → text-block (Ditto's plan to add HW) → guided-fields (HW specs) → confirmation-card (revised total)

**Libby first visit:**
Self composes: text-block (welcome) → select-card (what's taking your time?) → progress-indicator (getting started)

## What We Need Next

1. **Component catalog spec** — Every component defined with: purpose, data shape, visual reference (from our prototypes), composition rules
2. **Composition model** — How the Self decides what to compose, transition rules, what triggers recomposition
3. **Interactive prototype** — A React app with the three-column frame + a simulated Self that responds to clicks and chat by recomposing the centre canvas

## What The Static Prototypes Become

The 13 HTML prototypes (P08-P20) are now **composition references** — visual targets for what specific compositions should look like. They're reference screenshots for the Builder, not the final design.

| Prototype | Composition reference for |
|-----------|--------------------------|
| P08 | First-visit composition (welcome + quick starts) |
| P09 | Guided intake composition (input cards + knowledge panel) |
| P10 | Output review composition (content cards + provenance) |
| P11 | Post-first-output composition (journey + next step) |
| P12 | Mobile composition (morning brief + review queue) |
| P13 | Home composition (greeting + review items + health + alerts) |
| P14 | Process detail composition (steps + performance + trust) |
| P15 | Knowledge browser composition (documents + health + gaps) |
| P16 | Teach-this composition (correction + pattern + confirm) |
| P17 | Trust upgrade composition (evidence + proposal + safety net) |
| P18 | Second process composition (knowledge reuse + setup) |
| P19 | Multi-process composition (cross-department health + impact) |
| P20 | Problem composition (timeline + recovery + trust change) |

## Where It Should Land

- **Phase 10 brief** — reframe from "build pages" to "build component catalog + composition engine"
- **ADR-009 v2** — extend catalog with display + input components
- **Architecture** — Self's composition logic as a first-class engine capability
- **Interactive prototype** — React app demonstrating composable UI
