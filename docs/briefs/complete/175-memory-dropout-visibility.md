# Brief: Memory Dropout Visibility (P0 observability)

**Date:** 2026-04-16
**Status:** complete

> **Scope adjustment (2026-04-16):** Landed the primitive (counter + persist).
> Risk-detector `memory_pressure` surface + briefing integration deferred to
> a follow-up — the observability foundation is now in place.
**Depends on:** Brief 169 (parent)
**Unlocks:** MP-4 evidence narrative can show when memory budget pressure is suppressing context.

## Goal

- **Roadmap phase:** Phase 2 — harness memory
- **Capabilities:** Closes P0 observability gap: when durable memory exceeds the token budget, `memory-assembly.ts:200-253` silently breaks out of the loop. Valuable low-rank memories disappear from context with zero trace.

## Context

Memory assembly has a strict token budget. Memories are sorted by `reinforcementCount DESC, confidence DESC` and truncated when the budget fills. The counter `context.memoriesInjected` records how many made it in; nothing records how many were dropped. At a few months of usage (≈10k memories), low-signal corrections fall off the bottom systematically, and users have no way to know that their teaching is being silently starved.

This is the "trust decays invisibly" class of bug: the system gets quietly worse as memory accumulates, and the user blames the LLM.

## Objective

Every step that assembles memory records how many memories were loaded and how many were dropped due to budget pressure. This surfaces in briefing evidence, in admin diagnostics, and — when dropouts exceed a threshold — as a gentle suggestion to the user ("Your quoting process has 47 active memories; some may not be loading each run. Consider archiving older ones?").

## Non-Goals

- Fuzzy memory deduplication (audit P1, separate brief).
- Memory pruning / decay job (audit P2, separate brief).
- Per-memory dropout reasons — aggregate count is sufficient for v1.

## Inputs

1. `src/engine/harness-handlers/memory-assembly.ts` — budget enforcement loop
2. `packages/core/src/db/schema.ts` — `harnessDecisions` table
3. `src/engine/briefing-assembler.ts` — where evidence narrative is composed
4. `src/engine/self-tools/detect-risks.ts` — risk surface

## Constraints

- No new table — record on `harnessDecisions` (the existing per-step audit row).
- Threshold for user-facing suggestion: > 5 dropped in any single assembly AND dropout rate > 20% over the process's last 10 runs.
- Aggregate-only; no per-memory trace (privacy + volume).

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Aggregate counter pattern | `memoriesInjected` already present | adopt | Mirror the existing observable |
| Threshold-triggered insight | Risk-detector aging / stale-escalation pattern | pattern | Consistent with how other observability surfaces |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | Modify: add `memoriesDropped integer default 0` to `harnessDecisions` |
| `drizzle/NNNN_memories_dropped.sql` | Create: migration (Insight-190 journal) |
| `src/engine/harness-handlers/memory-assembly.ts` | Modify: count memories skipped in each of the three tiers (process, solution, intra-run); store in `context.memoriesDropped` |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: persist `memoriesDropped` in harnessDecisions insert |
| `src/engine/risk-detector.ts` | Modify: new `memory_pressure` risk type when rolling-avg dropout > threshold |
| `src/engine/briefing-assembler.ts` | Modify: surface `memory_pressure` risks in the briefing |
| `src/engine/harness-handlers/memory-assembly.test.ts` | Modify: add test: budget tight, 3 memories dropped, counter = 3 |
| `src/engine/risk-detector.test.ts` | Modify: rolling-avg dropout risk test |

## User Experience

- **Jobs affected:** Orient, Decide.
- **Process-owner perspective:** In briefing, a soft hint: "Your quoting process is at memory capacity — I'm loading the top 12 of 47 on each run. Want me to archive corrections older than 60 days?" The user retains control.

## Acceptance Criteria

1. [ ] `memoriesDropped` column exists on `harnessDecisions`.
2. [ ] Memory assembly computes and stores the count across all three tiers.
3. [ ] Feedback-recorder persists it in the same row as `memoriesInjected`.
4. [ ] Risk-detector produces a `memory_pressure` risk when the rolling 10-run average dropout rate > 20% and last run dropped > 5.
5. [ ] Briefing surfaces the risk as a suggestion, not an alarm.
6. [ ] Test: tight budget → counter matches expected drops.
7. [ ] Journal index is next available.

## Review Process

1. Review agent verifies the counter is incremented in every tier that truncates, not just the first.
2. Confirms threshold is tuned conservatively (no daily spam).

## Smoke Test

```bash
pnpm db:generate
pnpm test -- memory-assembly feedback-recorder risk-detector briefing-assembler
```

## After Completion

Update `docs/state.md`: "Brief 175 — memory dropout visibility (2026-04-16, complete): `harnessDecisions.memoriesDropped` records budget-starved memories; risk-detector surfaces a gentle suggestion when a process crosses the pressure threshold."
