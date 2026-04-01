# Brief: Rich Block Emission

**Date:** 2026-04-01
**Status:** ready
**Depends on:** Brief 068 (Confidence & Trust Card — complete)
**Unlocks:** Brief 070 (Activity Progressive Disclosure), Brief 063 (Block Renderer Polish — becomes more impactful)

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Conversation block emission — bridge the gap between the 22 ContentBlock types in the engine and what actually appears in conversation

## Context

Insight-131: Seven completed briefs (057-068) polished a chat wrapper. The engine has 22 ContentBlock types. The block registry renders all 22. But `toolResultToContentBlocks` in `self-stream.ts` maps only 12 of 19 Self tools, and most emit only StatusCard/Text. The conversation looks like wrapped ChatGPT — text streaming with developer-oriented activity traces. The prototypes (P16, P17, P22) show rich inline blocks (records, metrics, checklists, provenance citations) that never appear.

The Designer's interaction spec (`docs/research/conversation-block-emission-ux.md`) established the principle: **"Text is narrative, blocks are evidence."** Self's text is its voice; blocks are the structured evidence that supports it. This brief makes that principle real.

## Objective

Every Self tool produces appropriate ContentBlocks in conversation. A response to "What's the status of my invoice process?" shows a Record with fields, a Metric with trust score, and a Suggestion for next steps — not just a wall of text.

## Non-Goals

- **No new block types.** The existing 22 types are sufficient. This brief activates them, not extends them.
- **No UI component changes.** Block renderers already exist in `packages/web/components/blocks/`. If visual quality needs improvement, that's Brief 063.
- **No activity display changes.** Progressive disclosure for activity/reasoning is Brief 070.
- **No changes to the Confidence Card.** Brief 068 is complete and correct (response-level metadata per Insight-129).
- **No LLM prompt engineering for block selection.** Block types are determined by `toolResultToContentBlocks` based on tool output data shape — deterministic, not LLM-decided.
- **No streaming block changes.** Blocks arrive complete on tool result (Insight-110 boundary). Text streams. This is correct.

## Inputs

1. `docs/research/conversation-block-emission-ux.md` — Designer's interaction spec with block vocabulary, triggers, conversation flow examples
2. `src/engine/self-stream.ts` — Current `toolResultToContentBlocks` function (lines 522-814)
3. `src/engine/content-blocks.ts` — All 22 ContentBlock type definitions
4. `src/engine/self-tools/` — Tool implementations and return formats
5. `cognitive/self.md` — Self's cognitive framework (needs block emission guidance)
6. `docs/architecture.md` — L6 Human Layer, ContentBlock system spec
7. `docs/insights/131-chat-wrapper-is-not-the-product.md` — The triggering insight

## Constraints

