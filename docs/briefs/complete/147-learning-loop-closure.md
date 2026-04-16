# Brief 147: Learning Loop Closure — "Teach This?" Action

**Date:** 2026-04-14
**Status:** complete
**Depends on:** none (MP-4.1 feedback-to-memory bridge already implemented — see Insight-181)
**Unlocks:** MP-4.3 (correction rate tracking), MP-7.2 (escalation guidance-to-memory)

## Goal

- **Roadmap phase:** Meta-Process Robustness (sub-roadmap MP-4)
- **Capabilities:** MP-4.2 ("Teach this?" action loop — acceptance writes durable memory + quality criteria)

## Context

The feedback-to-memory bridge (MP-4.1) is already implemented and working:
- `createMemoryFromFeedback()` in `feedback-recorder.ts:141-220` creates process-scoped correction memories on every edit
- Reinforcement logic increments confidence on duplicate corrections (0.3 → 0.5 → 0.7 → 0.8 → 0.9)
- `memoryAssemblyHandler` in `memory-assembly.ts:131-151` loads process-scoped correction memories for next execution
- `checkCorrectionPattern()` in `feedback-recorder.ts:308-342` detects 3+ corrections and returns `{ pattern, count }`

The pattern notification surfaces in the feed via `feed-assembler.ts:472-503` which creates an `InsightItem` with `processId`, `processName`, `pattern`, `count`, and `evidence`.

**The gap is in the UI wiring and backend acceptance handler.** The `InsightCard` component at `packages/web/components/feed/insight-item.tsx:37` renders a "Teach this" button but **it has no onClick handler** — it does literally nothing. The "No" button only sets local React state (`setDismissed(true)`). The feed API route at `packages/web/app/api/feed/route.ts:31-108` only handles `approve`, `edit`, and `reject` actions — there is no `teach` action.

The `qualityCriteria` field on processes is `text("quality_criteria", { mode: "json" })` storing `string[]`. It's consumed by:
- `lens-composer.ts:135-136`: renders criteria as bullet points in step context
- `review-pattern.ts:52-74`: uses criteria for adversarial review prompts
- `deliberative-perspectives.ts:355`: passes criteria to perspective evaluation

So learned criteria appended as strings will immediately be used by the review pattern and lens composer — the learning loop closes naturally through existing harness handlers.

## Objective

Wire the "Teach this?" button end-to-end: UI click → API call → engine accepts pattern → memory locked at high confidence → quality criteria string appended to process definition → confirmation shown. The user sees their correction become a permanent rule.

## Non-Goals

- Correction rate tracking over time (MP-4.3 — separate brief)
- Before/after evidence narrative (MP-4.4 — depends on MP-4.3)
- SLM training data integration (Brief 135 already handles extraction)
- Modifying the pattern detection threshold (3+ works)
- Modifying `createMemoryFromFeedback()` — it already works for the immediate feedback path
- Adding new ContentBlock types — the InsightCard is already rendered

## Inputs

1. `src/engine/harness-handlers/feedback-recorder.ts` — `createMemoryFromFeedback()` (lines 141-220), `checkCorrectionPattern()` (lines 308-342), `extractCorrectionPattern()` (lines 234-248)
2. `src/engine/harness-handlers/memory-assembly.ts` — process-scoped memory loading (lines 131-151)
3. `src/engine/harness-handlers/lens-composer.ts` — consumes `qualityCriteria` as `string[]` (lines 29, 135-136)
4. `src/engine/harness-handlers/review-pattern.ts` — consumes `quality_criteria` as string array (lines 52-74, 158-175)
5. `packages/web/components/feed/insight-item.tsx` — "Teach this" button with no handler (line 37)
6. `packages/web/lib/feed-types.ts` — `InsightItem` type with `processId`, `pattern`, `count`, `evidence` (lines 106-119)
7. `packages/web/app/api/feed/route.ts` — POST handler only handles approve/edit/reject (lines 31-108)
8. `packages/web/lib/feed-query.ts` — `useReviewAction()` hook used by review items
9. `src/db/schema/product.ts` — processes table with `qualityCriteria` as JSON text field (line 143)
10. `docs/meta-process-roadmap.md` — MP-4 section

## Constraints

- Must work through the web UI feed (the primary path). CLI approve command is secondary and can be a follow-up.
- Memory confidence promotion must be idempotent — accepting the same pattern twice should not create duplicates
- Quality criteria updates must not break existing process definitions — many have `null` or empty `qualityCriteria`
- `qualityCriteria` is `string[]` — append human-readable strings like `"[learned] Always use 3 hours for bathroom labour"`, NOT structured objects. This avoids any schema change.
- No changes to `@ditto/core` — all changes are product layer
- The "No" button (dismiss) should persist the dismissal so the same pattern doesn't resurface — use the existing `suggestion_dismissals` pattern or a simpler in-memory approach

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Pattern acceptance → memory promotion | Existing reinforcement model in `feedback-recorder.ts` | adopt | Same codebase — extend existing confidence mechanics |
| Quality criteria as string[] | Existing `qualityCriteria` field consumed by lens-composer and review-pattern | adopt | Same codebase — learned criteria naturally flow into existing quality infrastructure |
| "Teach this?" UX pattern | Notion AI personal dictionary, Grammarly learned words | pattern | Common in AI tools that learn from corrections |
| Feed action wiring | Existing `useReviewAction()` hook pattern | adopt | Same codebase — same mutation pattern for a new action type |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: Add `acceptCorrectionPattern(processId, pattern)` function that: (a) queries all process-scoped correction memories matching the pattern, (b) updates confidence to 0.95 and sets `metadata.locked: true`, (c) returns the count of memories promoted |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: Add `promoteToQualityCriteria(processId, pattern)` function that: (a) reads the process's current `qualityCriteria` array (defaulting to `[]` if null), (b) generates a human-readable criterion string from the pattern and memory content, (c) checks for existing `[learned]` entry with same pattern (idempotency), (d) appends and updates the process record |
| `packages/web/app/api/feed/route.ts` | Modify: Add `"teach"` to valid actions. Handle: extract `processId` and `pattern` from request body, call engine's `acceptCorrectionPattern()` + `promoteToQualityCriteria()`, return `{ success, message }` |
| `packages/web/components/feed/insight-item.tsx` | Modify: Wire "Teach this" button with onClick handler that calls the feed API `teach` action with `processId` and `pattern` from `item.data`. Show confirmation state ("Learned!") on success. Wire "No" button to call feed API `dismiss-insight` or persist dismissal locally |
| `packages/web/lib/feed-query.ts` | Modify: Add `useTeachAction()` hook (or extend `useReviewAction()`) that POSTs to `/api/feed` with action `"teach"` |
| `src/engine/harness-handlers/feedback-recorder.test.ts` | Modify: Add tests for `acceptCorrectionPattern()` and `promoteToQualityCriteria()` |

