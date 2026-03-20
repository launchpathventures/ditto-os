# ADR-007: Trust Earning Algorithm

**Date:** 2026-03-20
**Status:** accepted

## Context

Phase 2 built trust enforcement (4 tiers, deterministic sampling, review patterns) but tiers were static — set in YAML, never changed. Phase 3 makes tiers dynamic: human feedback drives upgrade suggestions and automatic downgrades.

Key design forces:
- Must be explainable to non-technical users ("your last 20 runs" not "exponentially-weighted reputation score")
- Must be conservative: upgrades are hard to earn, downgrades are fast
- Must never auto-upgrade — human always decides
- Must prevent oscillation at tier boundaries
- Must support simulation ("what would have happened?")

Three research reports informed this decision:
- `docs/research/trust-earning-patterns.md` — algorithms, multi-source aggregation, gaming prevention
- `docs/research/trust-visibility-ux.md` — 18 UX patterns for trust visibility
- `docs/research/phase-3-trust-earning-ux.md` — persona journeys, interaction patterns

## Decision

### Algorithm: Fixed Sliding Window

Use a fixed sliding window (last N runs, default 20) rather than Beta distribution or exponential decay.

**Rationale:** Simpler to implement, explain, and debug. "Your last 20 runs" is concrete language Rob understands. Discourse TL3 and eBay both use fixed windows at scale. The raw event data supports future migration to exponential decay if needed.

### No Synthetic Trust Score

Trust state is a set of concrete metrics (approval rate, correction rate, trend, etc.), not a single number. Users see evidence, not scores.

### Conjunctive Upgrade / Disjunctive Downgrade (Asymmetric)

**Upgrades** require ALL conditions to pass simultaneously (conjunctive):
- supervised → spot_checked: ≥10 runs, ≥85% approval, 0 rejections in last 10, ≥90% auto-check pass, non-increasing correction trend
- spot_checked → autonomous: ≥20 runs at tier, ≥95% sampled approval, ≤5% correction rate, 0 rejections, 100% auto-check pass, 0 rewrites
- critical: never upgrades (architecture invariant)

**Downgrades** trigger on ANY single condition (disjunctive):
- Correction rate >30% in last 10 runs
- Any rejection
- Auto-check failure >20% in last 10 runs

All downgrades go to supervised. Human can override (break-glass).

### Grace Period

5 runs after any upgrade. Downgrades suppressed during grace unless correction rate exceeds 50% (safety valve). Prevents oscillation at tier boundaries.

### Override Model

Human can override auto-downgrades. Override always recorded in `trustChanges` with audit trail. After 3 consecutive overrides for the same trigger, CLI shows escalation warning.

### Signal Sources (Phase 3 Scope)

| Source | Weight | Rationale |
|--------|--------|-----------|
| Human feedback (approve/edit/reject) | Primary | Highest reliability |
| Review pattern (pass/flag/retry) | Supporting | Already recorded |
| Script/system (pass/fail) | Supporting | Already recorded |

Deferred: self-assessment, downstream process, external agent, time/outcome signals.

### Trust Simulation

Retroactively answers "what would have happened at a different tier?" by replaying deterministic sampling decisions against existing harness data. No new storage required.

## Provenance

| What | Source | Why |
|------|--------|-----|
| Fixed sliding window | Discourse TL3 (100-day rolling), eBay (adaptive 3/12 month) | Proven at scale, explainable |
| Conjunctive upgrade / disjunctive downgrade | eBay seller standards | Proven asymmetry |
| Grace period | Discourse TL3 (2-week grace) | Prevents oscillation |
| Break-glass override with audit | Google Binary Authorization | Override possible, always recorded |
| Trust simulation | GitHub Rulesets evaluate mode (adapted) | Strongest UX pattern from research |
| Upgrade suggestion as proposal | Paperclip approvals table pattern | System proposes, human decides |
| Quality gate as upgrade check | SonarQube QualityGateEvaluatorImpl.java | Individual conditions AND-ed |
| Edit severity classification | WikiTrust + wikimedia/revscoring | Proven edit → trust signal mapping |
| Word-level diff | kpdecker/jsdiff (diffWords) | Best JS diff library |

## Consequences

- **Easier:** Users understand trust decisions — concrete evidence, not opaque scores
- **Easier:** Debugging — fixed window makes it clear which runs contribute to trust
- **Easier:** Override with audit trail means no "locked out" scenarios
- **Harder:** Threshold tuning requires dogfood data (initial values are informed estimates)
- **Constraint:** Thresholds are currently global — per-process threshold tuning deferred to Phase 4
- **Follow-up:** Phase 7 (Layer 4) adds downstream process signals and outcome-based trust
- **Follow-up:** Phase 8 (Layer 5) adds correction pattern extraction
