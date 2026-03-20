# Brief: Phase 3 — Trust Earning (Parent)

**Date:** 2026-03-19
**Status:** ready
**Depends on:** Phase 2 (complete)
**Unlocks:** Phase 4 (CLI rewrite), Phase 5 (end-to-end verification)

## Goal

- **Roadmap phase:** Phase 3: Trust Earning
- **Capabilities:** Record human feedback, capture diffs for edits, trust data accumulation, upgrade eligibility check, downgrade trigger check (2 of 4), ADR written

## Context

Phase 2 built the harness infrastructure: pipeline, trust gate, review patterns, memory, and feedback recording. Trust tiers exist but are static — set in YAML, never change. The harness records every decision to `harnessDecisions`, every review result, every script pass/fail — but none of this data feeds back into trust tier decisions.

Phase 3 closes the loop: human feedback (approve/edit/reject) and automated signals (review verdicts, script results) accumulate into trust data that drives upgrade suggestions and automatic downgrades. The trust gate remains the enforcer; Phase 3 adds the data and decision layer that makes tiers dynamic.

Three research reports inform this design:
- `docs/research/trust-earning-patterns.md` — algorithms, multi-source aggregation, gaming prevention
- `docs/research/trust-visibility-ux.md` — 18 UX patterns for trust visibility
- `docs/research/phase-3-trust-earning-ux.md` — persona journeys, interaction patterns, design decisions

Key design insight from the Designer: **Trust is invisible until it matters.** Users don't manage trust — they review outputs. Trust accumulates silently and surfaces only at upgrade suggestions and downgrade alerts.

## Overall Architecture

### Algorithm: Fixed Sliding Window

**Decision:** Use a fixed sliding window (last N runs) rather than Beta distribution or exponential decay.

**Rationale:**
- Simpler to implement, explain, and debug than Beta/Wilson
- "Your last 20 runs" is concrete language Rob understands; "your exponentially-weighted reputation score is 0.73" is not
- Discourse and eBay both use fixed windows at scale (research Section 2)
- The window contains all the data needed for conjunctive upgrade checks
- If exponential decay proves necessary later, the event data supports it — no migration needed

**Window parameters:**
- Default window: last 20 completed runs (configurable per process)
- Minimum runs before any upgrade eligible: 10
- Adaptive: if fewer runs than window size, use all available

### Signal Sources (Insight-009 Scoping)

Phase 3 scopes to three signal sources. Others are deferred:

| Source | Phase 3 scope | Weight | Rationale |
|--------|--------------|--------|-----------|
| Human feedback (approve/edit/reject) | **In scope** | Primary | Highest reliability, direct trust signal |
| Review pattern (pass/flag/retry) | **In scope** | Supporting | Already recorded in `harnessDecisions` |
| Script/system (pass/fail) | **In scope** | Supporting | Already recorded in `stepRuns.status` |
| Self-assessment (confidence) | Deferred (Phase 5+) | Low | Uncalibrated — needs data to validate |
| Downstream process | Deferred (Phase 6 — Layer 4) | High | Requires process dependency graph |
| External agent/system | Deferred (Phase 6) | Context-dependent | Requires integration architecture |
| Time/outcome | Deferred (Phase 7 — Layer 5) | High | Requires outcome tracking |

### Trust Score: Not a Single Number

**Decision:** No synthetic trust score. Trust state is a set of concrete metrics computed from the window:

```typescript
interface TrustState {
  // Window definition
  windowSize: number;           // e.g., 20
  runsInWindow: number;         // how many runs are in the current window
  windowStart: Date;            // oldest run in window

  // Human feedback metrics (from `feedback` table)
  humanReviews: number;         // total human reviews in window
  approvals: number;            // clean approvals
  edits: number;                // edits (further broken down by severity)
  rejections: number;           // rejections
  approvalRate: number;         // approvals / humanReviews
  correctionRate: number;       // (edits + rejections) / humanReviews
  editSeverity: {               // breakdown of edit severity
    formatting: number;         // editRatio < 0.1
    correction: number;         // 0.1-0.3
    revision: number;           // 0.3-0.6
    rewrite: number;            // > 0.6
  };

  // Automated signal metrics (from `harnessDecisions` + `stepRuns`)
  reviewPatternPasses: number;  // steps where review result = 'pass'
  reviewPatternFlags: number;   // steps where review result = 'flag'
  reviewPatternRetries: number; // steps that needed retry before passing
  scriptPasses: number;         // script steps that passed
  scriptFailures: number;       // script steps that failed
  autoCheckPassRate: number;    // (passes) / (passes + flags + failures)

  // Human-reviewer agreement (Phase 3 new signal)
  humanAgreedWithFlag: number;  // human reviewed flagged item and edited/rejected
  humanOverrodeFlag: number;    // human approved despite flag

  // Derived
  lastRejectionRunId: string | null;
  consecutiveCleanRuns: number; // runs since last correction/rejection
  trend: 'improving' | 'stable' | 'declining';

  // Meta
  computedAt: Date;
  gracePeriodRemaining: number; // runs until grace period ends (0 if not in grace)
}
```

