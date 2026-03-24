# Insight-087: Every Piece of Data Has Provenance — The User Can Always Ask "Where Did This Come From?"

**Date:** 2026-03-24
**Trigger:** User directive: "It's essential whenever data is surfaced, it is clear where this data has come from, what process / agent / item has surfaced it, so the user can drill in if desired."
**Layers affected:** L6 Human (every component in the catalog), L3 Memory, L2 Process
**Status:** active — universal design rule, applies to every component

## The Rule

Every piece of data that appears anywhere in the Ditto UI must carry its provenance. The user must always be able to answer: **"Where did this come from?"** And they must be able to drill into that source.

This is not a feature. It is a universal property of the UI. Like how every element in a spreadsheet has a cell reference, every piece of data in Ditto has a source chain.

## What Provenance Means

Every data point has an origin:
- **Which process** produced or surfaced it
- **Which agent** (or human) created it
- **Which run** (when, what inputs)
- **Which knowledge** was used to produce it
- **What confidence** the system had

The user doesn't need to see all of this by default. But it must be **one click or hover away**. The provenance is always there, always accessible.

## Examples

**"91% clean" on the Quoting process:**
- Where did this come from? → Quoting process, calculated from 34 runs, last updated 2 hours ago
- Drill in → see the 34 individual runs, which were clean, which were corrected

**"$8,400 materials" on the Henderson quote:**
- Where did this come from? → Quoting process, agent used Reece price list (uploaded 4 Mar, 3 weeks stale), line items: copper pipe $2,100, fittings $1,800, fixtures $4,500
- Drill in → see the itemised materials breakdown, the price list used, when it was last updated

**"Labour looks low — bathrooms averaged 22 hrs" in Ditto's thinking:**
- Where did this come from? → Labour estimates knowledge (learned from 3 corrections by Rob over 6 weeks: Blake ensuite, Marsh bathroom, Peters bathroom)
- Drill in → see the 3 corrections, the original vs corrected values, when each happened

**"Copper +8%" in the heads-up alert:**
- Where did this come from? → Supplier tracking process, detected price movement from market data, compared against Reece price list on file
- Drill in → see the price comparison, the affected quotes, the market data source

## How This Appears in Components

Every component in the catalog must support provenance. The implementation is consistent:

**Default state:** The data appears clean, no clutter. Provenance is invisible but present.

**On hover or tap:** A subtle indicator appears (small icon, underline, or tooltip) showing the source. "From Quoting · 2 hrs ago" or "Based on Reece prices (3 wks old)."

**On click/drill:** Opens the source — the process run, the knowledge document, the specific agent output. The user goes deeper into the chain.

This is progressive disclosure applied to provenance. The UI is clean until you ask "where did this come from?" — then it answers immediately.

## Why This Matters

1. **Trust.** The user can verify anything. They're not trusting blindly — they can trace any number, any recommendation, any suggestion back to its source.

2. **Debugging.** When something looks wrong ("why is this quote so low?"), the user can follow the provenance chain to find the problem (stale price list, wrong labour estimate, etc.).

3. **Learning.** The user starts to understand how Ditto works by seeing the connections. "Oh, it used my Reece prices for this" — they learn the system through use, not documentation.

4. **Accountability.** Every output is traceable. Not "the AI said so" but "the quoting process used these specific inputs and this specific agent to produce this specific output."

## Design Implications for the Component Catalog

Every display component must have a `source` property:

```yaml
component: metric-row
data:
  label: "Quality"
  value: "91%"
source:
  process: "quoting"
  computation: "31 of 34 runs approved without changes"
  last_updated: "2 hours ago"
  drill_target: "/processes/quoting/performance"
```

The rendering layer handles the progressive disclosure — hover shows the source summary, click navigates to the drill target.

## Relationship to Other Insights

- **Insight-083** (knowledge visible and traceable): This extends 083 from knowledge provenance to ALL data provenance
- **Insight-086** (composable UI): Every component in the catalog must support provenance — it's a universal component property, not a per-page feature

## Where It Should Land

- **Component catalog spec** — every component has a `source` property with process, agent, computation, timestamp, drill target
- **Composition model** — the Self must populate provenance when composing any component
- **Interactive prototype** — hover/click provenance must be demonstrable
- **Engine** — every output, metric, and recommendation must carry its provenance chain in the data model
