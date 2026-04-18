# Brief 189: Evidence Harvest Pipeline — Node Emitter, Network Receiver, Privacy Layer

**Date:** 2026-04-17
**Status:** ready
**Depends on:** Brief 181 (parent RSI plan), ADR-033 (§1 consent model, §2 cross-tenancy, §5 integration-created signal), ADR-025 (Network API `/network/feedback` pattern), ADR-030 (deployment-mode flag), Insight-111 (explicit-vs-implicit separation), Insight-156 (network-vs-workspace split), Insight-180 (stepRunId guards)
**Unlocks:** Brief 190 (Scanner + Sandbox + Archive) — requires evidence flowing. Brief 191 (Release Distribution) — builds on the same Network-API surface. Brief 193 (Adversarial Detection) — consumes reputation signals emitted via evidence.

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. First shippable sub-brief of Brief 181.
- **Capabilities:**
  - Node-side `evidence-emitter` that extracts allowlisted signals from local `harnessDecisions`, `activities`, `stepRuns` and posts to Network on a configurable cadence
  - Node-side `emission-consent` managing the three-tier opt-in (core / rich / replay-traces) per ADR-033 §1
  - Network-side `evidence-receiver` auth'd endpoint with schema validation, tier enforcement, and joint-tuple k-anonymity
  - Network-side `aggregator` primitives exposing reputation-weighted queries and cohort/segment partitions
  - `networkEvidence` schema table on the Network database
  - Typed evidence schema + allowlist constants in `@ditto/core` so engine consumers receive the same contracts
  - Initial service-name-hash vocabulary (~500 entries) used by the `integration_created` signal (ADR-033 §5)

## Context

Brief 181 §Phasing / Sub-brief 189 outlines: "Node side extracts allowlisted signals from `harnessDecisions`/`activities`/`stepRuns` (harness decisions, correction-classification counts, trust drift deltas, mode-outcome attribution). Strip PII via type-level enforcement. Post to `/network/evidence` on a configurable cadence. Consent management via `config/ditto.yaml`: default-opt-in to core types, default-opt-out to rich types, total-opt-out switch. Network side: auth'd receiver endpoint. Schema validation. K-anonymity check (borderline signals require ≥5 contributing nodes before actionable). Write to `networkEvidence`. Reputation-weighted aggregation primitives exposed as queries."

ADR-033 §1 sharpens this to a three-tier model. ADR-033 §1a introduces the Insight-111 firewall — rollout-gating signals must be identity-blind at aggregation, never feeding per-node trust. ADR-033 §2 establishes the template-version-hash boundary: customization content never crosses, only shared concepts cross. ADR-033 §5 requires a joint-tuple k-anonymity guard on `integration_created` signals and an enumerated ~500-service vocabulary shipped with this brief.

This is the foundational sub-brief of the RSI loop. Without it, nothing downstream has data to reason about. It must land before any of 190–194 can move. Simultaneously, this is the privacy-critical sub-brief: type-level enforcement, k-anonymity, consent tiers, frozen-paths allowlist, and PII-audit discipline all land here. If privacy fails here, it fails everywhere.

## Objective

Ship an evidence flow end-to-end: node-side emitter reads local harness state, classifies into typed allowlisted signals, strips PII by construction, batches on cadence, posts to Network; network-side receiver authenticates, validates schema + tier + k-anonymity, writes to `networkEvidence`; reputation-weighted aggregation queries are available for Brief 190's scanner to consume. All three consent tiers wired with `config/ditto.yaml` overrides. Enumerated service-name-hash vocabulary initialized. Hand-audit of 100 random evidence payloads surfaces zero PII.

## Non-Goals

