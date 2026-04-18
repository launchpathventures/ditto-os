# Brief 193: Adversarial Detection + Meta-Observability

**Date:** 2026-04-17
**Status:** ready
**Depends on:** Brief 189 (Evidence Harvest — reputation primitive), Brief 190 (Scanner + Archive — provides proposal lifecycle data), ADR-033 (§1a Insight-111 firewall), Brief 181 §Phasing / Sub-brief 193. Can run parallel with 191 and 194 once 189+190 land.
**Unlocks:** Production-readiness of the whole RSI loop. Without adversarial detection + meta-observability, the scanner operates without self-reflection; the network has no visibility into its own health.

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. Fifth shippable sub-brief.
- **Capabilities:**
  - Outlier-weighted evidence aggregation at the receiver (extends Brief 189 aggregator)
  - Node reputation scoring — emission-consistency, adoption-success, rollback-rate signals
  - Coordinated divergence detection — alerts on multiple nodes suddenly aligning in a way deviating from baseline
  - Meta-health dashboard — scanner hit rate, sandbox calibration, clade fecundity, cognitive-mutation approval rate, release adoption lag
  - Self-degradation flagging — when scanner's own hit rate trends down 4+ consecutive weeks, surface as top-level Improvement Card
  - ROI attribution pipeline — 30-day post-deployment outcome attribution per proposal
  - Improvement Card and Update Card ContentBlocks for maintainer + operator surfaces
  - Maintainer admin web dashboard (`/admin/improvements`)

## Context

Brief 181 §Phasing / Sub-brief 193 outlines: "Adversarial detector: Outlier detection on evidence streams — nodes emitting evidence diverging from median by ≥2σ get reputation-discounted (not rejected). Coordinated divergence (multiple nodes suddenly aligning in a way that deviates from prior baseline) surfaced as maintainer alert. Node reputation signals: evidence-consistency, uptime, adoption-success rate, rollback rate. Meta-observability: Network dashboard shows scanner hit rate trend, sandbox calibration (PASS precision + recall against maintainer decisions), proposal time-from-evidence-to-release, release adoption lag per channel, rollback rate per release, clade fecundity, cognitive-mutation approval rate. Flag: scanner itself degrading (hit rate drops 4 weeks running) triggers a top-level Improvement Card — 'the improvement engine is getting worse; here are candidate causes.'"

This brief also delivers the ContentBlock types (Improvement Card, Update Card) that earlier sub-briefs (190, 191, 192) emit data for but don't render. The maintainer-facing web dashboard is here. The node operator's Update Card rendering is here.

Meta-observability is what makes the RSI loop self-aware. Without it, the scanner could silently degrade and no one would notice for months. With it, the system flags its own decline and surfaces the pattern as a proposal — the kernel closes.

## Objective

Ship (a) adversarial detection: reputation-weighted aggregation live on every Brief 189 query path, coordinated-divergence alerts fire on injected anomalies; (b) meta-observability: maintainer admin dashboard at `/admin/improvements` shows all meta-health metrics with trend visualization; (c) ROI attribution: 30-day post-deployment outcome pipeline per proposal; (d) self-degradation flag: 4-week trend detector fires a top-level Improvement Card when scanner health drops; (e) ContentBlocks: Improvement Card and Update Card typed per ADR-021, rendered via BlockList, surface across CLI + web.

## Non-Goals

