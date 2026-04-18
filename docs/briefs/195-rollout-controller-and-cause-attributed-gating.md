# Brief 195: Rollout Controller + Cause-Attributed Gating + Telemetry

**Date:** 2026-04-18
**Status:** ready
**Depends on:** Brief 189 (Evidence Harvest — reputation signals), Brief 191 (Release Distribution — signed manifests exist), ADR-034 §4 (staged rollout decision), Brief 091 (existing fleet-upgrade canary primitive — extended)
**Unlocks:** Brief 196 (Node Adoption — checks rollout stage). Brief 192 (ships via 191+195+196). Brief 194 (ships via 191+195+196).

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. Created by splitting Brief 191 per Insight-004 sizing; this is the rollout/gating layer.
- **Capabilities:** Staged rollout state machine (canary → partial → full) with configurable cohort percentages and dwell times; cause-attributed rollback-rate gate (weighted by operator-picked reason enum); telemetry-aggregator that feeds rollout decisions; release-channels cohort selection; rollout-abort CLI.

## Context

Brief 191 originally bundled signing + ceremony + rollout + adoption + rollback into one sub-brief. Reviewer of Brief 181 sub-briefs (Round 1, 2026-04-18) flagged this as Insight-004 over-scoping: four distinct integration seams, ~30 work products, ceremony alone is multi-day human work. Split along dependency seams: 191 owns signing + ceremony + shard escrow; 195 (this brief) owns rollout + gating + telemetry; 196 owns node adoption + three-way-merge + rollback.

ADR-034 §4 specifies the full rollout decision. This brief is the implementation of that section. The cause-attributed rollback-rate gate (mandatory reason enum: `matches_release_content | ambiguous | unrelated_local_issue`, weighted 1.0 / 0.5 / 0.0) is the novel contribution — prevents false-positive aborts from user-specific unrelated issues.

This brief extends Brief 091's existing fleet-upgrade canary + circuit-breaker primitive. Brief 091's model is: single-step canary (one workspace first → rest). This brief adds: multi-step staging (5% → 25% → 100%), dwell times between stages, and metric-driven gating instead of binary health-check pass/fail.

## Objective

Ship the staged rollout state machine on the Network: when a signed release is published (Brief 191), rollout-controller stages it through canary (5% cohort, 3-day dwell), partial (25%, 4-day dwell), full (100%). Each stage-advancement gated on cause-attributed weighted rollback rate < 5%. Telemetry-aggregator continuously ingests `update_applied` and `update_rolledback_with_reason` signals (emitted by nodes via Brief 189 evidence pipeline — this brief adds those variants to the EvidenceSignal union). Maintainer can abort any rollout with one command; reset aborts with audit log. Cohort selection from eligible channel members (stable/beta/nightly/security); channel membership resolved per node config.

## Non-Goals

- **Not shipping update fetching or adoption on nodes.** That's Brief 196. This brief delivers the network-side staging + gating; Brief 196 delivers the node-side fetcher + adopter that checks rollout stage before applying.
- **Not implementing statistical Kayenta-style canary analysis.** Too heavy for this scale; ADR-034 §4 defers Kayenta-style. Simple rollback-rate threshold.
- **Not implementing reputation-weighted cohort selection.** First iteration is random sampling + channel membership. Reputation-weighted cohort selection is a follow-up after Brief 193's reputation scoring lands.
- **Not implementing canary cohort stratification** (by tier, region, usage pattern, etc.). Random sampling at v1.
- **Not implementing the maintainer release-management web dashboard.** CLI only at this brief; dashboard in Brief 193.

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing
2. `docs/adrs/034-release-distribution-model.md` §4 (staged rollout + cause-attributed gate) — canonical reference
3. `docs/briefs/complete/091-fleet-upgrades.md` — existing canary primitive extended here
4. `docs/briefs/191-release-distribution-pipeline.md` — upstream signed manifests
5. `docs/briefs/189-evidence-harvest-pipeline.md` — node-side telemetry channel (extended with `update_applied` + `update_rolledback_with_reason` signal types)
6. `docs/insights/180-spike-test-every-new-api.md` — telemetry endpoint spike test
7. `docs/landscape.md` §Progressive Delivery (Argo Rollouts, Flagger, Kayenta pattern references)
8. `src/db/schema.ts` — existing `upgradeHistory` extends here with `rollbackReason`

## Constraints