- **Not implementing the scanner.** That's Brief 190.
- **Not implementing release distribution.** That's Brief 191.
- **Not implementing adversarial detection.** That's Brief 193 — but this brief ships the raw reputation/outlier primitives (emission-consistency metric) that 193 consumes.
- **Not computing per-node reputation scores** — just the primitives. Scoring logic is Brief 193.
- **Not implementing replay-trace sampling pipeline** — schema + consent for replay-trace tier is here, but the actual sampling logic lands with Brief 190 (which is the first consumer of replay traces).
- **Not managing the vocabulary at runtime.** Vocabulary is a seeded `service_name_vocabulary` table initialized via migration. Adding a new service name requires a maintainer-authored ADR or follow-up brief. Scope discipline: we are not building a dynamic-vocabulary system.
- **Not auto-detecting PII.** Privacy is type-level; if the schema allows a field, it's assumed non-PII by construction. Runtime auto-detection would create a false sense of safety. Human-audit + type discipline is the mechanism.
- **Not shipping the admin Evidence dashboard.** That's scoped to Brief 193's meta-observability surface.
- **Not implementing total rate-limiting or DDoS protection beyond standard Next.js middleware.** If abuse surfaces, a separate brief hardens the endpoint.

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing / Sub-brief 189, §Constraints (privacy + evidence), §Open-Questions 4/5
2. `docs/adrs/033-network-scale-rsi-architecture.md` §1 (consent model), §1a (firewall), §2 (cross-tenancy), §5 (integration-created signal + joint-tuple k-anonymity)
3. `docs/adrs/025-centralized-network-service.md` §4 (Network API shape, `/network/feedback` precedent)
4. `docs/adrs/030-deployment-mode-flag.md` (public vs workspace — emitter only runs in workspace mode; receiver only runs in public mode)
5. `docs/insights/111-explicit-implicit-signal-separation.md` (hard constraint)
6. `docs/insights/156-compiled-knowledge-layer.md` (where data lives)
7. `docs/insights/180-spike-test-every-new-api.md` (mandatory spike test)
8. `src/engine/harness-handlers/feedback-recorder.ts` — existing local observation substrate the emitter reads from
9. `src/engine/harness-handlers/memory-assembly.ts` — schema for how evidence ties to process runs
10. `src/db/schema.ts` — existing `harnessDecisions`, `activities`, `stepRuns`, `memories`, `processVersions` tables
11. `packages/web/app/api/v1/network/feedback/route.ts` — existing auth pattern to replicate
12. `docs/landscape.md` §Privacy Primitives — k-anonymity and l-diversity references
13. `packages/core/src/db/schema.ts` — engine-core schema; typed evidence definitions go here

## Constraints

- MUST enforce three-tier consent (core / rich / replay-traces) via `config/ditto.yaml` with defaults per ADR-033 §1: core default on, rich default off per type, replay-traces default off.
- MUST implement total opt-out (`learning.evidence.enabled: false` emits nothing) while still allowing update adoption — the two systems are independent.
- MUST route every emitted signal through a **compile-time allowlist** in `packages/core/src/learning/evidence-types.ts`. Zod schemas enforced at the send call-site. A field that is not in the allowlist is unrepresentable — type system catches additions before runtime.
- MUST strip PII at emission time. Content hashes for dedup, never content itself. No free-text fields allowed in any evidence type.
- MUST enforce joint-tuple k-anonymity at the receiver as a SQL-level constraint per ADR-033 §5 — not an application-level check. Queries returning signals below threshold must fail closed (return empty) rather than leak.
- MUST use `stepRunId` parameter for every function that triggers evidence emission per Insight-180. Emission is idempotent — duplicate calls with the same `stepRunId + signalType + payload hash` collapse at the emitter (not at the receiver) so network retries are safe.
- MUST respect the Insight-111 firewall in the schema: evidence types must carry a flag indicating trust-computation-eligible vs meta-process-only. Trust-eligible signals (always explicit) pass through to trust evaluation. Meta-process-only signals are denied writes into any trust-computation code path by type.
- MUST authenticate receiver endpoint per user per ADR-025 Network API pattern. Workspace-to-Network auth token required. Evidence endpoint cannot be called anonymously.
- MUST rate-limit per-user at the receiver proportional to configured emission cadence: default ceiling is `2 × (1 hour / emission_cadence_hours)` batches/hour. For default cadence 1h, ceiling is 2/hour. For configured 0.25h (15-minute flush), ceiling is 8/hour. Floor 1/hour. Rate-limit violations return 429 + exponential backoff hint; not emitted as evidence (avoids feedback loops).
- MUST include a shipped, migration-seeded `service_name_vocabulary` table with ~500 entries at first bootstrap. Entries added via maintainer-authored follow-up brief. Unknown services hash to a reserved "other" bucket which is never actionable (k=∞ floor).
- MUST NOT emit evidence in `DITTO_DEPLOYMENT=public` mode. Evidence emitter is workspace-only.
- MUST NOT receive evidence in `DITTO_DEPLOYMENT=workspace` mode. Evidence receiver is public-only.
- MUST spike-test the endpoint per Insight-180: the first external auth call from a node must be verified with a real network call before the emitter ships.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| Evidence-receiver HTTP auth | `packages/web/app/api/v1/network/feedback/route.ts` (ADR-025) | depend | Existing auth pattern; extending same model |
| Typed evidence schema | Zod schema + TypeScript strict mode | depend | Compile-time allowlist enforcement |
| K-anonymity (per-field and joint-tuple) | Sweeney 2002 + Li et al. 2007 (t-closeness paper) | pattern | Classical privacy literature, SQL-level enforcement original to Ditto |
| Three-tier consent model | Original to Ditto (informed by GDPR granular consent + Apple ATT) | pattern | Distinct trust relationships per tier |
| Rate limiting primitive | Existing Next.js middleware pattern in `packages/web/middleware.ts` | depend | No new infrastructure |
| Batched emission cadence | Standard telemetry-client pattern (e.g., Sentry, OpenTelemetry batching) | pattern | Battery of prior art; 1/hour default matches network-scale cadence |
| Service-name-hash vocabulary | BuiltWith category tree + Zapier connector directory | pattern | Enumerated vocabulary prevents free-text injection; seeded list not a dynamic system |
| SHA-256 content hashing for dedup | Node `crypto` stdlib | depend | Standard primitive |
| Type-level PII stripping | TypeScript strict + Zod refinements | depend | Compile-time enforcement |
| Reputation aggregation primitive | Original to Ditto (drawing on Brief 108 admin oversight pattern for actor-identified activity queries) | pattern | Same SQL-aggregation shape; node-reputation-specific |