- **Keep the switch statement pattern.** `toolResultToContentBlocks` is a deterministic switch on tool name. This is proven, testable, and correct. Don't replace it with a declarative/metadata-driven system — that's premature abstraction for 19 cases.
- **Parse, don't invent.** Block data must come from the tool's actual output. Don't fabricate fields. If a tool doesn't return trust score data, don't emit a Metric block for it.
- **One to three blocks per tool result.** The Designer's spec says more than three creates visual noise. Pick the highest-value blocks per tool.
- **Preserve existing block emissions.** Don't break what works. StatusCard from `create_work_item` is correct — enhance, don't replace.
- **`assess_confidence` stays as metadata.** Per Insight-129, it emits via `data-confidence` data part, not ContentBlock. Don't change this.
- **`consult_role` stays text-only.** A consultant's perspective is narrative — forcing it into blocks would be artificial.
- **All 453 existing unit tests must pass.** All 14 e2e tests must pass.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Switch-based tool→block mapping | Existing `self-stream.ts` pattern | pattern | Proven in production, deterministic, testable |
| Block type selection per data shape | Designer spec `conversation-block-emission-ux.md` | pattern | UX-driven block vocabulary with human jobs mapping |
| KnowledgeCitation pattern | P22 prototype + `content-blocks.ts` KnowledgeCitationBlock | pattern | Prototype shows provenance strips; block type already defined |
| Record for entity detail | P17 prototype + `content-blocks.ts` RecordBlock | pattern | Prototype shows trust evidence as field tables; RecordBlock supports this |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-stream.ts` | Modify: Expand `toolResultToContentBlocks` — enrich block output for 6 existing tools, add block mappings for 5 unmapped tools |
| `src/engine/self-tools/assess-confidence.ts` | No change (stays metadata per Insight-129) |
| `cognitive/self.md` | Modify: Add block emission guidance — "when tool results contain structured data, blocks appear inline as evidence alongside your narrative" |
| `src/engine/self-stream.test.ts` or `src/engine/llm-stream.test.ts` | Modify: Add tests for new block mappings (≥1 per changed tool) |
| `src/engine/self-tools/self-tools.test.ts` | Modify: Add tests verifying tool return structures support block mapping |

## User Experience

- **Jobs affected:** Orient (StatusCard, Record, Metric, Chart), Review (Checklist, KnowledgeCitation), Define (ProcessProposal), Delegate (Record for trust evidence, Checklist for safety net), Decide (Suggestion, Alert)
- **Primitives involved:** Conversation Messages (centre column), Block renderers (22 types), Confidence Card (unchanged, chrome)
- **Process-owner perspective:** When you ask Ditto about a process, you see a structured record with fields, a trust score metric, and actionable suggestions — not a wall of text. When Ditto detects a risk, you see an alert with a suggested mitigation. When you approve an output, you see a clear status change. The conversation becomes evidence-rich.
- **Interaction states:** Blocks appear on tool completion (not during streaming). During streaming, text flows. When tool executes, blocks appear inline at completion. No loading state for blocks (they arrive atomically). Error state: tool failure → AlertBlock with error severity.
- **Designer input:** `docs/research/conversation-block-emission-ux.md` — full interaction spec with block vocabulary tiers, conversation flow examples, and success criteria.

## Acceptance Criteria

1. [ ] **`get_process_detail` emits Record + Metric (enriched from StatusCard).** Record contains process fields (name, status, trust tier, last run, runs count). Metric shows trust score with trend if available. Note: Verify that `transition-map.ts` does not depend on StatusCardBlock from this tool for panel switching — if it does, emit both Record + StatusCard.
2. [ ] **`detect_risks` emits Alert per risk + Suggestion for mitigations.** Each risk becomes an AlertBlock (warning severity). If mitigations exist, a SuggestionBlock follows. Cap: if more than 3 risks, emit top 3 as AlertBlocks + 1 SuggestionBlock noting additional risks exist (Designer spec: "more than three creates visual noise").
3. [ ] **`get_briefing` emits KnowledgeSynthesis + Checklist.** KnowledgeSynthesis (existing) preserved. Checklist added for action items if briefing contains actionable items. Metric added for key numbers (work items count, pending reviews) if data is present.
4. [ ] **`suggest_next` emits SuggestionBlock.** Content from tool output, reasoning from tool's rationale. Actions: accept/dismiss.
5. [ ] **`adjust_trust` emits Record + Checklist + StatusCard.** Record shows before/after trust tier with evidence fields. Checklist shows safety net criteria. StatusCard confirms the change.
6. [ ] **`adapt_process` emits ProcessProposalBlock.** Shows the adapted process definition with step names, descriptions, and status indicators.
7. [ ] **`connect_service` emits StatusCard.** Shows connection status (success/failure), service name, integration details.
8. [ ] **`approve_review` / `edit_review` / `reject_review` emit StatusCard + conditional Alert.** StatusCard for the review action result. Alert (info) only when tool result contains substantive rationale or next steps — not for routine approvals (avoids noise in batch reviews).
9. [ ] **`quick_capture` emits StatusCard + KnowledgeCitation.** StatusCard for the captured item. KnowledgeCitation if the capture was classified using knowledge sources.
10. [ ] **`consult_role` returns empty block array (narrative only).** Consultant perspective is text — forcing blocks would be artificial.
11. [ ] **`assess_confidence` unchanged.** Still emits via `data-confidence` data part, not ContentBlock (Insight-129).
12. [ ] **`cognitive/self.md` updated with block emission guidance.** Section added explaining: "When your tools return structured data, blocks appear inline in the conversation as evidence alongside your narrative. You don't need to repeat the block data in text — reference it."
13. [ ] **Tests: ≥1 test per changed tool mapping.** Each test verifies the correct block types are emitted for representative tool output. At least 11 new tests total.
14. [ ] **All 453 existing unit tests pass.** No regressions.
15. [ ] **All 14 existing e2e tests pass.** No regressions.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Does every tool emit blocks consistent with the Designer's block vocabulary tiers?
   - Are blocks based on actual tool output data (not fabricated)?
   - Does the cognitive/self.md update avoid leaking implementation details?
   - Is Insight-110 boundary preserved (text streams, blocks arrive atomically)?
   - Is Insight-129 respected (confidence stays metadata, not block)?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run unit tests
pnpm test

# 2. Run e2e tests
cd packages/web && pnpm exec playwright test

# 3. Manual verification: Start the app and ask Ditto about a process
pnpm dev
# In the conversation, type: "What's the status of my dev pipeline?"
# Expected: Record block with process fields + Metric with trust score
# NOT expected: Wall of text describing the same information

# 4. Manual verification: Ask Ditto for suggestions
# Type: "What should I work on next?"
# Expected: SuggestionBlock with accept/dismiss actions
# NOT expected: Plain text list of suggestions
```

## After Completion

1. Update `docs/state.md` with: Brief 069 complete, all 19 Self tools have block emission strategies
2. Update `docs/roadmap.md`: Phase 11 progress — conversation block emission complete
3. Reassess Brief 063 (Block Renderer Polish) — now MORE relevant since blocks actually appear
4. Note: Briefs 066 (Conversation Polish) and 067 (Reasoning Verification) are partially superseded. 066's animations/hover still have value. 067's activity reframe is absorbed by Brief 070.
5. Phase retrospective: Did the "text frames, blocks prove" principle hold? Which block types had the most impact?
