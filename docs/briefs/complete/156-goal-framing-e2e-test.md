# Brief 156: Goal Framing End-to-End Test

**Date:** 2026-04-14
**Status:** draft
**Depends on:** Brief 155 (goal decomposition progress)
**Unlocks:** Confidence that MP-1 flow works end-to-end

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-1.6)
- **Capabilities:** Automated end-to-end validation of the full goal framing → process creation → first run → review flow

## Context

MP-1.1 (template matching), MP-1.2 (post-creation activation), and MP-1.3 (cycle heartbeat fix) are all complete via Brief 145. MP-1.4+1.5 add visibility. This test validates the entire chain works together.

## Objective

End-to-end test: "user says need → process proposed → approved → first run completes → output reviewed." Covers the full MP-1 meta-process from start to finish.

## Non-Goals

- Testing individual components (already covered by unit tests)
- Performance benchmarking

## Inputs

1. `src/engine/self-tools/generate-process.ts` — `findProcessModel()`, `generate_process`
2. `src/engine/heartbeat.ts` — `fullHeartbeat()`
3. `src/engine/system-agents/orchestrator.ts` — goal decomposition
4. Existing e2e test patterns in the codebase

## Constraints

- Must run in test mode (no external API calls)
- Must validate each handoff point in the chain

## Provenance

- Existing e2e test patterns in codebase (pattern)

## What Changes

| File | Action | Notes |
|------|--------|-------|
| New e2e test file | Create | Full goal framing flow validation |

## User Experience

N/A — test only

## Engine Scope

Product (tests Ditto-specific flow)

## Acceptance Criteria

1. [ ] E2E test: user input → `generate_process` proposes process with template matching
2. [ ] E2E test: proposal approval → process created in DB
3. [ ] E2E test: post-creation activation → `fullHeartbeat()` called → first run starts
4. [ ] E2E test: first run completes → output available for review
5. [ ] E2E test: review action (approve) → trust data updated
6. [ ] All handoff points validated (no silent failures between stages)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "goal-framing-e2e"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for MP-1.6
3. Run `/dev-documenter` for retrospective