- **Not implementing a new reputation-scoring algorithm from scratch.** Start with simple z-score outlier detection (per ADR-033 §6) + linear weighting; sophistication is future work.
- **Not shipping a commercial-grade anomaly-detection system.** Coordinated-divergence detection is a simple threshold on variance over sliding window. If real adversarial pressure emerges, harden later.
- **Not implementing statistical A/B of releases via Kayenta-style.** Too heavy for the scale at this brief's time. ADR-034 §4 notes: "3D Kayenta statistical analysis deferred — revisit sub-brief 186 once evidence deep enough."
- **Not implementing alternative/pluggable reputation scoring backends.** One built-in algorithm; no plugin architecture.
- **Not implementing the full Improvement Dashboard beyond what's needed for this brief.** `/admin/improvements` page is minimal: proposals pending + rollout status + meta-health metrics. Deeper features (composition, filtering, search) are future.
- **Not shipping mobile/responsive admin dashboard.** Desktop-only at first; responsive later.

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing / Sub-brief 193, §Risks (reward hacking, adversarial input)
2. `docs/adrs/033-network-scale-rsi-architecture.md` §1a (firewall), §6 (implied by AC list — reputation primitives)
3. `docs/adrs/034-release-distribution-model.md` §4 (rollout gating consumes reputation)
4. `docs/adrs/021-surface-protocol.md` (ContentBlock typing)
5. `docs/adrs/024-composable-workspace-architecture.md` (composition pattern for admin page)
6. `docs/briefs/complete/108-admin-oversight.md` — existing admin dashboard pattern (adopt)
7. `docs/briefs/189-evidence-harvest-pipeline.md` — aggregator extended here
8. `docs/briefs/190-network-scanner-sandbox-archive.md` — proposal lifecycle data
9. `docs/briefs/191-release-distribution-pipeline.md` — rollout + telemetry data
10. `docs/briefs/192-scanner-self-evolution-and-cognitive-layer.md` — scanner version history
11. `docs/human-layer.md` (Improvement Card + Daily Brief entries)
12. `src/engine/admin-oversight.ts` (Brief 108 pattern)
13. `packages/web/components/blocks/` (existing ContentBlock renderers)
14. `packages/web/app/admin/page.tsx` (existing admin auth + layout)

## Constraints

- MUST reuse Brief 108's admin auth pattern (`authenticateAdminRequest`). No new auth layer.
- MUST surface reputation as a first-class signal in the aggregator: every aggregation query weights signals by reputation score; no aggregation path bypasses reputation.
- MUST NOT reject low-reputation-node signals outright. Reputation discounts weight, not access. Healthy outliers exist.
- MUST implement coordinated-divergence detection via rolling-window variance comparison: alert when current variance exceeds baseline variance × 2.0 over a 7-day window. Configurable.
- MUST emit `self_degradation` alert as a top-level Improvement Card when scanner hit rate drops 4+ consecutive weeks. Alert includes candidate causes (pulled from archive trends: "low-quality proposals increasing," "adoption lag growing," "rollback rate rising," etc.).
- MUST implement ROI attribution: for every shipped proposal, track trust + quality metrics for the 30 days post-deployment; attribute deltas to the proposal. Attribution written to `improvementAttributions` table. Scanner reads this in its next generation via clade-score prior (Brief 190).
- MUST render Improvement Card and Update Card per ADR-021 (typed ContentBlock, surface-agnostic via BlockList, fallback to text for unknown blocks).
- MUST respect Insight-111 firewall when emitting self-degradation alerts: alerts are meta-process signals, never feed trust computation of any agent.
- MUST include `stepRunId` on alert-emission, attribution-write, reputation-score-update functions per Insight-180.
- MUST enforce admin-only access to `/admin/improvements` routes per Brief 108 pattern. `DITTO_DEPLOYMENT=workspace` returns 404 for these routes (ADR-030).
- MUST NOT display aggregate metrics that expose per-node information — maintain reputation-weighted aggregation and k-anonymity thresholds at the display layer as well as the query layer. Dashboard queries fail-closed below k-anonymity threshold; no per-node inference possible from combining displayed metrics.
- MUST disable coordinated-divergence detection on networks with fewer than 30 contributing nodes (false-positive rate too high at small cohort sizes). Between 30-100 nodes, threshold is 3× baseline variance (looser); ≥100 nodes use the 2× threshold. Documented tradeoff.
- MUST key node reputation at user-tenant level (not per-workspace). A malicious user spinning up multiple workspaces shares a single reputation score; reputation evasion via workspace-splitting is prevented. Enforced at reputation-scorer lookup.
- MUST define ROI attribution window start-clock unambiguously: clock starts at **full-rollout-reached** (stage = `full`), not at release publication or canary-start. Node-specific adoption timestamps used for per-node attribution if needed.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Admin dashboard pattern | Brief 108 `/admin` routes + `admin-oversight.ts` | depend | Pattern established, auth reused |
| ContentBlock rendering | ADR-021 + BlockList | depend | Existing surface protocol |
| Composition pattern for admin page | ADR-024 | depend | Deterministic composition per nav intent |
| Z-score outlier detection | Classical statistics | pattern | Simple primitive |
| Coordinated-divergence detection | Variance-ratio test (F-test analogue, simplified) | pattern | Standard anomaly-detection primitive |
| ROI attribution window | Brief 181 §Budget + Governance | depend | 30-day window already established |
| Self-degradation trend detection | Trend-regression over 4-week rolling window | pattern | Standard SRE-style degradation alerting |
| Improvement Card type | `docs/human-layer.md` (already designed) | depend | Design already in human-layer doc |
| Update Card type | Original to Ditto — needed by Brief 191 node-operator flow | pattern | New design, follows ADR-021 discipline |
| Reputation-weighted aggregation | Original to Ditto (informed by BFT reputation literature) | pattern | Cooperative-network-scoped; not adversarial-by-design |
| Meta-health metrics catalog | Brief 181 §Phasing / Sub-brief 193 | depend | Metrics list explicit in parent |

