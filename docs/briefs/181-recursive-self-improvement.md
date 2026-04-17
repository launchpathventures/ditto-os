# Brief 181: Recursive Self-Improvement — Network-Scale Learning Loop

**Date:** 2026-04-17
**Status:** draft
**Depends on:** Phase 14 Network Agent complete (engine code, pulse, persona system), ADR-025 (centralized network service), ADR-030 (deployment-mode flag), Brief 107 (budget infrastructure), Brief 060 (knowledge-compounding), ADR-015 (meta-process architecture), ADR-022 (critical evaluation), Insight-156 (compiled knowledge layer)
**Unlocks:** Phase 9 closure at network scale; Ditto becomes an ecosystem whose improvement capability compounds across all nodes simultaneously; network-wide learning flywheel

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process (currently deferred); this brief re-opens Phase 9 as a network-scale learning loop that runs centrally on the Ditto Network and distributes updates to all workspace nodes.
- **Capabilities:** Evidence harvest pipeline (node → network), network-scale scanner + archive + sandbox, signed update distribution pipeline (network → node), node-side trust-tiered adoption policies, scanner strategy self-evolution, cognitive-layer cross-node evolution, adversarial node detection, meta-observability across the full flywheel.

## Context

### The architectural reframe

Prior drafts of this brief treated recursive self-improvement as a *per-node* concern — each Ditto instance runs its own scanner, sandbox, and dev pipeline, and every structural change is approved by that node's operator. That architecture is correct in miniature but wrong at scale. Three reasons:

1. **Single-node evidence is statistically thin.** One workspace sees a correction pattern 3 times; a network of 100 workspaces sees it 300 times. The sandbox becomes genuinely predictive (not just indicative) at network scale.
2. **Duplicated dev pipelines are wasteful.** Running the `/dev-*` roles independently on every node to produce the same improvement is absurd. The dev pipeline runs once centrally; nodes pull releases.
3. **Per-node human-gating doesn't scale.** Asking every operator to approve every structural change breaks the ecosystem before it has 10 users. Approval belongs at the network layer (maintainer approves releases), node adoption is trust-tier-gated (autonomous nodes auto-accept additive updates, supervised nodes review everything).

This isn't a reframe from scratch — the architecture for it is already half-built. ADR-025 establishes the Ditto Network as a centralized service that all workspaces connect to. ADR-030 establishes the deployment-mode flag (`public` = network hub, `workspace` = node). Phase 14 Network Agent ships the pulse engine, persona system, inbound/outbound infrastructure, and the `/network/feedback` endpoint is already live for workspace→network signal flow. Insight-156 (compiled knowledge layer) already asks the question "where does compiled knowledge live — network or workspace?" Brief 181 answers it for the learning loop specifically.

### The network-scale loop

```
┌──────────────────────────────────────────────────────────────────┐
│                 ditto-network (DITTO_DEPLOYMENT=public)           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Evidence    │→ │  Scanner +   │→ │  Dev pipeline         │   │
│  │  aggregator  │  │  sandbox +   │  │  (architect/builder/  │   │
│  │  (privacy    │  │  archive     │  │   reviewer central)   │   │
│  │   layer)     │  │  (cross-node)│  │                       │   │
│  └──────────────┘  └──────────────┘  └──────────┬───────────┘   │
│         ▲                 ▲                      │               │
│         │                 │                      ▼               │
│  ┌──────┴─────────┐       │            ┌────────────────────┐   │
│  │  Evidence      │       │            │  Release manifest  │   │
│  │  receiver API  │       │            │  (signed, versioned)│  │
│  └──────▲─────────┘       │            └──────────┬─────────┘   │
│         │                 │                       │              │
│         │      Maintainer approves ────────────── │              │
│         │                                         │              │
└─────────┼─────────────────────────────────────────┼──────────────┘
          │ evidence (opt-in, allowlisted)          │ updates (signed)
          │                                         ▼
┌─────────┴──────────────────────────────┐ ┌───────────────────────┐
│  Node A (DITTO_DEPLOYMENT=workspace)    │ │  Node B (workspace)   │
│                                         │ │                       │
│  ┌──────────────────┐  ┌────────────┐  │ │  ┌────────────┐       │
│  │  Evidence emitter│  │  Update    │  │ │  │  Update    │       │
│  │  (privacy layer) │  │  adopter   │  │ │  │  adopter   │       │
│  │  opt-in per type │  │  (trust-   │  │ │  │  (trust-   │       │
│  └──────────────────┘  │   tiered)  │  │ │  │   tiered)  │       │
│                        └────────────┘  │ │  └────────────┘       │
│                                         │ │                       │
│  ┌──────────────────────────────────┐  │ │  ┌─────────────────┐  │
│  │ Local scanner (node-specific     │  │ │  │ Local scanner   │  │
│  │ patterns only — e.g. user's own  │  │ │  │ ...             │  │
│  │ processes, not shared upstream)  │  │ │  └─────────────────┘  │
│  └──────────────────────────────────┘  │ │                       │
└─────────────────────────────────────────┘ └───────────────────────┘
```

Three flows. Node→network: **evidence** (opt-in, allowlisted, privacy-preserving). Network-internal: **learning** (scanner → sandbox → dev pipeline → release manifest). Network→node: **updates** (signed, versioned, trust-tier-gated on adoption).

### The layered recursion model at network scale

The five layers from earlier drafts still apply, but each one's fitness signal is network-aggregated and its shipping surface is the release manifest. LC (cognitive, cross-cutting) gains enormously from network evidence because its unit of signal — approach-outcome correlation per mode — needs large-N to be statistically meaningful.

| Layer | What improves | Evidence grain | Shipping surface |
|-------|---------------|----------------|------------------|
| L1 — Output | Agent fixes its own bad output in-run | Per-run, node-local | No shipping (local retry only) |
| L2 — Process | Process template YAML gets edited | Cross-node correction patterns on template X | New template version in release manifest |
| L3 — Agent | Role contracts, system prompts, skills | Cross-node role-contract correlation with trust signals | New role-contract version in release manifest |
| L4 — Meta-process | Processes that improve processes improve | Cross-node meta-process health signals | New meta-process version in release manifest |
| L5 — Scanner | The network scanner's own strategy improves | Network-wide proposal hit rate + ROI attribution | New scanner prompt/config version |
| **LC — Cognitive** | **Modes, step-level cognitive_context, metacognitive-check prompts, deliberative lenses** | **Cross-node mode-outcome correlation (network-scale makes this finally statistically valid)** | **New cognitive content version** |