## What Changes (Work Products)

Engine-core (`packages/core/`) — types that consumers (Ditto, future ProcessOS) share:

| File | Action |
|------|--------|
| `packages/core/src/learning/evidence-types.ts` | **Create:** Open discriminated union of `EvidenceSignal` types declared via TypeScript module-augmentation pattern. This brief ships an initial 7-variant base (harness decision, trust drift, correction classification, adoption telemetry, mode-outcome correlation, failure pattern hashes, integration-created). Downstream briefs (191, 195, 194) extend via `declare module` augmentation + allowlist-extension ACs. Each variant is a Zod schema + TypeScript type. Tier classification is a const-asserted literal on each type. Trust-eligibility flag is a const-asserted boolean. No free-text fields permitted. |
| `packages/core/src/learning/evidence-allowlist.ts` | **Create:** `EVIDENCE_ALLOWLIST` array extensible via module augmentation. Initial 7 types shipped here. Compile-time exhaustiveness check on switch statements consuming `EvidenceSignal["type"]` — if a downstream brief adds a variant without updating its allowlist contribution, type-check fails. |
| `packages/core/src/learning/consent-tiers.ts` | **Create:** Three-tier enum (`core | rich | replay_traces`) + per-type tier mapping. |
| `packages/core/src/db/schema.ts` | **Modify:** Add `networkEvidence` table definition. Engine-primitive schema, not Ditto-product-specific. (`serviceNameVocabulary` lives in `src/db/schema.ts` — BuiltWith-derived integration taxonomy is Ditto-product, not engine-primitive; no ProcessOS consumer rationale for the vocabulary.) |

Ditto product layer (`src/`) — node-side:

| File | Action |
|------|--------|
| `src/engine/node-learning/evidence-emitter.ts` | **Create:** `emitEvidence({ signal, stepRunId, nodeConfig })` — validates against allowlist, routes through consent check, batches to in-memory queue, flushes on cadence. Idempotency via `emittedBatchLedger` in local DB (dedup by stepRunId + signal type + payload hash). |
| `src/engine/node-learning/emission-consent.ts` | **Create:** Reads `config/ditto.yaml`, returns effective consent per signal type. Default table matches ADR-033 §1. Total-opt-out short-circuits. |
| `src/engine/node-learning/emission-queue.ts` | **Create:** SQLite-backed queue (new `emittedBatchLedger` table in local DB). Batches at cadence, retries on 5xx with exponential backoff capped at 6 hours. Idempotency key = `stepRunId + signalType + sha256(payload)`. |
| `src/engine/node-learning/evidence-extractors/harness-decision.ts` | **Create:** Reads `harnessDecisions` rows since last flush, classifies into typed signals, strips identifying fields. Output is array of `EvidenceSignal`. |
| `src/engine/node-learning/evidence-extractors/correction-classification.ts` | **Create:** Reads `activities` rows with `actorType: "human"` + correction semantics, emits severity + direction classifications per WikiTrust (already in `trust-diff.ts`). |
| `src/engine/node-learning/evidence-extractors/trust-drift.ts` | **Create:** Reads recent `trustChanges` rows, emits delta signals (direction + magnitude bucket, never raw scores). |
| `src/engine/node-learning/evidence-extractors/mode-outcome.ts` | **Create:** Reads `stepRuns.cognitiveMode` + outcome metadata, emits correlation signals (rich tier — opt-in). |
| `src/engine/node-learning/evidence-extractors/integration-created.ts` | **Create:** Detects new integration YAML creation via `processes` table row + `integrations/` file presence, emits `integration_created` signal with vocabulary-hashed service name per ADR-033 §5. |
| `src/db/schema.ts` | **Modify:** Add `emittedBatchLedger` table (node-local, idempotency dedup ledger) + `serviceNameVocabulary` table (product-layer integration taxonomy). Both Ditto-product-specific. |
| `src/cli/commands/evidence.ts` | **Create:** `ditto evidence status/pause/resume` (surface consent state, current queue depth, last flush timestamp). `ditto evidence pause` sets runtime flag (not config); `ditto evidence resume` reverses. |
| `config/ditto.yaml` schema | **Modify (docs only — this is a project config example):** Add `learning.evidence.*` section with defaults per ADR-033 §1. |

Ditto product layer — network-side:

| File | Action |
|------|--------|
| `packages/web/app/api/v1/network/evidence/route.ts` | **Create:** POST-only endpoint. Validates workspace auth token, schema-validates payload via Zod, writes to `networkEvidence`. 429 on rate-limit. Returns `{ accepted: number, rejected: [{ index, reason }] }` for partial success. |
| `src/engine/network-learning/evidence-receiver.ts` | **Create:** Handler invoked by the route. Resolves `userId` from token, runs per-type tier check against the emitting node's registered consent, applies SQL-level joint-tuple k-anonymity constraint, writes rows. |
| `src/engine/network-learning/aggregator.ts` | **Create:** Query primitives. `countBySignalType(window)`, `jointTupleAggregate(dims, window, kThreshold=5)`, `emissionConsistencyByNode(nodeId, window)`. All queries honor k-anonymity at the SQL level — return empty set below threshold, never a partial result. |
| `src/engine/network-learning/vocabulary-seeder.ts` | **Create:** One-time migration helper that seeds ~500 service names from a bundled JSON manifest (`integrations/service-name-vocabulary.json`) into `serviceNameVocabulary`. |
| `integrations/service-name-vocabulary.json` | **Create:** Initial list of ~500 common service names (Salesforce, HubSpot, Gmail, Slack, Notion, Stripe, Shopify, AWS S3, PostgreSQL, MongoDB, etc.). One entry per well-known service. No deep category tree; flat list keyed by canonical lowercase slug. |
| `packages/web/lib/network-evidence-auth.ts` | **Create:** Per-user auth helper. Reuses ADR-025 Network API auth pattern. |
| `drizzle/NNNN_evidence_pipeline.sql` + snapshot | **Create:** Migration for `networkEvidence`, `serviceNameVocabulary`, `emittedBatchLedger` tables. Next-available idx in journal per Insight-190. |

Tests:

