# Brief: Phase 3a — Trust Data & Scoring

**Date:** 2026-03-19
**Status:** complete
**Depends on:** Phase 2 (complete), Phase 3 parent brief (007)
**Unlocks:** Phase 3b (trust actions & decisions)

## Goal

- **Roadmap phase:** Phase 3: Trust Earning
- **Capabilities:** Record human feedback (approve/edit/reject), capture diffs for edits, trust data accumulation

## Context

The harness pipeline records every decision in `harnessDecisions`, every review result, every script pass/fail — but none feeds trust computation. The `feedback` table stores feedback type but not structured diffs. The `processes.trustData` JSON field is empty.

Phase 3a creates the data foundation: structured diff capture, edit severity classification, trust score computation from existing signals, and CLI access to trust data. No behavior changes — trust tiers remain static during 3a. Phase 3b builds on this to make tiers dynamic.

## Objective

Compute and display accurate trust metrics for every process from existing harness data + enhanced human feedback. A builder can run `pnpm cli trust feature-implementation` and see concrete trust data derived from real execution history.

## Non-Goals

- Tier changes (Phase 3b)
- Upgrade/downgrade suggestions (Phase 3b)
- Grace periods (Phase 3b)
- Trust simulation (Phase 3b)
- Web UI / dashboard (Phase 9)
- LLM-based correction pattern extraction (Phase 7)
- Downstream or outcome signals (Phase 6-7)

## Inputs

1. `docs/briefs/007-phase-3-trust-earning.md` — parent brief with algorithm decisions
2. `docs/research/trust-earning-patterns.md` — algorithm options and provenance
3. `docs/research/phase-3-trust-earning-ux.md` — Designer interaction spec
4. `src/db/schema.ts` — existing schema
5. `src/engine/harness-handlers/feedback-recorder.ts` — existing feedback bridge
6. `src/engine/harness-handlers/trust-gate.ts` — existing trust gate (read-only for 3a)

## Constraints