## What Changes (Work Products)

Engine-core (`packages/core/`):

| File | Action |
|------|--------|
| `packages/core/src/content-blocks.ts` | **Modify:** Add `ImprovementCardBlock` and `UpdateCardBlock` variants to the 22-type discriminated union. Text fallback renderers included. |
| `packages/core/src/learning/reputation.ts` | **Create:** `NodeReputation` type. Score = weighted average of (emission-consistency, adoption-success, rollback-rate-weighted-by-reason). |
| `packages/core/src/learning/attribution.ts` | **Create:** `ProposalAttribution` type. Links proposal to 30-day outcome metrics. |
| `packages/core/src/db/schema.ts` | **Modify:** Add `nodeReputation`, `improvementAttributions`, `metaHealthSnapshots` tables. |

Ditto product layer — network-side:

| File | Action |
|------|--------|
| `src/engine/network-learning/adversarial-detector.ts` | **Create:** Z-score outlier detection per signal type. Coordinated-divergence detection (rolling-window variance). Emits `adversarial_evidence_alert` activity + maintainer notification. |
| `src/engine/network-learning/reputation-scorer.ts` | **Create:** Computes `NodeReputation` on schedule (hourly). Reads emission-consistency from `networkEvidence`, adoption-success from `adoptionTelemetry`, rollback weighting from `upgradeHistory`. Writes to `nodeReputation` table. |
| `src/engine/network-learning/aggregator.ts` | **Modify (extended from Brief 189):** All query primitives weight evidence by reputation score. New parameter `minReputation` on query interfaces. |
| `src/engine/network-learning/attribution-pipeline.ts` | **Create:** For every shipped proposal, after 30-day post-deployment window, compute deltas on (approval rate, correction rate, confidence calibration, latency, overconfidence detection — the 5 homeostatic dims from ADR-022) vs pre-ship baseline. Write to `improvementAttributions`. |
| `src/engine/network-learning/meta-health-computer.ts` | **Create:** Daily-scheduled aggregator that computes meta-health metrics: scanner hit rate, sandbox calibration (precision + recall against maintainer decisions), proposal time-from-evidence-to-release, release adoption lag per channel, rollback rate per release, clade fecundity, cognitive-mutation approval rate. Writes snapshots to `metaHealthSnapshots`. |
| `src/engine/network-learning/self-degradation-detector.ts` | **Create:** Reads `metaHealthSnapshots` for scanner hit rate over 4-week rolling window. Fires top-level Improvement Card when trend is downward for ≥4 consecutive weeks. Includes candidate causes. |
| `packages/web/app/admin/improvements/page.tsx` | **Create:** Maintainer dashboard. Shows pending proposals (from Brief 190), rollout status (from Brief 191), meta-health metrics (from `metaHealthSnapshots`), scanner version history (from Brief 192), coordinated-divergence alerts. Composition pattern per ADR-024. |
| `packages/web/app/api/v1/network/admin/improvements/route.ts` | **Create:** GET — aggregate data for dashboard. Authenticated per Brief 108 admin auth pattern. |
| `packages/web/components/blocks/improvement-card.tsx` | **Create:** React renderer for `ImprovementCardBlock`. Shows: proposal summary, sandbox verdict, predicted impact, deliberative-perspectives findings, approval buttons. |
| `packages/web/components/blocks/update-card.tsx` | **Create:** React renderer for `UpdateCardBlock`. Shows: release summary, diff preview, adoption state, apply/rollback actions. |
| `src/cli/commands/network-admin.ts` | **Modify:** Add `meta-health show/trend`, `adversarial alerts list/acknowledge`, `attribution show <proposal-id>`. |

