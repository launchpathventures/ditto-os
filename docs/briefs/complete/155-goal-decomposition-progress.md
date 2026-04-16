# Brief 155: Goal Decomposition Progress + Build Notifications

**Date:** 2026-04-14
**Status:** draft
**Depends on:** none
**Unlocks:** MP-2.4 (first-run streaming), MP-1.6 (end-to-end test)

## Goal

- **Roadmap phase:** Meta-Process Robustness (MP-1.4 + MP-1.5)
- **Capabilities:** Make goal decomposition visible to users; surface auto-built processes

## Context

When `create_work_item` triggers `executeOrchestrator()`, the tool returns immediately with classification JSON via `setImmediate()`. The user sees no progress — no "breaking this down into 3 steps...", no ProgressBlock. Goal decomposition is invisible.

Similarly, when the orchestrator's Tier 3 `triggerBuild()` creates a process automatically, the user never learns a new process was created for them.

## Objective

1. **MP-1.4:** Emit harness events during `executeOrchestrator` that the conversation can surface as ProgressBlocks. User sees "Breaking this into 3 steps... Starting step 1..." in real time.
2. **MP-1.5:** When `triggerBuild()` creates a process, emit a ContentBlock notification to the user's next briefing or active conversation. "I created a process for [sub-goal] — here's what it does."

## Non-Goals

- Changing orchestrator logic (only adding visibility)
- UI redesign (uses existing ProgressBlock and notification patterns)

## Inputs

1. `src/engine/system-agents/orchestrator.ts` — `executeOrchestrator()`, `goalHeartbeatLoop`
2. `src/engine/events.ts` — harness event emitter
3. `packages/web/hooks/use-harness-events.ts` — SSE event consumption
4. `docs/meta-process-roadmap.md` — MP-1.4, MP-1.5 specs

## Constraints

- Events must flow through existing SSE infrastructure
- ProgressBlock rendering must use existing ContentBlock registry
- Must not add latency to orchestrator execution

## Provenance

- Original to Ditto (orchestrator progress pattern)
- Harness event emitter (existing)

## What Changes

| File | Action | Notes |
|------|--------|-------|
| `src/engine/system-agents/orchestrator.ts` | Modify | Emit progress events during goal decomposition |
| `src/engine/events.ts` | Modify | New event types if needed |
| Content block for build notifications | Modify/Create | Notification content block for triggerBuild |

## User Experience

- **Jobs:** Orient (see progress), Delegate (trust that goals are being decomposed)
- **Primitives:** ProgressBlock, notification
- **Process-owner:** Sees real-time decomposition progress
- **Interaction states:** streaming progress, complete
- **Designer input:** Not invoked — uses existing ProgressBlock

## Engine Scope

Product (orchestrator events and notifications are Ditto-specific)

## Acceptance Criteria

1. [ ] `executeOrchestrator` emits progress events at: decomposition start, each sub-task identified, each sub-task dispatched
2. [ ] Active conversation surfaces orchestrator progress as ProgressBlocks in real time
3. [ ] `triggerBuild()` emits a notification event when it creates a new process
4. [ ] Notification appears in the user's next briefing or active conversation with process name and description
5. [ ] Existing orchestrator behavior unchanged (events are additive, not blocking)
6. [ ] Tests cover: event emission during decomposition, ProgressBlock rendering, build notification delivery

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks event emission patterns, SSE flow, no orchestrator regression
3. Present work + review findings to human

## Smoke Test

```bash
pnpm test -- --grep "orchestrator"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md` with what changed
2. Update `docs/roadmap.md` status for MP-1.4, MP-1.5
3. Run `/dev-documenter` for retrospective
