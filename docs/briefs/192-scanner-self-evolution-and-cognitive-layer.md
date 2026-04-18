# Brief 192: Scanner Self-Evolution + Cognitive Layer Evolution (L5 × LC)

**Date:** 2026-04-17
**Status:** ready
**Depends on:** Brief 190 (Scanner + Sandbox + Archive — this brief evolves the scanner), Brief 191 (Signing + Ceremony), Brief 195 (Rollout Controller), Brief 196 (Node Adoption + Three-Way-Merge basic) — 191+195+196 replace the originally-bundled Brief 191; 192 ships via the composite. ADR-033 (§1 firewall, §3 cognitive merge), ADR-028 (deliberative perspectives), ADR-014 Phase B1 (learning correlation primitives — approach-outcome attribution on step_runs). Brief 181 §Phasing / Sub-brief 192.
**Unlocks:** Brief 193 (Meta-Observability — tracks whether L5 × LC composition actually improves scanner output). Brief 194 can run parallel once 190 + 191 land.

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. Fourth shippable sub-brief. The recursive kernel: the scanner's own strategy evolves from its own output.
- **Capabilities:**
  - `meta-scanner` — a second scanner-strategy-evolution agent that reads the archive after N proposals and proposes edits to the scanner's own prompts + config (Promptbreeder-shaped)
  - `cognitive-evolution` — cross-node mode-outcome correlation aggregator that proposes edits to `cognitive/modes/*`, step-level `cognitive_context`, metacognitive-check handler prompts, deliberative-perspective lenses
  - `three-way-merge` engine for cognitive content adoption at node (per ADR-033 §3)
  - `frozen-paths` enforcement at scanner AND release-builder dispatch (defense in depth)
  - Manual Reconciliation Card for cognitive-content conflicts
  - Scanner versioning in `improvementScannerVersions` table with one-command rollback

## Context

Brief 181 §Phasing / Sub-brief 192 outlines: "The recursive kernel, centrally. Meta-scanner: Every N proposals (default 20), a scanner-strategy-evolution agent run proposes an edit to the scanner's own prompts + config. The edit is itself a proposal — sandboxed by running old-vs-new scanner on the last N evidence windows, comparing proposal distributions. Maintainer-approved, versioned in `improvementScannerVersions`, rollback is one command. Cognitive layer at network scale: Mutation targets: `cognitive/modes/*.md`, step-level `cognitive_context` templates, metacognitive-check handler prompts, deliberative-perspective lens definitions. Fitness signal: cross-node mode-outcome correlation (finally statistically valid at scale). Frozen-paths allowlist strictly enforced..."

This is where the system's improvement capability begins to improve itself. The meta-scanner reads the archive from Brief 190 and produces proposals that change how the scanner reasons. The cognitive evolution loop reads mode-outcome correlation (requires ADR-014 Phase B1 primitives — a hard prerequisite) and proposes changes to shared cognitive content, which is the widest-blast-radius mutation target in the system.

Both flows ship as ordinary proposals through the Brief 191 pipeline. Meta-scanner output is a scanner-prompt-edit proposal that, once approved, gets signed into a release manifest and shipped to the Network's scanner configuration on the next release cycle.

## Objective

Ship the recursive kernel: (a) meta-scanner produces scanner-strategy proposals after every 20 base scanner outputs, sandboxed against last-N evidence windows, shipping via Brief 191 with immediate scanner-version rollback; (b) cognitive-evolution aggregator produces mode-edit proposals from cross-node mode-outcome correlation, gated by ≥5 contributing nodes and ≥3 distinct processes, shipping via Brief 191 with three-way-merge on node adoption; (c) frozen-paths allowlist enforced at both scanner (Brief 190 gate) and release-builder (Brief 191 gate) — defense in depth. First composition proof: scanner proposes an edit to `cognitive/modes/improvement-scanning.md` (the cognition governing how the scanner evaluates proposals); when shipped, subsequent proposal distribution measurably shifts.

## Non-Goals

