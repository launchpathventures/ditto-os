# Brief: Phase 10c — Feed & Review

**Date:** 2026-03-24
**Status:** draft
**Depends on:** Brief 039 (Web Foundation)
**Unlocks:** Brief 042 (Navigation & Detail)

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard
- **Capabilities:** Contextual feed (6 item types), inline review flow, feedback capture, entity grouping, priority ordering

## Context

Brief 039 delivers the conversation surface. This brief builds the workspace's primary structured view — the feed — which becomes the user's daily surface once they have enough work to justify it. The feed merges Orient (shift report, updates), Review (inline approve/edit/reject), and Decide (insights, suggestions) into a single scrollable surface.

Key design decision from the UX spec: **review items live in the feed, not on a separate page.** This avoids a sparse separate review queue for single-process users and keeps everything in one place.

## Objective

A working feed component that renders 6 item types with inline actions, captures feedback from review interactions, groups items by work entity, and orders by priority. The feed works for a single-process user and scales to many.

## Non-Goals

- Sidebar navigation (Brief 042)
- Process detail views (Brief 042)
- Three-panel layout composition (Brief 042)
- Proactive briefing content generation (Brief 043 — this brief renders it, 043 produces it)
- Capability map (MVP+1)
- Batch review ("Approve batch" / "Spot-check N")
- json-render for process output content (deferred to when process outputs produce views)

## Inputs

1. `docs/briefs/038-phase-10-mvp-architecture.md` — parent architecture
2. `docs/research/phase-10-mvp-dashboard-ux.md` — sections 1, 3, 7.2
3. `src/engine/review-actions.ts` — existing approve/edit/reject
4. `src/engine/events.ts` — harness events for real-time updates
5. `src/db/schema.ts` — existing tables (workItems, processRuns, stepRuns, activities)

## Constraints

