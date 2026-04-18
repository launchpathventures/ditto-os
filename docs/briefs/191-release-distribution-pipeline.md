# Brief 191: Release Signing + Ceremony + Shard Escrow

**Date:** 2026-04-17 (split 2026-04-18 per reviewer Insight-004 finding)
**Status:** ready
**Depends on:** Brief 189 (Evidence Harvest — Network API auth pattern reuse), ADR-034 §1 (signing composition), §2 (rotation + escrow), §3 (metadata expiration), Insight-180 (spike-test), Insight-195 (Brief 191 split — this brief narrowed; 195 owns rollout; 196 owns node adoption).
**Unlocks:** Brief 195 (Rollout Controller — consumes signed manifests). Brief 196 (Node Adoption — verifies signatures on signed manifests). Together 191+195+196 form the full distribution pipeline; Briefs 192 and 194 ship changes through the composite.

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. Narrowed from original composite per reviewer Insight-004 sizing finding: four-seam composite split into three single-seam briefs. This brief owns **signing + ceremony + shard escrow** (the security-critical foundation).
- **Capabilities:**
  - `release-builder` — packages approved proposals (from Brief 190 archive, or maintainer-manual for bootstrap) into unsigned `ReleaseManifest`
  - `release-signer` — TUF metadata signing via `tuf-js` with offline-root + offline-targets YubiKey ceremony + online snapshot + online timestamp
  - Four release channels: `stable`, `beta`, `nightly`, `security` (declared here; channel-routing + cohort-selection is Brief 195 scope)
  - Release publishing endpoint — nodes pull signed manifests from `/v1/network/releases` (Brief 196 consumes)
  - Shard escrow specification: 3-of-5 Shamir shares with named holders + recovery ceremony + quarterly liveness drill
  - `docs/ops/signing-ceremony.md` + `docs/ops/shard-escrow.md` operational procedure documentation
  - Signing-spike integration test per Insight-180 before integration ships

## Context

Brief 181 §Phasing originally bundled signing + ceremony + rollout + adoption + rollback into one sub-brief. Reviewer of sub-briefs 189–194 (Round 1, 2026-04-18) flagged this as Insight-004 over-scoping: the ceremony alone is multi-day human work (YubiKey provisioning, 5 shard holders, first drill); adoption matrix is a separate seam; three-way-merge is a separate seam. Split:
- **191 (this brief)** — signing + ceremony + shard escrow. Foundational security infrastructure.
- **195** — rollout controller + cause-attributed gating + telemetry. Consumes signed manifests.
- **196** — node adoption + three-way-merge + rollback. Consumes signed manifests + rollout state.

ADR-034 specifies the full distribution decision. This brief implements ADR-034 §1-3 (signing composition, rotation, offline tolerance). Brief 195 implements ADR-034 §4-5 (rollout + cadence). Brief 196 implements ADR-034 §3 node-side metadata expiration + §4 rollback reason enforcement.

The ceremony is new operational infrastructure for Ditto. This brief includes the ceremony documentation, the shard-escrow specification (3-of-5 Shamir with named holders per ADR-034 §2), and the first drill before production-signing commences.

## Objective

Ship the signing foundation: release-builder packages approved proposals (or maintainer-manual for bootstrap) into unsigned manifests; offline-root + offline-targets YubiKey ceremony produces TUF-signed manifests via `tuf-js`; online snapshot + online timestamp keys refresh on schedule; four channels declared; publishing endpoint lets nodes pull. Shard escrow documented and drilled once before first production signing. Integration spike test verifies real signed manifest end-to-end round-trip per Insight-180 — before any production invocation.

## Non-Goals

- **Not implementing staged rollout or cause-attributed gating.** Brief 195 scope.
- **Not implementing node-side adoption, update-fetcher, or three-way-merge.** Brief 196 scope.
- **Not implementing rollback.** Brief 196 scope.
- **Not implementing Rekor transparency-log submission or in-toto attestations.** ADR-034 §1 lists these as optional enhancements; defer to follow-up brief.
- **Not implementing automated shard-recovery procedures.** Ceremony is documented + drilled manually. Automation is deliberately out of scope (cumbersome recovery is a feature, not a bug).
- **Not shipping a maintainer web dashboard for signing.** Ceremony procedure is CLI + YubiKey interaction; dashboard is Brief 193 scope.
- **Not implementing reputation-based cohort selection.** Simple channel-based eligibility here; reputation-weighted cohorts is future work.
- **Not implementing engine-code shadow-mode deployment.** Brief 194 scope.

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing
2. `docs/adrs/034-release-distribution-model.md` — canonical decision reference (full read required)
3. `docs/briefs/189-evidence-harvest-pipeline.md` — Network API auth pattern extended
4. `docs/briefs/195-rollout-controller-and-cause-attributed-gating.md` — downstream consumer
5. `docs/briefs/196-node-adoption-merge-rollback.md` — downstream consumer
6. `docs/briefs/complete/091-fleet-upgrades.md` — existing rollout primitive reference (Brief 195 extends)
7. `docs/insights/180-spike-test-every-new-api.md` — signing verification spike mandatory
8. `docs/insights/190-migration-journal-discipline.md` — Drizzle migration discipline (journal idx conflict resolution on rebase)
9. TUF specification https://theupdateframework.github.io/specification/latest/
10. `tuf-js` library https://github.com/theupdateframework/tuf-js — TypeScript TUF client, MIT
11. `docs/landscape.md` §Release Distribution + Signing — all evaluations
12. `docs/research/network-scale-rsi-tech-choices.md` §Topic 1
13. `docs/briefs/complete/106-bespoke-signed-review-pages.md` — prior short-lived-token signing pattern
14. `src/engine/workspace-provisioner.ts` — managed-workspace pattern hosts nodes pull from

