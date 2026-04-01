# Insight-129: Response Metadata vs ContentBlocks — Two Rendering Pathways

**Date:** 2026-04-01
**Trigger:** Brief 068 design — ConfidenceAssessment as response-level metadata, not a ContentBlock, despite the "all rendering through ContentBlocks" rule
**Layers affected:** L2 Agent (structured output types), L6 Human (rendering architecture)
**Status:** absorbed into `docs/architecture.md` Rendering Architecture section (Brief 068)

## The Insight

The architecture's "all rendering flows through ContentBlocks" rule (ADR-021, Insight-107) is correct for **content** — discrete units of information that can appear independently in any composition context (Today briefing, Inbox, process output viewer). But not everything the engine produces is content. Some structured data describes the *response itself* — metadata about what was produced, not a thing that was produced.

Confidence assessment is the first example: it tells the user how much to trust the response. It only makes sense attached to the response it describes. It cannot appear independently in a composition intent. Rendering it through the ContentBlock registry would be architecturally wrong — it would imply the confidence card is a content unit that surfaces can display anywhere, when in fact it is conversation chrome tied to a specific message.

Two rendering pathways exist:
1. **ContentBlock pathway** — discrete content units rendered via BlockList/block registry. Portable across composition contexts. 22 types.
2. **Response metadata pathway** — structured data about the response, rendered as conversation chrome by the Message component. Flows via custom data parts (data-confidence, potentially others). Not portable.

The distinction: "Can this appear independently in a Today briefing?" If yes → ContentBlock. If no → response metadata.

## Implications

- `ConfidenceAssessment` is exported from `content-blocks.ts` for type co-location but is NOT a member of the `ContentBlock` discriminated union.
- Future response-level metadata (e.g., cost summary, latency breakdown for Jordan's demos) follows this pathway.
- If composition contexts later need confidence aggregation (e.g., briefing confidence across multiple process runs), a `ConfidenceBlock` ContentBlock variant can be added then — the response-level metadata feeds it, but they are distinct types serving distinct purposes.

## Where It Should Land

Update `docs/architecture.md` rendering architecture section to document the two pathways. Brief 068 "After Completion" includes this update.
