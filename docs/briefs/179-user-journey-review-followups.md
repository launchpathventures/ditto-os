# Brief: User Journey Robustness — Review Follow-Ups

**Date:** 2026-04-16
**Status:** draft
**Depends on:** Brief 169 (parent) — closes residuals from dev-reviewer on briefs 170-178
**Unlocks:** Production-readiness for the Brief 169 set.

## Goal

- **Roadmap phase:** Follow-up to Brief 169 (Phases 3-14 correctness residuals)
- **Capabilities:** Close the 3 P0 + 4 P1 issues the independent review surfaced on briefs 170-178.

## Context

`/dev-reviewer` ran the 15-point checklist against briefs 170-178 with fresh context. Verdict: CONDITIONAL PASS — no new regressions, land the work, follow up with targeted fixes. This brief captures those follow-ups as a single coherent unit of work so the user-journey robustness effort ends production-ready rather than "almost".

## Objective

Close the review findings without broadening scope. Each fix is surgical.

## Non-Goals

- New capability. Only fixes to shipped code.
- Rewriting any of briefs 170-178.
- The deferred-by-design items called out in scope-adjustment notes (reserve/commit lifecycle, risk-detector memory_pressure surface, `userPreferences.clarifyBeforeAct` opt-out).

## Inputs

1. Commits `c36ba9e..ae9bd73` on branch `claude/enhance-user-journey-N2feS` — the work under review
2. Dev-reviewer report (captured in session transcript)
3. `docs/briefs/170-*.md` through `178-*.md` — originating ACs
4. `docs/review-checklist.md` — for re-review

## Fixes

### P0-1 — Brief 178: waiting-state anchor for stale escalation

**File:** `src/engine/stale-escalation.ts:136`, `packages/core/src/db/schema.ts`
**Issue:** `sweepStaleEscalations` anchors on `run.createdAt` — a run that executed for 8 days then paused would immediately escalate to tier 3.
**Fix:** Add `processRuns.waitingStateSince` timestamp column. Populate when status transitions to `waiting_human`/`waiting_review`. `classifyStaleTier` reads this column (fallback to `createdAt` for backfill). Drizzle migration required.

### P0-2 — Brief 171: scrubber threshold harmonisation

**File:** `src/engine/integration-handlers/scrub.ts:28` and `:84`
**Issue:** `scrubCredentialsFromValue` filters secrets with `length > 4`; `secretsFromAuthEnv` with `length > 0`. Short credentials get collected but never redacted.
**Fix:** Harmonise both to `length > 4` AND document the minimum in a module comment. Short (<5 char) credentials are a known limitation — accept it explicitly rather than silently leak. Update tests.

### P0-3 — Brief 172: orphan run budget default

**File:** `src/engine/heartbeat.ts:766` (`checkBudgetBeforeDispatch`)
**Issue:** When a processRun can't be matched to a goal work item, the guard returns `{ blocked: false }` silently. Outbound actions from orphan runs bypass the budget gate.
**Fix:** Change the "no goal found" branch to log a warning AND return `{ blocked: false }` only when the run has a `cycleType` (network agent runs are expected to be goal-less). For all other orphans, return `{ blocked: true, reason: "orphan run — no goal found, budget guard rejecting by default" }`. Add tests for both branches.

### P1-1 — Brief 178: wire `resetStaleEscalationLadder`

**File:** `src/engine/heartbeat.ts` (3 terminal-transition sites touched by Brief 174) + action-resume paths
**Issue:** Function exported but never called. Escalation tiers persist on runs that should reset.
**Fix:** Call `resetStaleEscalationLadder(runId)` at each site that nulls `definitionOverride` for terminal statuses, plus at `resumeHumanStep` (approve path). Test: run escalates to tier 3 → user approves → tier resets to 0.

### P1-2 — Brief 177: tighten temporal regex + skip probe when prior context clarifies

**File:** `src/engine/self-specificity.ts:92`, `src/engine/self.ts` (probe call site)
**Issue:** `/\bon \w+(?:day)?\b/i` matches "on track", "on hold". Probe runs even when prior session turns resolve ambiguity.
**Fix:**
- Regex → `/\bon (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?)\b/i`
- Extend `scoreSpecificity` to accept optional `priorTurnSummary: string` and combine it with the current message before scoring.
- Pass the last user turn into the probe in `self.ts`.

### P1-3 — Brief 174: audit all step-level failed transitions

**File:** `src/engine/heartbeat.ts:533, 592, 606, 657, 671, 814, 834, 2012, 2138, 2299` (and others found via grep)
**Issue:** Brief 174 nulled `definitionOverride` at three high-level terminal sites. Step-level `status: "failed"` transitions that set `stepRuns.status` also need audit — if they *also* transition the parent run to failed, they must null the override.
**Fix:** Grep every `.update(schema.processRuns).set({ status: "failed"` and verify each also sets `definitionOverride: null`. Extract a helper `markRunTerminal(runId, status)` to centralise.

### P1-4 — Brief 173: undefined vs null YAML round-trip semantics

**File:** `src/engine/self-tools/yaml-round-trip.ts:103-114`
**Issue:** `canonicalJson` uses `JSON.stringify` which omits `undefined`. A definition that intentionally sets `undefined` to signal "unset" passes round-trip but loses intent on re-parse.
**Fix:** Explicit walk that distinguishes `undefined` from absent key. If a field is explicitly `undefined`, either warn or normalise to explicit `null`. Add test.

## Constraints

- No new schema columns beyond `waitingStateSince` (P0-1).
- No new ADRs.
- All existing tests must stay green; 21 pre-existing failures remain out of scope.
- Journal idx discipline per Insight-190.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| `waitingStateSince` pattern | Industry-standard "state_entered_at" in state-machine libs | pattern | Canonical way to measure time-in-state |
| Orphan-run fail-safe default | OWASP "fail closed" security principle | pattern | Safety-critical default |

## Acceptance Criteria

1. [ ] `waitingStateSince` column exists, populated at waiting-state transitions, used by `classifyStaleTier`.
2. [ ] Scrubber thresholds harmonised; short-credential limitation documented.
3. [ ] Orphan runs default to `blocked: true` (unless cycle run); warning logged.
4. [ ] `resetStaleEscalationLadder` called at all reset points; tier clears on approve.
5. [ ] Temporal regex no longer matches "on track"; probe consumes prior turn; test for both.
6. [ ] Every `processRuns.status = "failed"` site also nulls `definitionOverride`; helper extracted.
7. [ ] YAML round-trip test covers explicit-undefined case.
8. [ ] Dev-reviewer re-run: 3 P0 → 0, 4 P1 → 0 (or explicit scope notes).
9. [ ] Full suite: no new regressions; 21 pre-existing failures unchanged.

## Smoke Test

```bash
pnpm run type-check && pnpm test
# Expect: type-check clean; suite same 21 pre-existing failures; new tests pass.
```

## After Completion

1. Update `docs/state.md` — add Brief 179 summary + mark Brief 169 parent fully complete.
2. Retrospective captured via `/dev-documenter`.
