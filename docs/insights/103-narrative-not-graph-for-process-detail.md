# Insight-103: Narrative, Not Graph, for Process Detail

**Date:** 2026-03-26
**Trigger:** Designer analysis comparing linear step visualization (v45) vs node-based DAG (v44) for process detail view
**Layers affected:** L6 Human
**Status:** active

## The Insight

Process detail ("How it works") must use a **linear narrative** — numbered plain-language steps — not a node-based graph. The node graph is the correct pattern for a different primitive at a different scale: the **Process Graph** (Primitive 14), which shows how multiple processes connect across the business.

The key distinction: intra-process visualization (how one process works) serves Orient and must be readable by all personas including Rob on a 375px screen. Inter-process visualization (how processes relate to each other) serves Decide and appears only at Month 3+ when 4+ processes exist.

Exposing engine-level complexity (branching, parallel execution, error paths) in the process detail view builds for the Workflow Designer anti-persona ("someone who thinks in boxes and arrows") rather than for outcome owners. Branching within a single process, when needed, should use indented sub-paths within the linear narrative — not nodes and connectors.

## Implications

- Process Detail view: linear narrative with step dots, plain language, who-does-what labels (Ditto/You), active-step indicator. Mobile-friendly.
- Process Graph (Primitive 14): node-graph approach with humanized labels (process names, not "Decision Point"), health-colored nodes, inter-process connections only.
- Process Builder (Primitive 9): structured list with rich metadata per step, still sequential.
- Indented sub-path branching needs a complexity ceiling: max 1 level in the linear view; deeper branching gets a simplified narrative with "see full detail" expansion. Needs prototyping.

## Where It Should Land

`docs/human-layer.md` — clarify the visual treatment distinction between Primitive 2 (Process Card expanded), Primitive 9 (Process Builder), and Primitive 14 (Process Graph). Ensure the three are never conflated in prototype or implementation work.