## Constraints

- MUST use TUF via `tuf-js` for metadata signing per ADR-034 §1. Four roles configured: root 2-of-3 (offline YubiKey), targets 2-of-2 (offline YubiKey), snapshot 1-of-1 (online), timestamp 1-of-1 (online).
- MUST implement air-gapped signing for root and targets keys — keys live on YubiKeys, ceremonies on offline machine. Snapshot + timestamp keys automated on network service (online).
- MUST NOT allow CI-automated root or targets signing. No "just this once" overrides.
- MUST implement 3-of-5 Shamir secret-sharing for root key disaster recovery per ADR-034 §2. Explicit named holders: Maintainer A (primary signer), Maintainer B (primary signer), Legal counsel (sealed envelope, notarized), Bank safety-deposit (dual-signatory access by Maintainers A+B), Cloud-HSM escrow (multi-party authorization).
- MUST publish `docs/ops/signing-ceremony.md` with step-by-step ceremony procedure, YubiKey provisioning, air-gap setup, ceremony checklist, witness requirements. First drill completed and logged before production signing.
- MUST publish `docs/ops/shard-escrow.md` distinguishing **active-signing threshold (2-of-3 root keys)** from **disaster-recovery threshold (3-of-5 Shamir shards)**. These are distinct cryptographic mechanisms; documentation must not conflate them.
- MUST implement four channels per ADR-034 (declared here; routing is Brief 195). `security` channel declared as always opt-out-explicit — default-on.
- MUST enforce staged metadata expiration per ADR-034 §3 (server-side publication respects these windows): timestamp 7d, snapshot 30d, targets 90d, root 1y + 30d grace. Server tooling refuses publication of expired metadata.
- MUST include `stepRunId` on every signing, publishing function per Insight-180. Idempotent by release ID.
- MUST publish release manifests with cryptographic integrity: hash of release body matches signed manifest; corruption = reject at node (node-side enforcement is Brief 196, but server-side tooling must compute + embed hashes correctly).
- MUST implement quarterly shard-holder liveness check. Automated reminders; manual confirmation recorded.
- MUST conduct one shard-recovery drill before first production signing ceremony. Drill verifies 3-of-5 reconstruction works against a test-key (never the real root key).
- MUST spike-test per Insight-180 before integration: round-trip a real TUF-signed manifest through signer → publisher → fetcher (test harness standing in for Brief 196 fetcher). No mocked signatures.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| TUF metadata protocol | TUF spec 1.0.x | depend | Well-specified, proven |
| `tuf-js` client library | `theupdateframework/tuf-js` (Apache 2.0) | depend | TypeScript-native, mature |
| Shamir secret sharing | `shamir-secret-sharing` or `@hashicorp/vault-shamir` (JS impl exists) | depend | Classical cryptographic primitive |
| YubiKey-based offline signing | Debian, Fedora, Tor maintainer workflow | pattern | Hardware-token-backed keys, offline ceremony |
| Air-gapped ceremony procedure | Debian release-team handbook + Tor bridge-authority model | pattern | Well-established maintainer workflow |
| Atomic publishing | Standard write-temp-then-rename pattern | pattern | Server-side transactional publish |
| Integration spike test | Insight-180 | depend | Project convention |

## What Changes (Work Products)

Engine-core (`packages/core/`):

| File | Action |
|------|--------|
| `packages/core/src/learning/release-manifest.ts` | **Create:** `ReleaseManifest` type. Fields: version, channel, engineVersionRange, proposalIds, contentDiffs (template, cognitive-mode, role-contract), engineCodePinVersion, releaseNotes, signatures, expirationTimestamp. |
| `packages/core/src/db/schema.ts` | **Modify:** Add `releaseManifests` table. |