| File | Action |
|------|--------|
| `src/engine/node-learning/evidence-emitter.test.ts` | **Create:** Allowlist enforcement, consent-tier filtering, idempotency, total-opt-out. |
| `src/engine/node-learning/emission-consent.test.ts` | **Create:** Config parsing, default resolution per tier, per-signal override. |
| `src/engine/network-learning/evidence-receiver.test.ts` | **Create:** Auth rejection, schema rejection, per-tier enforcement, rate-limit behavior. |
| `src/engine/network-learning/aggregator.test.ts` | **Create:** K-anonymity threshold behavior (below-threshold returns empty, at-threshold returns result), joint-tuple k-anonymity on `integration_created`, reputation consistency metric. |
| `src/engine/integration-spike.test.ts` | **Modify:** Add spike test for `POST /v1/network/evidence` with real auth token (skipped by default; ran manually per Insight-180). |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint entry. |
| `docs/insights/NNN-evidence-privacy-patterns.md` | **Create on completion:** Any durable patterns that emerged about type-level privacy enforcement and k-anonymity at the SQL layer. |

## User Experience

- **Jobs affected:** Orient (operator sees consent state + queue depth on status), Decide (operator picks initial consent tier during onboarding or via CLI). No end-user surface.
- **Primitives involved:** No new UI primitives. Minor Daily Brief entry ("X signals emitted to network this week") if operator opts into visibility — deferred unless explicitly configured.
- **Process-owner perspective:** Invisible in normal operation. Surfaces only via `ditto evidence status` CLI or (optionally) Daily Brief. Privacy consent is a one-time setup question during workspace provisioning; config file preserves choices across deployments.
- **Interaction states:** N/A for UI; `ditto evidence status` outputs human-readable text (current consent tiers enabled, queue depth, last flush, any rejected signals from last flush with reason).
- **Designer input:** Not invoked — this is internal plumbing.

## Acceptance Criteria

1. [ ] `EvidenceSignal` open discriminated union in `packages/core/src/learning/evidence-types.ts` ships the initial seven signal types from ADR-033 §1 (harness decision, trust drift, correction classification, adoption telemetry, mode-outcome correlation, failure pattern hashes, integration-created). Union is declared as open via TypeScript module-augmentation. Zod schemas reject any additional field at runtime per variant. Downstream briefs 191, 195, 194 extend via module augmentation.
2. [ ] Compile-time exhaustiveness check in `evidence-allowlist.ts` — any consumer switch statement over `EvidenceSignal["type"]` that doesn't handle every contributed variant fails `pnpm run type-check`. Adding a new variant via downstream brief without updating allowlist contribution fails type-check.
3. [ ] `emitEvidence` respects three-tier consent: core default on, rich default off per type, replay-traces default off. Verified by 6-case test matrix.
4. [ ] Total opt-out (`learning.evidence.enabled: false`) emits nothing even with all signal types enabled at tier level. Verified by integration test.
5. [ ] Idempotency: same `(stepRunId, signalType, payload hash)` emitted twice collapses to one receiver row. Verified by two-call test.
6. [ ] Cadence: emitter batches and flushes hourly by default; `emission_cadence_hours: 0.25` override works (15-minute flush). Verified by a fake-clock test.
7. [ ] Receiver rejects unauthenticated requests (401), malformed-payload requests (400), and rate-limit violations (429 with retry-after). Verified by three integration tests.
8. [ ] SQL-level joint-tuple k-anonymity on `integration_created`: queries returning `(service_name_hash, protocol_type, auth_pattern)` tuples require k≥5 contributing nodes. Verified by injecting 4-node seed set (returns empty) + 5-node seed set (returns result).
9. [ ] Insight-111 firewall: evidence types tagged `meta_process_only` are rejected by any call into trust computation (compile-time + runtime check). Verified by test.
10. [ ] `DITTO_DEPLOYMENT=public` disables emitter initialization. `DITTO_DEPLOYMENT=workspace` disables receiver initialization. Verified by two deployment-mode tests.
11. [ ] `service_name_vocabulary` seeded with ≥500 entries on fresh sync. Unknown service names hash to reserved "other" bucket, which is never actionable. Verified by two tests (seeded count + unknown-hash behavior).
12. [ ] PII audit: hand-audit 100 random `networkEvidence` rows from a seeded end-to-end test — zero PII instances. Audit checklist documented in the brief's Review Process.
13. [ ] `ditto evidence status` CLI output includes: consent tiers enabled, queue depth, last flush timestamp, rejected-signal count + reasons from last flush.
14. [ ] Integration spike test (`src/engine/integration-spike.test.ts`) verifies one real POST to `/v1/network/evidence` — endpoint URL, auth shape, response shape match. Test runs manually per Insight-180.
15. [ ] Insight-180 guard: `emitEvidence` requires `stepRunId` parameter. TypeScript signature enforces it. Runtime check rejects empty/invalid IDs.
16. [ ] SQL-level joint-tuple k-anonymity uses a consistent snapshot. Concurrent insertions during an in-flight aggregation query cannot cause sub-threshold tuples to leak into the result. Verified by concurrent-write test: 100 parallel INSERT + SELECT operations, each SELECT returns results consistent with a point-in-time snapshot at query start.
17. [ ] Rate-limit ceiling is proportional to configured cadence per Constraints: ceiling = 2 × (1h / cadence_hours), floor 1/hour. Verified by two-case test (cadence 1h → 2/h; cadence 0.25h → 8/h).

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-033, this brief, plus `docs/insights/111-explicit-implicit-signal-separation.md`, `docs/insights/180-spike-test-every-new-api.md`.
2. Review agent specifically checks:
   - Is the type-level allowlist actually compile-time enforced, or does a runtime leak path exist?
   - Does the joint-tuple k-anonymity at the SQL level handle edge cases: concurrent inserts, updates that bring a tuple above or below threshold, deletes?
   - Insight-111 firewall: is there any code path where a meta-process signal could reach trust computation?
   - Deployment-mode enforcement: can the workspace accidentally receive evidence (or the network accidentally emit it)?
   - Vocabulary edge cases: service name collisions, hash-seed rotation implications, "other" bucket privacy properties
   - Rate-limit evasion: can a node rotate keys / create multiple tokens to bypass?
   - PII audit quality: is the 100-row sample representative?