All five plus LC ship as versioned releases from the network. Nodes pull. This is the crucial simplification: **the engine and its contents are shipped software; evolution happens centrally; nodes never self-modify code.** Per-node customization (a user's own process edits, their own self-scoped cognitive tweaks) remains local and is never harvested — it stays in that node's DB. The network learns only from allowlisted aggregate signals.

### What "free to self improve" means here

At the network layer: the scanner + dev pipeline run continuously against aggregated evidence; the maintainer approves releases on a natural cadence (weekly is the target); additive releases can ship with one-click approval because the evidence is deep; structural releases require full ADR process. The *network* is free to self-improve because it has statistical confidence; the *maintainer* is in the loop at leverage, not at every change.

At the node layer: updates arrive continuously; trust-tier policies decide whether to auto-apply, auto-apply-with-shadow, or queue-for-review; nodes can roll back any update with one command; nodes can pin to a specific release channel (stable / beta / nightly). The *node* is free to adopt updates without approval, within policies the operator sets once.

This matches how mature software ecosystems actually work (apt, Homebrew, npm, browser auto-update) and diverges from the per-change-per-operator-approval model only at the right seam — the network takes on the cost of deep review once, all nodes benefit.

### Frontier research — now mapped to network scale

- **Darwin Gödel Machine** (Zhang/Clune, arXiv:2505.22954) — archive-of-variants with empirical fitness. At network scale, the archive lives on the network; fitness validation uses cross-node replay corpus; variants can be A/B'd by cohort (5% of nodes get variant X, measure for 2 weeks). Sandboxing becomes statistical instead of heuristic.
- **Huxley-Gödel Machine** (arXiv:2510.21614) — clade metaproductivity. Network-scale lineage depth makes CMP computable for real, not just aspirational.
- **Promptbreeder** (DeepMind, arXiv:2309.16797) — the mutation-prompts-that-mutate-task-prompts pattern. At network scale, mutation operators evolve from mutation-operator effectiveness across many proposals.
- **STOP** (Zelikman et al., 2023) — scaffolding rewrites scaffolding. In our shape, the network's dev pipeline writes engine improvements that make the dev pipeline better; the scanner writes scanner improvements. STOP's "model itself is static" limitation is addressed by the separate SLM track (Briefs 135–137) which becomes cleaner in a centralized training setting.
- **TextGrad** (Yuksekgonul et al., Nature 2024) — textual gradient propagation. Cross-node edit diffs aggregate into much stronger gradient signals than single-node feedback.
- **SEAL** (MIT, arXiv:2506.10943) — relevant for the future SLM work, where network-scale training data is the obvious win. Out of scope here.
- **Compound-product** (snarktank/compound-product) — the report → analyse → plan → execute → PR shape. Adopted wholesale as the dev pipeline flow, but with cross-node evidence instead of single-repo reports.
- **AlphaEvolve** (DeepMind, arXiv:2506.13131) — ensemble LLM + evaluator feedback loop. Maps to: multiple scanner variants producing proposals, evaluator (sandbox + deliberative-perspectives) filtering, best retained.
- **Package ecosystems** (apt, Homebrew, npm, Chrome auto-update, Dependabot) — staged releases, signed manifests, trust-tiered adoption, rollback authority, channels (stable/beta). Pattern-adopted for the update distribution pipeline.
- **Reward hacking** (Weng 2024) — still the dominant failure mode, now amplified by scale. Adversarial node detection + outlier-weighted evidence aggregation is the new mitigation surface.

### What's already in place

- **ADR-025 Network API** — `/network/feedback`, `/network/register`, SSE event stream, authenticated per-user. Foundation for evidence flow.
- **ADR-030 deployment-mode flag** — `DITTO_DEPLOYMENT = public | workspace`. Foundation for role separation.
- **Phase 14 network infrastructure** — pulse engine, persona system, web front door, managed workspace infra (Briefs 090/091/100). The central hub exists.
- **Insight-156 compiled knowledge layer** — explicit architecture for "what lives on network vs workspace." Same pattern applies to the learning loop.
- **Brief 107 budget ledger** — per-goal budget infra. Reused for scanner + update-distribution budgets.
- **Brief 060 knowledge-compounding** — structured extraction pattern. Scanner differs at higher abstraction.
- **processes/self-improvement.yaml** — existing stub. Rewritten to call the network-scale pipeline.
- **ADR-015** — additive-vs-structural rule. Applied at the release-manifest boundary, not per-node.
- **ADR-022 homeostatic quality** — 5-dim fitness frame. Now computed on network-aggregate data.

### What's new

- Evidence harvest pipeline (node → network) with privacy/anonymization layer
- Network-scale scanner, archive, sandbox
- Signed update distribution (network → node) with channels (stable/beta/nightly) and staged rollout
- Node-side adoption policies per trust tier
- Adversarial node detection + reputation-weighted evidence
- Network-scale dev pipeline integration (producing release manifests, not PRs to user repos)
- Cross-node cognitive layer evolution

## Objective

Make Ditto a network-scale self-improving system: evidence flows continuously from workspace nodes to the central ditto-network (opt-in, privacy-preserving, allowlisted); a central scanner aggregates evidence, proposes improvements, validates them empirically across cross-node replay corpora, and hands approved proposals to a central dev pipeline that produces signed release manifests; nodes pull releases on trust-tier-gated adoption policies; post-deployment outcomes attribute back to specific proposals, improving the scanner's own strategy; the cognitive layer evolves from network-wide mode-outcome correlation. All under maintainer approval at the release layer and node-operator-set adoption policies at the node layer.

Success shape at 12 months: 50+ active nodes, release cadence established on an adaptive rhythm (monthly floor, biweekly or weekly as archive depth permits — see ADR-034 §5; early-year reality is typically monthly), scanner hit rate trending up month-over-month, node adoption lag (time from release to 50% adoption) under 7 days, zero reported adversarial-node incidents that survived outlier detection, measurable compounding — the month-12 engine is measurably more capable than the month-1 engine across the same benchmark.

## Non-Goals

- **Not node-level code self-modification.** Nodes never write TypeScript. Nodes pull signed releases. All code changes route through the central dev pipeline. This is a hard constraint.
- **Not full AI-scientist/AlphaEvolve autonomy.** Network maintainer approves every release. Structural releases require human-authored ADR. The scanner proposes; humans decide.
- **Not harvesting raw user content.** Evidence is typed pattern-category-level signal, never raw content. Hard-coded allowlist, not opt-out.
- **Not forcing nodes to participate in evidence sharing.** Nodes can opt out of evidence entirely and still receive updates. Evidence is opt-in per signal type; updates are default-opt-in per trust tier.
- **Not auto-updating critical-tier nodes.** Critical tier operators opt out of auto-updates; they pull manually.
- **Not fine-tuning LLM weights in this brief.** Scaffold-level RSI only. SLM training pipeline (Briefs 135–137) benefits from network evidence separately but is not in scope.
- **Not a Phase 11 discovery system.** The scanner here improves existing processes/engine/cognitive content; the coverage-agent (MP-10) handles "you should have a process you don't" on its own track.
- **Not replacing the Network API.** This brief extends it with new endpoints; existing endpoints (especially `/network/feedback`) are built upon.

## Inputs

1. `docs/adrs/025-centralized-network-service.md` — Network architecture, who owns what, existing API surface
2. `docs/adrs/030-deployment-mode-flag.md` — Public vs workspace deployment distinction
3. `docs/adrs/015-meta-process-architecture.md` — Additive-vs-structural rule, applied at release-manifest boundary
4. `docs/adrs/022-critical-evaluation-and-homeostatic-quality.md` — 5-dim fitness frame
5. `docs/adrs/008-system-agents-and-process-templates.md` — How system agents are registered
6. `docs/insights/156-compiled-knowledge-layer.md` — Network-vs-workspace split pattern, same applies to learning signals
7. `docs/briefs/complete/060-knowledge-compounding.md` — Structured extraction precedent; scanner is same shape higher up
8. `docs/briefs/complete/107-budget-infrastructure.md` — Budget ledger reused at network scale
9. `processes/self-improvement.yaml` — Existing stub; rewritten to call network pipeline
10. `src/engine/system-agents/knowledge-extractor.ts` — Closest existing pattern
11. `src/engine/harness-handlers/feedback-recorder.ts` — Local observation substrate that feeds the network emitter
12. `packages/web/app/api/v1/network/` — Existing Network API route structure
13. `src/db/schema.ts` — `harnessDecisions`, `activities`, `stepRuns`, `memories`, `processVersions`, `networkUsers`, `adminFeedback` tables
14. Darwin Gödel Machine (arXiv:2505.22954 + `jennyzzt/dgm`), Promptbreeder (arXiv:2309.16797), TextGrad (`zou-group/textgrad`), DSPy MIPRO — for mutation + fitness patterns
15. Package ecosystem prior art: apt/dpkg, Homebrew, npm, Chrome auto-update, Dependabot — for release distribution patterns

## Constraints

### Privacy + evidence

- MUST treat all node-emitted evidence as opt-in per signal type via explicit operator consent in `config/ditto.yaml`. Default is opt-in to a core set (harness decisions, trust drift, correction classifications — all pattern-type, zero content). Rich signals (mode-outcome correlation, specific failure-pattern hashes) default to opt-out.
- MUST apply a hard-coded allowlist of shareable signal types in `src/engine/network-evidence/allowlist.ts`. Not an opt-out model. New signal types require explicit addition to the allowlist plus an entry in the brief-time privacy review checklist.
- MUST strip all PII from evidence at the node layer *before* transmission. No IDs that cross-reference to identifiable users in the emitted payload. Use content hashes for deduplication, not content itself.
- MUST support k-anonymity for borderline signals (k ≥ 5 default) — if fewer than k nodes have reported the same pattern, the pattern is not actionable yet.
- MUST never transmit user-edit diffs as text. Diffs are classified into severity/direction bins (WikiTrust-style already used by `trust-diff.ts`) and the *classification* is transmitted, not the diff.
- MUST offer a total-opt-out: `evidence.enabled: false` in node config disables all emission. Nodes in this state still receive updates normally.

### Update distribution + adoption

- MUST cryptographically sign all release manifests with the network's release key. Nodes verify signatures on pull; unverified manifests are rejected regardless of trust tier.
- MUST support release channels: `stable` (default), `beta` (opt-in, includes unreleased-but-ready changes), `nightly` (opt-in, for network maintainers and dogfood nodes). Every node picks a channel in config.
- MUST support staged rollout: a release ships to `canary` (≤5% of nodes, usually nightly-channel) → `partial` (25% of stable-channel) → `full` (100%). Each stage gates on cross-node telemetry from the prior stage.
- MUST support per-node rollback: one command reverts any applied update. Rollbacks are themselves telemetered back to the network as "this release was reverted by N nodes with reasons X/Y/Z."
- MUST enforce trust-tier-gated adoption at the node layer — not at the network. The network ships; the node decides whether to apply, per its configured policy.
- MUST pin the engine version of critical-tier processes (not critical-tier nodes — critical-tier *processes* within a node). A process pinned to engine version 1.4.2 does not get its engine auto-updated; human operator must migrate explicitly.

### Scanner + dev pipeline + sandbox

- MUST route every scanner run through the central network's harness pipeline. No harness bypass.
- MUST pin scanner trust tier at `critical` for structural proposals (new steps, new tools, engine-code changes, cognitive-core edits). Additive-only proposals (mental-model entries, reflection-prompt variants, tightened quality_criteria wording) progress along the normal trust ladder.
- MUST NOT mutate any file referenced by a currently-shipping template without cross-node replay validation first.
- MUST track proposal lineage in `improvementProposals` on the network DB — inputs, evidence, sandbox verdict, maintainer decision, cohort rollout telemetry, post-deployment outcome. Every proposal is learnable evidence.
- MUST enforce the frozen-paths allowlist: `cognitive/core.md`, `cognitive/self.md`, `packages/core/src/interfaces.ts` (engine ABI), and ADR documents cannot be scanner-proposed. Changes here require human-authored ADR first, manual dev pipeline run.
- MUST include a kill-switch at the network layer: a single command (`ditto-network improvements pause`) halts scanner activity, freezes in-flight proposals, and stops new release publication. Does not affect already-published releases or node pulls.

### Adversarial + governance

- MUST implement outlier-weighted evidence aggregation. Nodes that consistently emit evidence diverging from the median by ≥2σ get their evidence weight reduced, not rejected outright (healthy outliers exist — a legitimate edge-case workflow shouldn't be silenced).
- MUST maintain node reputation signals: uptime, evidence-consistency, update-adoption-success rate. Low-reputation nodes' evidence is still counted but discounted in the aggregator.
- MUST detect and surface suspected adversarial input (coordinated evidence from multiple nodes that diverges suspiciously) as a maintainer alert, not auto-reject. Humans investigate.
- MUST audit-log every release decision (approval, rejection, rollback trigger) with maintainer identity, evidence snapshot hash, and post-hoc outcome attribution.

### General

- MUST use `stepRunId` invocation guards per Insight-180 for any new external-side-effect function.
- MUST log all budget consumption on the network with per-proposal attribution (like Brief 107 user budgets).
- MUST support a "dry-run" release mode: a signed manifest that opts-in nodes can apply in shadow (run side-by-side with current, log divergences, don't affect outcomes). Used for canary stage.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Evidence emitter privacy layer | Original to Ditto, informed by k-anonymity + differential privacy literature | pattern | No existing OSS tool matches our allowlist-first + pattern-only-emission shape |
| Evidence harvest endpoint | ADR-025 `/network/feedback` (existing) | depend | Extends existing auth + per-user API — adds typed evidence channel |
| Cross-node replay sandbox | Sub-brief 190 (formerly 183 in prior draft) extended, DGM (`jennyzzt/dgm` DGM_outer.py + self_improve_step.py) | adopt | Archive + probabilistic selection + sandbox validation pattern; now network-scoped |
| Archive + clade scoring | Huxley-Gödel Machine (metauto-ai/HGM), Darwin Gödel Machine | pattern | Network-scale lineage depth makes CMP actually computable |
| Self-referential mutation (scanner evolves) | Promptbreeder (arXiv:2309.16797) | pattern | Mutation-prompts-mutate-task-prompts; now runs once centrally with network-scale evidence |
| Textual gradient propagation | TextGrad (`zou-group/textgrad`) | pattern | Cross-node edit classifications form much stronger gradient signal than single-node feedback |
| Programmatic optimizer loop | DSPy MIPRO | pattern | Proposal generation → mini-batch eval → score → iterate; network cohort is the mini-batch |
| Report → analyse → plan → execute → PR | snarktank/compound-product (`scripts/compound/`) | pattern | Dev pipeline flow at network scale — cross-node aggregated report instead of single-repo report |
| Signed release manifests | Debian `apt` + `debsigs`, npm package signing, Sigstore | pattern | Cryptographic integrity is table stakes for auto-update ecosystems |
| Staged rollout (canary → partial → full) | Chrome auto-update, Netflix production rollout pattern, Kubernetes canary deployments | pattern | Established safe-rollout convention; evidence-based stage gates |
| Release channels (stable/beta/nightly) | Chrome, Rust toolchain, Homebrew taps | pattern | Giving nodes a risk-appetite choice is solved in the package-ecosystem literature |
| Per-node adoption policies | apt unattended-upgrades + `Dpkg::Options::=--force-confold` pattern | pattern | Tier-based policy shape already widely deployed |
| Node reputation / outlier detection | Academic distributed-systems literature (BFT, gossip protocols); Sybil-resistance research | pattern | Our network is cooperative, not adversarial-by-design, but reputation-weighted aggregation is the right primitive |
| Homeostatic multi-dim quality | ADR-022 §4 | depend | Already project framework |
| Deliberative perspectives on proposals | ADR-028, `deliberative-perspectives.ts` | depend | Already project framework |
| Trust tier as safety boundary | ADR-007, ADR-015 | depend | Already project framework |
| Kill-switch at leverage | Original to Ditto (analog: emergency stop in industrial control systems) | pattern | Network-level kill-switch is distinct from per-node; both required |
| Network API auth | ADR-025 existing | depend | Per-user authenticated; evidence endpoints extend same auth model |
| Content-block rendering for updates | ADR-021 | depend | Update cards render through same block system |

## What Changes (Work Products)

This brief is the parent. Each sub-brief below owns its file deltas. The union:

### On the network (`DITTO_DEPLOYMENT=public`)

| File | Action |
|------|--------|
| `src/engine/network-learning/evidence-receiver.ts` | **Create (189):** Auth'd endpoint that receives typed evidence from nodes, validates against allowlist, runs k-anonymity check, writes to `networkEvidence` |
| `src/engine/network-learning/aggregator.ts` | **Create (189):** Reputation-weighted aggregation; outlier detection; cohort/segment queries |
| `src/engine/network-learning/scanner.ts` | **Create (190):** Central scanner. Consumes aggregated evidence, proposes improvements with cross-node evidence trail |
| `src/engine/network-learning/sandbox.ts` | **Create (190):** Cross-node replay validation. Runs proposed changes against sampled node-contributed replay corpora (anonymized). Five-dim scoring |
| `src/engine/network-learning/archive.ts` | **Create (190):** Network proposal archive with lineage, clade-metaproductivity scoring, probabilistic selection |
| `src/engine/network-learning/release-builder.ts` | **Create (191):** Packages approved proposals into signed release manifests. Handles version bumping, dependency resolution, release-note generation |
| `src/engine/network-learning/release-signer.ts` | **Create (191):** Cryptographic signing over release manifests; key rotation support |
| `src/engine/network-learning/rollout-controller.ts` | **Create (191):** Staged rollout logic: canary → partial → full gating on cross-node telemetry from prior stage |
| `src/engine/network-learning/strategy-evolution.ts` | **Create (192):** Meta-scanner — scanner's own prompts + config evolve from network-wide proposal hit rate. Promptbreeder-shaped |
| `src/engine/network-learning/cognitive-evolution.ts` | **Create (192):** Cross-node cognitive-layer evolution. Uses mode-outcome correlation across all contributing nodes. Allowlist enforcement for frozen paths |
| `src/engine/network-learning/adversarial-detector.ts` | **Create (193):** Suspected coordinated adversarial evidence surfaced as maintainer alert; node reputation updates |
| `src/engine/network-learning/meta-health.ts` | **Create (193):** Scanner health metrics (hit rate, sandbox calibration, clade fecundity, adoption-success rate, time-from-evidence-to-release) |
| `packages/web/app/api/v1/network/evidence/route.ts` | **Create (189):** POST endpoint, authenticated, rate-limited, schema-validated |
| `packages/web/app/api/v1/network/releases/route.ts` | **Create (191):** GET endpoint — nodes pull manifest list; signed responses |
| `packages/web/app/api/v1/network/releases/[id]/route.ts` | **Create (191):** GET single signed release; POST rollout-telemetry back |
| `packages/web/app/admin/improvements/page.tsx` | **Create (193):** Maintainer dashboard — pending proposals, rollout status, health metrics, release approval UI |
| `processes/network-learning.yaml` | **Create (190):** Network-scale learning meta-process definition — triggers scanner, runs sandbox, packages releases |
| `src/db/schema.ts` | **Modify:** Add `networkEvidence`, `improvementProposals`, `improvementArchive`, `releaseManifests`, `rolloutStages`, `nodeReputation`, `adoptionTelemetry` tables. Journal/migration per Insight-190 |

### On the node (`DITTO_DEPLOYMENT=workspace`)

| File | Action |
|------|--------|
| `src/engine/node-learning/evidence-emitter.ts` | **Create (189):** Extracts allowlisted signals from local harnessDecisions/activities, strips PII, classifies into pattern types, posts to network evidence endpoint |
| `src/engine/node-learning/emission-consent.ts` | **Create (189):** Per-signal-type consent management; config-driven defaults; opt-out totality |
| `src/engine/node-learning/update-fetcher.ts` | **Create (191):** Polls network for new releases on channel; verifies signatures; stages pending updates |
| `src/engine/node-learning/update-adopter.ts` | **Create (191):** Trust-tier-gated adoption; applies updates atomically; rollback command |
| `src/engine/node-learning/adoption-policy.ts` | **Create (191):** Config-driven policy engine: per-tier, per-release-type rules (auto-accept additive, queue structural for review, etc.) |
| `src/engine/node-learning/local-scanner.ts` | **Create (192):** Lightweight local scanner for node-specific patterns (user's own process customizations). Never emits proposals upstream — proposes to the node's own Self only |
| `src/cli/commands/updates.ts` | **Create (191):** `ditto updates list/show/apply/rollback/channel/pause` |
| `config/ditto.yaml` schema | **Modify:** Add `learning.evidence`, `learning.updates`, `learning.adoption_policy` sections |

### Shared (`packages/core/`)

| File | Action |
|------|--------|
| `packages/core/src/learning/evidence-types.ts` | **Create (189):** Typed evidence schema; allowlist constants; zod validators |
| `packages/core/src/learning/release-manifest.ts` | **Create (191):** Release manifest shape — engine version, template versions, cognitive-content versions, signatures, release notes |
| `packages/core/src/learning/adoption-policy-types.ts` | **Create (191):** Typed policy shapes — per-tier-per-release-type |

### Documentation

| File | Action |
|------|--------|
| `docs/adrs/031-network-scale-recursive-self-improvement.md` | **Create:** ADR capturing the network-scale architecture, the privacy model, the signing model, the adoption-policy model |
| `docs/adrs/032-release-distribution-model.md` | **Create:** ADR for the release distribution specifics — channels, staged rollout, cryptographic signing |
| `docs/state.md`, `docs/roadmap.md` | **Modify:** Phase 9 in-progress, link sub-briefs |
| `docs/insights/181-network-scale-rsi.md` | **Create on completion:** Lessons from the burn-in |

## Phasing — Sub-Briefs

Strict dependency order. Each sub-brief ships independently with ACs, ADR or insight, fresh-context review.

**Numbering note (2026-04-17):** Earlier drafts of this brief referenced sub-briefs 182–187. Those numbers were taken by parallel threads that shipped (browser work 182–186, OAuth 187, autopilot 188). Sub-briefs below are renumbered to 189–194. The What Changes (Work Products) table and Exit Criteria references use the new numbers.

### Sub-brief 189 — Evidence Harvest Pipeline (node emitter + network receiver + privacy layer)

Build the flow of evidence from nodes to network. Foundation for everything else.

**Node side:** Extract allowlisted signals from `harnessDecisions`/`activities`/`stepRuns` (harness decisions, correction-classification counts, trust drift deltas, mode-outcome attribution). Strip PII via type-level enforcement (structured enums only, no free text). Post to `/network/evidence` on a configurable cadence (default 1/hour, batched). Consent management via `config/ditto.yaml`: default-opt-in to core types, default-opt-out to rich types, total-opt-out switch.

**Network side:** Auth'd receiver endpoint. Schema validation. K-anonymity check (borderline signals require ≥5 contributing nodes before actionable). Write to `networkEvidence`. Reputation-weighted aggregation primitives exposed as queries.

**Exit criteria:** 3+ dev nodes emitting to a staging network; evidence dashboard shows signal volume per type per day; PII audit passes (hand-audit 100 random payloads); total-opt-out verified (node with `evidence.enabled: false` emits nothing); k-anonymity rejection verified (signal type with only 2 contributors stays below threshold).

### Sub-brief 190 — Network Scanner + Sandbox + Archive

Build the central learning brain. Scanner reads aggregated evidence, produces proposals with cross-node evidence trail and predicted impact. Sandbox validates by replaying (against node-contributed replay corpora, anonymized) the proposal vs current on the evidence cohort. Archive persists lineage with probabilistic selection and clade scoring.

**Scanner:** LLM-driven. Consumes evidence query results, trust drift signals, meta-process health. Outputs typed improvement proposals (L2 template edit / L3 role edit / LC cognitive edit / engine handler addition / etc.). Confidence-scored, impact-predicted, diff-ready.

**Sandbox:** Pulls sample replay traces from evidence contributors (consent-gated separately — "share replay traces" is a stricter opt-in than "share aggregate evidence"). Runs old-vs-new on the sample, LLM-judges outputs, scores on ADR-022 5-dim frame. Requires min N contributors (default 10) + min N traces (default 50) for a PASS.

**Archive:** Network-scale proposal store. Lineage parent-child. Clade-metaproductivity rolling score. Selection probability feeds into next scanner run's prior.

**Exit criteria:** Scanner produces ≥1 proposal per run on seeded network with known patterns. Sandbox PASS correlates >70% with maintainer approval on a curated eval set. Archive survives network restart. Clade prior measurably shifts scanner output distribution after 3+ generations.

### Sub-brief 191 — Release Distribution Pipeline

Everything between "proposal approved by maintainer" and "update applied on node." Release builder packages approved proposals into signed manifests (engine version + template diffs + cognitive-content diffs + release notes). Rollout controller stages: canary (nightly-channel, ≤5%) → partial (beta + 25% of stable) → full (100% of stable). Each stage gates on cross-node telemetry from the prior stage (error rate, rollback rate, adoption success).

**Node side:** Update fetcher polls channel. Signature verification (unverified = reject). Update adopter applies atomically to the `processes/`, `cognitive/`, `templates/` directories; engine updates (new `@ditto/core` version) are tagged as "requires restart" and deferred to operator-scheduled window. Adoption policy engine decides auto-apply vs queue-for-review vs shadow-mode based on release type × tier.

**Rollback:** `ditto updates rollback <release-id>` reverts in one command. Rollback telemetered back to network.

**Exit criteria:** Full round-trip on staging network — proposal approved → release signed → canary deploys → partial deploys → full deploys. Rollback tested. Signature rejection tested (tampered manifest rejected by node). Trust-tier policy tested (supervised-tier queues a structural update, autonomous-tier auto-applies).

### Sub-brief 192 — Scanner Self-Evolution + Cognitive Layer Evolution

The recursive kernel, centrally.

**Meta-scanner:** Every N proposals (default 20), a scanner-strategy-evolution agent run proposes an edit to the scanner's own prompts + config. The edit is itself a proposal — sandboxed by running old-vs-new scanner on the last N evidence windows, comparing proposal distributions. Maintainer-approved, versioned in `improvementScannerVersions`, rollback is one command.

**Cognitive layer at network scale:** Mutation targets: `cognitive/modes/*.md`, step-level `cognitive_context` templates, metacognitive-check handler prompts, deliberative-perspective lens definitions. Fitness signal: cross-node mode-outcome correlation (finally statistically valid at scale). Frozen-paths allowlist strictly enforced: `cognitive/core.md`, `cognitive/self.md`, ADR docs, `packages/core/src/interfaces.ts`. Validation: aggregate evidence across ≥5 nodes × ≥3 processes where target was active. Metacognitive-check edits require A/B across two consecutive weeks of node population, half old / half new.

**The composition:** The scanner runs under `cognitive/modes/improvement-scanning.md`. That mode is itself a cognitive-layer mutation target. When the scanner proposes an edit to its own cognitive framing, and the dev pipeline ships it, the scanner's cognition governing how it evaluates improvements evolves from its own results. L5 × LC composition — the densest form of RSI this architecture expresses.

**Exit criteria:** Meta-scanner has produced ≥1 approved edit within 50 proposals. Cognitive-layer has shipped ≥1 cross-node-validated mode update. Frozen-paths allowlist rejection tested (adversarial proposal against `cognitive/core.md` rejected at release-builder). `improvement-scanning.md` has been edited by a scanner proposal at least once.

### Sub-brief 193 — Adversarial Detection + Meta-Observability

Build the guardrails and the dashboard.

**Adversarial detector:** Outlier detection on evidence streams — nodes emitting evidence diverging from median by ≥2σ get reputation-discounted (not rejected). Coordinated divergence (multiple nodes suddenly aligning in a way that deviates from prior baseline) surfaced as maintainer alert. Node reputation signals: evidence-consistency, uptime, adoption-success rate, rollback rate.

**Meta-observability:** Network dashboard shows scanner hit rate trend, sandbox calibration (PASS precision + recall against maintainer decisions), proposal time-from-evidence-to-release, release adoption lag per channel, rollback rate per release, clade fecundity, cognitive-mutation approval rate. Flag: scanner itself degrading (hit rate drops 4 weeks running) triggers a top-level Improvement Card — "the improvement engine is getting worse; here are candidate causes." The engine reflecting on its own decay.

**Exit criteria:** Synthetic adversarial evidence injected into staging triggers maintainer alert within 1 cycle. Node with reputation < threshold has evidence weight reduced appropriately. Dashboard visible in admin. Self-degradation synthetic triggers top-level alert within 7 days.

### Sub-brief 194 — Dev Pipeline Integration for Engine-Level Changes

Close the loop for code changes.

When a proposal requires engine-level change (new harness handler, new content-block type, new system agent, schema addition, new integration), it must route through the dev pipeline to produce code. The dev pipeline already exists (`src/dev-pipeline.ts`, `/dev-*` roles). This sub-brief wires the scanner → dev pipeline handoff at the network layer.

**Flow:** Scanner produces structural proposal with draft ADR → maintainer approves ADR → dev pipeline invocation: PM reads ADR + evidence → Researcher confirms no existing solution → Architect writes brief → Builder writes code + tests + migration → Reviewer validates → merge to network repo → next release manifest includes new engine version. Nodes adopt per their policy.

**Constraint:** Code-changing proposals are auto-classified as structural and route to this flow. Only additive code changes eligible (new files, new handlers prepended/appended, new tables). Semantic changes to existing handlers, trust computation, or `@ditto/core` interfaces are blocked at the proposal classifier and require human-authored ADR before the dev pipeline can start.

**Validation:** Beyond existing dev-pipeline review, engine changes get replay-corpus validation: last 30 days of node-contributed replay traces (consent-gated) are run against the proposed engine change in shadow; any material behavioral divergence is a review blocker.

**Exit criteria:** One approved L2 proposal round-trips through dev pipeline to merged release with engine version bump. One adversarial code-change proposal (tries to modify existing trust computation) is blocked at the classifier. Replay-corpus validation catches a hand-seeded breaking change.

## User Experience

### Network maintainer (central)

- **Jobs:** Orient (network health), Review (pending release approvals), Decide (approve/reject/request-changes), Orchestrate (set rollout pacing)
- **Primitives:** Admin dashboard (new Improvements view), Release manifest review UI, Rollout controls, Health metrics
- **Flow:** Daily — glance at dashboard, review any proposals pending (2–10/week at steady state), approve/reject/request-changes. Weekly — release signing session, review canary telemetry, approve partial/full rollout. Monthly — review scanner health metrics, adjust gates or budget if drift.

### Node operator

- **Jobs:** Orient (what updates are available/applied), Decide (accept or reject incoming updates, set policy)
- **Primitives:** `ditto updates` CLI, Update Card (new Content Block), Adoption policy config
- **Flow:** Rare — most updates auto-apply per policy. Operator sees Update Cards in Daily Brief for anything that queued for review (per tier). Set-once policy: pick channel (stable/beta/nightly), pick per-tier rules (additive auto / structural review / cognitive shadow-then-apply). Never see individual proposals — those are the maintainer's job.

### End user (workspace user)

- **Jobs:** None directly. Benefits flow through as improved process outputs, better cognitive framing, faster responses. User may see "updated to version X" notification in Daily Brief — informational only.

## Acceptance Criteria

1. [ ] Phase 9 in `docs/roadmap.md` flipped from `deferred` to `done`
2. [ ] ADR-031 + ADR-032 accepted, referenced from architecture.md
3. [ ] 3+ dev nodes emitting evidence to staging network for 30+ days; evidence volume / signal type dashboard populated
4. [ ] PII audit: hand-audit 100 random evidence payloads — zero PII present
5. [ ] Total-opt-out verified on a node configured `evidence.enabled: false`
6. [ ] K-anonymity threshold rejects sub-threshold signals (verified with synthetic test)
7. [ ] Scanner produces ≥10 approved proposals across L2/L3/LC/engine layers in 30-day burn-in
8. [ ] Sandbox PASS precision + recall against maintainer decisions tracked; baseline captured for future comparison
9. [ ] At least one meta-scanner-approved scanner-strategy edit shipped; proposal distribution visibly shifted in following cycle
10. [ ] At least one cross-node-validated cognitive-mode edit shipped via full pipeline
11. [ ] `cognitive/core.md` + `cognitive/self.md` allowlist enforcement verified: adversarial proposal rejected at release-builder, not just at review
12. [ ] `improvement-scanning.md` edited by a scanner proposal at least once (L5 × LC composition proof)
13. [ ] Full round-trip verified: proposal → approval → signed manifest → canary → partial → full across staging network
14. [ ] Tampered manifest rejected by node signature verification
15. [ ] Per-tier adoption policy tested — autonomous auto-applies, supervised queues, critical opts out
16. [ ] Rollback tested end-to-end on staging — one command reverts, telemetry captured
17. [ ] Adversarial evidence simulated — maintainer alert fires within 1 cycle, reputation discount applied
18. [ ] Self-degradation simulated — network scanner flags its own decline within 7 days
19. [ ] Engine-level change round-trips through dev pipeline to release (at least one additive handler shipped this way)
20. [ ] Replay-corpus validation catches a seeded breaking engine change
21. [ ] Network-level kill-switch halts scanner + release publication within one cycle
22. [ ] Budget depletion verified — network pauses scanner at 100% weekly; in-flight completes; next period resumes
23. [ ] Node-level kill-switch — `ditto updates pause` halts incoming; still receives signed manifests but defers adoption indefinitely
24. [ ] Reward-hacking audit: curated adversarial proposals rejected by sandbox ≥9/10
25. [ ] All new tables have migration files, journal ids verified, SQL matches per Insight-190

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + ADR-025 + ADR-015 + ADR-022 + this brief
2. Review agent checks:
   - Does evidence-emission enforce the allowlist correctly? Is there any type-level leak path?
   - Is the signature model actually sound (key storage, rotation, revocation)?
   - Do node adoption policies compose correctly across tiers and release types (matrix exhaustive)?
   - Is the frozen-paths allowlist enforced at release-builder, not just at scanner? (Can't rely on scanner honesty)
   - Is the kill-switch at each layer actually reachable from every state the system can be in?
   - Reward-hacking surface: what's the single metric a malicious scanner strategy could game, and what stops it?
   - Privacy: does the combination of allowlisted signal types enable re-identification in aggregate?
   - Insight-180 invocation guards on all external-side-effect functions
3. Fresh-context reviewer reads the brief as adversary: "how would you break this?" Capture as test cases.
4. Privacy review: separate pass specifically on evidence types — do any permit inference attacks when combined?
5. Present work + all reviews to human; human decides.

## Smoke Test

```bash
# 1. Network-side sanity
DITTO_DEPLOYMENT=public pnpm cli sync
pnpm cli inspect network-scanner

# 2. Node-side sanity
DITTO_DEPLOYMENT=workspace pnpm cli sync
pnpm cli updates channel  # should default to stable

# 3. Seeded evidence flow on staging network (3 nodes)
./scripts/test-network-evidence.sh --nodes=3 --days=7
# Expect: evidence dashboard populated, scanner has enough signal for first run

# 4. Scanner + sandbox + archive on seeded cohort
pnpm cli test:network-scanner --cohort=./test/fixtures/known-patterns
# Expect: ≥1 proposal, sandbox verdicts, archive entry

# 5. Adversarial reward-hack proposals
pnpm cli test:network-scanner --adversarial=./test/fixtures/reward-hack-proposals.json
# Expect: ≥9/10 rejected

# 6. Full release round-trip
pnpm cli network-admin approve <proposal-id>
pnpm cli network-admin sign-release <release-id>
# On node:
pnpm cli updates list
pnpm cli updates apply <release-id>  # or wait for auto-apply per policy
pnpm cli updates status

# 7. Signature tampering
./scripts/test-tampered-manifest.sh
# Expect: node rejects with signature error

# 8. Rollback
pnpm cli updates rollback <release-id>
pnpm cli updates status  # verify reverted

# 9. Kill-switches
# Network:
pnpm cli network-admin improvements pause
# Node:
pnpm cli updates pause
```

## Budget & Governable Quality Gates

Two-layer model — network and node — each with independent budget and gate surfaces. Quality gates dominate budget everywhere.

### Network-layer budget (network maintainer controls)

| Tier | Default | Purpose |
|------|---------|---------|
| Weekly total (network LLM spend) | $500/week | Scanner + sandbox + dev pipeline invocations combined. Paused at 100%, warned at 90% |
| Per-layer allocation (optional) | scanner 15% / sandbox 35% / dev-pipeline 40% / meta 10% | Caps per layer as % of weekly |
| Per-proposal predicted-cost cap | $100/proposal (dev pipeline ship cost) | Proposals predicted to exceed surface as "suggestion" not queue-for-dispatch |

### Network-layer gates (maintainer-tunable, `config/network-learning.yaml`)

```yaml
budget:
  weekly_total_usd: 500
  per_proposal_predicted_cost_usd: 100
  layer_allocation: {scanner: 15, sandbox: 35, dev_pipeline: 40, meta: 10}
  attribution_window_days: 30

gates:
  sandbox:
    min_contributing_nodes: 10         # cross-node evidence required
    min_replay_traces: 50              # per proposal
    adversarial_rejection_threshold: 0.9
    per_dim_thresholds:
      approval_rate:          {min: 0.60}
      correction_rate:        {max: 0.25}
      confidence_calibration: {min: 0.70}
      response_latency:       {max_regression_pct: 15}
      overconfidence:         {max: 0.10}

  cognitive:
    min_process_coverage: 3
    min_evidence_nodes: 5              # distinct contributing nodes
    min_evidence_weeks: 2
    metacognitive_reviewer_count: 2
    frozen_paths: [cognitive/core.md, cognitive/self.md, packages/core/src/interfaces.ts]

  release:
    canary_cohort_pct: 5
    canary_dwell_days: 3
    partial_cohort_pct: 25
    partial_dwell_days: 4
    max_rollback_rate_in_stage: 0.05   # >5% rollbacks aborts the rollout

  adversarial:
    outlier_sigma_threshold: 2.0
    reputation_floor: 0.2              # below this, evidence weight → 0
    coordinated_divergence_alert_threshold: 0.4
```

### Node-layer budget (node operator controls)

Nodes have no budget for scanner (runs centrally). Their relevant cost is LLM cost of applying shadow-mode updates (running both old and new pipelines side-by-side during canary/shadow stages). Default cap: $5/week/node, tunable.

### Node-layer gates (operator-tunable, `config/ditto.yaml`)

```yaml
learning:
  evidence:
    enabled: true                       # total opt-out switch
    signal_types:
      harness_decisions: true           # core — default on
      trust_drift: true                 # core — default on
      correction_classes: true          # core — default on
      mode_outcome_correlation: true    # rich — default on
      failure_pattern_hashes: false     # rich — default off
      replay_traces: false              # strictest — opt-in per type
    emission_cadence_hours: 1
    batch_size: 100

  updates:
    channel: stable                     # stable | beta | nightly
    auto_apply:
      additive: true                    # e.g. new template version, cognitive tweak
      structural: false                 # e.g. new harness handler — queue for operator review
      engine_code: false                # always queue
    shadow_mode:
      enabled_for: [cognitive, structural]  # run shadow for N days before committing
      shadow_days: 3
    rollback_authority: true            # operator can rollback any update
    paused: false                       # total opt-out switch

  local_scanner:
    enabled: true                       # lightweight local scanner for your own customs
    max_weekly_spend_usd: 5
```

### Two practical rollout patterns

- **Start narrow, expand channels.** First month: dogfood nodes only on nightly. Second month: team nodes on beta. Third month: friendly users on stable. Evidence depth grows; maintainer calibration grows; rollout cadence stabilizes.
- **Separate learning from shipping.** Network can run scanner + sandbox + approve proposals but hold release publication. Nodes stay on the current release. Useful for building up archive depth before the first real ship.

### Gaming the system

At network scale, reward-hacking surfaces change. Potential attacks:
- Malicious nodes submit fake evidence to steer updates toward a specific outcome → outlier detection + reputation weighting + k-anonymity defend
- Scanner evolves toward proposing minor cosmetic changes (high approval rate, low impact) → hit rate must weight by ROI attribution, not raw approval count
- Sandbox precision drifts (PASS no longer predicts real-world success) → meta-observability flags, triggering sandbox recalibration proposal
- Release rushes (maintainer approves too fast under pressure) → required dwell times at each rollout stage, no manual skip without explicit override that's audit-logged

## Open Questions (Resolve Before Starting Sub-brief 189)

1. **Signing key management.** Where does the network release signing key live? Candidate answer: air-gapped hardware token; fallback HSM; ceremonies for rotation. Defer final choice to ADR-032 but this brief must note the dependency.
2. **Replay trace consent model.** Is "share aggregate evidence" opt-in sufficient, or do replay traces (actual step_run samples, anonymized) require a separate, stricter opt-in? Strong preference: separate opt-in, default off, with a clear "why this is different" in consent UI.
3. **Cross-tenancy in aggregation.** If nodes A and B both run the same template X, the template is shared by construction. But if they extended it with custom cognitive content, is that content shared in evidence? Candidate: allowlist only references the template version hash, never the delta. Per-node customizations stay local.
4. **Rollout stage gating on rollback rate.** A 5% rollback rate during canary aborts the rollout. But what if rollbacks are for user-specific reasons unrelated to the release? Candidate: attribute rollbacks to causes via mandatory rollback reason field; only abort when rollback reason aligns with release content.
5. **Release cadence.** Target weekly, but what's the rhythm when archive is thin? Start at monthly, accelerate as evidence deepens? Candidate: adaptive cadence driven by maintainer-approval throughput.
6. **Engine-version divergence between nodes.** At any moment, the network has nodes on various engine versions (some pinned, some behind). How does the scanner reason about proposals when evidence comes from heterogeneous versions? Candidate: evidence carries engine-version in payload; scanner aggregates per-version; proposals target version ranges.
7. **Cognitive content layering.** A node's local cognitive customizations (e.g. user overrode a mode prompt) + incoming cognitive update — who wins? Candidate: three-way merge like config file management (apt `Dpkg::Options::=--force-confold` pattern); user customization wins unless explicitly marked auto-accept.

8. **Integration provisioning — local creation vs network curation.** Category D in the engine-change table (§Phasing / Sub-brief 194) as drafted routes new integrations through scanner → maintainer → release. Stress-test reveals this blocks individual users on integrations the network doesn't yet know are wanted (single-node demand produces no network evidence; k-anonymity floor blocks action). Three lanes plausibly exist: (a) **local creation** — node-level, via Brief 037 codegen or Self-assisted YAML authoring, private unless opted to share shape; (b) **runtime discovery** — no YAML at all, via Zapier SDK (Brief 113), browser protocol (Briefs 182–184), or Stagehand `browse_web` (Brief 134); (c) **network curation** — scanner proposes *promotion* of convergent local creations to canonical signed releases, rather than proposing up-front creation.

   Architect to resolve in ADR-033 (Network-Scale RSI Architecture §5 resolves this question as of 2026-04-17):
   - Does the scanner *propose creation* (current Brief 181 draft) or *propose promotion* of convergent local creations?
   - If promotion: what allowlisted aggregate signal represents "integration shape convergence" without leaking endpoints or credentials? Candidate: `integration_created` with `{service_name_hash, protocol_type, operation_count, auth_pattern}`. Service-name hashed over an enumerated vocabulary to prevent free-text injection.
   - Merge UX when a node has a local version and the network ships canonical: three-way merge per `apt Dpkg::Options::=--force-confold`? Auto-replace for autonomous tier, prompt for supervised?
   - Scope of local creation: Self generates YAML during conversation, or CLI-only (`ditto generate-integration`)? Brief 113 lets Self discover and invoke Zapier actions already; the open question is whether Self can *persist* a new YAML without dev pipeline involvement.
   - Relationship to Insight-164 (Zapier SDK as primary integration path) — if Zapier covers the long tail at runtime, local YAML creation is a niche for services Zapier doesn't cover *and* that warrant first-class typed tool shapes. Architect should state this boundary explicitly.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| PII leaks through evidence despite allowlist | Allowlist enforced at type level; hand audits during burn-in; k-anonymity threshold; never free-text; privacy review as separate pass in Review Process |
| Signed release key compromise | Key ceremonies; rotation with overlap; node-side freshness checks; kill-switch revokes old signatures |
| Malicious node emits fake evidence to steer | Reputation-weighted aggregation; outlier detection; k-anonymity minimums; coordinated-divergence alerts |
| Scanner reward-hacks toward cosmetic proposals | ROI-weighted hit rate (not raw approval count); sandbox adversarial fixtures; maintainer-approval rate sanity-check |
| Bad release hits production | Canary → partial → full staging; per-stage rollback-rate gating; one-command rollback per node; shadow-mode for cognitive/structural |
| Engine-version heterogeneity produces bad proposals | Evidence carries engine-version; scanner reasons per-version; proposals target version ranges |
| Sandbox calibration drifts (PASS stops predicting reality) | Meta-observability tracks sandbox precision/recall vs maintainer decisions; recalibration proposal triggered |
| Dev pipeline produces non-compiling code | Existing dev-pipeline reviewer gate + replay-corpus validation on engine changes; release-builder runs `pnpm run type-check` pre-sign |
| Node adopts update that breaks local customization | Three-way merge for cognitive content; rollback authority on every node; shadow-mode first for high-risk release types |
| Maintainer rubber-stamps proposals under time pressure | Required dwell times at each rollout stage; proposal queue forces review order; audit log catches skip patterns |
| Network becomes single point of failure | Update channel is HTTP pull; nodes can function indefinitely on their current release without network reachability; evidence emission degrades gracefully (queue + retry) |
| Too few nodes, statistically thin even at network | Staged rollout can't start on thin archive; first 3 months operates as "observe mode" across dogfood nodes before first real release |

## What Recursion Looks Like After This Brief

**Month 1.** Evidence pipeline live. 3 dev nodes (you + team) emitting to staging network. Signal volumes growing; scanner silent (archive building).

**Month 2.** Scanner produces first proposals from aggregated evidence. Most are L2 template tweaks. Sandbox catches obvious bad ones. Archive has depth. First release signed, shipped to nightly channel, pulled by dogfood nodes in canary. Feedback telemetry comes back; some rollbacks; scanner learns from rollback reasons.

**Month 3.** First stable-channel release. Network expands to 5 nodes (friendly beta users). Scanner proposes first L3 change (role contract tweak). First meta-scanner proposal approved — scanner's own prompt evolves. Distribution shift visible in next cycle.

**Month 4.** First engine-level change round-trips through dev pipeline to release manifest. New harness handler shipping. All nodes adopting per their policies. First cross-node-validated cognitive update under review.

**Month 6.** 50 nodes. Weekly release cadence natural. Scanner hit rate measured month-over-month; trending up. First adversarial evidence detected and discounted in production. First scanner-proposes-edit-to-`improvement-scanning.md` — the cognition governing how the scanner evaluates improvements evolves from its own results. L5 × LC composition live.

**Month 12.** Month-12 engine is measurably more capable than month-1 engine on the same benchmark. Proposal hit rate trending up. Maintainer time per release trending down. Node rollback rates trending down. The system is recursively, measurably, continuously improving itself — at network scale, under maintainer approval at leverage, with node operators free to adopt per their risk appetite, and with evidence that no single-node architecture could possibly produce.

That is what recursive self-improvement means for Ditto: not an autonomous loop that edits its own weights, not a per-node approval ceiling, but a network-scale learning flywheel that compounds across every workspace, ships signed releases on a natural cadence, and gets measurably better at getting better — every week, under human oversight at the right leverage point, on the same harness and trust rules that govern every other piece of work in the system.

## After Completion

1. Update `docs/state.md` — network learning pipeline live, release cadence established
2. Update `docs/roadmap.md` — Phase 9 `done`, sub-briefs linked
3. Update `docs/architecture.md` §Self-Improvement Meta-Process — replace the single-node framing with the network-scale model, reference this brief and the ADRs
4. Update `docs/landscape.md` — reaffirm DGM / HGM / compound-product evaluations against what we actually built
5. Phase retrospective. Each sub-brief contributes a paragraph. Specific attention: did privacy survive contact with reality? did reward hacking appear? did scanner self-evolution actually improve hit rate or just churn?
6. ADR-031 (architecture) + ADR-032 (release distribution) accepted
7. `docs/insights/181-network-scale-rsi.md` — durable lessons, especially what diverged from this brief's predictions
