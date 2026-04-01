# Insight-138: Metadata-First Block Mapping

**Date:** 2026-04-01
**Trigger:** Brief 069 build — reviewer flagged fragile regex parsing of tool text output for block construction. Fixed by having tools pass structured metadata alongside text, with block mapper using metadata-first with text fallback.
**Layers affected:** L2 Agent, L6 Human
**Status:** active

## The Insight

When Self tools return results, `toolResultToContentBlocks` must construct typed ContentBlocks for the conversation surface. Tools that return structured JSON (like `get_process_detail`, `adjust_trust`) are trivial — parse the JSON, populate block fields. But tools that return narrative text (like `detect_risks`, `get_briefing`, `suggest_next`) force the block mapper to regex-parse prose, which is fragile and breaks when text formatting changes.

The solution: tools pass structured data in `DelegationResult.metadata` alongside their text output. The block mapper checks `result.metadata` first for typed fields, and falls back to text parsing only when metadata is absent. This keeps backward compatibility while making the happy path reliable.

**Pattern:** `metadata` is for machines (block mapping), `output` is for the Self's narrative voice (text streaming). Both carry the same information in different forms. Neither should be removed.

## Implications

1. All future Self tools should populate `metadata` with any data that block mapping needs — even if the text output contains the same information.
2. Existing tools that currently return only text should progressively add metadata (Brief 069 did this for `detect_risks`, `get_briefing`, `suggest_next`).
3. The block mapper should never trust text parsing alone for fields that affect block type selection or content population.

## Where It Should Land

- Architecture spec L2 (Agent Execution): Self tool contract should document the `metadata` convention.
- Self tool template/guidelines: new tools should be built with metadata from the start.
