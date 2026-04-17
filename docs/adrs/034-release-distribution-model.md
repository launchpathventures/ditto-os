# ADR-034: Release Distribution Model

**Date:** 2026-04-17
**Status:** proposed
**Depends on:** ADR-025 (centralized network service), ADR-030 (deployment-mode flag), ADR-033 (Network-Scale RSI Architecture)
**Extends:** Brief 091 (Fleet-Wide Workspace Upgrades — existing canary + circuit-breaker primitive)

## Context

ADR-033 resolves the architecture-layer questions of Brief 181 (evidence consent, cross-tenancy, cognitive merge UX, version heterogeneity, integration provisioning). This ADR resolves the distribution-layer questions: how signed releases are produced, how nodes verify and adopt them, and how rollouts are gated.

Questions resolved here:
- **Q1** Signing key management — key storage, ceremony model
- **Q2** Key rotation cadence — how often, for which roles
- **Q3** Node offline tolerance — metadata expiration bounds that balance freshness attacks against real-world offline tolerance
- **Q6** Rollout stage gating with rollback attribution — how to abort a rollout on rollback-rate without false-positives from unrelated issues
- **Q7-release** Release cadence — adaptive vs fixed

### Forces

| Force | Pulls toward |
|-------|-------------|
| TypeScript ecosystem native | Options with tuf-js / sigstore-js / ssri Node libraries |
| Small maintainer team (one or two signers) | Minimal ceremony, tooling burden |
| Air-gapped signing preference | Options that don't require live services at sign time |
| Self-hosted nodes may go offline for days | Longer metadata expiration windows |
| Freshness attack defense (rollback, freeze, fast-forward) | Shorter metadata expiration windows |
| Insight-180 (spike-test every new API) | Early verification of cryptographic and registry choices |
| Brief 091 already exists and works | Extend, don't replace |
| Rollback-rate as rollout abort signal is common-sense | Track rollbacks, auto-abort above threshold |
| Rollbacks for unrelated reasons exist (users cancel, local issues) | Cause attribution, not raw rate |
| EU CRA and supply-chain regulation (2025-2026) | Signed releases with transparency log option |
| Cost consciousness | Prefer proven OSS over commercial |

### Research inputs

- `docs/research/network-scale-rsi-tech-choices.md` §Topic 1 — nine signing/distribution options surveyed
- `docs/research/network-scale-rsi-tech-choices.md` §Topic 3 — eight canary gating options surveyed
- `docs/briefs/complete/091-fleet-upgrades.md` — existing Ditto canary primitive
- TUF specification: https://theupdateframework.github.io/specification/latest/
- Sigstore Rekor (transparency log): https://docs.sigstore.dev/rekor/
- in-toto/SLSA attestation framework: https://slsa.dev

## Decision

### 1. Signing composition: TUF-lite + optional Rekor transparency + in-toto attestations (resolves Q1)

**Core signing protocol: TUF (The Update Framework)** via the `tuf-js` TypeScript library. Note on prior art: npm's package-provenance stack uses Sigstore keyless signing + Rekor transparency log, not classic TUF metadata roles — so "npm uses tuf-js" is an overstatement. What's true: `tuf-js` is the reference TypeScript TUF implementation, maintained by the same org that ships npm provenance tooling (`theupdateframework`), and is available as a mature dependency. Its production exemplars are PyPI (via PEP 458, Python TUF) and the Docker Notary v1 stack — not npm provenance.

Four roles with threshold signing:

| Role | Keys | Threshold | Storage | Expiration |
|------|------|-----------|---------|------------|
| Root | 3 keys (two maintainers + one custody-held backup) | 2 of 3 | Offline YubiKeys / hardware security modules, air-gapped ceremony | 1 year |
| Targets | 2 keys (two maintainers) | 2 of 2 | Offline YubiKeys | 6 months |
| Snapshot | 1 key (automation) | 1 of 1 | Network service, hot storage, rotated 6 months | 30 days |
| Timestamp | 1 key (automation) | 1 of 1 | Network service, hot storage, rotated monthly | 7 days |

