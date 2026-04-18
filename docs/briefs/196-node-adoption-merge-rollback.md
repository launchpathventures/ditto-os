# Brief 196: Node Adoption Policy + Three-Way Merge + Rollback

**Date:** 2026-04-18
**Status:** ready
**Depends on:** Brief 191 (Signing + Ceremony — signed manifests exist), Brief 195 (Rollout Controller — node checks stage before apply), Brief 189 (Evidence pipeline — telemetry signals already available after Brief 195's extension)
**Unlocks:** Full end-to-end release distribution loop working. Brief 192 + Brief 194 (both ship changes via Brief 191+195+196 composite pipeline). Node-operator updates experience.

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. Created by splitting Brief 191 per Insight-004 sizing; this brief is the node-side adoption + merge + rollback layer.
- **Capabilities:** Node-side `update-fetcher` that polls Network for releases on configured channel and verifies TUF signatures; `update-adopter` applies per trust-tier adoption policy; `three-way-merge` (line-level at this brief; YAML/Markdown AST-aware in Brief 192); mandatory-reason rollback command (`ditto updates rollback --reason`); `ditto updates` CLI; per-trust-tier adoption policy config + matrix.

## Context

Brief 191 split per reviewer's Insight-004 finding. 196 (this brief) owns everything that happens on the node side: fetching signed manifests, verifying TUF signatures, applying updates atomically per operator policy, detecting conflicts with local customization, rolling back with attributed reason.

The three-way-merge primitive lives here in its basic form (line-level diff3, for plain content and simple YAML). Brief 192's cognitive-layer evolution extends it with YAML-aware + Markdown-AST-aware merge strategies — because cognitive content warrants structural merge awareness in ways general release content doesn't.

Adoption policy is the key UX decision surface. Per ADR-033 §3, autonomous tier auto-applies additive updates, supervised tier queues structural, critical tier never auto-applies. Frozen paths (`cognitive/core.md`, `cognitive/self.md`, engine ABI) always queue regardless of tier. Structural cognitive updates (per ADR-015 additive-vs-structural classification) never auto-apply at any tier.

## Objective

Ship node-side adoption end-to-end: update-fetcher polls Network on cron with operator-configured cadence, pulls signed manifests for configured channel, verifies TUF signatures (unverified → reject with clear error), stages verified manifests in local `pendingUpdates` table; update-adopter reads adoption policy from `config/ditto.yaml: learning.updates.*`, resolves per-release-type action (auto_apply / queue_for_review / shadow_mode), applies updates atomically to content directories (`processes/`, `cognitive/`, `templates/`), emits `update_applied` telemetry via Brief 189 evidence pipeline; `ditto updates` CLI surfaces pending, applied, rolled-back; rollback requires explicit reason from mandatory enum.

## Non-Goals

- **Not implementing the full web UI for node operators.** CLI + BlockList rendering at this brief. Full dashboard composition is out of scope.
- **Not implementing YAML-aware or Markdown-aware three-way merge.** Basic line-level diff3 here; Brief 192 extends with structural awareness.
- **Not implementing engine-code shadow-mode deployment.** That's Brief 194.
- **Not implementing automated rollback on node-detected regression.** Operator-initiated rollback only at this brief. Automated rollback on health-check-fail is a future extension.
- **Not implementing Update Card ContentBlock rendering.** Brief 193 ships the Update Card renderer. This brief writes the data shape (UpdateCardBlock from Brief 193's `packages/core/src/content-blocks.ts` definition).

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing
2. `docs/briefs/191-release-distribution-pipeline.md` — signing infrastructure that produces manifests this brief consumes
3. `docs/briefs/195-rollout-controller-and-cause-attributed-gating.md` — rollout stage visibility (node checks stage before apply)
4. `docs/briefs/189-evidence-harvest-pipeline.md` — telemetry channel for `update_applied` and `update_rolledback_with_reason`
5. `docs/adrs/034-release-distribution-model.md` §3 (offline tolerance — metadata expiration), §4 (rollout + rollback reason)
6. `docs/adrs/033-network-scale-rsi-architecture.md` §3 (cognitive adoption tier table + structural cognitive never auto-applies), §4 (engine-version heterogeneity)
7. `docs/insights/180-spike-test-every-new-api.md`
8. `tuf-js` library (Brief 191 dependency; node-side verification)
9. Standard `diff3` primitive — Node `diff3` npm package or equivalent (line-level three-way merge)

## Constraints

- MUST verify TUF signatures on fetched manifests via `tuf-js` client (from Brief 191). Unverified → reject with error; no override flag.
- MUST enforce trust-tier adoption matrix per ADR-033 §3:
  | Tier | Additive | Structural | Cognitive additive | Cognitive structural | Engine code | Frozen paths |
  |------|----------|-----------|--------------------|-----------------------|-------------|--------------|
  | Autonomous | auto | queue | auto | **queue** | queue | queue |
  | Spot-checked | auto | queue | queue | queue | queue | queue |
  | Supervised | queue | queue | queue | queue | queue | queue |
  | Critical | **never auto** | never auto | never auto | never auto | never auto | queue-or-reject |
  Plus security channel (ADR-034): always opt-out-explicit; if opted in, adopts per tier but security releases can override dwell stages.
- MUST enforce frozen-paths (`cognitive/core.md`, `cognitive/self.md`, engine ABI, `docs/adrs/*`) — always queue regardless of tier. Even autonomous tier does not auto-apply.
- MUST enforce structural cognitive never auto-applies at any tier (ADR-033 §3). Release manifest carries `impact: additive | structural` field on cognitive updates (set by Brief 192 meta-proposals); update-adopter reads it before dispatch.
- MUST enforce staged metadata expiration per ADR-034 §3: timestamp 7d, snapshot 30d, targets 90d, root 1y + 30d grace. Expired = refuse with operator warning.
- MUST enforce engine-version-range compatibility per ADR-033 §4: release manifest with incompatible range deferred. Pinned processes never receive engine updates.
- MUST require explicit `--reason` on `ditto updates rollback` from enum: `matches_release_content | ambiguous | unrelated_local_issue`. CLI rejects missing reason. Handler-layer also rejects missing/invalid reason (defense in depth — not just CLI validation).
- MUST include `stepRunId` on fetch, adopt, rollback functions per Insight-180. Idempotent by release ID + node ID.
- MUST emit `update_applied` and `update_rolledback_with_reason` signals via Brief 189 evidence pipeline (these types added by Brief 195 to the EvidenceSignal union — this brief consumes that extension; no new union changes here).
- MUST implement three-way-merge (line-level `diff3`) on content-file updates where node has local customization. Clean merge → apply. Conflict → queue Manual Reconciliation entry (data shape defined here; UI rendering is Brief 193 / Brief 192).
- MUST check rollout stage before applying: node polls stage from Brief 195 network state; if release not yet promoted to a stage the node qualifies for (e.g., partial stage but node not in selected cohort), defer. Polling respects network response caching.
- MUST rate-limit node rollback commands: default 1/hour/release to prevent accidental rollback storms. Configurable.
- MUST atomically apply updates — if any file-write fails mid-apply, rollback automatically to pre-apply state (transactional). Filesystem semantics: stage in temp, swap on success.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| TUF client verification | `tuf-js` (Brief 191) | depend | Established |
| Per-tier adoption policy matrix | ADR-033 §3 | depend | Canonical |
| Three-way merge (line-level) | `node-diff3` or `@opentf/std` diff3 | depend | Classical diff3 primitive |
| Rollback reason enum | ADR-034 §4 + Brief 195 `RollbackReason` type | depend | Single source of truth |
| Polling cadence | Standard update-client pattern (apt, yum, npm) | pattern | Well-established |
| Metadata expiration enforcement | TUF specification §expiration | depend | Direct from spec |
| Atomic file-write | Standard transactional-filesystem pattern (write-temp-then-rename) | pattern | Node `fs.promises.rename` atomicity |

## What Changes (Work Products)

Engine-core (`packages/core/`):

| File | Action |
|------|--------|
| `packages/core/src/learning/adoption-policy-types.ts` | **Create:** `AdoptionPolicy` type + matrix (per-tier per-release-type → action). Matrix from ADR-033 §3. |
| `packages/core/src/learning/adoption-action.ts` | **Create:** `AdoptionAction` enum (`auto_apply | queue_for_review | shadow_mode | reject`). |
| `packages/core/src/learning/merge-verdict.ts` | **Create:** `MergeVerdict` type. Fields: `status: "CLEAN" \| "CONFLICT" \| "FROZEN_PATH"`, mergedContent, conflictBlocks, original, theirs, ours. (Basic line-level merge verdict here; Brief 192 extends for YAML/Markdown awareness.) |
| `packages/core/src/db/schema.ts` | **Modify:** Add `pendingUpdates`, `appliedUpdates`, `manualReconciliations` (node-local) table definitions. |

Ditto product layer — node-side:

| File | Action |
|------|--------|
| `src/engine/node-learning/update-fetcher.ts` | **Create:** Cron-driven polling loop. Fetches channel manifest list from Network (Brief 191 `/v1/network/releases`). Verifies TUF signatures via `tuf-js`. Checks stage eligibility (polls Brief 195 stage state). Stores verified releases in `pendingUpdates` local DB. |
| `src/engine/node-learning/update-adopter.ts` | **Create:** `adoptUpdate({ releaseId, stepRunId })`. Reads adoption policy from config. Resolves action per (tier, release-type). Atomic file-write on apply. Writes to `appliedUpdates`. Emits `update_applied` via Brief 189 evidence pipeline. |
| `src/engine/node-learning/adoption-policy-engine.ts` | **Create:** Policy resolver. Reads `config/ditto.yaml: learning.updates.auto_apply.*` + structural classification from release manifest. Returns `AdoptionAction`. Frozen paths always `queue_for_review`. |
| `src/engine/node-learning/three-way-merge.ts` | **Create (basic line-level):** `threeWayMerge(base, theirs, ours)` using diff3 algorithm. Returns `MergeVerdict`. Brief 192 extends with YAML + Markdown AST awareness. |
| `src/engine/node-learning/manual-reconciliation.ts` | **Create:** On merge conflict, writes entry to `manualReconciliations` table. Queues Manual Reconciliation Card data shape (UI rendering in Brief 193 / 192). |
| `src/engine/node-learning/rollback-handler.ts` | **Create:** `rollbackUpdate({ releaseId, reason, stepRunId })`. Validates reason from enum — rejection at handler layer, not just CLI. Reverts applied update atomically. Emits `update_rolledback_with_reason` telemetry. |
| `src/engine/node-learning/expiration-checker.ts` | **Create:** Checks metadata expiration windows per ADR-034 §3. If expired, refuses updates + warns operator. Hourly scheduled. |
| `src/engine/node-learning/engine-version-checker.ts` | **Create:** Validates release's `engineVersionRange` against node's current `@ditto/core` version. Incompatible → defer. |
| `src/cli/commands/updates.ts` | **Create:** `ditto updates list/show/apply/rollback/channel/pause/resume/status/reconcile`. `rollback` requires `--reason`; no default; handler-layer also rejects missing. `reconcile` lists pending manual reconciliations, allows accept-network/keep-local/merge-via-Self. |
| `config/ditto.yaml` schema (docs) | **Modify:** Add `learning.updates.*` section per ADR-034 §3 defaults. |
| `src/engine/node-learning/update-telemetry-emitter.ts` | **Create:** Wraps evidence-emitter (Brief 189) for node-learning-specific signals. |
| `drizzle/NNNN_node_adoption.sql` + snapshot (node-local) | **Create:** Migration for `pendingUpdates`, `appliedUpdates`, `manualReconciliations`. Next idx per Insight-190. |

Tests:

| File | Action |
|------|--------|
| `src/engine/node-learning/update-fetcher.test.ts` | **Create:** Signature verification (valid, tampered manifest rejected, expired metadata rejected), stage eligibility gating, polling cadence. |
| `src/engine/node-learning/update-adopter.test.ts` | **Create:** Per-tier adoption matrix (autonomous auto-applies additive; supervised queues; critical never auto-applies), frozen-paths always queue, structural cognitive never auto-applies, atomic apply on failure rolls back. |
| `src/engine/node-learning/adoption-policy-engine.test.ts` | **Create:** Policy matrix exhaustive (tier × release-type → action). |
| `src/engine/node-learning/three-way-merge.test.ts` | **Create:** Clean merge applies, conflict queues Manual Reconciliation, user-wins default, frozen-path rejection. |
| `src/engine/node-learning/rollback-handler.test.ts` | **Create:** Rollback reverses state, reason enforced at handler layer (not just CLI), telemetry emitted, rate-limit enforcement. |
| `src/engine/node-learning/expiration-checker.test.ts` | **Create:** Grace-period behavior per metadata role. |
| `src/engine/node-learning/engine-version-checker.test.ts` | **Create:** Version-range semantics, pinned-process behavior. |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint. |

## User Experience

- **Jobs affected (node operator):** Orient (update status via CLI), Decide (accept/reject queued updates, roll back with reason), Capture (manual reconciliation when cognitive update conflicts).
- **Primitives involved:** Update Card data shape (renderer in Brief 193). Manual Reconciliation entries (renderer in Brief 192 / 193).
- **Process-owner perspective:** Autonomous/spot-checked tiers: invisible; updates arrive and apply per policy. Supervised: sees queue via `ditto updates list`. Critical: sees CLI notifications; operator must `ditto updates apply` manually.
- **Interaction states:** Pending (verified, awaiting apply per policy), applied (active), rolled-back (reverted), needs-reconciliation (conflict on merge).
- **Designer input:** Lightweight — Update Card + Manual Reconciliation entry visual polish is Brief 193 / 192 scope.

## Acceptance Criteria

1. [ ] Node-side `update-fetcher` polls on cron (default hourly); fetches signed manifests from Network; verifies TUF signatures via `tuf-js`. Unverified manifest rejected with clear error code. Verified by integration test.
2. [ ] Tampered-manifest test: CI mutates signed manifest bytes; node rejects. Verified by integration test.
3. [ ] Per-tier adoption matrix enforced per ADR-033 §3 (autonomous auto-applies additive; spot-checked queues structural; supervised queues everything; critical never auto-applies). Verified by 4-tier × 6-release-type matrix.
4. [ ] Frozen paths (`cognitive/core.md`, `cognitive/self.md`, engine ABI, `docs/adrs/*`) always queue regardless of tier. Verified by test with autonomous-tier node + frozen-path update — not auto-applied.
5. [ ] Structural cognitive updates never auto-apply at any tier. Release manifest's `impact: structural` field read before dispatch. Verified by test with autonomous-tier node + structural cognitive update — not auto-applied.
6. [ ] Staged metadata expiration enforced per ADR-034 §3 gradient (7d/30d/90d/1y). Expired metadata refuses updates with operator warning. Verified by clock-skew test.
7. [ ] Engine-version-range compatibility: release with incompatible `engineVersionRange` deferred on node with incompatible version. Pinned processes never receive engine updates. Verified by 3-case test.
8. [ ] `ditto updates rollback` requires `--reason` from mandatory enum (`matches_release_content | ambiguous | unrelated_local_issue`). CLI rejects missing reason. Handler also rejects missing/invalid reason — defense in depth at both layers. Verified by two tests (CLI-layer + handler-layer rejection).
9. [ ] Rollback rate-limiting: default 1/hour/release. Verified by rapid-rollback test.
10. [ ] Atomic update application: if any file-write fails mid-apply, all applied changes revert to pre-apply state. Verified by failure-injection test.
11. [ ] Three-way merge (line-level): clean merge applies; conflict queues Manual Reconciliation entry; frozen-path rejects. Verified by 3-case test.
12. [ ] Node checks rollout stage before applying: partial-stage release without node in eligible cohort deferred. Verified by stage-eligibility test.
13. [ ] `update_applied` and `update_rolledback_with_reason` telemetry signals emitted via Brief 189 evidence pipeline. Signals reach `networkEvidence`. Verified by end-to-end seeded test.
14. [ ] `ditto updates list/show/apply/rollback/channel/pause/resume/status/reconcile` commands work. Verified by CLI integration tests.
15. [ ] `stepRunId` required on fetch, adopt, rollback per Insight-180. Verified by compile + runtime tests.
16. [ ] Insight-190: migration journal + SQL + snapshot present; next idx verified.

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-033 §3-4, ADR-034 §3-4, Brief 191, Brief 195, this brief.
2. Reviewer specifically checks:
   - Adoption matrix exhaustive? Any `(tier, release-type)` cell missing or ambiguous?
   - Atomic apply: all filesystem mutations captured; recovery-from-partial-apply bulletproof?
   - Three-way merge conflict detection: false-positive rate OK? False-negative (silently accepts bad merge)?
   - Rollback rate-limit: reasonable; can operator bypass?
   - Stage eligibility: node correctly defers partial-stage updates? Does the node poll or does Network push?
   - Signature verification: any code path where unverified manifest accepted (debug mode, test hooks)?
3. Present reviews + brief to human.

## Smoke Test

```bash
pnpm cli sync
pnpm cli updates channel
# Expect: stable (default)

pnpm cli updates list
# Expect: pending releases on stable channel

# Apply under autonomous tier
pnpm cli updates apply <additive-release-id>
# Expect: signature verified, applied atomically, telemetry emitted

# Apply structural update under autonomous tier
pnpm cli updates apply <structural-release-id>
# Expect: "Queued for review" — not auto-applied

# Apply frozen-path update under autonomous tier
pnpm cli updates apply <frozen-path-release-id>
# Expect: "Queued for review" — frozen paths always queue

# Rollback without reason
pnpm cli updates rollback <release-id>
# Expect: error "--reason required"

# Rollback with valid reason
pnpm cli updates rollback <release-id> --reason matches_release_content
# Expect: revert applied, telemetry emitted

# Rollback with invalid reason
pnpm cli updates rollback <release-id> --reason fabricated_reason
# Expect: error at both CLI and handler layer

# Rapid rollback (rate-limit)
pnpm cli updates rollback <release-id> --reason ambiguous
pnpm cli updates rollback <release-id> --reason ambiguous
# Expect: second call rate-limited

# Manual reconciliation
pnpm cli updates reconcile list
# Expect: pending conflicts (if any)
pnpm cli updates reconcile show <id>
# Expect: three-way diff printed
pnpm cli updates reconcile keep-local <id>
# Expect: local preserved, network version marked dismissed

# Tampered manifest
./scripts/test-tampered-manifest.sh
# Expect: TUFVerificationError

# Expired metadata
./scripts/test-expired-metadata.sh
# Expect: operator warning; updates refused
```

## After Completion

1. Update `docs/state.md` — node adoption live. RSI loop end-to-end complete (Brief 191 signs, Brief 195 stages, Brief 196 adopts).
2. Update `docs/roadmap.md` — Sub-brief 196 complete.
3. Unblock Brief 192 (ships changes via 191+195+196), Brief 194 (ships engine changes via 191+195+196 with shadow-mode overlay).
4. Capture insights: first-month rollback distribution, conflict frequency on three-way merge, operator policy configuration patterns.
5. Architect retro: adoption matrix fit reality? Rate-limit threshold right? Should structural cognitive auto-apply at autonomous tier with a grace period, or remain always-queue?