- **Not implementing cognitive primitive harvesting at node.** Brief 189 already emits `mode_outcome_correlation` as a rich-tier signal. This brief consumes those.
- **Not implementing the Improvement Card or Manual Reconciliation Card ContentBlocks.** Brief 193 ships those.
- **Not implementing automated scanner A/B testing.** Maintainer approval is the gate. Statistical A/B test of competing scanner versions is a future follow-up.
- **Not implementing ADR-014 Phase B1 primitives.** This brief declares Phase B1 a hard prerequisite. If B1 hasn't landed, this sub-brief's first task is to ship B1 (mode attribution on step_runs, approach-outcome aggregation) before evolving cognitive content.
- **Not expanding frozen-paths allowlist.** The allowlist is fixed at `cognitive/core.md`, `cognitive/self.md`, `packages/core/src/interfaces.ts`, `docs/adrs/*`. Adding paths requires a follow-up ADR.
- **Not implementing runtime feature-flag gating of scanner versions.** Scanner version is a config-file declaration read at init; rollback = redeploy with older version. Runtime feature-flag gating is future work if needed.

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing / Sub-brief 192, §Open-Questions 7 (cognitive merge)
2. `docs/adrs/033-network-scale-rsi-architecture.md` §1a (firewall), §3 (cognitive merge UX + ADR-015 additive-vs-structural)
3. `docs/adrs/014-agent-cognitive-architecture.md` — full cognitive framework, especially Phase B1
4. `docs/adrs/015-meta-process-architecture.md` — additive-vs-structural enforcement
5. `docs/adrs/022-critical-evaluation-and-homeostatic-quality.md` §E5 (cross-process failure correlation)
6. `docs/adrs/028-deliberative-perspectives.md` (lens definitions are evolvable here)
7. `docs/briefs/190-network-scanner-sandbox-archive.md` — scanner + archive this depends on
8. `docs/briefs/191-release-distribution-pipeline.md` — shipping mechanism this depends on
9. `docs/briefs/189-evidence-harvest-pipeline.md` — upstream signal source
10. `cognitive/self.md`, `cognitive/core.md` — frozen paths, never modified by scanner
11. `cognitive/modes/` directory — mutable evolution targets
12. `src/engine/harness-handlers/metacognitive-check.ts` — evolvable handler
13. `src/engine/harness-handlers/deliberative-perspectives.ts` — evolvable lens definitions
14. Promptbreeder paper (`arxiv.org/abs/2309.16797`) — mutation-of-mutation-operators pattern
15. STOP paper (`arxiv.org/abs/2310.02304`) — scaffolding-rewrites-scaffolding framing
16. Darwin Gödel Machine — self-modification with human oversight

## Constraints