**Rationale for threshold shapes:** Root requires any two of three maintainers — protects against single-maintainer key loss without requiring three-party coordination for routine operations. Targets requires both maintainers — elevates scrutiny for anything that changes what's shipped. Snapshot and timestamp are automated (they only increment version pointers; they don't authorize new content).

**Air-gapped signing:** Root and targets signing happens on an offline machine (e.g., a dedicated NUC not connected to any network). Release manifests are carried via USB stick to the offline machine, signed, carried back. Ceremony documented in `docs/ops/signing-ceremony.md` (to be written at sub-brief 184 time).

**Optional Rekor entries for transparency:** Every signed release optionally submits its signature manifest hash to Sigstore's public Rekor transparency log. Adds tamper-evident audit capability without requiring full keyless ceremony. Verification path: node can optionally cross-check Rekor entry exists at verification time (`learning.updates.verify_rekor: true` in `config/ditto.yaml`, default `false` since it requires network reachability).

**Optional in-toto attestations for build provenance:** Release manifests include an in-toto attestation describing the build: commit hash, builder identity, workflow ID, input artifacts. Attestation signed under the same targets key. Enables supply-chain audit ("this release came from this commit on this workflow"). Matches npm provenance pattern.

**What we explicitly rejected:**
- Full Sigstore keyless signing (requires live Fulcio during signing — blocks air-gap model, which is load-bearing for maintainer independence)
- npm ECDSA registry signatures alone (no delegation or rotation protocol)
- Pure Ed25519 + manifest (no attack-class defense literature, no threshold)
- Notary v2 (requires OCI artifact model; our release format is richer than container images)
- gh attestation (GitHub lock-in; we want deployment independence)

### 2. Rotation cadence and compromise response (resolves Q2)

**Scheduled rotation:**

| Role | Routine rotation | Trigger |
|------|------------------|---------|
| Root | Annual | Ceremony Q1 each year |
| Targets | Every 6 months | Ceremony co-scheduled with major release |
| Snapshot | Every 6 months | Automated, co-scheduled with targets |
| Timestamp | Monthly | Automated |

**Compromise response:** TUF's versioned-root walk-forward mechanism handles mid-cycle rotation. Procedure (per TUF spec §Repository operations — root key rotation):
1. Generate new keypair for the compromised role
2. Root role prepares a new `root.json` listing the new role keys and incrementing the root version (e.g., 1.root.json → 2.root.json)
3. The new `root.json` MUST be signed by both (a) the **old root threshold** — for root rotation this means 2 of 3 old root keys — AND (b) the **new root threshold** — 2 of 3 new root keys. Both signature sets are present on the same metadata file. This dual-signing is what lets nodes that only trust the old root verify the transition, while new nodes bootstrapped after rotation trust only the new key set.
4. Publish new `root.json` at `N+1.root.json`; retain `N.root.json` so offline nodes can walk forward through consecutive versions
5. Nodes walk forward on next update cycle: load currently-trusted `root.N`, fetch `N+1.root.json`, verify against `root.N`'s threshold, then verify against `N+1`'s own threshold (proves the new keys are also consenting), then accept `N+1` as current
6. Revoke the compromised key from the key inventory; future rotations don't include it

For non-root role rotations (targets, snapshot, timestamp), only the root threshold is required to sign the new `root.json` that lists the new role key — those roles don't have "old-key consent to rotation" because the root role is authoritative over them.

**Key ceremony documentation:** `docs/ops/signing-ceremony.md` (pending, sub-brief 184) documents: air-gap setup, YubiKey provisioning, ceremony checklist, witness requirements, disaster recovery.

**Shard escrow — explicit M-of-N specification (ADR scope, not sub-brief scope):**

Root key material is Shamir-secret-shared into **5 shards with a 3-of-5 reconstruction threshold** (Shamir Secret Sharing, GF(256) polynomial over the root private key bytes). The distribution:

