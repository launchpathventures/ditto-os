# Brief: Process Primitive Wiring — schedule, wait_for, gate, email_thread

**Date:** 2026-04-10
**Status:** draft
**Depends on:** None (foundational)
**Unlocks:** Brief 123 (Workspace Lite), Brief 124 (Ghost Mode), Brief 125 (Visibility + Cancellation)

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Conversation-aware process execution, adaptive nurture cadences, reply-triggered flows

## Context

Four step primitives are defined in `StepDefinition` (`packages/core/src/harness/harness.ts`) but none are evaluated by the heartbeat. Process templates that declare `schedule`, `wait_for`, `gate`, or `email_thread` silently ignore them. This means:

- `user-nurture-first-week.yaml` cadenced steps fire immediately (not delayed)
- `front-door-intake.yaml` `gather-details` step with `wait_for: reply` doesn't suspend
- Engagement gates on nurture steps don't filter based on user activity
- Email threads across steps don't group into a single conversation

These are **engine primitives** — they belong in the heartbeat (Ditto product layer) with type definitions in `@ditto/core`. The question "could ProcessOS use this?" is yes for all four.

## Objective

Wire all four step primitives so that process templates declaring them get the expected behavior: delayed execution, reply-triggered resumption, engagement-conditional gating, and email thread grouping.

## Non-Goals

- New process template authoring (templates already declare these primitives)
- Chain executor changes (chain-level delays already work via `delayedRuns`)
- UI for viewing step delay/gate status (future brief)
- Heartbeat performance optimization

## Inputs

1. `packages/core/src/harness/harness.ts` — StepDefinition type with the four primitives
2. `src/engine/heartbeat.ts` — The execution loop where all four must be wired
3. `src/engine/inbound-email.ts` — Existing `resumeHumanStep()` for wait_for wiring
4. `src/engine/channel.ts` — Existing `sendAndRecord()` with `inReplyToMessageId` support
5. `src/engine/scheduler.ts` — Periodic checks for timeout expiry
6. `src/engine/people.ts` — Interaction queries for gate evaluation
7. `docs/insights/171-conversation-aware-process-primitives.md` — Design rationale

## Constraints

- All primitives must work with existing step lifecycle states (`queued`, `running`, `waiting_human`, `approved`, `skipped`, `failed`)
- `wait_for` must reuse the existing `waiting_human` + `suspendState` mechanism (ADR-010)
- `gate` with `fallback: skip` must use existing `skipped` status
- `email_thread` must use the existing `inReplyToMessageId` parameter in `sendAndRecord()`
- `parseDuration` must live in `@ditto/core` (shared utility)
- Do not modify the `StepDefinition` type (already defined)
- Heartbeat changes must not break existing process execution (all four are opt-in via step fields)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Step delay evaluation | Temporal.io workflow sleep | pattern | Same concept: step pauses until a computed time, then resumes on next tick |
| Reply-triggered resumption | ADR-010 (human step suspend/resume) | adopt | Reuses existing suspend state mechanism for a new trigger type |
| Engagement gating | HubSpot workflow enrollment criteria | pattern | Same concept: check conditions before executing next step in sequence |
| Email threading | AgentMail In-Reply-To header | depend | Already implemented in channel adapter, just needs data connection |
| Duration parsing | ms (npm) / Temporal.Duration | pattern | Standard duration string format, implemented without dependency |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/duration.ts` | Create: `parseDuration(str) → ms` utility, supports h/d/w units |
| `packages/core/src/index.ts` | Modify: re-export `parseDuration` |
| `packages/core/src/db/schema.ts` | Modify: add `deferredUntil` integer column on stepRuns |
| `src/engine/heartbeat.ts` | Modify: add schedule evaluation (early return if before executeAt), wait_for suspension (post-execution), gate evaluation (pre-execution), email_thread state propagation (post-execution + pre-execution injection) |
| `src/engine/inbound-email.ts` | Modify: verify `findWaitingRunForPerson()` matches wait_for suspensions, add `timedOut: false` to resumed outputs |
| `src/engine/scheduler.ts` | Modify: add periodic timeout check for wait_for steps past their timeoutAt |
| `src/engine/people.ts` | Modify: add `hasInteractionSince(personId, type, since)` query helper |
| `src/engine/process-loader.ts` | Modify: validate schedule.delay format and schedule.after references |

## User Experience

- **Jobs affected:** None directly — these are engine primitives. User-facing impact comes through the process templates that use them (Briefs 123-125).
- **Primitives involved:** None — no UI changes
- **Process-owner perspective:** Transparent. Processes that declare these primitives start working as designed.
- **Designer input:** Not invoked — no user-facing changes

## Acceptance Criteria

1. [ ] `parseDuration("4h")` returns 14400000, `parseDuration("3d")` returns 259200000, `parseDuration("7d")` returns 604800000, `parseDuration("2w")` returns 1209600000
2. [ ] `parseDuration("invalid")` throws with descriptive error message
3. [ ] A step with `schedule: { delay: "24h", after: trigger }` does not execute until 24h after process startedAt
4. [ ] A step with `schedule: { delay: "4h", after: "step-a" }` does not execute until 4h after step-a completedAt
5. [ ] A step with `wait_for: { event: reply, timeout: "48h" }` suspends after execution with status `waiting_human`
6. [ ] An inbound email reply to a person with a waiting wait_for step resumes the step with `{ timedOut: false }` in outputs
7. [ ] A wait_for step past its timeout is resumed by the scheduler with `{ timedOut: true }` in outputs
8. [ ] A step with `gate: { engagement: silent, since_step: "report-back", fallback: skip }` is skipped if the person has replied since report-back completed
9. [ ] A step with `gate: { engagement: silent, ... }` executes normally if the person has NOT replied
10. [ ] A step with `gate: { engagement: replied, ..., fallback: skip }` is skipped if the person has NOT replied
11. [ ] A step with `email_thread: "onboarding"` that is the first in its thread creates a new thread (messageId stored on run metadata)
12. [ ] A subsequent step with `email_thread: "onboarding"` sends as a reply (inReplyToMessageId injected from run metadata)
13. [ ] `pnpm run type-check` passes with all changes
14. [ ] Existing process execution (processes without these primitives) is unaffected
15. [ ] Gate evaluation results (skipped/executed/deferred) are recorded as activities for the learning layer (L5)
16. [ ] wait_for timeout events are recorded as activities with `{ timedOut: true }` metadata

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Layer alignment (L1/L2), trust model (primitives don't bypass trust gates), feedback capture (step outcomes recorded), security (wait_for timeout prevents indefinite suspension)
3. Present work + review findings to human

## Smoke Test

```bash
# Type check passes
pnpm run type-check

# Duration parser tests
pnpm vitest run packages/core/src/duration.test.ts

# Heartbeat primitive tests (new test file)
pnpm vitest run src/engine/heartbeat-primitives.test.ts

# Existing tests still pass
pnpm vitest run src/engine/process-loader.test.ts
pnpm vitest run src/engine/harness-handlers/memory-assembly.test.ts
```

## After Completion

1. Update `docs/state.md`: "Process primitives (schedule, wait_for, gate, email_thread) wired to heartbeat"
2. Update Insight 171 with implementation details
3. Retrospective: which primitive was hardest to wire? Any heartbeat refactoring needed?