Ditto product layer — network-side:

| File | Action |
|------|--------|
| `src/engine/network-learning/release-builder.ts` | **Create:** `buildRelease({ proposalIds, channel, engineVersionRange, stepRunId })` assembles `ReleaseManifest`. Validates content diffs apply cleanly. Computes release notes from proposal metadata. Returns unsigned manifest. Bootstrap mode accepts maintainer-authored manifest JSON until Brief 190 scanner ships proposals. |
| `src/engine/network-learning/release-signer.ts` | **Create:** Wraps `tuf-js`. Online operation: sign timestamp + snapshot with hot keys. Offline operation: ceremony-driven root + targets signing via YubiKey CLI tool. Ceremony procedure in `docs/ops/signing-ceremony.md`. |
| `src/engine/network-learning/release-publisher.ts` | **Create:** `publishRelease({ releaseId, stepRunId })` writes signed manifest to `releaseManifests` + makes available at `/v1/network/releases`. Atomic: hash embedded, integrity preserved. |
| `docs/ops/signing-ceremony.md` | **Create:** Step-by-step ceremony: air-gap machine setup, YubiKey provisioning (model + firmware version), ceremony checklist (pre-flight, signing, post-flight, witness requirements), disaster-recovery drill procedure. Distinguishes 2-of-3 active signing from 3-of-5 disaster recovery. |
| `docs/ops/shard-escrow.md` | **Create:** Shard-holder protocols, quarterly liveness check, re-sharding triggers, recovery procedure. Legal-counsel-envelope template + bank-safety-deposit-box instructions + HSM-escrow configuration. |
| `packages/web/app/api/v1/network/releases/route.ts` | **Create:** GET — nodes pull manifest list per their channel. Signed responses. Cache-Control headers appropriate. Authenticated per Brief 189 auth pattern. |
| `packages/web/app/api/v1/network/releases/[id]/route.ts` | **Create:** GET — single signed release body. Authenticated. (Telemetry POST is Brief 195 scope — this brief delivers only pull endpoints.) |
| `src/cli/commands/network-admin.ts` | **Modify:** Add `release build/sign/publish/channels-list` subcommands. Usage: `release build --proposals <ids> --channel <name>`, `release sign <release-id> --ceremony`, `release publish <release-id>`. |
| `src/engine/network-learning/metadata-expiration-server.ts` | **Create:** Server-side tooling that refuses publication of expired role metadata. Scheduled refresh of timestamp + snapshot. |
| `drizzle/NNNN_release_signing.sql` + snapshot | **Create:** Migration. Explicit idx resolution per Insight-190 — check journal for next-available idx and rebase if collision with parallel-session migrations. |

Tests:

| File | Action |
|------|--------|
| `src/engine/network-learning/release-builder.test.ts` | **Create:** Manifest assembly, diff-application validation, engine-version-range computation. |
| `src/engine/network-learning/release-signer.test.ts` | **Create:** `tuf-js` integration, signature correctness, role separation. Uses test-key fixtures — never real root. |
| `src/engine/network-learning/release-publisher.test.ts` | **Create:** Publishing atomicity, hash embedding, endpoint availability. |
| `src/engine/integration-spike.test.ts` | **Modify:** Add spike test for release signing + node-side verification round-trip. Run manually per Insight-180. |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint including first-ceremony completion + shard drill results. |
| `docs/insights/NNN-signing-ceremony-learnings.md` | **Create on completion:** Durable patterns from first few production ceremonies. |

## User Experience

- **Jobs affected (maintainer):** Build, sign, publish releases (network-admin CLI with ceremony flag). Quarterly shard-holder liveness check. Annual shard-recovery drill.
- **Primitives involved:** None new at this brief. CLI-only maintainer surface; web dashboard is Brief 193.
- **Process-owner perspective:** Ceremony is a documented maintainer operational activity — YubiKey-assisted, air-gapped machine, 2-of-2 targets signing with witness. Expected ceremony frequency at steady state: biweekly for stable-channel releases; weekly during active development.
- **Interaction states:** N/A — CLI only. `ditto network-admin release sign <id> --ceremony` prompts for YubiKey insertion with step-by-step guidance.
- **Designer input:** Not invoked; CLI only.

## Acceptance Criteria