- MUST pin meta-scanner trust tier `critical` forever. Every meta-scanner proposal requires maintainer approval. No exceptions. Enforced at code, asserted by test.
- MUST NOT permit meta-scanner or cognitive-evolution to propose changes to frozen paths. Enforced at two layers: (a) scanner/meta-scanner output filter, (b) release-builder dispatch. Defense in depth — if either layer passes a frozen-path proposal, the other rejects.
- MUST run cognitive-evolution only when ADR-014 Phase B1 primitives are live: (a) `stepRuns.cognitiveMode` attribution column populated, (b) approach-outcome correlation aggregator query available. If primitives missing, this brief's first task is shipping them.
- MUST require ≥5 contributing nodes × ≥3 distinct processes where the target mode was active before cognitive-evolution can produce a proposal. Below thresholds = `insufficient-evidence` verdict, proposal stays in archive as `awaiting-evidence`.
- MUST require ≥2 independent reviewers for metacognitive-check-prompt edit proposals (per Brief 181 — highest-leverage target in the system, needs extra scrutiny).
- MUST implement the three-way-merge engine for cognitive content per ADR-033 §3. YAML-aware for process-step `cognitive_context`. Markdown-aware for `cognitive/modes/*.md`. Line-level for free-form content where YAML/Markdown structure insufficient.
- MUST classify every cognitive proposal with `impact: additive | structural`. Additive = new mental model entry, refined wording, tightened criteria. Structural = changed refusal patterns, changed escalation, changed authority boundaries. Maintainer-authored classification at proposal creation; deliberative-perspectives check misclassification.
- MUST route structural cognitive updates through the `cognitive/structural` release type, which every tier always queues for review (no auto-apply — overrides ADR-033 §3 tier table for this class).
- MUST support one-command scanner version rollback via `ditto network-admin scanner rollback <version>`. Rollback restores prior scanner prompt + config, logged to `activities`.
- MUST version scanner in `improvementScannerVersions` table. Each version is a signed release (ships via Brief 191) with prompt text, config JSON, creator maintainer, approval timestamp, ancestor version.
- MUST sandbox meta-scanner proposals by running both old and new scanner against the last N evidence windows (default N=3 cycles), comparing proposal distributions quantitatively. Divergence score must be documented in the proposal body.
- MUST include `stepRunId` on every meta-scanner run, cognitive-evolution aggregator run, scanner-version publish, scanner-version-dispatch (hot-swap of active scanner pointer), rollback command per Insight-180. The dispatch function mutates active-scanner state and is a side-effect-producing hot path; guard required.
- MUST cryptographically bind maintainer identity on quorum approvals. `approvedBy` must be a unique authenticated session token, not a role name. A single maintainer adopting two roles cannot satisfy the 2-reviewer quorum. Verified by attempt-test.
- MUST compute meta-scanner fitness via ROI-weighted hit rate. Fitness function = Σ(proposal_impact_measured × approval_weight) / Σ(proposal_cost). Raw approval count is NOT a term in the fitness function — preventing a scanner that evolves toward cheap-approvable-low-impact proposals. Documented in meta-scanner implementation inline comment.
- MUST NOT run meta-scanner more than once per 20-proposal-accumulation cycle. Scheduled event-firing, not cron.
- MUST NOT run cognitive-evolution more than once per week per target (prevents thrashing on a single mode).

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Meta-scanner mutation-of-mutation pattern | Promptbreeder (arxiv:2309.16797) | pattern | Self-referential prompt evolution — canonical prior art |
| Scaffolding-rewrites-scaffolding framing | STOP (arxiv:2310.02304) | pattern | Conceptual grounding for self-modifying scanner |
| Scanner versioning pattern | Brief 190 archive + Brief 191 release manifests | depend | Reuse existing infrastructure |
| Cross-node mode-outcome correlation | ADR-014 Phase B1 | depend | Hard prerequisite |
| Three-way merge for cognitive content | Debian apt `--force-confold` + Git three-way | pattern | User-wins default |
| YAML-aware diffing | `yaml` npm package with deep-comparison utilities | depend | Structured-data merge |
| Markdown-aware diffing | `mdast-util-from-markdown` + `unified` ecosystem | pattern | Markdown AST-level merge |
| Additive-vs-structural classification for cognitive | ADR-015 + ADR-033 §3 `impact` field | depend | Already project framework |
| Deliberative-perspectives on lens edits | ADR-028 self-referential check | pattern | Lens edits reviewed by (different) lenses |
| Sandbox replay for scanner proposals | Brief 190 sandbox extended | depend | Same primitive, different target (scanner prompt) |
| Manual Reconciliation Card | Original to Ditto (analogous to apt dpkg conffile prompt) | pattern | Three-way conflict surface for human |

## What Changes (Work Products)

Engine-core (`packages/core/`):

| File | Action |
|------|--------|
| `packages/core/src/learning/scanner-version.ts` | **Create:** `ScannerVersion` type. Fields: versionId, prompt, config, creator, approvedAt, parentVersion, releaseId (linked to Brief 191 manifest). |
| `packages/core/src/learning/cognitive-impact.ts` | **Create:** `CognitiveImpact` enum (`additive | structural`) + `CognitiveProposal` type extending `ImprovementProposal` with `impact`, `targetPath`, `mergedContent`. |
| `packages/core/src/learning/merge-verdict.ts` | **Create:** `MergeVerdict` type. Fields: `status: "CLEAN" \| "CONFLICT" \| "FROZEN_PATH"`, mergedContent, conflictBlocks, original, theirs, ours. |

Ditto product layer — network-side:

| File | Action |
|------|--------|
| `src/engine/network-learning/meta-scanner.ts` | **Create:** Scanner-strategy-evolution agent. Reads `improvementProposals` archive after every 20 base-scanner outputs. LLM prompt: "Given this distribution of proposals + maintainer decisions + sandbox outcomes + post-deployment attributions, what prompt or config change to the base scanner would improve hit rate?" Outputs typed scanner-edit proposal. Uses `createCompletion({ purpose: "analysis" })`. Trust tier critical pinned. |
| `src/engine/network-learning/cognitive-evolution.ts` | **Create:** Mode-outcome correlation aggregator. Reads aggregated `mode_outcome_correlation` signals, filters to ≥5 contributing nodes + ≥3 distinct processes, proposes mode edit via LLM. Targets: `cognitive/modes/*.md`, step-level `cognitive_context` (in process YAMLs), metacognitive-check prompts, deliberative-perspective lenses. Classifies `impact`. Routes to proposal archive. |
| `src/engine/network-learning/frozen-paths-guard.ts` | **Create:** `enforceFrozenPaths(proposal)` — asserts target paths do not intersect frozen set. Called at scanner output, meta-scanner output, and release-builder input. Defense in depth. |
| `src/engine/network-learning/reviewers-quorum.ts` | **Create:** For metacognitive-check-prompt edits, enforce ≥2 independent maintainer approvals before promotion. Reviewer identity from `approvedBy` in proposal record. |
| `cognitive/modes/improvement-scanning.md` | **Create:** Initial cognitive mode for the scanner. Defines what "good proposal" looks like, red flags, ROI-weighting, silence-as-feature, evidence thresholds. Mode-dependent calibration per Brief 114. This file is itself a mutation target — after first scanner proposes to edit it, next generations can reshape. |
| `src/cli/commands/network-admin.ts` | **Modify:** Add `scanner versions/rollback/current`, `cognitive-evolution status/pause/resume`. |
| `src/engine/network-learning/scanner-version-dispatch.ts` | **Create:** Scanner-version lookup at scanner runtime. Reads current version from `improvementScannerVersions` table (latest with `status=active`). Hot-path: scanner init reads current version and loads prompt+config. Rollback = update `status` flags, next scanner run picks up. |

Ditto product layer — node-side:

| File | Action |
|------|--------|
| `src/engine/node-learning/three-way-merge.ts` | **Modify (formalize — basic line-level shipped by Brief 196):** Brief 196 ships line-level `diff3` with conflict detection (Node `diff3` package). This brief extends with: (a) YAML-aware merge via `yaml` package deep-structural diff + conflict detection on overlapping keys with divergent values; (b) Markdown AST-aware merge via `unified`/`mdast-util-from-markdown` with paragraph-level conflict detection; (c) routing logic in `three-way-merge.ts` that dispatches to line-level / YAML-aware / Markdown-aware based on file extension. Returns same `MergeVerdict` shape; extended `status` union if needed. Clear ownership: Brief 196 creates file with line-level; Brief 192 modifies file to add YAML + Markdown paths. |
| `src/engine/node-learning/manual-reconciliation.ts` | **Create:** When merge conflict detected, adds entry to `manualReconciliations` table. Surfaces as Manual Reconciliation Card (rendered in Brief 193; this brief writes the data). |
| `src/cli/commands/updates.ts` | **Modify:** Add `reconcile` subcommand — lists pending manual reconciliations, allows operator to accept-network / keep-local / merge-via-Self per ADR-033 §3. |

Tests:

| File | Action |
|------|--------|
| `src/engine/network-learning/meta-scanner.test.ts` | **Create:** Mutation output shape, confidence threshold, distribution-shift sandbox verification. |
| `src/engine/network-learning/cognitive-evolution.test.ts` | **Create:** Contributor-count + process-count thresholds, mode classification, structural-vs-additive classifier, frozen-path rejection. |
| `src/engine/network-learning/frozen-paths-guard.test.ts` | **Create:** Adversarial proposals against frozen paths rejected at both layers (scanner output + release builder input). |
| `src/engine/network-learning/reviewers-quorum.test.ts` | **Create:** Metacognitive-check proposal requires 2 reviewers; single-reviewer blocks promotion. |
| `src/engine/node-learning/three-way-merge.test.ts` | **Modify (formalization from Brief 191):** YAML merge, Markdown merge, line-level merge, conflict cases. |
| `src/engine/node-learning/manual-reconciliation.test.ts` | **Create:** Conflict detection, accept-network / keep-local / merge-via-Self paths. |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint. |
| `docs/insights/NNN-l5-lc-composition-results.md` | **Create on completion:** First observations on whether meta-scanner output actually shifts scanner behavior + whether cognitive-evolution outputs improve downstream trust signals. |

## User Experience

- **Jobs affected (maintainer):** Review scanner-version proposals (infrequent). Review cognitive-evolution proposals (weekly-ish once archive depth sufficient). Rollback scanner version when needed.
- **Jobs affected (node operator):** Manual Reconciliation Card when cognitive update conflicts with local customization.
- **Primitives involved:** Manual Reconciliation Card (data here, UI in Brief 193).
- **Process-owner perspective:** Mostly invisible. Node operator sees a Manual Reconciliation Card only when a shipped cognitive update would overwrite a local customization. Accept-network / keep-local / merge-via-Self.
- **Interaction states:** `ditto updates reconcile list` shows pending conflicts. `ditto updates reconcile show <id>` shows three-way diff (original / theirs / ours). `ditto updates reconcile accept-network | keep-local | merge-via-self <id>` executes operator choice.
- **Designer input:** Not invoked at this brief. Manual Reconciliation Card UX refinement is Brief 193 scope.