| Shard | Holder | Purpose |
|-------|--------|---------|
| 1 | Maintainer A (primary) | Active-duty signer |
| 2 | Maintainer B (primary) | Active-duty signer |
| 3 | Legal counsel (sealed envelope, notarized) | Third-party neutral holder |
| 4 | Bank safety-deposit box (dual-signatory access, maintainers A+B) | Institutional cold storage |
| 5 | Cloud-HSM escrow account (e.g., AWS KMS custom-key-store) with multi-party authorization | Recovery-of-last-resort; access requires court order or 2-of-2 maintainer consent |

**Recovery ceremony (worst case):** If both active shards (1 and 2) are lost simultaneously, three of the remaining five shards must be physically co-located to reconstruct: e.g., legal counsel's notarized envelope (shard 3) + bank safety-deposit contents (shard 4) + HSM escrow access (shard 5 — requires escrow-holder consent). This three-legged requirement is deliberately cumbersome: catastrophic recovery should be effortful. Annual drill: verify shards are accessible and reconstruction works against a test-key. Escrow-holder changes (legal counsel departs, bank account changes) trigger re-sharding.

**Non-root keys (targets, snapshot, timestamp)** do not require Shamir escrow because they are rotatable via the root. If a targets YubiKey is lost, the root threshold signs a new `root.json` listing a replacement targets key. No escrow drama needed — this is exactly what TUF's role-separation design provides.

**Why this belongs in the ADR, not sub-brief 184:** The *choice* of 3-of-5 and the escrow holders are architectural trust-model decisions. Operational implementation (physical ceremony, HSM config, legal templates) is sub-brief 184 scope. The threshold and the non-primary-maintainer holders (legal + bank + HSM) are where the trust-architecture actually lives and must be decided once, durably.

**What we deliberately avoid:** automated key rotation without human in the loop. Rotation is infrequent enough that a quarterly ceremony is cheap; and automation on the root key would undermine the air-gap story.

### 3. Node offline tolerance: staged metadata expiration (resolves Q3)

**Node metadata expiration gradient (matching §1 storage tiers):**

| Role | Expiration on node | Grace period before node refuses updates |
|------|-------------------|------------------------------------------|
| Timestamp | 7 days | None — must refresh before any update |
| Snapshot | 30 days | None — must refresh |
| Targets | 90 days | None — must refresh |
| Root | 1 year + 30 day grace | 30 days of grace after expiration during which node can still verify but warns operator |

**What "offline tolerance" means in practice:**
- Node offline < 7 days: on return, routine timestamp refresh, everything normal
- Node offline 7–30 days: on return, needs fresh timestamp + snapshot; may lag on the latest release for a few hours while catching up
- Node offline 30–90 days: on return, full walk from timestamp → snapshot → targets; operator sees "catching up on releases" notification
- Node offline 90 days–1 year: full metadata refresh including targets; operator warned of sprawl; may need manual intervention if root rotated during the window
- Node offline > 1 year: root expired; node refuses updates until operator manually trusts the new root (requires out-of-band verification — e.g., visit a maintainer-signed page, verify root fingerprint)

**Rationale:** 7-day timestamp balances typical "offline for a weekend or short trip" against freshness attack window. Automated timestamp refresh every 24 hours means well-connected nodes are always within 1 day, not 7. The 7-day expiration is the outer bound, not the typical case.

**Pinned process exception (from ADR-033 §4):** Processes pinned to a specific engine version don't expire on node metadata because they don't accept engine updates regardless. Their release state is frozen at pin time; the rest of the node updates normally.

### 4. Rollout stage gating with cause-attributed rollback (resolves Q6)

Extends Brief 091's existing canary + circuit-breaker + rollback + upgrade-history primitive to the release-distribution context.

**Stage progression:**

| Stage | Cohort | Channel scope | Dwell | Gate |
|-------|--------|---------------|-------|------|
| Canary | 5% of participating nodes | Nightly + dogfood | 3 days | `matches_release_content` rollback rate < 5% |
| Partial | 25% of participating nodes | Beta + 25% of stable | 4 days | Same gate + cumulative |
| Full | 100% of participating nodes | All stable | — | — |

