# ADR-033: Network-Scale Recursive Self-Improvement Architecture

**Date:** 2026-04-17
**Status:** proposed
**Depends on:** ADR-015 (meta-process architecture), ADR-022 (critical evaluation), ADR-025 (centralized network service), ADR-030 (deployment-mode flag)
**Companion ADR:** ADR-034 (Release Distribution Model) — resolves the signing/distribution/rollout questions; this ADR covers architecture-layer decisions above distribution.

## Context

Brief 181 (`docs/briefs/181-recursive-self-improvement.md`) proposes a network-scale recursive self-improvement loop: evidence flows node→network via opt-in allowlisted signals, the central scanner proposes improvements from aggregated cross-node evidence, the central dev pipeline produces signed release manifests, nodes adopt per trust-tier policies. Brief 181 enumerates five sub-briefs (182–188, subject to renumbering per the brief's own collision note) and surfaces eight open questions for the Architect.

This ADR resolves the five architecture-layer questions. ADR-034 resolves the three distribution-layer questions.

Questions resolved here:
- **Q4** Replay trace consent model — aggregate vs per-trace
- **Q5** Cross-tenancy in evidence aggregation — what crosses the node/network boundary when nodes customize locally
- **Q7** Cognitive content merge UX — 3-way merge on adoption
- **Q8a** Engine-version divergence between nodes — how the scanner reasons about heterogeneous versions
- **Q8b** Integration provisioning — three-tier local/runtime/network (stress-test driven)

Questions deferred to ADR-034: signing-key management (Q1), rotation cadence (Q2), offline tolerance (Q3), rollout stage gating with rollback attribution (Q6), release cadence (Q7-release).

### Forces

| Force | Pulls toward |
|-------|-------------|
| Statistical validity at network scale | Aggregate cross-node evidence |
| User data sovereignty (ADR-018) | Per-node evidence stays local unless opted |
| Insight-111 (explicit-vs-implicit signal separation) | Learning signals never feed trust computation; type-level enforcement |
| Insight-156 (compiled knowledge layer — network-vs-workspace split) | Person-scoped on network, self-scoped on workspace — same pattern for learning |
| Trust at leverage, not per-change | Maintainer approves network-level releases, not per-user |
| Node autonomy, especially self-hosted | Nodes choose adoption policy once, not per-update |
| Long-tail integration coverage | Runtime discovery (Zapier/browser) for most cases; YAML niche |
| Per-node customization preservation | User's local edits never silently overwritten by network updates |
| Privacy by construction | Type-level enforcement > runtime sanitization |
| Version heterogeneity across live nodes | Evidence carries version; scanner doesn't average across incompatible contexts |

### Research inputs

- `docs/research/network-scale-rsi-tech-choices.md` — 25 options surveyed across signing, privacy, and canary gating
- `docs/insights/156-compiled-knowledge-layer.md` — the three-tier knowledge architecture pattern that maps onto learning signals
- `docs/insights/111-explicit-implicit-signal-separation.md` — the hard constraint that trust uses only explicit signals
- `docs/briefs/complete/091-fleet-upgrades.md` — Ditto's existing rollout primitive (extended in ADR-034)
- Insight-180 — spike-test every new API; applies to evidence emission and update adoption hot paths

## Decision

### 1. Three-tier evidence consent model (resolves Q4)

Evidence emitted from node to network is governed by three consent tiers, configured in `config/ditto.yaml` under `learning.evidence`. Tiers correspond to the sensitivity of the signal, not the analytical value.

| Tier | Default | Signal types included | Consent surface |
|------|---------|----------------------|-----------------|
| **Core** | opt-in default | Harness decisions (action/actor/tier), trust drift deltas, correction classifications (severity + direction only), adoption-telemetry (which updates applied/rolled-back and why — see §1a for Insight-111 firewall) | `config/ditto.yaml: learning.evidence.signal_types.core: true` (default true); onboarding prompt confirms default |
| **Rich** | opt-in by explicit flag | Mode-outcome correlation, failure-pattern hashes, friction-pattern signals, template edit convergence signals | `config/ditto.yaml: learning.evidence.signal_types.rich.<type>: true` (default false); operator enables per type |
| **Replay traces** | strictly separate opt-in | Sampled, anonymized step_run payloads (input + output + LLM model id) for sandbox validation | `config/ditto.yaml: learning.evidence.replay_traces: true` (default false); separate consent UI explaining "why this is different" with an example diff showing PII stripping |

**Enforcement:** Node-side emitter in `src/engine/node-learning/evidence-emitter.ts` (from Sub-brief 182) must route every signal through a type-level allowlist before transmission. Tier is attached to each signal type at the type level, not at runtime. Attempts to emit a signal whose declared tier is disabled must fail at compile time (type system) or at the allowlist check (runtime), never silently drop.

**Rationale:** The three tiers reflect three distinct trust relationships between node operator and network. Aggregating them into one "opt-in" switch would either under-share (blocking useful core signals) or over-share (letting sensitive replay payloads flow under the same blanket consent). The consent surface separation was the explicit question in Q4; the tiering makes it concrete.

**1a. Insight-111 firewall for rollout-gating signals (adoption-telemetry).** Adoption-telemetry in the core tier carries `rollbackReason` (ADR-034 §4) which feeds an automated gate (rollout abort at threshold). Insight-111 forbids learning signals from feeding *trust computation*. This ADR draws the firewall explicitly: rollout-gating is a *distribution-layer* decision over aggregated, identity-blind evidence; it does NOT feed per-node trust tier computation, does NOT feed per-node reputation (Sub-brief 186 reputation is derived from emission-consistency and adoption-success metadata only, not rollback reasons), and does NOT flow through the feedback-recorder into any per-node memory or trust state. A rollback with reason `matches_release_content` on Node X contributes to the network's decision to abort/continue the release; it changes nothing about Node X's standing. Implementation: the aggregator that computes rollback-weight must operate on hash-of-nodeId, not nodeId; the abort decision must never dereference individual nodes back to identity for trust use. This firewall is load-bearing for Insight-111 compliance and must be auditable in Sub-brief 182's type-level allowlist review.

### 2. Template-version-hash cross-tenancy boundary (resolves Q5)

When a node customizes a shared template locally, the local customization stays local. Evidence emitted from the node references only the **template version hash** the customization started from, plus a **customization category** (enumerated: `step_added`, `step_removed`, `tool_set_changed`, `cognitive_context_added`, `trust_tier_overridden`, etc.), plus the **classification of the outcome** (approval rate, correction rate, trust drift) observed on the customized version.

Never emitted:
- The text of the customization (new step prompts, added tool definitions)
- Any content the customization produces when executed (outputs, memories, correction text)
- The identity of the user who made the customization

**Enforcement:** `src/engine/node-learning/evidence-emitter.ts` accepts only typed shapes from a compile-time enum; the type for "customization convergence" has no free-text fields by construction. Peer review at sub-brief 182 time must audit the type definitions against this rule explicitly.

**Promotion path:** If N nodes (k≥5 per ADR-034 threshold) show the same customization category on the same template version hash correlating with positive outcome metrics, the scanner proposes *a template update* — not the customization content (which the network never sees) but a follow-up investigation: "Many nodes are customizing template X in category Y with positive outcomes; consider reviewing template X." The investigation produces the actual content via ordinary architect/dev-pipeline flow, grounded in maintainer judgment and dogfood evidence, not in node-local deltas.

**Rationale:** Insight-156 establishes that person-scoped data lives on the network and self-scoped data lives on the workspace. Customizations are the user's authorship on top of a shared template — that's closer to self-scoped than shared-scoped. The template-version-hash boundary encodes this cleanly: the shared concept (the template) crosses; the user's authorship (the delta) does not.

### 3. Cognitive content adoption: three-way merge, user wins by default (resolves Q7)

When the network ships a cognitive content update (e.g., new version of `cognitive/modes/selling.md`) and a node has a local customization of the same file, adoption uses a **three-way merge** keyed on: (a) the version the node started from, (b) the node's current local customization, (c) the network's new version.

Merge behavior, per adoption policy tier:

| Trust tier | Default on clean merge | Default on conflict |
|------------|----------------------|---------------------|
| Autonomous | Apply automatically | Keep local, queue Merge Card in Daily Brief |
| Spot-checked | Apply with audit log entry | Keep local, queue Merge Card |
| Supervised | Queue Merge Card for every cognitive update, clean or conflicted | Queue Merge Card |
| Critical | Never auto-apply cognitive updates; update available but not installed | Never auto-apply |

**User-wins-on-conflict default:** On merge conflict, the node's customization is preserved. The network's new version is available via `ditto updates show <id>` and can be manually applied with `--force-network` or merged interactively. This matches apt's `Dpkg::Options::=--force-confold` default — user customization is load-bearing unless they explicitly choose otherwise.

**Merge Card surface:** When a merge is queued for review, it appears as a Merge Card ContentBlock in the Daily Brief. Card shows: (1) what the network changed (3-way diff summary), (2) what the user's local customization does (3-way diff summary), (3) three actions (`Accept network`, `Keep local`, `Merge manually via Self conversation`).

**Allowlist-frozen paths exempt — manual reconciliation, not 3-way merge:** `cognitive/core.md`, `cognitive/self.md`, and `packages/core/src/interfaces.ts` are frozen at the network layer (scanner cannot propose edits per Brief 181). Because the network never proposes changes to these files, a node with a local edit has no "prior upstream version" on the branch that produced the local edit — the node's local is effectively its own fork. When the maintainer ships a manually-authored update to one of these paths, the node's update-adopter does not attempt a 3-way merge; it queues a **Manual Reconciliation Card** regardless of trust tier. The card presents the full network version and the local version side-by-side and offers three actions: `Accept network (replace local)`, `Keep local (mark diverged)`, `Conversational merge via Self`. Choosing `Keep local (mark diverged)` records the divergence in `activities` and suppresses future prompts for this file until the next network update. This is distinct from the 3-way merge path in the tier table above, which applies only to non-frozen paths.

**ADR-015 interaction — structural cognitive changes require review regardless of trust tier.** ADR-015 establishes that structural changes (changed flow, new steps, changed semantics) always require human approval regardless of trust tier. Some cognitive updates are structural by this definition — a mode that changes its refusal patterns, a metacognitive-check prompt that changes its escalation behavior. For cognitive updates, the release manifest declares an `impact` field: `additive` (new mental model entry, refined wording, tightened criteria) vs `structural` (changed refusal patterns, changed escalation, changed authority boundaries). Autonomous-tier auto-apply only applies to `additive`. `Structural` cognitive updates queue for operator review at every tier. Spot-checked and supervised tiers queue both kinds. The `impact` field is maintainer-authored at release time; mis-classification is caught by the mandatory deliberative-perspectives review step per ADR-028.

### 4. Engine-version heterogeneity: version-scoped aggregation (resolves Q8a)

Every evidence payload carries the node's engine version (`@ditto/core` semantic version) at emission time. The network aggregator partitions evidence by **engine version range** (major.minor), not by single exact version. The scanner proposes improvements targeting a version range; the release manifest declares minimum and maximum compatible versions; nodes outside the range defer the update.

**Version partition policy:** Aggregation uses the **minor version** as the grouping key by default. Patch-level differences are ignored (same aggregate bucket). Major-version differences are always separate buckets and never mixed. The grouping is configurable per-signal-type if a signal is known to be semantically stable across majors.

**Pinned nodes:** A node operator can pin their engine version via `config/ditto.yaml: learning.updates.engine_version_pin: "1.4.x"` or at the per-process level via the process definition's `engine_version` field. Pinned processes receive no engine updates; the rest of the node updates normally. Scanner evidence from pinned nodes is still collected and is tagged with the pinned version; proposals targeting newer versions do not draw from pinned-version evidence.

**Divergence alerting:** When the bulk of active nodes lag the network's current release by more than two minor versions, the maintainer dashboard surfaces a "version sprawl" indicator. Useful data; not an auto-action.

### 5. Integration provisioning: three-tier local/runtime/network (resolves Q8b)

Resolves the stress-test question surfaced after Brief 181 was drafted. Three lanes exist, each with a distinct mechanism and trust model.

**Lane A — Local creation.** Node capability. The user (via Self conversation) or operator (via CLI) can create a new integration YAML locally. Self uses existing Brief 037 codegen against an OpenAPI spec, or converses with the user to capture service details and generate the YAML, or browses the service's API docs via Stagehand `browse_web` (Brief 134) and synthesizes. The new integration lives in the node's DB. Works immediately. Never transmitted to the network unless the user opts in to share the shape.

Local integration trust tier defaults to `supervised` regardless of the node's other trust settings — a locally-authored integration gets the same scrutiny as a new externally-proposed process.

**Lane B — Runtime discovery (no YAML).** For most long-tail services, the user doesn't need a YAML at all. Three runtime paths, in order of preference:
1. **Zapier SDK** (Brief 113) — dynamic tool discovery across 9,000+ services; Self invokes at conversation time; no persistent artifact. Insight-164 establishes this as the primary integration path.
2. **Browser protocol** (Briefs 182–186) — for authenticated SaaS without API access. Self invokes; session-capture + fingerprint-matching governs trust.
3. **Stagehand `browse_web`** (Brief 134) — read-only for research, extraction, data gathering. No write operations.

Lane B is expected to handle the majority of net-new integration needs without producing any integration artifact. The exact fraction is unknown and will be measurable in telemetry once Sub-brief 182 ships; until then, "expected majority" is the honest claim.

**Lane C — Network curation (promotion, not creation).** The scanner never proposes creation of a new integration from scratch. Instead, it proposes **promotion** of convergent local creations: if ≥k nodes (k=5 per Brief 181's privacy constraint) have independently created local integrations for the same service (matched on `service_name_hash` over an enumerated vocabulary), the scanner surfaces a maintainer proposal to curate a canonical YAML for that service.

Maintainer reviews, runs the ordinary dev pipeline (researcher confirms shape, architect validates against ADR-005 integration architecture, builder writes YAML, reviewer validates), produces a signed release. Nodes with local versions get Merge Cards on adoption (per §3 rules); nodes without get the new integration added.

**New evidence signal (added to §1 core tier):** `integration_created` with fields:
- `service_name_hash` — hash over an enumerated vocabulary of ~500 common service names. Prevents free-text injection. Scanner can see "many nodes created an integration for service X" without learning which endpoints or credentials are involved.
- `protocol_type` — enum: `cli | rest | mcp | browser`
- `operation_count` — integer, tool count in the local YAML
- `auth_pattern` — enum: `api_key | oauth2 | basic | session_cookie | none`

No endpoint URLs, no credential schemas, no request/response bodies, no header names.

**Joint-tuple k-anonymity at receiver (Reviewer's joint-distribution concern).** Individual fields above are non-identifying; the joint tuple `(service_name_hash, protocol_type, auth_pattern)` across a node's lifetime is a usage fingerprint ("node X has Salesforce via OAuth2 + HubSpot via OAuth2 + Zapier via API key"). The receiver must enforce k-anonymity over the joint tuple, not just per-field: before a joint tuple becomes actionable to the scanner or surfaces in maintainer dashboards, the aggregator must confirm ≥5 distinct nodes have contributed signals with an overlapping joint-tuple subset. Signals that don't meet the threshold are retained in `networkEvidence` but are not queryable by scanner code paths until threshold is met. This is a stricter requirement than the per-signal-type k-anonymity floor in Brief 181 and must be implemented as a SQL-level constraint in Sub-brief 182's aggregator, not an application-level check.

**Rationale:** The stress test revealed that Brief 181's original "Category D — scanner proposes creation" routed all new integrations through a centralized pipeline, blocking individual users on long-tail services. The three-tier split preserves user sovereignty (Lane A works today), leans on runtime discovery for the long tail (Lane B covers most cases), and reserves centralized effort for the genuinely valuable middle (Lane C, proven via evidence). The `integration_created` signal turns per-node creation into aggregate demand signal without leaking endpoint specifics.

## Provenance

| Decision | Source | What we took | What we changed |
|----------|--------|--------------|-----------------|
| Three-tier consent model | Original to Ditto; informed by GDPR granular consent + Apple App Tracking Transparency's per-type prompts | Pattern: separate consent tiers for distinct trust relationships | Tiers defined by trust relationship, not by technical mechanism |
| Template-version-hash boundary | Insight-156 (compiled-knowledge-layer) + apt package-metadata-vs-config split | Principle: shared concept crosses, user authorship does not | Encoded as type-level boundary at emission, not runtime sanitization |
| Three-way merge on cognitive adoption | Debian apt `Dpkg::Options::=--force-confold` + Git three-way merge | Pattern: user customization wins by default; merge UI surfaces conflicts | Applied to cognitive content specifically; tiered by trust level |
| Version-scoped aggregation | Semantic versioning convention + Kubernetes API version compatibility model | Pattern: partition by minor version, alert on wide divergence | Adapted to evidence aggregation; network explicit about compatible ranges |
| Three-tier integration provisioning | Composition: npm (package ecosystem) + Zapier (dynamic catalog) + browser automation | Pattern: local + runtime + curated-registry layered provision | Layering specific to Ditto's integration types; promotion-not-creation for network lane |
| `integration_created` signal shape | Original to Ditto | — | Enumerated vocabulary prevents free-text injection; fields chosen to enable convergence detection without leaking specifics |

## Consequences

### What becomes easier

- **User provisioning a new integration is never blocked on the network.** Lane A (local) works in minutes; Lane B (runtime) works on conversation cadence; Lane C (network) exists but is not a blocker.
- **Maintainer time scales.** The network curates what's proven valuable (Lane C); the long tail is handled by runtime discovery without maintainer effort.
- **Privacy audit is tractable.** The type-level allowlist means privacy review is a schema audit, not a runtime content audit.
- **Version heterogeneity is explicit.** Scanner reasons about compatible versions rather than assuming everyone is current.
- **Node operator has a durable trust relationship with the network.** Set adoption policies once; cognitive and engine updates flow per policy; never surprised.
- **Insight-156's network-vs-workspace split extends naturally** to learning signals — the template-hash boundary is the same idea at a finer grain.

### What becomes harder

- **Scanner loses visibility into customization content.** If template X is being customized in category Y by many nodes but no one shares the content, the scanner can only surface "investigate this" not "here's a proposed canonical update." Maintainer judgment plus dogfood nodes fill the gap.
- **Three consent tiers add configuration surface.** Node operators have more to set up. Mitigated by good defaults and clear onboarding consent flow.
- **Three-way merge infrastructure must be built.** Git-style three-way merge on YAML and Markdown is non-trivial. First iteration can be simpler (take user's file on any conflict, show diff to operator) and evolve.
- **`integration_created` vocabulary must be maintained.** The enumerated service-name hash table needs curation. Adding a new service name to the vocabulary is a maintainer action, not a user action. Trade-off: vocabulary lag vs privacy guarantee.

### New constraints

- Type-level allowlist enforcement in evidence emitter is load-bearing for the privacy model. Every evidence-type change requires privacy review at sub-brief 182 scope.
- Cognitive content files (`cognitive/modes/*`, step-level `cognitive_context`) become versioned artifacts in release manifests. Sub-brief 184 must handle cognitive content in signed manifests, not just code and template YAML.
- The `integration_created` signal is useless without the enumerated service-name vocabulary. Vocabulary initialization must ship as part of Sub-brief 182, not deferred.
- Pinned engine versions complicate the scanner's proposal-targeting logic. Sub-brief 183 must reason about version ranges, not single versions.

### Follow-up decisions

1. **ADR-034** — Release Distribution Model covers signing, rotation, offline tolerance, rollout staging with rollback attribution, release cadence. Prerequisite for Sub-brief 184.
2. **Service-name vocabulary initialization.** Initial vocabulary of ~500 common service names — source options: Zapier's supported-services list (with permission), BuiltWith category tree, public integration-registry data. Sub-brief 182 design decision.
3. **Three-way merge engine choice.** YAML-aware or treat-as-text? Markdown-aware for cognitive content? Sub-brief 184 design decision.
4. **Version-range targeting UX in scanner proposals.** How does a maintainer see "this proposal applies to engine 1.4.x through 1.6.x, 12 nodes affected"? Sub-brief 183 + maintainer dashboard (sub-brief 186).

## Unresolved open questions

All five architecture-layer questions from Brief 181 are resolved here (Q4, Q5, Q7-cognitive, Q8a, Q8b). Three distribution-layer questions remain — all resolved in ADR-034 (Q1, Q2, Q3, Q6, Q7-release).

No new architecture-layer questions are introduced by this ADR beyond the follow-up decisions listed above, which are sub-brief scope, not ADR scope.