## Acceptance Criteria

1. [ ] Meta-scanner runs after every 20 base-scanner proposals; event-triggered, not cron. Verified by integration test injecting 19 → no fire, 20th → fires.
2. [ ] Meta-scanner output is a typed `scanner-edit` proposal routed through the same Brief 190 archive + Brief 191 release mechanism as other proposals. Verified by end-to-end seeded test.
3. [ ] Meta-scanner sandbox: runs old+new scanner against last 3 evidence windows, computes proposal-distribution divergence, requires divergence > 0.2 (cosine distance on classification histograms) to be PASS. Below threshold = INSUFFICIENT_EVIDENCE.
4. [ ] Scanner trust tier pinned `critical` forever. No override. Verified by code + test assertion.
5. [ ] `ditto network-admin scanner rollback <version-id>` reverts to prior scanner version in one command. Next scanner run uses rolled-back prompt + config. Verified by integration test.
6. [ ] Cognitive-evolution requires ≥5 contributing nodes + ≥3 distinct processes for PASS. Below thresholds = INSUFFICIENT_EVIDENCE. Verified by seeded threshold tests.
7. [ ] Metacognitive-check prompt edits require ≥2 independent maintainer approvals (not just one). Single approver blocks promotion. Verified by integration test.
8. [ ] Frozen-paths allowlist enforced at both scanner output AND release-builder input. Adversarial proposal targeting `cognitive/core.md` rejected at BOTH layers. Verified by 2-layer rejection test.
9. [ ] `impact: additive | structural` classification on every cognitive proposal. Structural cognitive updates never auto-apply at any tier. Verified by 2-case test (additive auto-applies at autonomous; structural queues at autonomous).
10. [ ] Three-way merge YAML: clean merge applies cleanly; conflict queues Manual Reconciliation Card. Verified by 3-case test (clean, conflict, user-local-wins).
11. [ ] Three-way merge Markdown: AST-level merge with heading-preservation; conflict detection on paragraph-level divergence. Verified by 3-case test.
12. [ ] `cognitive/modes/improvement-scanning.md` exists at brief completion. Includes mode-dependent calibration per Brief 114. Reviewed for clarity against scanner's actual behavior expectations.
13. [ ] L5 × LC composition proof: meta-scanner produces at least one proposal targeting `cognitive/modes/improvement-scanning.md`. Once shipped, next scanner run's proposal distribution measurably shifts (per AC #3 divergence metric). Verified by **seeded-fixture integration test** — not calendar-wait: test fixture seeds pre-ship and post-ship proposal sets, AC evaluates divergence in-test in seconds, not weeks.
14. [ ] `stepRunId` required on meta-scanner, cognitive-evolution, scanner-version publish, rollback command. Verified by compile + runtime tests.
15. [ ] ADR-014 Phase B1 prerequisite check: brief fails-fast if `stepRuns.cognitiveMode` column missing or approach-outcome aggregator unavailable. First task is shipping B1 if absent.
16. [ ] `ditto updates reconcile list/show/accept-network/keep-local/merge-via-self <id>` commands work. Verified by CLI integration tests.
17. [ ] Scanner-version history queryable: `ditto network-admin scanner versions` lists all versions with ancestor chain + approval timestamps.
18. [ ] Meta-scanner ROI-weighted fitness: fitness computation code contains NO reference to raw approval count as a term. Code inspection + test verifies fitness(proposal) = impact × approval / cost; doubling approval count without changing impact × cost does not increase fitness. Verified by code audit + two-case numerical test.
19. [ ] Cryptographic quorum binding: two approvals on a metacognitive-check-prompt-edit proposal must come from distinct session tokens (not distinct role names). Single-maintainer session-switching attack rejected. Verified by attack-test.
20. [ ] Scanner-version-dispatch (`scanner-version-dispatch.ts`) `stepRunId` guard: function signature requires stepRunId; runtime check rejects missing. Verified by compile + runtime tests.

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-033, ADR-014 (cognitive architecture), ADR-015 (additive-vs-structural), this brief, Brief 190, Brief 191.
2. Reviewer specifically checks:
   - Meta-scanner reward hacking: can it evolve toward proposals that maximize approval without improving underlying quality? (Safeguards: ROI-weighted hit rate, not raw approval count.)
   - Cognitive-evolution reward hacking: same question for mode edits.
   - Frozen-paths defense in depth: really two independent layers, or is one just a call to the other?
   - Three-way merge edge cases: large structural reshufflings, binary content, mixed content types?
   - ADR-014 Phase B1 prerequisite: is the fail-fast check robust? What if B1 landed but is buggy?
   - Reviewer quorum for metacognitive-check: can a single maintainer fake two approvals via role-switching?
   - Scanner-version rollback: is there any state (in-flight LLM call, queued sandbox) that survives rollback and causes inconsistency?
   - Manual Reconciliation Card: do all three resolution paths (accept-network/keep-local/merge-via-self) actually work? What if operator picks "merge-via-self" but Self is unavailable?