Ditto product layer — node-side:

| File | Action |
|------|--------|
| `packages/web/components/blocks/update-card.tsx` | **Same file (shared):** Update Card used at node operator surface (via `/chat` or Daily Brief) — renders release summary + operator actions. |

Tests:

| File | Action |
|------|--------|
| `src/engine/network-learning/adversarial-detector.test.ts` | **Create:** Z-score outlier detection thresholds, coordinated-divergence simulated injection, alert emission. |
| `src/engine/network-learning/reputation-scorer.test.ts` | **Create:** Score computation, weighting correctness, edge cases (new node with no data, long-idle node). |
| `src/engine/network-learning/attribution-pipeline.test.ts` | **Create:** 30-day window correctness, delta computation, clade-prior update. |
| `src/engine/network-learning/meta-health-computer.test.ts` | **Create:** Metric computation, snapshot persistence, rolling-window semantics. |
| `src/engine/network-learning/self-degradation-detector.test.ts` | **Create:** 4-week-downtrend detection, candidate-cause extraction, alert emission. |
| `packages/web/components/blocks/improvement-card.test.tsx` | **Create:** Render correctness, action button wiring. |
| `packages/web/components/blocks/update-card.test.tsx` | **Create:** Render correctness, action button wiring. |
| `packages/web/app/admin/improvements/page.test.tsx` | **Create:** Route auth, composition rendering, data aggregation correctness. |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint. |
| `docs/insights/NNN-meta-observability-patterns.md` | **Create on completion:** Patterns that emerged from first 30 days of production dashboard usage. |

## User Experience

- **Jobs affected (maintainer):** Orient (daily glance at dashboard), Review (pending proposals and rollout status), Decide (approvals via Improvement Card, alert acknowledgement).
- **Jobs affected (node operator):** Orient (Update Card in Daily Brief / chat), Decide (apply/rollback updates via Update Card buttons).
- **Primitives involved:** Improvement Card (maintainer), Update Card (operator), meta-health dashboard page (maintainer web), Daily Brief entries (operator).
- **Process-owner perspective:** Maintainer: one-page dashboard at `/admin/improvements` surfaces everything needed daily — pending proposals, rollout status, meta-health trends, alerts. Operator: Update Cards appear in Daily Brief when a release requires review per adoption policy; otherwise invisible.
- **Interaction states:**
  - Improvement Card: `pending-review | sandboxed | approved | rejected | shipped | attributed`
  - Update Card: `pending | shadow-mode | applied | rolled-back`
  - Meta-health dashboard: live line charts for hit rate, adoption lag, rollback rate; counts for pending proposals, active rollouts, open alerts
  - Self-degradation alert: top-of-dashboard banner + Improvement Card with full trend visualization
- **Designer input:** Invoke Dev Designer before building the admin dashboard page. Designer specs Improvement Card layout, Update Card layout, meta-health dashboard composition. (This brief can proceed with a lightweight Designer touch — the dashboard primarily reuses Brief 108 admin patterns + existing BlockList rendering.)