This serves all personas:
- **Rob** sees: "31 of 34 approved clean" (derived from approvalRate + runsInWindow)
- **Lisa** sees simulation data (derived from window + sampling replay)
- **Jordan** sees trust summaries across processes (aggregated TrustState per process)
- **Nadia** sees comparative rates across team processes

### Upgrade Conditions (Conjunctive — All Must Pass)

**supervised → spot_checked:**

| Condition | Threshold | Source |
|-----------|-----------|--------|
| Minimum runs | ≥ 10 in window | Window |
| Approval rate (human) | ≥ 85% | `feedback` |
| No rejections | 0 in last 10 runs | `feedback` |
| Auto-check pass rate | ≥ 90% | `harnessDecisions` |
| Correction trend | Not increasing | Computed |

**spot_checked → autonomous:**

| Condition | Threshold | Source |
|-----------|-----------|--------|
| Minimum runs at spot_checked | ≥ 20 | Window |
| Approval rate (sampled reviews) | ≥ 95% | `feedback` |
| Correction rate (all) | ≤ 5% | `feedback` + edits |
| No rejections | 0 in window | `feedback` |
| Auto-check pass rate | 100% | `harnessDecisions` |
| No major edits (rewrite) | 0 in window | Edit severity |

**critical:** Never upgrades. Architecture invariant.

Provenance: Conjunctive upgrade from eBay seller standards. Threshold values are initial — tuned from dogfood data.

### Downgrade Conditions (Disjunctive — Any Triggers)

| Trigger | Threshold | Action | Provenance |
|---------|-----------|--------|------------|
| Correction rate spike | > 30% in last 10 runs | → supervised | eBay (disjunctive downgrade) |
| Any rejection | 1 rejection | → supervised | Original (conservative) |
| Auto-check failure rate | > 20% in last 10 runs | → supervised | SonarQube quality gate pattern |

**Grace period:** 5 runs after any upgrade. During grace period, downgrades are suppressed but corrections are still recorded. If correction rate exceeds 50% during grace period, downgrade fires immediately (safety valve). Provenance: Discourse TL3 grace period.

### Override Model

Human can override downgrades (break-glass pattern from Google Binary Authorization):
- Override always recorded in `trustChanges` table with reason
- Monitoring continues at overridden tier
- After 3 consecutive overrides for the same trigger, friction increases (confirmation dialog)
- Override never affects `critical` tier (architecture invariant)

### Data Storage Strategy

**No new `trustEvents` table.** The data already exists:
- Human feedback → `feedback` table (already exists)
- Review verdicts → `harnessDecisions` table (already exists)
- Script results → `stepRuns` table (already exists)

**New tables:**
1. `trustChanges` — immutable log of every tier transition (Paperclip `agentConfigRevisions` pattern)
2. `trustSuggestions` — upgrade proposals waiting for human decision (Paperclip `approvals` pattern)

**Enhanced fields:**
- `feedback.diff` — structured jsdiff format (currently unstructured JSON)
- `feedback.editSeverity` — computed classification (formatting/correction/revision/rewrite)
- `feedback.editRatio` — quantitative severity score
- `processes.trustData` — populated with computed `TrustState` (currently empty `{}`)

### Edit Severity Pipeline

When human submits an edit via CLI:
1. Compute word-level diff using `jsdiff` (`diffWords()`)
2. Calculate `editRatio = (wordsAdded + wordsRemoved) / (wordsAdded + wordsRemoved + wordsUnchanged)`
3. Classify: formatting (<0.1), correction (0.1-0.3), revision (0.3-0.6), rewrite (>0.6)
4. Store in `feedback.diff` (structured), `feedback.editSeverity`, `feedback.editRatio`
5. Trust weight varies: formatting = weakly positive, correction = neutral, revision = negative, rewrite = strongly negative

Provenance: `kpdecker/jsdiff` for diff computation, WikiTrust + revscoring for severity classification.

### Trust Simulation

Retroactively answers: "What would have happened at a different tier?"

Uses existing data:
- `harnessDecisions.samplingHash` — deterministic, replayable
- `harnessDecisions.reviewResult` — whether automated checks passed
- `feedback.type` — whether human found issues when they did review

Algorithm: For each run in the window, re-evaluate `shouldSample()` at the simulated tier. For runs that would NOT have been sampled, check: did automated checks pass? When the run WAS sampled, was the human review clean? Count "missed corrections" — runs that needed human correction but wouldn't have been reviewed.

### Security Considerations

- **Trust tier changes are governance actions** — always recorded with actor attribution
- **Override audit** — overrides cannot be silently applied; `trustChanges` is append-only
- **canAutoAdvance enforcement** — Phase 3 adds enforcement in CLI `approve` for critical tier (currently data-only)
- **No self-trust-modification** — agents cannot modify their own process's trust tier (human-only action)
- **Sampling salt** — remains unpredictable to prevent gaming the sampling hash

## Sub-Phase Decomposition

Phase 3 splits into two sub-briefs along the data/action seam:

### Phase 3a: Trust Data & Scoring

**Focus:** Get the data right. Schema changes, diff computation, trust state aggregation, CLI display.