**Rollback reason enforcement:** When a node rolls back a release via `ditto updates rollback <release-id>`, the operator must pick a reason from a mandatory enum. The command is an external-side-effect CLI entry point and requires a `stepRunId` invocation guard per Insight-180 — rollback attempts are recorded in `activities` with `actorType: "operator"`, and a replay of the same rollback command for the same release-id is idempotent (second call recognizes the prior rollback, returns success without re-executing).

| Reason | Seed weight in abort calculation |
|--------|----------------------------------|
| `matches_release_content` — "the release itself caused my issue" | 1.0 |
| `ambiguous` — "not sure whether release-related" | 0.5 |
| `unrelated_local_issue` — "local problem, release is fine" | 0.0 |

**Abort threshold — seed value, not calibrated:** Weighted rollback rate > **5% in stage-eligible cohort** triggers automatic abort. Abort holds the release at the current stage (does not promote to next, does not roll back existing adopters). Maintainer alert fires. Rollouts can be resumed manually after investigation.

**Explicit honesty: 5% and 0.5 are seed values, not evidence-calibrated thresholds.** They are starting points chosen to be within industry-practice ranges (Argo Rollouts / Flagger default rollback-abort thresholds cluster in 1–5%). At small canary cohort sizes (e.g., 3 of 60 nodes in the canary band), a single `matches_release_content` rollback produces a 33% weighted rate — far above 5% — which is statistically correct (one failure in three is a meaningful signal) but may produce spurious aborts for noise. **Calibration trigger:** after the first 6 production releases, review rollback-rate distributions and abort-false-positive incidents. Recalibrate with one of: (a) Bayesian prior with minimum-N before the gate activates (require ≥10 adopted nodes in stage before computing rate), (b) cohort-size-aware threshold (e.g., Wilson score interval's lower bound > 5%), or (c) separate threshold per stage (canary may need a higher threshold to account for small cohort, partial lower). The specific recalibration method is sub-brief 186 scope (meta-observability) once evidence exists; what this ADR commits is the seed values and the mandatory recalibration checkpoint.

Same treatment applies to the `ambiguous = 0.5` weight: a reasonable first guess reflecting that ambiguous rollbacks carry partial evidence, but subject to recalibration on the same six-release checkpoint. Could end up anywhere in [0.25, 0.75] depending on observed correlation between `ambiguous`-reason rollbacks and actual release-caused issues.

**Why cause-attributed, not raw rate:** Users rollback for many reasons unrelated to the release — a local configuration issue they're debugging, a temporary network problem, revealed process incompatibility that's orthogonal. Treating all rollbacks as release-caused creates false-positive aborts and trains maintainers to override the gate, which defeats the gate. Forcing rollback reason shifts the cognitive load to the operator at rollback time (when they have the context) rather than to the maintainer at abort time (when they don't).

**Gaming prevention:** An operator who consistently attributes release-caused rollbacks as `unrelated_local_issue` to avoid triggering aborts damages only their own node's release trajectory (the network stops sending them problematic releases, but also becomes cautious with their signal). Node-reputation scoring from Sub-brief 186 can surface operators with anomalously-low `matches_release_content` attribution ratios.

**Brief 091 integration:** The existing `upgradeHistory` table extends with `rollbackReason` column (enum) and `rollbackWeight` derived field. The existing circuit breaker on consecutive canary failures (default 2) continues to operate — fails closed on unexplained failures while the cause-attributed rate handles the explained ones.

### 5. Adaptive release cadence driven by archive depth (resolves Q7-release)

**Rhythm ladder:**

| Archive depth | Maintainer release cadence target |
|---------------|----------------------------------|
| < 3 generations (bootstrap) | Monthly max |
| 3–5 generations | Biweekly |
| 5+ generations | Weekly target (no push pressure to hit it) |

**Why archive depth, not calendar:** Release quality depends on proposal depth in the archive (per Sub-brief 184, clade-metaproductivity scoring requires lineage). Shipping weekly when the archive has three proposals total produces empty or weak releases. Cadence should follow evidence depth.

**Maintainer discretion:** Cadence is a target, not an obligation. If archive depth is adequate but no proposal is ready for release, the maintainer holds. No "release train" model that ships regardless of content.

**Emergency releases:** Security fixes and critical bug fixes are out-of-cadence, shipped via a dedicated `security` channel that all nodes opt into by default (`learning.updates.security_channel: true`). Security releases skip canary/partial and go straight to full, since the risk of not-shipping typically exceeds the risk of a rushed rollout for genuinely-critical fixes. Maintainer discretion; logged with reason.

**First-year reality:** For the first 6–12 months, expect monthly cadence. Archive depth grows slowly, as does maintainer calibration. The weekly-target is aspirational for year 2+.

## Provenance

| Decision | Source | What we took | What we changed |
|----------|--------|--------------|-----------------|
| TUF core signing protocol | The Update Framework spec + `theupdateframework/tuf-js` | Four-role threshold model, versioned metadata, walk-forward rotation | Specific thresholds and storage choices calibrated to small team + air-gap preference |
| Optional Rekor transparency | `sigstore/rekor` + npm provenance pattern | Signature log for post-hoc audit | Optional rather than mandatory; `verify_rekor: false` default for offline tolerance |
| In-toto build attestations | `in-toto/in-toto` + SLSA L2 | Attestation over build provenance, signed under targets key | Composed with TUF signing rather than replacing it |
| YubiKey-based offline ceremony | Common pattern in software signing (Debian, Fedora, Tor) | Hardware-token-backed keys, ceremony model | Shard escrow for disaster recovery |
| Rotation cadence shape | TUF operators' guide + Fedora signing schedule | Annual root, 6-month targets, 30-day snapshot, 7-day timestamp | Calendars quarterly targets for Ditto's maintainer rhythm |
| Node metadata expiration gradient | TUF specification § expiration | 7/30/90/1y cascade | Specific values tuned for self-hosted "offline for weeks" scenario |
| Canary + partial + full with dwell | Brief 091 (Ditto native) + Chrome staged rollout | Stage progression model | Percentages sized for smaller network; dwell times informed by SRE practice |
| Cause-attributed rollback rate | Original to Ditto | — | Mandatory reason enum with weighting; prevents false-positive aborts |
| Adaptive cadence on archive depth | Original to Ditto | — | Rhythm follows evidence, not calendar |

## Consequences

### What becomes easier

- **Maintainer independence.** Air-gapped signing removes external-service dependencies; signing works even if Sigstore / Fulcio / Rekor are unreachable. Only verification-time Rekor lookup is optional.
- **Supply-chain auditability.** in-toto attestations answer "what was in this build?"; optional Rekor entries answer "when was this signed and by whom?"
- **Rollback is blameless.** Cause-attributed rollback means operators don't feel punished for local issues; the release-level gate stays meaningful.
- **Node operator knows where they stand.** Expiration gradient gives clear "offline this long = this recovery path" mental model.
- **Rhythm follows reality.** Adaptive cadence means no empty releases in month 2 and no forced release trains in month 12.

### What becomes harder

- **Ceremony overhead exists.** Quarterly signing ceremony requires two-maintainer coordination and YubiKey infrastructure. Cost is real, especially in the first six months. Mitigated by: cheap YubiKeys, documented ceremony, short ceremony time once routine.
- **Three-layer signing (TUF + optional Rekor + in-toto) adds verification complexity.** Each node's verification code must handle all three. `tuf-js` does the TUF part; in-toto and Rekor are additional code paths. Mitigated by sub-brief 184 prioritizing TUF verification as the hard path and making the other two explicitly optional/best-effort.
- **`tuf-js` spike-test obligations per Insight-180.** Verification of signed releases is new external-crypto surface. Sub-brief 184 must include an integration-spike test against a real signed release before wiring to production node fetchers.
- **Maintainer becomes the bottleneck for emergency releases.** Security fix out-of-cadence requires fast maintainer response. Mitigated by: two maintainers with equivalent authority; on-call rotation documented; ceremony can run on reduced-rigour (skip witness) for emergencies with explicit post-hoc audit.
- **Shard escrow is the single largest operational risk in the signing design.** Two active-duty maintainer YubiKeys + 3-of-5 Shamir escrow (§2): if both active shards are lost simultaneously (shared incident — fire, theft, simultaneous disability, legal incapacity), recovery requires physical co-location of 3 of the 5 shards, at least two of which are held by third parties (legal + bank + HSM escrow). This is deliberately effortful — catastrophic recovery should not be easy — but an unforeseen escrow-holder failure (legal counsel's firm dissolves, bank closes safety-deposit service, HSM escrow provider departs business) can compound. Mitigations: annual escrow drill that verifies reconstruction works; quarterly escrow-holder liveness check (legal counsel acknowledges holding; bank confirms account active; HSM confirms escrow); immediate re-sharding on any holder change.
- **Timestamp service SPOF.** The automated timestamp key is online and signs `timestamp.json` every 24 hours. If the timestamp service is down for 7+ consecutive days, every well-connected node's timestamp metadata expires simultaneously and nodes refuse updates. This is load-bearing for freshness-attack defense but creates a single point of failure. Mitigations: HA timestamp service (two instances, active-active); alerting on timestamp-service freshness; manual fallback procedure documented in sub-brief 184 (maintainer can sign a one-off timestamp from an air-gapped machine if service outage is protracted).
- **Two-maintainer targets signing (2-of-2) is a routine-release SPOF.** Every routine release requires both maintainers in the ceremony. Illness, vacation, travel, or dispute blocks shipping. This is a *feature* (scrutiny per release) for most of the year; becomes a *bug* when compounded with release-cadence pressure. Mitigations: schedule ceremonies predictably; designate backup maintainers authorized to do a 2-of-2 in emergency scenarios with explicit post-hoc audit; ceremony can run with video-witnessed remote signing if physical co-location isn't possible, documented in ceremony procedure.

### New constraints

- Every release ship goes through the air-gapped signing ceremony. No CI shortcut. No "just this once" auto-sign.
- Sub-brief 184 must deliver a spike-test integration verifying `tuf-js` against a real signed manifest before the node fetcher ships. Insight-180 applies hard.
- The signing key's custody changes are audit-logged events. Maintainer departures or additions trigger explicit ceremony events.
- `ditto updates rollback` CLI surface must force operators to pick a reason. No silent rollbacks.
- Release cadence metric (archive depth) must be visible on maintainer dashboard (sub-brief 186).
- `security` channel opt-in is default-on — nodes can opt out but shouldn't.

### Follow-up decisions (sub-brief scope, not ADR)

1. **Ceremony procedure documentation** — `docs/ops/signing-ceremony.md` with step-by-step and witness checklist. Sub-brief 184.
2. **Shard escrow specifics** — how shards are stored, where, by whom. Sub-brief 184, with security review.
3. **Release manifest JSON schema** — the exact shape of a release manifest (artifact hashes, version ranges, attestations, release notes). Sub-brief 184.
4. **Maintainer dashboard for release rhythm** — archive depth visualization, pending proposals, rollout status. Sub-brief 186.
5. **`ditto updates rollback` reason-picker UX** — CLI prompt flow that makes picking the accurate reason the easy path. Sub-brief 184.
6. **`ditto updates channel` management** — setting channel, seeing release history per channel, migrating channel. Sub-brief 184.
7. **Security-channel gate procedure** — what triggers skip-canary? Documented criteria; maintainer discretion within those criteria. Sub-brief 184.

## Unresolved open questions

All three distribution-layer questions from Brief 181 resolved here (Q1, Q2, Q3, Q6, Q7-release). Combined with ADR-033's five architecture-layer resolutions, all eight open questions from Brief 181 are resolved.

Two new meta-level questions surfaced by this ADR (not blocking ADR acceptance):

- **Rotation-ceremony-in-practice drift.** Does the quarterly cadence actually hold over 18 months? If ceremony attendance slips, do we extend rotation windows or hire a third maintainer? Deferred to first annual retrospective.
- **Rekor dependency in practice.** Is the optional Rekor integration actually useful, or is it a maintenance tax that's never verified? Revisit after 12 months of production releases; may be dropped if no one ever verifies.
