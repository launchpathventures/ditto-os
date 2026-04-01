# Insight-130: The Chat Wrapper Trap — Polishing Parts Instead of Composing Blocks

**Date:** 2026-04-01
**Trigger:** User evaluation of Briefs 057-068 — conversation still feels like a "wrapped Claude/ChatGPT" despite 12 briefs of UI work. Chain of thought and reasoning remain clunky. No composable blocks appear in chat. 43 prototype HTML files exist as the design specification but are invisible to the dev skills.
**Layers affected:** L6 Human (conversation rendering), L2 Agent (Self response format), Dev Process (skill contracts)
**Status:** active — CRITICAL

## The Insight

Two compounding failures produced the current state:

### Failure 1: Optimising the Wrong Abstraction

The Brief 057-068 chain polishes the AI SDK message model (text parts, tool parts, reasoning parts) — making the wrapper nicer. But the fundamental experience remains: AI sends text + reasoning + tool traces, user reads text. This is exactly what Claude.ai and ChatGPT do.

Ditto's architecture describes a block-based conversation where the Self produces ContentBlocks as the PRIMARY rendering surface. The 22-type ContentBlock vocabulary (StatusCardBlock, MetricBlock, ChecklistBlock, SuggestionBlock, etc.) exists in the engine. The BlockList renderer is wired in message.tsx. But in practice, the Self's conversation responses are 95% raw text with occasional tool calls — the blocks never appear.

**What "not a chat wrapper" looks like (from RECONCILIATION.md Screen 3: Conversation):**
> "All these 'moments' happen naturally within the same conversation UI. The blocks (TextBlock, ReviewCardBlock, RecordBlock, KnowledgeCitationBlock, etc.) handle contextual rendering... Key blocks used: All 21 content block types render here."

### Failure 2: Prototypes Are Invisible to the Dev Process

43 prototype HTML files exist at `docs/prototypes/`. They are the definitive visual specification — showing exactly how conversations, blocks, and trust signals should look for Rob, Lisa, Jordan, and Nadia. RECONCILIATION.md maps all 43 files to 11 screens with specific block usage per screen.

**None of the 7 dev skill contracts reference prototypes.** Not the Builder, not the Designer, not the Architect, not the Reviewer. The review checklist doesn't check against them. CLAUDE.md doesn't mention them. The prototypes are completely invisible to the agents that build the product.

This means:
- The Builder implements from briefs that may or may not reference P30 (block gallery) — it's per-brief, not systemic
- The Designer produces specs without being required to reference the existing prototypes
- The Architect writes briefs without being required to show how their design maps to the prototype vision
- The Reviewer has no checklist item for "does this match the prototype specification?"
- The entire prototype investment has been orphaned from the build process

### The Compounding Effect

Failure 1 (wrong abstraction) + Failure 2 (invisible prototypes) = the dev pipeline produces polished chat wrappers instead of the block-based workspace the prototypes define. Each brief is internally correct (passes type-check, meets its own ACs) but collectively wrong (doesn't produce the product the prototypes specify).

## Implications

1. **Dev skills must reference prototypes.** At minimum:
   - `dev-designer.md`: MUST check `docs/prototypes/` and `docs/prototypes/RECONCILIATION.md` for existing visual specifications before designing
   - `dev-architect.md`: MUST reference relevant prototypes in brief Inputs section; MUST specify which prototype screens the brief advances
   - `dev-builder.md`: MUST check referenced prototypes during smoke test for visual verification
   - `dev-reviewer.md` / `review-checklist.md`: Add checklist item: "For UI work: does implementation match referenced prototype specifications?"
   - `CLAUDE.md`: Add `docs/prototypes/RECONCILIATION.md` to the "read when relevant" design documents list

2. **The conversation needs a block-first rewrite, not more chrome.** Briefs 066-068 should be superseded by a brief that changes the Self's response composition to produce blocks.

3. **P30 (Block Gallery) and RECONCILIATION.md are the north star.** Every UI brief should trace to these documents.

## Where It Should Land

- Immediate: Update all 7 dev skill contracts + CLAUDE.md + review-checklist.md with prototype references
- Next brief: Block-first conversation composition (replaces 066-068 chain)
- Requires `/dev-designer` to spec the block-first conversation using prototypes as the specification
