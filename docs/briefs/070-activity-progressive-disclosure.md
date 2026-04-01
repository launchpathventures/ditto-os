# Brief: Activity Progressive Disclosure

**Date:** 2026-04-01
**Status:** ready
**Depends on:** Brief 069 (Rich Block Emission — blocks must appear before activity display matters less)
**Unlocks:** None (polish layer). Brief 063 can run in parallel.

## Goal

- **Roadmap phase:** Phase 11: Chat UX & Experience
- **Capabilities:** Three-level progressive disclosure for activity traces and reasoning — replace developer-oriented display with user-first defaults

## Context

The current conversation displays activity (tool calls + reasoning) in a single developer-oriented format: "8 steps — read file (5x), searched code (2x)" with expandable raw tool names, file paths, and grep patterns. Reasoning shows raw monospace thinking text. This serves developers but alienates the primary personas (Lisa, Rob, Nadia).

The Designer's spec (`docs/research/conversation-block-emission-ux.md`, Section 4) proposes three progressive disclosure levels:
- **Level 1 (default):** Human-language summary — "Ditto checked 3 sources and verified the result."
- **Level 2 (click to expand):** Outcome-oriented steps — "Checked knowledge base → found 2 relevant entries"
- **Level 3 (developer toggle):** Current display — raw tool names, file paths, patterns

This brief also suppresses reasoning display by default. The Confidence Card (Brief 068) and activity summary (Level 1-2) provide sufficient trust signals. Raw thinking is Level 3 only.

This supersedes Brief 067 (Reasoning Verification Evidence), which proposed reframing activity headers but not the full three-level progressive disclosure.

## Objective

A non-technical user (Lisa persona) can understand every activity indicator in the conversation without seeing tool names, file paths, or raw thinking. A developer can toggle to see everything. The default is human-first.

## Non-Goals

- **No changes to block emission.** That's Brief 069.
- **No changes to Confidence Card.** That's Brief 068 (complete).
- **No new activity grouping logic.** The existing grouping (consecutive CLI tools + reasoning → activity group) is correct. This brief changes HOW the group displays, not WHAT it groups.
- **No adaptive default level.** User preference or adaptive behavior can come later. For now: Level 1 default, Level 2 on click, Level 3 on developer toggle.
- **No animation changes.** That's Brief 066 territory.

## Inputs

1. `docs/research/conversation-block-emission-ux.md` — Designer's spec, Section 4 (Activity & Reasoning Display)
2. `packages/web/components/ai-elements/chain-of-thought.tsx` — Current ChainOfThought component
3. `packages/web/components/ai-elements/reasoning.tsx` — Current Reasoning component
4. `packages/web/components/ai-elements/message.tsx` — Activity grouping logic
5. `packages/web/components/ai-elements/tool-display-names.ts` — Tool display names (already has outcome/runningOutcome fields from Brief 067 spec)
6. `docs/insights/124-user-toggle-autonomy-during-streaming.md` — User close/open must be respected
7. `docs/insights/125-internal-activity-vs-user-facing-tools.md` — Internal vs user-facing distinction

## Constraints