1. [ ] `tuf-js` library integrated at engine-core. `ReleaseManifest` type declared. `tuf-js` version pinned in package.json.
2. [ ] Four roles configured per ADR-034 §1: root 2-of-3, targets 2-of-2, snapshot 1-of-1, timestamp 1-of-1.
3. [ ] YubiKey provisioned for each of 3 root key shares + 2 targets key shares. Ceremony documentation at `docs/ops/signing-ceremony.md` covers air-gap setup, YubiKey firmware, ceremony checklist, witness requirements.
4. [ ] Shard-escrow specification at `docs/ops/shard-escrow.md` documents 3-of-5 Shamir with 5 named holders, quarterly liveness check, recovery ceremony. **Distinct from** 2-of-3 active root-signing threshold — documentation calls out the distinction explicitly in a dedicated section.
5. [ ] First shard-recovery drill completed and logged before first production signing. Drill uses a test-key, not real root.
6. [ ] Four channels declared: stable, beta, nightly, security. `security` channel opt-out-explicit with default-on.
7. [ ] Server-side tooling refuses publication of expired metadata per ADR-034 §3 (timestamp 7d, snapshot 30d, targets 90d, root 1y + 30d grace). Verified by expiration-injection test.
8. [ ] Release manifest includes cryptographic hash of release body; server embeds correctly. Verified by hash-mismatch injection test.
9. [ ] `ditto network-admin release build/sign/publish/channels-list` CLI works. Verified by integration tests.
10. [ ] `stepRunId` required on build, sign, publish functions per Insight-180. Verified by compile + runtime tests.
11. [ ] Integration spike test runs manually: real signed manifest end-to-end round-trip (signer → publisher → fetcher test-harness). No mocked signatures.
12. [ ] Tampered-manifest test: CI mutates signed manifest bytes; test-harness fetcher rejects. (Node-side verification itself is Brief 196 scope; this brief verifies server produces cryptographically valid manifest.)
13. [ ] Quarterly shard-holder liveness check automation: scheduled reminder + confirmation recording. Verified by scheduler-test.
14. [ ] Online snapshot + timestamp key rotation automated (timestamp monthly, snapshot 6-monthly). Root + targets rotation documented but manual per ADR-034 §2 (no automation of offline key rotation).
15. [ ] Insight-190: migration journal + SQL + snapshot present; next-available idx; rebase-if-collision documented.

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-034, this brief, Brief 189, Brief 195, Brief 196.
2. Reviewer specifically checks:
   - TUF role separation correctly implemented?
   - Ceremony procedure airtight? Is there any path where root key material touches a networked machine?
   - 2-of-3 vs 3-of-5 distinction correctly documented (reviewer Round-1 flagged this explicitly)?
   - Shard-escrow recovery ceremony: do holders understand their role? Signed attestation on envelope? Bank procedure? HSM access flow?
   - Quarterly liveness check actionable? Who receives reminders?
   - Metadata expiration server-side: can publication happen with expired metadata via any code path?
   - Spike test covers signing + verification, not just one side?
   - Is there any code path where signer accepts a malformed unsigned manifest (e.g., missing proposalIds, malformed diffs)?
3. Security review: independent pass on ceremony + key storage + shard-escrow model.
4. Present reviews + brief to human.

## Smoke Test

```bash
pnpm cli sync

# Build (bootstrap mode — maintainer-authored manifest for first release)
pnpm cli network-admin release build --manual ./test/fixtures/sample-manifest.json
# Expect: unsigned manifest produced; release-id assigned

# Channels list
pnpm cli network-admin channels-list
# Expect: stable, beta, nightly, security

# Signing ceremony (offline machine)
pnpm cli network-admin release sign <release-id> --ceremony
# Prompts for YubiKey insertion per ceremony procedure
# Expect: signed manifest with 4 role signatures (root 2-of-3, targets 2-of-2, snapshot 1, timestamp 1)

# Publish
pnpm cli network-admin release publish <release-id>
# Expect: release-id available at /v1/network/releases

# Expired-metadata refusal
pnpm cli test:publisher --force-expired-metadata
# Expect: refuses publication with clear error

# Tampered manifest (server-side hash mismatch)
pnpm cli test:publisher --inject-hash-mismatch
# Expect: refuses publication

# Shard drill (annual, before production)
pnpm cli network-admin shard drill
# Expect: 3-of-5 reconstruction against test-key succeeds; logged with date + attendees

# Spike test (manual per Insight-180)
pnpm vitest run src/engine/integration-spike.test.ts -t "release signing round-trip"
# Expect: real signed manifest produced + verified via test-harness fetcher
```

## After Completion

1. Update `docs/state.md` — signing foundation live, first ceremony drilled, ready for Brief 195+196 integration.
2. Update `docs/roadmap.md` — Sub-brief 191 complete (narrowed scope).
3. Unblock Brief 195 (rollout), Brief 196 (adoption). Together 191+195+196 = end-to-end release distribution.
4. Capture insights on first-ceremony friction, YubiKey setup snags, ceremony duration. Iterate `docs/ops/signing-ceremony.md`.
5. Architect retro: was 2-of-2 targets threshold right? Did shard drill surface any escrow-holder issues? Are expiration windows (7d/30d/90d/1y) calibrated correctly after first month of production signing?