## Acceptance Criteria

1. [ ] `ImprovementCardBlock` and `UpdateCardBlock` added to `packages/core/src/content-blocks.ts` discriminated union. Text fallback renderers work. Unknown-block fallback tested.
2. [ ] Reputation-weighted aggregation: every query in `aggregator.ts` accepts `minReputation` parameter and weights signals accordingly. Verified by test comparing weighted vs unweighted aggregate on seeded data.
3. [ ] Outlier detection: node emitting signals diverging from median by ≥2σ gets reputation discount within one hourly refresh cycle. Verified by integration test.
4. [ ] Coordinated divergence detection: injected synthetic anomaly (4 nodes suddenly aligned on unusual signal distribution) fires maintainer alert within one hourly refresh cycle. Verified by injection test.
5. [ ] Reputation discount: signal weight ranges from 0.2 (floor) to 1.0 based on reputation score. Floor prevents total silencing of low-reputation nodes. Verified by boundary test.
6. [ ] ROI attribution: 30-day post-deployment window computes 5-dim deltas; writes to `improvementAttributions`. Scanner reads attribution in next generation per Brief 190 clade-score. Verified by seeded pre/post comparison test.
7. [ ] Self-degradation detection: 4-week scanner-hit-rate downtrend fires top-level Improvement Card with candidate causes. Verified by synthetic-trend-injection test.
8. [ ] Meta-health dashboard at `/admin/improvements` renders: pending proposals count, rollout status per channel, scanner hit rate + trend, sandbox precision/recall, proposal time-from-evidence-to-release, release adoption lag per channel, rollback rate per release, clade fecundity, cognitive-mutation approval rate, coordinated-divergence alerts list.
9. [ ] Dashboard auth: non-admin users get 401; `DITTO_DEPLOYMENT=workspace` returns 404 for `/admin/improvements` routes.
10. [ ] Improvement Card rendered correctly on web admin dashboard. Approval/reject buttons wired to `ditto network-admin proposals approve/reject` equivalents via API.
11. [ ] Update Card rendered correctly on node operator surface (Daily Brief or `/chat`). Apply/rollback buttons wired to `ditto updates apply/rollback` via API (node-local).
12. [ ] Self-degradation alert top-level: dashboard banner + Improvement Card visible until acknowledged. Verified by test.
13. [ ] Insight-111 firewall: self-degradation alerts tagged `meta_process_only`; rejected by any trust-computation code path. Verified by test.
14. [ ] `stepRunId` required on alert-emission, attribution-write, reputation-score-update functions per Insight-180. Verified by compile + runtime tests.
15. [ ] `ditto network-admin meta-health show` CLI prints current snapshot. `... trend` prints 4-week chart to terminal (ASCII). `... adversarial alerts list` lists open alerts.
16. [ ] Data layer: `metaHealthSnapshots`, `nodeReputation`, `improvementAttributions` tables created via migration. Next idx per Insight-190.
17. [ ] Dashboard display-layer k-anonymity: queries fail-closed below threshold. No combination of visible metrics can infer per-node information. Verified by adversarial combinatorial test.
18. [ ] Small-network coordinated-divergence regime: <30 nodes detector disabled; 30-99 nodes use 3× threshold; ≥100 nodes use 2× threshold. Documented explicitly in constraints and tested at each boundary.
19. [ ] Reputation keyed at user-tenant level: multiple workspaces under one user share one reputation score. Verified by creating 3 workspaces under one user, emitting divergent evidence from workspace 2, confirming reputation-discount applies to workspaces 1 and 3 as well.
20. [ ] ROI attribution window start-clock = full-rollout-reached. Verified by 30-day fixture with staged-release that reaches full at day 5; attribution window closes at day 35, not day 30 from publication.

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-033 §1a, this brief, Brief 108 (admin pattern), Briefs 189-192.
2. Reviewer specifically checks:
   - Insight-111 firewall: any path where self-degradation alert or reputation score feeds trust computation?
   - Reputation discount floor (0.2): does it actually prevent total silencing?
   - Coordinated-divergence threshold: 2× baseline variance — too loose? Too tight? What does baseline mean when the network is <30 nodes?
   - ROI attribution: 30-day window is from what start event? Ship (manifest published) or full-rollout (100% cohort adopted)? Does clock start consistently?
   - Self-degradation candidate causes: how are they extracted? LLM-based or rule-based? If LLM-based, is the cost/latency OK?
   - Dashboard privacy: can any query expose per-node information through aggregation combinations?
   - Alert lifecycle: who acknowledges? What does acknowledgement mean? Does an acknowledged coordinated-divergence alert auto-suppress follow-ups?
   - Admin auth: Brief 108 pattern correctly reused?
   - Improvement Card and Update Card: do they correctly fall back to text per ADR-021?
