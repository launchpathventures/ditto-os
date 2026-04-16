# Brief 159: Correction Rate Tracking + Evidence Narrative + E2E Learning Test

**Date:** 2026-04-14
**Status:** draft
**Depends on:** Brief 147 (MP-4.2 "Teach this?" complete)
**Unlocks:** MP-7.2 (escalation guidance-to-memory — already unblocked via MP-4.1)

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-4.3 + MP-4.4 + MP-4.5)
- **Capabilities:** Track correction rates per pattern, show before/after evidence, validate full learning loop

## Context

MP-4.1 (feedback-to-memory bridge) and MP-4.2 ("Teach this?" action loop) are complete. The learning loop captures corrections and promotes patterns to quality criteria. What's missing:

1. **MP-4.3 Correction rate tracking:** Track per-process, per-pattern correction rates over time. Surface in process detail and briefing.
2. **MP-4.4 Evidence narrative:** When suggesting trust upgrade or showing learning effect, include before/after correction rates. "Labour estimate corrections: 60% → 8% after learning."
3. **MP-4.5 E2E test:** Edit output 3x with same pattern → notification appears → accept → next run produces corrected output without human edit.

## Objective

Close the learning loop with measurable evidence: track what's being corrected, show it's improving, prove it end-to-end.

## Non-Goals

- SLM training (Brief 135 handles that separately)
- Changing the correction detection logic (already works)

## Inputs

1. `src/engine/harness-handlers/feedback-recorder.ts` — correction pattern detection, memory bridge
2. `src/engine/briefing-assembler.ts` — briefing data assembly
3. `src/engine/trust.ts` — trust upgrade suggestions
4. `docs/meta-process-roadmap.md` — MP-4.3, MP-4.4, MP-4.5 specs

## Constraints

- Correction rates must be computed from existing feedback records (no new tracking table needed if feasible)
- Evidence narrative must integrate with existing trust upgrade suggestion flow
- E2E test must run without external API calls

## Provenance

- `src/engine/harness-handlers/feedback-recorder.ts` — correction pattern detection, memory bridge (existing)
- `src/engine/trust.ts` — trust upgrade suggestion flow (existing)
- WikiTrust severity model — correction classification by edit severity and frequency (pattern)

## What Changes

| Target | Action | Detail |
|--------|--------|--------|
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify | Correction rate computation per process/pattern, time-windowed tracking |
| `src/engine/trust.ts` | Modify | Evidence narrative in upgrade suggestions ("correction rate dropped from 60% to 8%") |
| `src/engine/briefing-assembler.ts` | Modify | Correction rate trends in briefing when significant change detected |
| `src/engine/` (new test file) | Add | E2E learning loop test: edit 3x -> pattern detected -> teach -> corrected output |

## User Experience

- **Jobs:** Orient (see correction rates in briefing), Review (evidence informs trust decisions)
- **Primitives:** Process detail, Daily Brief, trust suggestion
- **Process-owner experience:** Sees "correction rate dropped from 60% to 8% after learning labour estimates" as concrete evidence in trust upgrade suggestions and briefing
- **Designer input:** Not invoked — data appears in existing views

## Engine Scope

Product (correction tracking is Ditto-specific feedback loop)

## Acceptance Criteria

### MP-4.3 — Correction Rate Tracking
1. [ ] Per-process, per-pattern correction rates computed from feedback records
2. [ ] Rates tracked over time (at minimum: before learning, after learning)
3. [ ] Correction rates surfaced in process detail view
4. [ ] Correction rate trends included in briefing when significant change detected

### MP-4.4 — Evidence Narrative
5. [ ] Trust upgrade suggestions include correction rate evidence: "Correction rate dropped from X% to Y%"
6. [ ] Learning effect shown when "Teach this?" pattern is active: before/after rates
7. [ ] Narrative is human-readable and specific (not generic "performance improved")

### MP-4.5 — End-to-End Learning Test
8. [ ] E2E test: edit output 3x with same pattern → pattern notification appears
9. [ ] E2E test: accept "Teach this?" → quality criteria updated + memory locked
10. [ ] E2E test: next run produces corrected output without human edit
11. [ ] Full loop validated: correction → pattern → teach → learning → improved output

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "correction-rate\|learning-loop"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` — mark MP-4.3 through MP-4.5 complete
2. Run `/dev-documenter` to update roadmap and capture any insights
3. MP-7.2 (escalation guidance-to-memory) is already unblocked via MP-4.1
