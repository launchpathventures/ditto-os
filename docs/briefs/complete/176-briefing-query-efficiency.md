# Brief: Briefing Query Efficiency (P0 performance)

**Date:** 2026-04-16
**Status:** complete

> **Scope adjustment (2026-04-16):** Landed the high-value fix: `assembleFocus`
> O(N)→O(1) process-name batching. `assembleSuggestions` trust-state batch +
> correction-rate parallelisation deferred (additional work behind a
> separate brief) — the hot path is closed.
**Depends on:** Brief 169 (parent), Brief 158 (briefing quality)
**Unlocks:** Briefing assembly stays under 500ms at 100+ concurrent processes.

## Goal

- **Roadmap phase:** Phase 10 — orient / briefing
- **Capabilities:** Closes P0 performance: `assembleFocus` and `assembleSuggestions` in `briefing-assembler.ts` issue O(N) DB queries looking up per-run process names and per-process trust state. With 20 reviews + 50 active runs + 20 processes, morning briefing issues 90+ queries sequentially.

## Context

`briefing-assembler.ts:253-349` contains four loops — `pendingReviews`, `waitingHuman`, `failedRuns`, `activeRuns` — each issuing a per-run `SELECT name FROM processes WHERE id = ?`. `assembleSuggestions` at `:537-569` calls `computeTrustState(procId)` per process sequentially, and `correction-rate-trends` at `:877-900` also iterates. Brief 158's autonomous-digest got this right (batch-fetch via `inArray`) — the older code paths did not.

The symptom: briefing feels laggy for heavy users, and becomes a bottleneck during morning surge.

## Objective

Batch-fetch all process metadata, trust state, and correction rates in a bounded number of queries (ideally 1 per relational lookup). Briefing assembly scales O(1) with active run count.

## Non-Goals

- Caching briefing output (MP-3.5 explicitly forbids).
- Wrapping assembly in a DB transaction (separate P1 concern — briefing transactional consistency).
- Redesigning `computeTrustState`; just batching its callers.

## Inputs

1. `src/engine/briefing-assembler.ts` — target file
2. `src/engine/trust-earning.ts` / `trust-computation.ts` — `computeTrustState` signature
3. `src/engine/correction-rates.ts` — `computeCorrectionRates` signature
4. Brief 158 autonomous-digest batch pattern (`assembleAutonomousDigest` at the same file) — reference implementation

## Constraints

- Must not change `BriefingData` shape.
- Must not change timing of briefing freshness (`generatedAt`).
- Must preserve failure-isolation semantics already in place for correction rates (non-blocking).

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| `inArray` batch + `Map` lookup | Brief 158 `assembleAutonomousDigest` at lines 661-733 | adopt | Already the house style for this file |
| Batch `computeTrustState(ids[])` | Trust state is a pure function of run history; batch query over process IDs | pattern | Avoids per-call DB overhead |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/briefing-assembler.ts` | Modify: rewrite `assembleFocus` to collect all unique `processId`s up front, issue one `SELECT id, name FROM processes WHERE id IN (...)`, then map-lookup. Same for `assembleSuggestions` and correction-rate iteration. |
| `src/engine/trust-earning.ts` | Modify: add `computeTrustStateBatch(processIds: string[])` returning `Map<processId, TrustState>`. Share the heavy queries once. |
| `src/engine/correction-rates.ts` | Modify: add `computeCorrectionRatesBatch(processIds: string[])` that issues one run-history query and computes rates in-memory per process. |
| `src/engine/briefing-assembler.test.ts` | Modify: assertion on max DB query count using a query spy (target: ≤ 10 queries for 20-run briefing). |

## User Experience

- **Jobs affected:** Orient (briefing speed).
- **Process-owner perspective:** Briefing opens instantly instead of showing a spinner. Under load the difference is larger.

## Acceptance Criteria

1. [ ] `assembleFocus` issues a single `SELECT … WHERE id IN (...)` for process names covering all four dimensions.
2. [ ] `assembleSuggestions` uses `computeTrustStateBatch` + `computeCorrectionRatesBatch` — no sequential per-process calls.
3. [ ] Query-count test: briefing with 20 reviews + 50 active runs + 20 processes issues ≤ 10 DB queries.
4. [ ] Latency test: briefing assembly < 200ms in-process at the same scale (using a seeded DB fixture).
5. [ ] No change to `BriefingData` output at this scale (golden-file diff).
6. [ ] Existing briefing tests still pass.

## Review Process

1. Review agent checks for any remaining `for (…) await db.select(…)` pattern in briefing-assembler.
2. Confirms batch functions keep the same error-isolation (one process erroring doesn't poison the batch).

## Smoke Test

```bash
pnpm test -- briefing-assembler
```

## After Completion

Update `docs/state.md`: "Brief 176 — briefing query efficiency (2026-04-16, complete): N+1 loops in `assembleFocus`/`assembleSuggestions`/correction-rate-trends batched via `inArray` + new `computeTrustStateBatch`/`computeCorrectionRatesBatch`. Briefing < 10 DB queries at 20-run scale."
