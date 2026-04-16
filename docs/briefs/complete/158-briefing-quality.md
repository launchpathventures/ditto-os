# Brief 158: Briefing Quality — Autonomous Digest, Wait States, Empty State, Freshness

**Date:** 2026-04-14
**Status:** complete (2026-04-15)
**Depends on:** none
**Unlocks:** MP-5.3 (auto-advanced summary)

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-3.1 + MP-3.2 + MP-3.3 + MP-3.4 + MP-3.5)
- **Capabilities:** Complete briefing experience — autonomous summaries, wait-state clarity, graceful empty states, freshness guarantees, review-to-resume flow

## Context

The daily briefing (`get_briefing` tool, `briefing-assembler.ts`) shows items that need attention but has five gaps:

1. **MP-3.1 Autonomous digest:** When processes auto-advance at autonomous/spot-checked tier, there's no summary. User can't see "12 follow-up emails sent automatically, 2 got responses."
2. **MP-3.2 Wait-state visibility:** Processes waiting for external events (email reply, API response) show as "in progress" but the user can't distinguish "actively running" from "waiting for Sarah to reply."
3. **MP-3.3 Empty state:** When there's nothing to report, does the briefing say "all quiet" or hallucinate importance?
4. **MP-3.4 Review-to-resume flow:** User approves → next step starts → SSE event → UI updates without refresh. Verify the chain works.
5. **MP-3.5 Freshness:** Briefing must regenerate per session gap, never serve stale data.

## Objective

Close all five briefing gaps so the daily orient experience is complete and trustworthy.

## Non-Goals

- Redesigning the briefing UI (improvements within existing structure)
- Cycle-specific aggregate metrics (that's MP-8.2)

## Inputs

1. `src/engine/briefing-assembler.ts` — current briefing assembly
2. `src/engine/self-tools/` — `get_briefing` tool
3. `packages/web/hooks/use-harness-events.ts` — SSE event consumption
4. `packages/web/hooks/use-pipeline-review.ts` — review flow hooks
5. `docs/meta-process-roadmap.md` — MP-3.1 through MP-3.5 specs

## Constraints

- Autonomous digest must query auto-advanced step runs since last session
- Wait-state requires `wait_for` metadata on step runs
- Empty state must be deterministic (no LLM hallucination of urgency)
- Freshness: briefing timestamp must be included in output

## Provenance

- `src/engine/briefing-assembler.ts` — existing briefing assembly (existing)
- SSE event infrastructure — `use-harness-events.ts`, `use-pipeline-review.ts` (existing)
- Zapier Digest — autonomous summary pattern: batch activity into periodic digest (pattern)
- PagerDuty Event Intelligence — wait-state classification and human-readable descriptions (pattern)

## What Changes

| Target | Action | Detail |
|--------|--------|--------|
| `src/engine/briefing-assembler.ts` | Modify | Autonomous digest query (auto-advanced runs since last session), wait-state metadata rendering, empty state handling, freshness timestamp |
| `packages/core/src/content-blocks.ts` | Modify | ProgressBlock updates for wait-state display (`wait_for` metadata) |

## User Experience

- **Jobs:** Orient (daily briefing is the primary orient surface)
- **Primitives:** Daily Brief, ProgressBlock, Review Queue
- **Process-owner experience:** Morning briefing shows autonomous summary ("While you were away: 8 emails sent") + waiting states ("Waiting for supplier reply — sent 2 days ago") + review items
- **Interaction states:** briefing loading, briefing with content, briefing empty ("all clear — nothing needs your attention"), review-to-resume
- **Designer input:** Recommended for autonomous digest section UX

## Engine Scope

Product (briefing is Ditto-specific)

## Acceptance Criteria

### MP-3.1 — Autonomous Digest
1. [ ] `briefing-assembler.ts` queries auto-advanced step runs since last session
2. [ ] Digest summarized by process: "While you were away: 8 emails sent (2 responses), 3 quotes generated"
3. [ ] Digest appears in briefing output as a distinct section

### MP-3.2 — Wait-State Visibility
4. [ ] ProgressBlock distinguishes "running" from "waiting for external event"
5. [ ] `wait_for` metadata rendered with human-readable descriptions ("Waiting for supplier reply — sent 2 days ago")

### MP-3.3 — Empty State
6. [ ] When no items need attention, briefing returns "Nothing needs your attention. Your processes are running smoothly."
7. [ ] No hallucinated urgency in empty state

### MP-3.4 — Review-to-Resume Flow
8. [ ] Integration test: approveRun → fullHeartbeat → gate-pause event → UI shows next review item without refresh
9. [ ] SSE event chain verified end-to-end

### MP-3.5 — Freshness
10. [ ] Briefing regenerates per session gap (not cached stale)
11. [ ] Timestamp included in briefing output

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "briefing"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` — mark MP-3.1 through MP-3.5 complete
2. Run `/dev-documenter` to update roadmap and capture any insights
3. Brief 160 (MP-5.3) is unblocked by MP-3.1 autonomous digest
