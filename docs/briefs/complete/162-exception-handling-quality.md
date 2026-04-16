# Brief 162: Exception Handling — Escalation Quality, Guidance Memory, Stale Detection, Dependency Visibility

**Date:** 2026-04-14
**Status:** draft
**Depends on:** MP-4.1 (feedback-to-memory bridge — complete)
**Unlocks:** Self-resolving escalations over time

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-7.1 + MP-7.2 + MP-7.3 + MP-7.4)
- **Capabilities:** Human-readable escalations, guidance captured as memory, stale escalation detection, cross-process dependency visibility

## Context

The exception handling meta-process has working infrastructure (confidence gate, retry with feedback, orchestrator escalation, human step suspend/resume) but four UX and learning gaps:

1. **MP-7.1:** Escalation messages may show raw errors instead of human-readable explanations.
2. **MP-7.2:** User resolves an escalation with guidance, but the guidance isn't captured as memory — same escalation can recur.
3. **MP-7.3:** If user doesn't respond to an escalation for days, no follow-up. `detect_risks` doesn't surface stale escalations.
4. **MP-7.4:** When Process A depends on Process B's output and B fails, A shows "in progress" with no explanation of the blockage.

## Objective

Make escalations feel like a teammate asking for help, capture the guidance for next time, surface stale escalations, and show dependency chains when blocked.

## Non-Goals

- Changing retry logic (already works)
- Auto-resolving escalations (human guidance is the point)

## Inputs

1. `src/engine/heartbeat.ts` — step failure handling, retry logic
2. `src/engine/harness-handlers/feedback-recorder.ts` — feedback-to-memory bridge
3. `src/engine/self-tools/` — `detect_risks` tool
4. `src/engine/system-agents/orchestrator.ts` — orchestrator escalation types
5. `docs/meta-process-roadmap.md` — MP-7.1 through MP-7.4 specs

## Constraints

- Escalation messages must be templated per failure type (not one-size-fits-all)
- Guidance-to-memory must tag with the failure pattern for retrieval
- Stale detection threshold: 24 hours (configurable)
- Dependency visibility must show the chain, not just "blocked"

## Provenance

- `src/engine/heartbeat.ts` — existing retry logic and step failure handling
- `src/engine/harness-handlers/feedback-recorder.ts` — existing feedback-to-memory bridge
- `src/engine/self-tools/` `detect_risks` tool — existing risk detection
- `src/engine/system-agents/orchestrator.ts` — existing escalation types

## What Changes

| File | Action | What |
|------|--------|------|
| `src/engine/heartbeat.ts` | Modify | Human-readable escalation message templates per failure type |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify | Guidance-to-memory capture tagged with failure pattern |
| `src/engine/self-tools/` detect_risks | Modify | Stale escalation detection (>24h threshold) |
| ProgressBlock | Modify | Dependency chain display for cross-process blockages |

## User Experience

- **Jobs:** Review (escalation messages), Decide (provide guidance)
- **Primitives:** ProgressBlock, Daily Brief, Review Queue
- **Process-owner:** "I'm stuck on this quote — how would you handle combined pricing?" instead of raw errors
- **Interaction states:** Escalation presented → guidance provided → auto-resolved next time
- **Designer input:** Recommended for escalation message tone/format

## Engine Scope

Product (escalation UX and guidance memory are Ditto-specific)

## Acceptance Criteria

### MP-7.1 — Escalation Message Quality
1. [ ] Step failures generate human-readable explanations with context
2. [ ] Templates per failure type (confidence low, external error, timeout, dependency)
3. [ ] Escalation reads like a teammate: "I'm stuck on X because Y. How would you handle it?"

### MP-7.2 — Guidance-to-Memory Bridge
4. [ ] When user resolves escalation with guidance, captured as process-scoped memory
5. [ ] Memory tagged with failure pattern for retrieval on similar future failures
6. [ ] Same escalation auto-resolves on next occurrence using stored guidance

### MP-7.3 — Stale Escalation Detection
7. [ ] `detect_risks` surfaces escalations older than 24h
8. [ ] Includes age and original context in the risk item
9. [ ] Appears in briefing: "This has been waiting for your input for 2 days"

### MP-7.4 — Cross-Process Dependency Visibility
10. [ ] When process is blocked on another process's output, dependency chain shown
11. [ ] ProgressBlock shows: "Quoting paused — waiting on supplier research (failed 1h ago)"
12. [ ] Briefing includes dependency blockage as a risk item

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "escalation\|exception\|dependency"
pnpm run type-check
```

## After Completion

1. Run `/dev-documenter` to update `docs/state.md` and `docs/roadmap.md`
2. Mark MP-7.1 through MP-7.4 complete in `docs/meta-process-roadmap.md`