- MUST implement staged rollout per ADR-034 §4: canary (5%) → partial (25%) → full (100%) with dwell times 3d / 4d. Threshold values labeled seed values, recalibration at 6-release checkpoint per ADR-034.
- MUST implement cause-attributed rollback-rate gate: weighted rate computed from `matches_release_content` (weight 1.0) + `ambiguous` (weight 0.5) + `unrelated_local_issue` (weight 0.0). Threshold 5% seed value. Stage-abort on exceed.
- MUST enforce minimum cohort size before gate activates: Wilson score lower-bound requires ≥10 adopted nodes in stage before rollback-rate gate can fire abort. Below minimum = gate disabled (cannot auto-abort a thin cohort).
- MUST support four channels per Brief 191: stable, beta, nightly, security. Cohort at each stage sampled from channel-eligible nodes.
- MUST emit rollout-state transitions to activities with `actorType: "rollout-controller"`. Maintainer audit trail.
- MUST integrate Brief 091's existing circuit-breaker primitive for consecutive-failure detection. Circuit-breaker fails closed; rollback-rate gate fails on attributed rate. Both gates operate together.
- MUST include `stepRunId` on rollout-state-transition, telemetry-ingest, abort commands per Insight-180.
- MUST extend EvidenceSignal union (Brief 189) with new variants: `update_applied` and `update_rolledback_with_reason`. Allowlist updated atomically.
- MUST NOT skip dwell times for any reason other than the `security` channel. Security releases can skip canary/partial → full directly, but maintainer explicit override with reason logged.
- MUST NOT compute rollback-rate metric that includes unweighted counts — only the weighted sum per cause attribution reaches the gate.
- MUST support maintainer abort at any stage: `ditto network-admin rollout abort <release-id>`. Aborted release stays at current stage; no auto-promotion; no rollback of already-adopted nodes.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Staged rollout state machine | Brief 091 canary + Chrome staged rollout + ADR-034 §4 | pattern + depend | Brief 091 primitive extended to multi-step |
| Cause-attributed rollback-rate gate | Original to Ditto (ADR-034 §4) | pattern | Prevents false-positive aborts; no prior art |
| Wilson score minimum-N | Classical statistics | pattern | Gate only activates on statistically meaningful cohort |
| Circuit-breaker | Brief 091 | depend | Reuse existing |
| Telemetry aggregator | Original to Ditto (informed by Brief 108 admin oversight) | pattern | Reads evidence stream |
| EvidenceSignal union extension | Brief 189 module-augmentation pattern | depend | Atomic allowlist update |

## What Changes (Work Products)

Engine-core (`packages/core/`):

| File | Action |
|------|--------|
| `packages/core/src/learning/rollout-stage.ts` | **Create:** `RolloutStage` enum (`canary | partial | full | aborted | complete`), `StagedRolloutState` type, transition rules. |
| `packages/core/src/learning/rollback-reason.ts` | **Create:** `RollbackReason` enum with seed weights (1.0 / 0.5 / 0.0). Single source of truth consumed by Brief 196's CLI + this brief's aggregator. |
| `packages/core/src/learning/evidence-types.ts` | **Modify (EvidenceSignal extension):** Add `UpdateAppliedSignal` and `UpdateRolledBackWithReasonSignal` variants to the open EvidenceSignal union. Update allowlist atomically. |
| `packages/core/src/db/schema.ts` | **Modify:** Add `rolloutStages` table. Extend `upgradeHistory` with `rollbackReason` and `rollbackWeight` columns. |

Ditto product layer — network-side:

| File | Action |
|------|--------|
| `src/engine/network-learning/rollout-controller.ts` | **Create:** State machine. Reads `rolloutStages`. On signed release published, creates canary stage. Progression gated on (a) dwell time met AND (b) weighted rollback rate < 5% AND (c) minimum cohort met. Scheduled hourly. |
| `src/engine/network-learning/telemetry-aggregator.ts` | **Create:** Consumes `update_applied` + `update_rolledback_with_reason` signals via evidence pipeline. Writes per-stage per-release aggregates. Computes weighted rate. |
| `src/engine/network-learning/release-channels.ts` | **Create:** `resolveChannelMembership(nodeId)`. Reads node config (ADR-025 managedWorkspaces pattern). Returns eligible channels. |
| `src/engine/network-learning/cohort-sampler.ts` | **Create:** `selectCohort(releaseId, stage)` returns node set sized to stage percentage, sampled from channel-eligible set. Deterministic with seed for reproducibility. |
| `src/cli/commands/network-admin.ts` | **Modify:** Add `rollout status/abort/resume <release-id>` subcommands. |
| `drizzle/NNNN_rollout_controller.sql` + snapshot | **Create:** Migration. Next idx per Insight-190. |

Tests:

| File | Action |
|------|--------|
| `src/engine/network-learning/rollout-controller.test.ts` | **Create:** Stage progression, dwell-time enforcement, weighted-rate gate, min-cohort gate, circuit-breaker integration, abort. |
| `src/engine/network-learning/telemetry-aggregator.test.ts` | **Create:** Signal ingestion, weighted-rate math, per-release aggregates. |
| `src/engine/network-learning/cohort-sampler.test.ts` | **Create:** Deterministic selection, channel filtering, stage sizing. |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint. |

## User Experience