3. Designer review (lightweight): `/admin/improvements` dashboard composition, Improvement Card layout. Designer specs can be minimal — mostly reuses existing patterns.
4. Adversarial read: "I want to manipulate the dashboard to mislead the maintainer. How?"
5. Present reviews + brief to human.

## Smoke Test

```bash
# Maintainer side
pnpm cli sync
pnpm cli network-admin meta-health show
# Expect: current snapshot printed (will be empty on day 1; populated after first scanner run)

pnpm cli network-admin meta-health trend
# Expect: ASCII chart (4-week window) of hit rate + adoption lag

pnpm cli network-admin adversarial alerts list
# Expect: empty (no alerts unless triggered)

# Inject adversarial evidence
pnpm cli test:adversarial-injection --nodes=4 --pattern=synthetic-outlier
# Wait for hourly reputation refresh OR force:
pnpm cli test:reputation-refresh
pnpm cli network-admin adversarial alerts list
# Expect: one coordinated-divergence alert

# Self-degradation simulation
pnpm cli test:self-degradation-seed --downtrend=4-weeks
# Dashboard shows: top banner "scanner health declining" + Improvement Card
pnpm cli network-admin alerts acknowledge <alert-id>
# Expect: acknowledged, banner hidden

# ROI attribution test
# (requires Brief 191 to have shipped a release 30+ days ago)
pnpm cli test:attribution-seed --ship-date=-30d
pnpm cli test:attribution-compute
# Expect: improvementAttributions row with 5-dim deltas

# Dashboard web test
# (requires DITTO_DEPLOYMENT=public)
# Navigate to /admin/improvements after admin login
# Expect: pending proposals, rollout status, meta-health metrics, alerts, scanner version history

# Dashboard auth test
# Non-admin user → 401
# DITTO_DEPLOYMENT=workspace → 404 for /admin/improvements

# Improvement Card fallback
# Inject unknown block type; verify text fallback renders
pnpm cli test:block-fallback --type=improvement-card-v99
# Expect: text representation visible, action not blocked
```

## After Completion

1. Update `docs/state.md` with meta-observability live, first alerts fired, first attribution computed, first scanner-decline detected (if any).
2. Update `docs/roadmap.md` Phase 9 — Sub-brief 193 complete.
3. Declare RSI loop production-ready: Brief 181 §Phasing sub-briefs 189, 190, 191, 192, 193 all complete. Brief 194 is remaining. (RSI loop is usable without 194 — 194 is engine-code change pipeline, which ships via ordinary PRs until 194 automates it.)
4. Capture insights:
   - Reputation-scoring calibration — do real low-reputation nodes emerge, or does everyone cluster?
   - Coordinated-divergence alerts — false-positive rate?
   - Self-degradation first fire — was it a real degradation or noise?
   - ROI attribution — does 30 days capture the outcome, or do we need longer windows for slow-cadence processes?
5. Architect retro: was 4-week downtrend right threshold? Was 2× baseline-variance threshold right for coordinated divergence? Recalibrate per observed false-positive/negative rates.