- MUST use shadcn/ui primitives for all card/button/dialog components
- MUST render feed items via a component registry (discriminated union on `itemType`)
- MUST NOT use json-render for the feed scaffold — standard React components
- MUST capture diffs when user edits a review item (for feedback-recorder)
- MUST group updates by work entity (not pure chronological)
- MUST order by priority (action-required first, then informational)
- MUST handle all interaction states: empty, loading, error, content, single-process
- MUST work with SSE events from Brief 039 for real-time item updates

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Feed card components | shadcn/ui Card + custom | depend + original | Card primitives from shadcn, item types original |
| Entity grouping | Notion updates pattern | pattern | Group by work item, not just chronologically |
| Inline actions | Asana card actions | pattern | Approve/edit/discuss without navigation |
| Progressive disclosure | Slack Peek | pattern | Expand/collapse inline |
| Feedback capture | Existing `feedback-recorder.ts` | extend | Diffs from edits route to existing handler |
| Priority ordering | Superhuman split inbox | pattern | Urgent/action above informational |
| Review-in-feed | Original to Ditto | — | No separate review queue page |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/feed/feed.tsx` | Create: main feed container with priority ordering, entity grouping, date separators |
| `packages/web/components/feed/item-registry.tsx` | Create: discriminated union item renderer |
| `packages/web/components/feed/shift-report.tsx` | Create: Type 1 — narrative shift report card |
| `packages/web/components/feed/review-item.tsx` | Create: Type 2 — review card with inline approve/edit/reject |
| `packages/web/components/feed/work-update.tsx` | Create: Type 3 — progress update card |
| `packages/web/components/feed/exception-item.tsx` | Create: Type 4 — exception/warning card |
| `packages/web/components/feed/insight-item.tsx` | Create: Type 5 — insight/suggestion card (trust change proposals, "Teach this") |
| `packages/web/components/feed/process-output.tsx` | Create: Type 6 — rendered process output card |
| `packages/web/components/feed/review-editor.tsx` | Create: inline editor for text/table outputs with diff tracking |
| `packages/web/components/feed/empty-state.tsx` | Create: empty/loading/error states per UX spec |
| `packages/web/lib/feed-types.ts` | Create: TypeScript types for feed items (discriminated union) |
| `packages/web/lib/feed-query.ts` | Create: TanStack Query hooks for feed data + SSE subscription |
| `packages/web/app/api/feed/route.ts` | Create: Route Handler to assemble feed items from DB |
| `src/engine/feed-assembler.ts` | Create: engine function to query and assemble feed items from workItems, processRuns, stepRuns, activities |

## User Experience

- **Jobs affected:** Orient (shift report, updates), Review (inline approve/edit/reject), Decide (insights, "Teach this" prompts)
- **Primitives involved:** Daily Brief (shift report card), Review Queue (inline in feed), Activity Feed (merged), Feedback Widget (conversational — "Teach this" prompt after edit patterns), Improvement Card (insight cards), Output Viewer (inline editor)
- **Process-owner perspective:** Rob scrolls the feed → sees shift report "2 quotes ready" → taps review card → approves one, edits another → edits captured as feedback → after 3 similar edits, insight card appears: "Teach this?"
- **Interaction states (per UX spec 7.2):**
  - *Feed empty:* "Nothing here yet. Talk to Self to get started."
  - *Feed loading:* 3 skeleton cards
  - *Feed error:* "Something went wrong. Self can help."
  - *Single-process:* One shift report + one item. Feels complete.
  - *Review card expanded:* Shows output with edit controls. Save/cancel.
  - *Review card approved:* Collapses to one line with ✓, slides down.
  - *Review card rejected:* Shows "Returned for revision" + reason.
- **Designer input:** UX spec sections 1.2-1.4 (feed items), 3 (review flow), 7.2 (workspace states)

## Acceptance Criteria

1. [ ] Feed component renders items in priority order (action-required first, then informational, then historical)
2. [ ] Shift report card (Type 1) renders narrative summary from `assembleBriefing()` data, collapsible detail
3. [ ] Review card (Type 2) renders output summary, flags, confidence indicator (green/amber/no dot), inline actions (approve, edit, ask Self)
4. [ ] Work update card (Type 3) renders one-line status + expandable detail
5. [ ] Exception card (Type 4) renders warning/error with natural language explanation + actions (investigate, pause, ask Self)
6. [ ] Insight card (Type 5) renders pattern detection + evidence + actions (Teach this, No, Tell me more)
7. [ ] Process output card (Type 6) renders summary + content area (placeholder for json-render)
8. [ ] Entity grouping: updates for the same work item cluster together
9. [ ] Inline review: approve calls `approveRun()` server-side, card collapses to confirmation. Note: `approveRun()` already records to activities table — the web path preserves this existing audit trail.
10. [ ] Inline review: edit opens inline editor, saves diff, calls `editRun()` server-side with diff attached
11. [ ] Inline review: reject shows reason input, calls `rejectRun()` server-side
12. [ ] Feedback capture: edit diffs stored via existing `feedback-recorder.ts` pathway
13. [ ] "Teach this" prompt: after detecting 3+ similar edits (pattern matching on correction type), insight card appears in feed
14. [ ] Real-time: new items appear via SSE subscription (from Brief 039 event stream), insert at correct priority position
15. [ ] `feed-assembler.ts` queries workItems + processRuns + stepRuns + activities and produces typed feed items

## Review Process

1. Spawn review agent with architecture.md + review-checklist.md + this brief + UX spec
2. Review checks: all 6 item types implemented, review actions go through engine server-side, feedback captured for edits, entity grouping works, single-process empty state feels complete
3. Present + review to human

## Smoke Test

```bash
# 1. Run a process via CLI: pnpm cli heartbeat
# 2. Open app → navigate to feed (or Self says "Show me everything")
# 3. Expected: Shift report at top, review item below (if trust gate paused)
# 4. Click approve on review item → card collapses with ✓
# 5. Edit a review item → inline editor opens → make a change → save
# 6. Check DB: edit diff recorded in activities table
# 7. With no processes: feed shows empty state "Nothing here yet. Talk to Self."
```

## After Completion

1. Update `docs/state.md` — feed and review shipped
2. Brief 042 is unblocked
