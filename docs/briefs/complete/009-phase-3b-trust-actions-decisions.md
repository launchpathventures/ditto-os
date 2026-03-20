# Brief: Phase 3b — Trust Actions & Decisions

**Date:** 2026-03-19
**Status:** ready
**Depends on:** Phase 3a (008 — trust data & scoring)
**Unlocks:** Phase 4 (CLI rewrite), Phase 5 (end-to-end verification)

## Goal

- **Roadmap phase:** Phase 3: Trust Earning
- **Capabilities:** Upgrade eligibility check, downgrade trigger check (2 of 4), ADR-008 written

## Context

Phase 3a established the data foundation: trust score computation, structured diffs, edit severity classification. Trust metrics are computed and visible via `pnpm cli trust` but tiers remain static.

Phase 3b closes the loop: the system evaluates upgrade eligibility, generates suggestions, evaluates downgrade triggers, executes tier changes, and records everything in an immutable audit trail. The human decides upgrades; the system can auto-downgrade.

## Objective

Trust tiers become dynamic. After 3b, a process at `supervised` can earn `spot_checked` through sustained quality (human decides), and a process at `spot_checked` can auto-downgrade to `supervised` when quality degrades.

## Non-Goals

- Web UI / dashboard (Phase 9)
- Mobile push notifications (Phase 9+)
- Downstream process signals (Phase 6 — Layer 4)
- Outcome-based trust signals (Phase 7 — Layer 5)
- Multi-user governance / delegated authority (Phase 4+)
- Team-level trust aggregation / Nadia's view (Phase 9)
- Auto-upgrade (architecture invariant — never auto-upgrades)
- Upgrade to/from `critical` tier (architecture invariant — critical never changes programmatically)

## Inputs

1. `docs/briefs/007-phase-3-trust-earning.md` — parent brief with algorithm decisions
2. `docs/briefs/008-phase-3a-trust-data-scoring.md` — data foundation (must be complete)
3. `docs/research/trust-earning-patterns.md` — algorithm options and provenance
4. `docs/research/phase-3-trust-earning-ux.md` — Designer interaction spec (persona journeys, interaction patterns)
5. `src/engine/trust.ts` — trust computation module (from 3a)
6. `src/engine/harness-handlers/trust-gate.ts` — trust gate (now modifiable)

## Constraints

- MUST never auto-upgrade — upgrades are always suggestions that require human acceptance
- MUST never change `critical` tier programmatically
- MUST record every tier change in `trustChanges` table with full audit trail
- MUST enforce grace period after upgrade (5 runs, configurable)
- MUST enforce `canAutoAdvance=false` in CLI `approve` for critical tier
- MUST allow human override of auto-downgrades (break-glass pattern)
- Trust simulation must use existing data only — no new storage required

## Provenance