- Do NOT modify trust gate behavior (3a is data-only)
- Do NOT auto-change trust tiers (that's 3b)
- MUST use existing `harnessDecisions` and `stepRuns` tables as trust signal sources — no new event log table
- MUST store structured diffs in `feedback.diff` using jsdiff change-object format
- MUST compute trust state on demand (not background job) — aggregated from existing tables
- MUST cache computed trust state in `processes.trustData` to avoid recomputation on every CLI call
- MUST preserve all existing CLI commands unchanged

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Word-level diff computation | `kpdecker/jsdiff` (`diffWords()`) | Best JS diff library; word granularity matches correction pattern detection needs |
| Edit severity classification | WikiTrust `analysis/computerep.ml` + `wikimedia/revscoring` | editRatio → severity mapping proven in Wikipedia's trust system |
| Tier change audit trail (schema) | Paperclip `agentConfigRevisions` (immutable snapshots) | Append-only revision log enables rollback and audit |
| Window-based aggregation | Discourse TL3 (100-day rolling window) | Fixed windows are simpler and more explainable than exponential decay |
| Multi-source signal weighting | Insight-009, OpenSSF Scorecard `checker/check_result.go` | Different sources contribute with different weights |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `package.json` | Modify: add `diff` dependency (`kpdecker/jsdiff`) |
| `src/db/schema.ts` | Modify: add `trustChanges` table, add `editSeverity`/`editRatio` columns to `feedback` |
| `src/engine/trust.ts` | Create: trust score computation module — `computeTrustState()`, `classifyEditSeverity()`, `computeEditRatio()` |
| `src/engine/trust-diff.ts` | Create: jsdiff integration — `computeStructuredDiff()`, `classifyEdit()` |
| `src/cli.ts` | Modify: enhance `approve` command with edit support (accept original or provide edited text); add `trust` command |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: call `computeStructuredDiff()` when recording edit feedback; store structured diff + severity |

## User Experience

- **Jobs affected:** Orient (new `trust` CLI command shows trust data)
- **Primitives involved:** None directly — Phase 3a is CLI-only, enriching data for future Trust Control
- **Process-owner perspective:** User can run `pnpm cli trust <process>` to see trust health. No behavior change — processes still operate at their YAML-defined trust tier. The CLI `approve` command gains edit support: user can edit output text before approving, and the diff is captured structurally.
- **Interaction states:** N/A — CLI only
- **Designer input:** `docs/research/phase-3-trust-earning-ux.md` — edit severity is internal per Designer decision #3. User sees the diff but not the severity classification.

### CLI `approve` Enhancement

Current: `pnpm cli approve <run-id>` marks output as approved.

Enhanced:
```
pnpm cli approve <run-id>              # clean approval (same as today)
pnpm cli approve <run-id> --edit       # opens $EDITOR with output text;
                                       # diff computed on save
pnpm cli reject <run-id>               # rejection with optional comment
pnpm cli approve <run-id> --comment "..." # approval with comment
```

### CLI `trust` Command

```
pnpm cli trust <process-slug>

Trust Data — feature-implementation (supervised)

  Window: last 20 runs (14 available)

  Human reviews:     14 total
    Approved clean:  11 (79%)
    Edited:          2 (minor: 1, correction: 1)
    Rejected:        1

  Automated checks:  14 runs
    Review pass:     12 (86%)
    Review flag:     2
    Script pass:     14/14 (100%)

  Correction rate:   21% (3 of 14)
  Consecutive clean: 4 runs
  Trend:             improving ↑

  Upgrade eligible:  No (need ≥85% approval, currently 79%)
```

## Acceptance Criteria

1. [ ] `trustChanges` table exists in schema with columns: `id`, `processId`, `fromTier`, `toTier`, `reason`, `actor` (human/system), `metadata` (json), `createdAt`
2. [ ] `feedback` table has new columns: `editSeverity` (text: formatting/correction/revision/rewrite/null), `editRatio` (real: 0.0-1.0/null)
3. [ ] `jsdiff` is installed and `computeStructuredDiff(original, edited)` returns `{ changes, stats: { wordsAdded, wordsRemoved, wordsUnchanged } }`
4. [ ] `classifyEditSeverity(editRatio)` returns correct classification: <0.1=formatting, 0.1-0.3=correction, 0.3-0.6=revision, >0.6=rewrite
5. [ ] `pnpm cli approve <id> --edit` opens `$EDITOR`, computes structured diff on save, stores in `feedback.diff` with jsdiff format, computes and stores `editSeverity` + `editRatio`
6. [ ] `pnpm cli reject <id>` records rejection in `feedback` table with optional `--comment` in `feedback.comment`
7. [ ] `computeTrustState(processId)` aggregates signals from `feedback` + `harnessDecisions` + `stepRuns` over the configured window (default 20 runs)
8. [ ] Trust state includes human feedback metrics: `approvals`, `edits` (by severity), `rejections`, `approvalRate`, `correctionRate`
9. [ ] Trust state includes automated signal metrics: `reviewPatternPasses`, `reviewPatternFlags`, `scriptPasses`, `scriptFailures`, `autoCheckPassRate`
10. [ ] Trust state includes human-reviewer agreement: counts of `humanAgreedWithFlag` (human edited/rejected after flag) and `humanOverrodeFlag` (human approved despite flag)
11. [ ] Trust state includes `consecutiveCleanRuns`, `trend` (improving if second-half approval rate is >5pp higher than first-half; declining if >5pp lower; stable otherwise), and `lastRejectionRunId`
12. [ ] `pnpm cli trust <process-slug>` displays computed trust state in human-readable format matching the wireframe above
13. [ ] Computed trust state is cached in `processes.trustData` JSON field; recomputed on every `trust` CLI call or after any feedback is recorded
14. [ ] Existing `pnpm cli approve <id>` (no flags) continues to work identically to current behavior (clean approval recorded in `feedback` table)

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Schema changes are backward-compatible (no data loss from existing tables)
   - Trust computation correctly weights multi-source signals per Insight-009
   - Edit severity classification matches research thresholds
   - Human-reviewer agreement signal is correctly derived from existing data
   - CLI commands are consistent with existing patterns
3. Run `pnpm run type-check` — must pass
4. Present work + review findings to human for approval

## After Completion

1. Update `docs/state.md`: Phase 3a complete, trust data computation working
2. Next: Phase 3b (trust actions & decisions)