- Schema: `trustChanges` table, `feedback` enhancements (structured diff, edit severity)
- jsdiff integration for edit severity computation
- Trust score computation function (window-based aggregation from existing tables)
- Populate `processes.trustData` with computed `TrustState`
- CLI: `pnpm cli trust <process>` shows trust data
- CLI: `pnpm cli approve` enhanced with edit support + structured diff capture

**Independently testable:** Can compute trust scores and verify they match expected values from known feedback data. No behavior changes — trust tiers remain static during 3a.

### Phase 3b: Trust Actions & Decisions

**Focus:** Act on the data. Upgrade suggestions, downgrade triggers, simulation, tier changes.

- Upgrade eligibility check (conjunctive conditions)
- Upgrade suggestion generation and storage (`trustSuggestions` table)
- Downgrade trigger evaluation (disjunctive)
- Grace period enforcement
- Trust tier change execution (update `processes.trustTier`, record in `trustChanges`)
- Trust simulation computation
- Override with audit trail
- CLI: `pnpm cli trust accept/reject/override` commands
- ADR-008: Trust Earning Algorithm (documents the design decisions)

**Depends on 3a:** Needs trust scores and structured diff data to evaluate conditions.

## Non-Goals

- Full learning layer (Phase 7) — correction pattern extraction is Phase 2 scope (memory bridge); Phase 3 doesn't add LLM-based reconciliation
- Dashboard / web UI for trust — Phase 9
- Mobile push notifications — Phase 9+
- Downstream process signals — Phase 6 (Layer 4)
- Outcome-based trust signals — Phase 7 (Layer 5)
- Multi-user governance (who can accept upgrades) — Phase 3 dogfood assumes single user; delegated authority is Phase 4+
- Team-level trust health aggregation (Nadia's view) — Phase 9 (data model supports it, no aggregation UI in Phase 3)
- Peer/cross-process comparison — Phase 9

## User Experience

- **Jobs affected:** Orient (trust data in process status), Review (implicit trust building), Delegate (upgrade/downgrade decisions)
- **Primitives involved:** Trust Control (#11), Process Card (#2), Activity Feed (#3), Feedback Widget (#7) — all enriched, no new primitives
- **Process-owner perspective:** Trust is invisible during normal review. Surfaces as upgrade suggestions (evidence + accept/keep) and downgrade alerts (evidence + override option). See Designer interaction spec for persona-specific journeys.
- **Interaction states:** Detailed in Designer spec — upgrade (not available / available / viewed / accepted / dismissed), downgrade (triggered / accepted / overridden), review (implicit trust building)
- **Designer input:** `docs/research/phase-3-trust-earning-ux.md` — adopted in full. Key design decisions resolved:
  1. **No synthetic trust score visible to user** — show concrete data (approval rate, correction count)
  2. **Upgrade check runs after every completed run** — suggestion appears as soon as eligible
  3. **Edit severity is internal** — user sees the diff, not the classification
  4. **Human-reviewer agreement captured silently** — implicit feedback, not explicit questions
  5. **Grace period is invisible to user** — system doesn't explain "you're in grace period," just doesn't suggest downgrades
  6. **Proximity indicator uses concrete language** — "Correction rate: 17% (downgrade at 30%)" not "trust budget"
  7. **Team view deferred** — Phase 9

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Fixed sliding window | Discourse TL3 (100-day window), eBay (adaptive 3/12 month) | Simpler than Beta/exponential, explainable to users |
| Conjunctive upgrade / disjunctive downgrade | eBay seller standards (published) | Proven asymmetry: upgrades are hard, downgrades are fast |
| Event-sourced trust data | Paperclip `costEvents` table pattern | Append-only, aggregate at query time |
| Tier change audit trail | Paperclip `agentConfigRevisions` (immutable snapshots) | Rollback and audit capability |
| Upgrade suggestion as proposal | Paperclip `approvals` table pattern | System proposes, human decides |
| Grace period | Discourse TL3 (2-week grace) | Prevents oscillation at tier boundaries |
| Word-level diff | `kpdecker/jsdiff` (`diffWords()`) | Best JS diff library, word-level is right granularity |
| Edit severity classification | WikiTrust `analysis/computerep.ml` + `wikimedia/revscoring` | Proven edit → trust signal mapping |
| Break-glass override with audit | Google Binary Authorization | Override always possible, always recorded |
| Trust simulation | GitHub Rulesets evaluate mode (adapted) | "What would have happened" is the strongest UX pattern found |
| Quality gate as upgrade check | SonarQube `QualityGateEvaluatorImpl.java` | Each condition individually evaluated, all AND-ed |
| Multi-source signal weighting | Insight-009 + OpenSSF Scorecard `checker/check_result.go` | Human signals weighted higher than automated |

## After Completion

1. Update `docs/state.md` with Phase 3 completion
2. Update `docs/roadmap.md` — mark Phase 3 capabilities as done
3. Write ADR-008: Trust Earning Algorithm
4. Phase retrospective
5. Proceed to Phase 4 (CLI rewrite) or Phase 5 (end-to-end verification)