## User Experience

- **Jobs affected:** Capture (user teaches the system), Review (user confirms learning)
- **Primitives involved:** InsightCard in feed (existing, needs wiring)
- **Process-owner perspective:** User edits bathroom labour from 2h to 3h for the 3rd time → feed shows InsightCard: "Quoting — You've made 4 similar corrections to bathroom labour hours. Should this become a rule?" → user clicks "Teach this" → button state changes to "Learned!" → next time the quoting process runs, lens-composer includes the learned criterion and review-pattern checks against it → output uses 3h without user edit
- **Interaction states:**
  - Default: "Teach this" / "No" / "Tell me more" buttons
  - Loading: "Teach this" button disabled, spinner (optional)
  - Success: button text changes to "Learned!" with check icon, card fades or stays as confirmation
  - Already taught: if user somehow clicks again, API returns success idempotently
  - Dismissed: card disappears (existing behavior from `setDismissed(true)`)
  - Error: button reverts, toast or inline error "Couldn't save — try again"
- **Designer input:** Not invoked — minimal UI change (wiring existing button + adding states)

## Acceptance Criteria

1. [ ] `acceptCorrectionPattern(processId, pattern)` finds all process-scoped correction memories matching the pattern and sets confidence to 0.95
2. [ ] Accepted memories have `metadata.locked: true` preventing future confidence reduction
3. [ ] `acceptCorrectionPattern` is idempotent — calling it twice for the same pattern returns success without duplicating
4. [ ] `promoteToQualityCriteria(processId, pattern)` reads the process's `qualityCriteria` field, defaulting to `[]` if null
5. [ ] Learned criterion is appended as a human-readable string like `"[learned] Always use 3 hours for bathroom labour (pattern: bathroom_labour_hours)"` — compatible with existing `string[]` type consumed by lens-composer and review-pattern
6. [ ] Quality criteria promotion is idempotent — same `[learned]` pattern prefix not duplicated in criteria array
7. [ ] Feed API POST route accepts `action: "teach"` with `processId` and `pattern` body fields. Authorization is inherited from the existing feed route architecture (server-side, workspace-scoped session) — the feed only assembles items for the authenticated user's processes, so the processId is already validated by provenance
8. [ ] Feed API `teach` action calls `acceptCorrectionPattern()` + `promoteToQualityCriteria()`, logs the action to the `activities` table (who taught what pattern on which process, when), and returns `{ success: true, message: "Learned: [description]" }`
9. [ ] InsightCard "Teach this" button has an onClick handler that calls the feed API teach action with `item.data.processId` and `item.data.pattern`
10. [ ] InsightCard shows success state after teach action completes (button text changes, visual confirmation)
11. [ ] InsightCard "No" button persists dismissal (either via API or local state) so the pattern doesn't immediately resurface
12. [ ] New test: accept pattern → memory confidence = 0.95, metadata.locked = true
13. [ ] New test: accept pattern twice → no duplicate memories or criteria entries
14. [ ] New test: promoteToQualityCriteria on process with null qualityCriteria → initialises array with one entry
15. [ ] New test: promoteToQualityCriteria on process with existing criteria → appends without overwriting
16. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: idempotency verified, no data loss on existing quality criteria, learned criteria strings render correctly in lens-composer and review-pattern, memory confidence semantics consistent with trust-diff model, InsightCard button states handle loading/error
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Type-check
pnpm run type-check

# Run feedback-recorder tests
pnpm vitest run src/engine/harness-handlers/feedback-recorder.test.ts

# Verify quality criteria consumed correctly
grep -n "qualityCriteria\|quality_criteria" src/engine/harness-handlers/lens-composer.ts
grep -n "qualityCriteria\|quality_criteria" src/engine/harness-handlers/review-pattern.ts

# Verify InsightCard has onClick
grep -n "onClick\|onAction\|teach" packages/web/components/feed/insight-item.tsx

# Verify feed API accepts teach
grep -n "teach\|validActions" packages/web/app/api/feed/route.ts
```

## After Completion

1. Update `docs/state.md` with MP-4.2 completion
2. Update `docs/meta-process-roadmap.md` — mark MP-4.1 as "already complete" (Insight-181) and MP-4.2 as done
3. Phase retrospective: does the full loop feel right? When a learned criterion is used in the next review, does the user notice the improvement? Consider whether correction rate tracking (MP-4.3) needs to follow immediately.