3. Adversarial read specifically focused on the recursive kernel: "I want to inject a subtle bias that makes the scanner worse over time. How?"
4. Present reviews + brief to human.

## Smoke Test

```bash
# ADR-014 Phase B1 check
pnpm cli sync
pnpm cli inspect --check-phase=B1
# Expect: all prerequisites satisfied

# Seeded meta-scanner run (after 20 base-scanner proposals in archive)
pnpm cli test:meta-scanner --seed=./test/fixtures/20-proposal-archive.sql
# Expect: one scanner-edit proposal produced, ancestor chain linked, sandbox divergence measured

# Seeded cognitive-evolution run
pnpm cli test:cognitive-evolution --seed=./test/fixtures/5-nodes-3-processes.sql
# Expect: one mode-edit proposal produced, classification = additive or structural, frozen-paths check passed

# Frozen-paths adversarial
pnpm cli test:meta-scanner --adversarial=./test/fixtures/frozen-path-meta-proposals.json
# Expect: all rejected at scanner AND release-builder layers

# Reviewer quorum enforcement
pnpm cli network-admin proposals approve <meta-check-prompt-edit-proposal-id>
# Expect: "Needs second approver" — not promoted
# Second maintainer approves:
pnpm cli network-admin proposals approve <id> --as-maintainer=maintainer2
# Expect: promoted to shipped

# Scanner version rollback
pnpm cli network-admin scanner current
# Expect: version X
pnpm cli network-admin scanner rollback <earlier-version>
# Expect: version reverts, next scanner run uses older prompt
# Integration test: run scanner on same evidence, verify output resembles older distribution

# Three-way merge clean case
pnpm cli test:three-way-merge --seed=./test/fixtures/merge-clean.yaml
# Expect: merged content applied cleanly

# Three-way merge conflict case
pnpm cli test:three-way-merge --seed=./test/fixtures/merge-conflict.md
# Expect: Manual Reconciliation Card queued with original/theirs/ours

# Manual reconciliation operator flow
pnpm cli updates reconcile list
# Expect: pending conflict
pnpm cli updates reconcile show <id>
# Expect: three-way diff printed
pnpm cli updates reconcile keep-local <id>
# Expect: local preserved, network version marked dismissed, activity logged

# L5 × LC composition proof (integration burn-in)
# 1. Run 20 base-scanner proposals; inject into archive.
# 2. Trigger meta-scanner; verify proposal produced; approve.
# 3. Ship via Brief 191 to staging network.
# 4. Run 20 more base-scanner proposals post-ship.
# 5. Compute classification histogram divergence between pre-ship and post-ship proposal sets.
# Expect: divergence > 0.2.
```

## After Completion

1. Update `docs/state.md` with L5 × LC kernel live, first meta-scanner proposal shipped, first cognitive-evolution proposal shipped, first scanner rollback executed.
2. Update `docs/roadmap.md` Phase 9 — Sub-brief 192 complete.
3. Unblock Brief 193 (Meta-Observability — observes whether L5 × LC composition actually improves hit rate over time).
4. Capture insights:
   - Does meta-scanner output actually improve hit rate, or just churn?
   - What mode-edits came out of cognitive-evolution and how did they affect downstream trust signals?
   - Three-way merge edge cases in production
   - Scanner rollback frequency — how often do we need it?
5. Architect retro: was the 20-proposal-accumulation threshold right? 5-node + 3-process minimum for cognitive? Should reviewer-quorum apply to other cognitive targets beyond metacognitive-check?