- **Jobs affected (maintainer):** Orient (rollout status via CLI). Decide (abort on emergency).
- **Primitives involved:** None new at this brief — CLI only.
- **Process-owner perspective (maintainer):** `ditto network-admin rollout status <id>` shows current stage, cohort size, weighted rollback rate, gate status, time-until-next-stage. `... abort <id>` halts progression.
- **Interaction states:** `canary | partial | full | aborted | complete` on a release; CLI renders as text.
- **Designer input:** Not invoked; CLI only.

## Acceptance Criteria

1. [ ] Staged rollout: canary (5%) → partial (25%) → full (100%) with dwell times 3d / 4d. Values documented as seed per ADR-034 §4 recalibration trigger.
2. [ ] Cause-attributed weighted rollback rate computed per ADR-034 §4: 1.0/0.5/0.0 weights on `matches_release_content`/`ambiguous`/`unrelated_local_issue`. Verified by test matrix.
3. [ ] Gate activation requires ≥10 adopted nodes in current stage (Wilson minimum-N). Below threshold, gate disabled; stage continues on dwell-time only. Verified by threshold test.
4. [ ] Stage-abort triggers on weighted rate > 5%. Release holds at current stage; no auto-promotion; adopted nodes unchanged. Maintainer alert fires.
5. [ ] Circuit-breaker (Brief 091) and rollback-rate gate operate together; either fails → stage halts. Verified by integration test.
6. [ ] Four channels supported (stable, beta, nightly, security). Cohort sampling filtered by channel membership. Verified by 4-case test.
7. [ ] Security channel can skip canary/partial with maintainer explicit override + logged reason. Verified by security-release test.
8. [ ] EvidenceSignal union extended with `UpdateAppliedSignal` and `UpdateRolledBackWithReasonSignal`. Allowlist updated. Compile-time check passes. Verified by type-check + emission test.
9. [ ] Rollout state transitions logged to activities with actorType `"rollout-controller"` + release ID + stage. Verified by integration test.
10. [ ] `ditto network-admin rollout status/abort/resume <release-id>` commands work. Verified by CLI integration tests.
11. [ ] Telemetry aggregator correctly ingests signals from Brief 189 evidence pipeline. Verified by end-to-end seeded test.
12. [ ] `stepRunId` required on rollout-state-transition, telemetry-ingest, abort commands per Insight-180. Verified by compile + runtime tests.
13. [ ] Cohort sampler is deterministic for same (releaseId, stage, nodeSeed) — reproducible across runs. Verified by test.
14. [ ] Circuit-breaker + weighted-rate gate: synthetic rollback burst (6% weighted, no consecutive failures) triggers rate-gate abort, not circuit-breaker. Consecutive failure burst (5 nodes fail health-check) triggers circuit-breaker abort, not rate-gate. Verified by two-case test.
15. [ ] Insight-190 migration journal verified: SQL file + snapshot present, idx next-available.

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-034, this brief, Brief 091, Brief 189, Brief 191.
2. Reviewer specifically checks:
   - Weighted rate computation: can an operator or adversarial node manipulate attribution to break the gate?
   - Dwell-time enforcement: what if clock skew between nodes affects "3 days"?
   - Minimum cohort: Wilson score parameters correct?
   - Stage abort: does it properly isolate (no retroactive rollback of already-adopted nodes)?
   - Cohort sampling determinism: reproducible but also secure (not predictable by adversary wanting to influence which cohort they're in)?
   - Channel security: security channel skip-canary only with explicit override logged?
3. Present reviews + brief to human.

## Smoke Test

```bash
pnpm cli sync
pnpm cli network-admin rollout status <release-id>
# Expect: current stage, cohort size, weighted rate, gate status

# Simulate successful canary
pnpm cli test:rollout --simulate-canary-success <release-id>
# Expect: auto-progresses to partial after 3d dwell

# Simulate cause-attributed rollback burst
pnpm cli test:rollout --inject-rollbacks <release-id> --count 10 --reason matches_release_content
# Expect: weighted rate crosses 5% threshold, rollout aborts, alert fires

# Simulate ambiguous-reason rollbacks (weight 0.5)
pnpm cli test:rollout --inject-rollbacks <release-id> --count 20 --reason ambiguous
# Expect: weighted rate = 10 * 0.5 / N — crosses 5% if N < 100; does not cross if N ≥ 100

# Wilson minimum-N
pnpm cli test:rollout --inject-rollbacks <release-id> --count 2 --reason matches_release_content
# Expect: below 10-node cohort, gate disabled, no abort

# Abort
pnpm cli network-admin rollout abort <release-id>
pnpm cli network-admin rollout status <release-id>
# Expect: aborted state
```

## After Completion

1. Update `docs/state.md` — rollout controller live.
2. Update `docs/roadmap.md` — Sub-brief 195 complete.
3. Unblock Brief 196 (node adoption checks rollout stage), Brief 192, Brief 194.
4. Capture insights on first-month rollback-reason distribution — if `ambiguous` dominates, recalibrate weight; if `unrelated_local_issue` is gaming the gate, add detection signal.
5. Architect retro: revisit seed thresholds per ADR-034 §4 recalibration trigger (6 releases).