- **Preserve user toggle autonomy (Insight-124).** If user manually expands or collapses, respect that. `userClosedRef` pattern from Reasoning component applies to all three levels.
- **Preserve auto-close behavior.** Activity groups auto-close 1.5s after streaming completes. This stays.
- **Preserve developer toggle (Ctrl+Shift+E).** Engine View already exists. Level 3 should be gated behind it.
- **No tool name rewrites.** Tool display names in `tool-display-names.ts` already have `outcome` and `runningOutcome` fields (from Brief 067 design). Use them for Level 2.
- **prefers-reduced-motion respected.** All transitions honor the media query.
- **All existing tests pass.** 453 unit + 14 e2e.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Progressive disclosure pattern | Nielsen Norman Group research (progressive disclosure best practice) | pattern | Standard UX pattern for managing complexity |
| Activity grouping | Existing `message.tsx` logic (Brief 064) | pattern | Proven grouping logic, don't change |
| Outcome-oriented labels | `tool-display-names.ts` outcome fields (Brief 067 spec) | pattern | Already designed, just need to populate and use |
| Developer toggle | Existing Ctrl+Shift+E Engine View | pattern | User already has this toggle; extend it to activity |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/ai-elements/chain-of-thought.tsx` | Modify: Add three-level display logic (Level 1 summary header, Level 2 outcome steps, Level 3 raw detail). Level determined by `engineView` context + user expansion state. Extends existing component — not a full rewrite. |
| `packages/web/components/ai-elements/reasoning.tsx` | Modify: Default collapsed. Only visible in Level 2 (as inline text, not monospace box) or Level 3 (current monospace display). Confidence Card replaces reasoning as default trust signal. |
| `packages/web/components/ai-elements/message.tsx` | Modify: Activity group rendering uses new ChainOfThought levels. Pass `engineView` state to activity groups. |
| `packages/web/components/ai-elements/tool-display-names.ts` | Modify: Populate `outcome`, `runningOutcome`, and `category` fields for all 10 CLI tool display names. |
| `packages/web/e2e/planning.spec.ts` or equivalent | Modify: Update e2e selectors if activity group DOM structure changes. |

## User Experience

- **Jobs affected:** Orient (activity summary tells user what happened), Review (activity trace provides verification evidence)
- **Primitives involved:** Activity Group (ChainOfThought), Reasoning panel, Message component
- **Process-owner perspective:** Lisa asks "What's the status of my content review?" She sees: Confidence Card → blocks (Brief 069) → text narrative. A quiet line says "Checked 3 sources and verified the result." She doesn't need to know Ditto read 5 files and ran 2 grep searches. If she's curious, she clicks to see outcome-oriented steps. Jordan, a technical PM, enables developer mode and sees the full tool trace he's used to.
- **Interaction states:**
  - **Streaming (active):** Level 1 shows pulsing "Checking sources..." with current tool's running outcome. Level 2 shows steps accumulating. Level 3 shows raw tool calls.
  - **Complete:** Level 1 shows summary "Checked 3 sources and verified the result." Levels 2-3 show completed steps.
  - **Empty:** No activity (text-only response) → no activity indicator shown.
  - **Error:** Tool failure in activity → Level 1: "Encountered an issue checking sources." Level 2: Shows which step failed. Level 3: Full error output.
- **Designer input:** `docs/research/conversation-block-emission-ux.md`, Section 4

## Acceptance Criteria

1. [ ] **Level 1 (default): Human-language summary.** Collapsed activity group shows a single line like "Checked 3 sources and verified the result." No tool names, no file paths, no step counts.
2. [ ] **Level 1 summary generated from tool categories.** Summary groups tools by category field from `tool-display-names.ts`. N = total distinct tool invocations. Verb adapts to category mix: "Checked {N} sources — {categories}" for read-only activity, "Completed {N} steps — {categories}" for mixed read/write activity. During streaming: current tool's `runningOutcome`. Confidence Card (Brief 068) renders independently — always visible when present, not gated behind disclosure level.
3. [ ] **Level 2 (click to expand): Outcome-oriented steps.** Each internal tool renders as its `outcome` label + result hint (e.g., "Checked knowledge base → found 2 relevant entries"). No raw tool names or file paths.
4. [ ] **Level 2 reasoning: Inline text.** Reasoning within activity groups renders as flat inline text (muted, not monospace box). No separate collapsible panel.
5. [ ] **Level 3 (developer toggle): Raw detail.** Ctrl+Shift+E toggles to current display — tool names, file paths, patterns, monospace reasoning. This is the existing behavior gated behind the toggle.
6. [ ] **Reasoning default collapsed outside activity groups.** Standalone reasoning parts (not grouped with tools) default to collapsed. Summary shows last ~80 chars (existing behavior). Expanding shows full text.
7. [ ] **Reasoning hidden at Level 1.** When activity group is collapsed (Level 1), reasoning content is not visible. Confidence Card serves as the trust signal instead.
8. [ ] **User toggle respected (Insight-124).** If user manually expands to Level 2, it stays expanded even if streaming continues. `userClosedRef` pattern preserved.
9. [ ] **Tool display names refined for Lisa test.** All tool display names in `tool-display-names.ts` have outcome-oriented labels that pass the Lisa test (no technical jargon, outcome-focused). Review and refine any existing labels that expose implementation details. (e.g., Read → outcome: "Checked files", runningOutcome: "Reading files...", category: "file")
10. [ ] **prefers-reduced-motion respected.** Level transitions use no animation when media query active.
11. [ ] **All 453 existing unit tests pass.**
12. [ ] **All 14 existing e2e tests pass.** E2e selectors updated if activity group DOM changes.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Does Level 1 pass the "Lisa test" (no technical jargon visible)?
   - Does Level 3 preserve all existing developer information?
   - Is Insight-124 (user toggle autonomy) properly implemented?
   - Does the developer toggle (Ctrl+Shift+E) cleanly switch between user/developer views?
   - Are all 10 CLI tool display names populated with meaningful outcomes?
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Run all tests
pnpm test && cd packages/web && pnpm exec playwright test

# 2. Manual verification: Start the app
pnpm dev

# 3. Ask Ditto something that triggers tool use
# Type: "What's happening with my work?"
# Expected (Level 1): Collapsed line "Checked 3 sources and verified the result."
# NOT expected: "8 steps — read file (5x), searched code (2x)"

# 4. Click the activity line to expand
# Expected (Level 2): Outcome-oriented steps like "Checked knowledge base → found 2 entries"
# NOT expected: "Read: processes/dev-pipeline.yaml"

# 5. Toggle developer mode (Ctrl+Shift+E)
# Expected (Level 3): Full tool trace with file paths and patterns
```

## After Completion

1. Update `docs/state.md`: Brief 070 complete, activity display now three-level progressive disclosure
2. Note: Brief 067 (Reasoning Verification Evidence) is superseded by this brief
3. Assess Brief 066 (Conversation Polish Layer) — animations and hover actions are still relevant, can proceed independently
4. Phase retrospective: Did the three levels feel natural? Is Level 1 summary generation accurate enough?
