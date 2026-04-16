# Insight-192: Design Content Blocks Entity-Agnostic From the Start

**Date:** 2026-04-15
**Trigger:** Brief 155 — ProgressBlock needed to represent goal decomposition, not just process runs
**Layers affected:** L4 Awareness, L6 Human
**Status:** active

## The Insight

Content blocks that track entity state should use `entityType` + `entityId` as required fields from the start, not entity-specific IDs like `processRunId`. StatusCardBlock got this right; ProgressBlock didn't and required a migration.

When ProgressBlock was designed, it used `processRunId: string` as its identifier — baking in the assumption that progress only tracks process runs. When Brief 155 needed it to track goal decomposition, the first attempt added optional `entityType?` and `entityId?` fields alongside the legacy `processRunId`. This created three fields for one concept: the required field was sometimes a lie, and the optional fields told the truth.

The cleanup collapsed this to `entityType: "process_run" | "goal_decomposition"` + `entityId: string` as required fields — matching StatusCardBlock's pattern. Only 4 construction sites and 2 tests needed updating.

**The rule:** When a content block identifies an entity, use `entityType` + `entityId`. Never a type-specific ID field. A new block type is justified when the *rendering* diverges, not when the identifier semantics change.

## Implications

- Future content blocks should follow StatusCardBlock/ProgressBlock pattern: `entityType` + `entityId` for any block that references an entity
- Avoids backward-compat migration tax when the block needs to track a new entity type
- A new block type is justified when the rendering is meaningfully different (e.g., a dependency graph vs. a progress bar), not when only the data model differs

## Where It Should Land

ADR-021 (Surface Protocol) — as a design guideline for content block interfaces. Or architecture.md Layer 6 content block vocabulary section.