| What | Source | Why this source |
|------|--------|----------------|
| Conjunctive upgrade / disjunctive downgrade | eBay seller standards | Proven asymmetry at scale |
| Grace period (5 runs) | Discourse TL3 (2-week grace) | Prevents oscillation at tier boundaries |
| Break-glass override with audit | Google Binary Authorization | Override possible, always recorded |
| Trust simulation | GitHub Rulesets evaluate mode (adapted) | Strongest UX pattern from research |
| Upgrade suggestion as proposal | Paperclip `approvals` table pattern | System proposes, human decides, decision recorded |
| Quality gate as upgrade check | SonarQube `QualityGateEvaluatorImpl.java` | Each condition evaluated individually, all AND-ed |
| Upgrade/downgrade language | Designer spec (Rob's wireframe) | Plain language, no jargon, evidence first |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: add `trustSuggestions` table, add `trustSuggestionStatus` type union |
| `src/engine/trust.ts` | Modify: add `checkUpgradeEligibility()`, `checkDowngradeTriggers()`, `computeSimulation()`, `executeTierChange()` |
| `src/engine/trust-evaluator.ts` | Create: post-run trust evaluation — called after feedback is recorded, checks eligibility + triggers |
| `src/engine/harness-handlers/feedback-recorder.ts` | Modify: trigger trust evaluation after recording feedback |
| `src/cli.ts` | Modify: add trust decision commands (`trust accept`, `trust reject`, `trust override`); enforce `canAutoAdvance` in `approve` for critical |
| `docs/adrs/007-trust-earning.md` | Create: ADR documenting the trust earning algorithm decisions |

## User Experience

- **Jobs affected:** Delegate (upgrade/downgrade decisions), Orient (trust status changes appear in process status)
- **Primitives involved:** Trust Control (#11 — upgrade/downgrade flows), Process Card (#2 — tier status), Activity Feed (#3 — tier change events)
- **Process-owner perspective:** After sustained quality, user receives upgrade suggestion via `pnpm cli status` or `pnpm cli trust`. They see evidence, what changes, safety net. They accept or keep current tier. If quality drops, system auto-downgrades and user sees why. User can override if they disagree.
- **Interaction states:**
  - Upgrade: not eligible → eligible (suggestion created) → accepted / dismissed → (re-offered if dismissed and re-eligible)
  - Downgrade: monitoring → threshold crossed → auto-downgrade applied → user informed → (optional override)
  - Override: downgrade alert → override → monitoring continues → (re-trigger if still above threshold, escalation after 3)
- **Designer input:** `docs/research/phase-3-trust-earning-ux.md` — adopted. Key patterns:
  - Upgrade suggestion shows evidence + what changes + safety net (Rob's wireframe)
  - Downgrade alert shows which runs caused it and why
  - Simulation available via `pnpm cli trust <process> --simulate <tier>`
  - Re-offered suggestion shows evidence accumulated since last dismissal

### Upgrade Suggestion (CLI Flow)

After trust evaluation detects eligibility:

```
$ pnpm cli trust feature-implementation

Trust Data — feature-implementation (supervised)
  ... [trust state from 3a] ...

  ┌─────────────────────────────────────────────┐
  │  UPGRADE SUGGESTION                         │
  │                                             │
  │  Eligible for: spot_checked                 │
  │                                             │
  │  Evidence:                                  │
  │   ✓ 20 runs completed                      │
  │   ✓ Approval rate: 90% (18/20)             │
  │   ✓ No rejections in last 10 runs          │
  │   ✓ Auto-check pass rate: 95%              │
  │   ✓ Correction trend: declining            │
  │                                             │
  │  What changes:                              │
  │   You'd review ~20% of outputs (1 in 5).   │
  │   Automated checks continue on all outputs. │
  │                                             │
  │  Safety net:                                │
  │   Auto-downgrade if correction rate > 30%.  │
  │                                             │
  │  Run: pnpm cli trust accept feature-impl... │
  │  Or:  pnpm cli trust reject feature-impl... │
  │  Or:  pnpm cli trust feature-impl --simulate│
  └─────────────────────────────────────────────┘
```

### Trust Simulation (CLI)

```
$ pnpm cli trust feature-implementation --simulate spot_checked

Simulation: What if feature-implementation had been at spot_checked?

  Analyzing last 20 runs...

  16 runs would NOT have been reviewed by you
  Of those 16:
    ✓ 14 passed all automated checks
    ⚠ 2 had review flags (both resolved by retry)
    ✗ 0 had issues needing your correction

  4 runs WOULD have been sampled for your review
  Of those 4:
    ✓ 3 approved clean
    ✓ 1 edited (minor formatting — editRatio 0.08)

  Result: No corrections would have been missed.
```

### Downgrade Alert (CLI)

```
$ pnpm cli status

  feature-implementation:
  ⚠ TRUST DOWNGRADE: spot_checked → supervised

  What happened:
  Correction rate reached 40% in last 10 runs (threshold: 30%)

  Corrections:
   Run #47: Labour estimate too low (complex job)
   Run #48: Wrong margin applied
   Run #50: Missing materials
   Run #51: Labour estimate too low

  You now review every output.

  Override: pnpm cli trust override feature-implementation
  (You believe these were edge cases — monitoring continues at spot_checked)
```

## Acceptance Criteria

1. [ ] `trustSuggestions` table exists with columns: `id`, `processId`, `currentTier`, `suggestedTier`, `evidence` (json: array of condition results), `status` (pending/accepted/rejected/dismissed), `decidedAt`, `decidedBy`, `decisionComment`, `previousSuggestionId` (nullable, links re-offers), `createdAt`
2. [ ] `checkUpgradeEligibility(processId, trustState)` evaluates all conjunctive conditions for the next tier and returns `{ eligible: boolean, conditions: Array<{ name, threshold, actual, passed }> }`
3. [ ] Upgrade conditions match parent brief: supervised→spot_checked requires ≥10 runs, ≥85% approval, 0 rejections in last 10, ≥90% auto-check pass, non-increasing correction trend
4. [ ] Upgrade conditions match parent brief: spot_checked→autonomous requires ≥20 runs at spot_checked, ≥95% sampled approval, ≤5% correction rate, 0 rejections in window, 100% auto-check pass, 0 rewrites in window
5. [ ] `checkDowngradeTriggers(processId, trustState)` evaluates disjunctive conditions and returns `{ triggered: boolean, triggers: Array<{ name, threshold, actual }> }`
6. [ ] Downgrade triggers match parent brief: correction rate >30% in last 10, any rejection, auto-check failure >20% in last 10
7. [ ] Grace period: no downgrade evaluation for 5 runs after any upgrade; immediate downgrade if correction rate exceeds 50% during grace (safety valve)
7a. [ ] If a downgrade trigger fires while an upgrade suggestion is pending, the suggestion is marked `dismissed` and the downgrade takes precedence
8. [ ] When upgrade eligibility is detected, a `trustSuggestions` row is created with `status: 'pending'` and full condition evidence
9. [ ] `pnpm cli trust accept <process>` updates `processes.trustTier`, records in `trustChanges`, marks suggestion as accepted, resets grace period counter
10. [ ] `pnpm cli trust reject <process>` marks suggestion as rejected with optional comment; re-evaluation happens after next window
11. [ ] When downgrade triggers fire, `processes.trustTier` is updated to `supervised`, recorded in `trustChanges` with `actor: 'system'` and trigger details
12. [ ] `pnpm cli trust override <process>` reverses an auto-downgrade: restores previous tier, records override in `trustChanges` with `actor: 'human'` and reason; after 3 consecutive overrides for same trigger, CLI shows escalation warning
13. [ ] `pnpm cli trust <process> --simulate <tier>` replays sampling decisions using existing `samplingHash` data, reports runs that would/wouldn't be reviewed and whether corrections would be missed
14. [ ] `pnpm cli approve` enforces `canAutoAdvance=false` for critical tier: refuses batch approval, requires individual review
15. [ ] Trust evaluation runs automatically after every feedback record (approve/edit/reject); if eligible or triggered, results appear in next `pnpm cli trust` or `pnpm cli status` output
16. [ ] ADR-008 written: documents algorithm choice (fixed window over Beta), threshold values, conjunctive/disjunctive asymmetry, grace period rationale, multi-source weighting, simulation approach

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Upgrade never auto-applies (human must explicitly accept)
   - Critical tier is never modified by system
   - All tier changes are recorded in `trustChanges` with full audit
   - Grace period prevents oscillation
   - Override model allows break-glass but escalates on repeated use
   - Simulation correctly replays deterministic sampling
   - Trust evaluation doesn't introduce performance issues (bounded window queries)
3. Run `pnpm run type-check` — must pass
4. Present work + review findings to human for approval

## After Completion

1. Update `docs/state.md`: Phase 3 complete
2. Update `docs/roadmap.md`: mark all Phase 3 capabilities as done
3. ADR-008 already written as part of this phase
4. Phase retrospective: what worked, what surprised, what to change
5. Invoke `/dev-documenter` for full wrap-up