3. Fresh-context reviewer reads as adversary: "how would I exfiltrate user data through this?" Capture answers as test cases.
4. Privacy review (separate pass): does the combination of allowlisted core-tier signals enable re-identification via longitudinal joint distributions? If yes, strengthen k-anonymity to cover joint tuples beyond integration_created.
5. Present work + all reviews to human.

## Smoke Test

```bash
# Node-side sanity
DITTO_DEPLOYMENT=workspace pnpm cli sync
pnpm cli evidence status
# Expect: consent tiers per config, queue depth 0, no errors

# Network-side sanity (separate deployment, or same workspace with env override)
DITTO_DEPLOYMENT=public pnpm cli sync
# Verify evidence endpoint registered in packages/web/app/api/v1/network/

# Configure a test node with `learning.evidence.signal_types.core: true`, rich off, replay off
# Drive a few fake harness decisions (via test fixture) and force a flush:
pnpm cli evidence flush
# On network, query networkEvidence table — expect rows matching core-tier signals only

# Flip consent to full opt-out
# Config change: learning.evidence.enabled: false
pnpm cli evidence status  # Expect: "Opted out"
# Drive fake harness decisions, force flush
pnpm cli evidence flush
# On network: no new rows

# Adversarial test
pnpm cli test:evidence --adversarial=./test/fixtures/pii-attempt-payloads.json
# Expect: ≥95% of adversarial payloads (injected PII in non-allowlisted shape) rejected at emitter

# Joint-tuple k-anonymity
pnpm cli test:evidence --k-anonymity-seed=./test/fixtures/4-node-seed.sql
# Query: `jointTupleAggregate(["service_name_hash", "protocol_type", "auth_pattern"], {days: 30})`
# Expect: empty result
pnpm cli test:evidence --k-anonymity-seed=./test/fixtures/5-node-seed.sql
# Expect: 1+ tuples returned

# Spike test (run manually per Insight-180)
pnpm vitest run src/engine/integration-spike.test.ts -t "evidence endpoint"
# Verifies endpoint reachable with real auth; no mocking
```

## After Completion

1. Update `docs/state.md` with evidence pipeline live, PII audit result, baseline signal volumes.
2. Update `docs/roadmap.md` Phase 9 — Sub-brief 189 complete.
3. Unblock 190 (Scanner + Sandbox + Archive), 191 (Release Distribution), 193 (Adversarial Detection).
4. Capture insights:
   - Any patterns about type-level privacy enforcement worth generalizing
   - Any learnings about SQL-level k-anonymity at scale
5. Architect retro: was the three-tier consent model the right granularity, or do users want more/fewer tiers? Revisit after 30 days of production data.
