# Brief 190: Network Scanner + Cross-Node Replay Sandbox + Proposal Archive

**Date:** 2026-04-17
**Status:** ready
**Depends on:** Brief 189 (Evidence Harvest Pipeline — evidence must be flowing), ADR-033, ADR-022 (5-dim homeostatic quality), ADR-028 (deliberative perspectives), Brief 060 (knowledge-extractor pattern), Brief 181 §Phasing / Sub-brief 190
**Unlocks:** Brief 191 (Release Distribution — consumes approved proposals). Brief 192 (Scanner Self-Evolution — evolves this scanner's strategy). Brief 193 (Meta-Observability — tracks scanner health). Brief 194 (Dev Pipeline for engine-level changes — consumes structural proposals).

## Goal

- **Roadmap phase:** Phase 9 — Self-Improvement Meta-Process. Second shippable sub-brief of Brief 181.
- **Capabilities:**
  - Network-scale `improvement-scanner` system agent that reads aggregated evidence and produces typed improvement proposals
  - `network-learning/sandbox` cross-node replay validator with 5-dim homeostatic scoring
  - `improvementArchive` with proposal lineage, clade-metaproductivity scoring, probabilistic selection prior
  - `improvementProposals` schema table with full lineage audit
  - `processes/network-learning.yaml` meta-process definition that orchestrates scanner → sandbox → archive → deliberative review
  - Maintainer-facing proposal CLI (`ditto network-admin proposals list/show/approve/reject`)

## Context

Brief 181 §Phasing / Sub-brief 190 outlines: "Build the central learning brain. Scanner reads aggregated evidence, produces proposals with cross-node evidence trail and predicted impact. Sandbox validates by replaying (against node-contributed replay corpora, anonymized) the proposal vs current on the evidence cohort. Archive persists lineage with probabilistic selection and clade scoring."

This is the "brain" of the RSI loop. Brief 189 feeds data in; Brief 191 ships decisions out; this brief is the reasoning layer between. It runs as a system agent through the existing harness pipeline (ADR-008 pattern), scoped to the Network deployment only. The scanner's trust tier is pinned `critical` for structural proposals and `supervised` for additive per ADR-015's additive-vs-structural rule.

Deliberative perspectives (ADR-028) run on every non-trivial proposal before surfacing — the scanner's own judgment is subject to peer-review evaluation under multiple lenses. This is the first system agent to use ADR-028 deliberative-perspectives handler at peer-review scale with aggregate cross-node evidence.

The archive is append-only with clade-metaproductivity scoring (Huxley-Gödel Machine pattern). Early clades will be thin; CMP is a simple approval-rate-weighted sample until lineage depth ≥3 generations, per ADR-033 §1 Open Questions.

## Objective

Ship an end-to-end scanner loop on the Network: scheduled meta-process triggers scanner → scanner reads aggregated evidence (via Brief 189 aggregator primitives) → scanner proposes typed improvements with predicted-impact + predicted-ship-cost + full evidence trail → sandbox validates approved-for-sandbox proposals against cross-node replay corpora with 5-dim scoring → proposals persisted to archive with lineage → deliberative-perspectives pass → maintainer dashboard surfaces proposals for approval. Scanner runs nightly + on-trigger (accumulation of N new correction signals). First month expectations: 0–2 proposals/week while archive warms; no shipping yet (ships begin in Brief 191).

## Non-Goals

- **Not implementing release distribution.** Proposals land in the archive; shipping is Brief 191.
- **Not implementing scanner self-evolution.** The scanner runs under a fixed prompt at this sub-brief. Meta-scanner is Brief 192.
- **Not implementing cognitive-layer evolution.** Scanner proposes L2 (process templates), L3 (role contracts), and classifies engine-level (Category E routes to Brief 194), but LC (cognitive cross-cutting) is Brief 192.
- **Not implementing adversarial-detection.** Scanner reads reputation-weighted evidence from Brief 189's aggregator, but the weighting itself is from Brief 189; active adversarial-detection alerting is Brief 193.
- **Not implementing a maintainer web dashboard.** First iteration is CLI-only (`ditto network-admin proposals ...`). Web dashboard is Brief 193's scope.
- **Not implementing the Improvement Card ContentBlock.** The typed ContentBlock for proposal rendering lands in Brief 193 alongside the maintainer dashboard.
- **Not shipping the ROI attribution pipeline.** Attribution over 30-day windows is Brief 193 (meta-observability).

## Inputs

1. `docs/briefs/181-recursive-self-improvement.md` §Phasing / Sub-brief 190, §Context (layered recursion), §Constraints (scanner + sandbox)
2. `docs/briefs/189-evidence-harvest-pipeline.md` — upstream data provider
3. `docs/adrs/033-network-scale-rsi-architecture.md` §2 (cross-tenancy), §5 (integration promotion); all sections for architectural grounding
4. `docs/adrs/022-critical-evaluation-and-homeostatic-quality.md` §4 (5-dim quality frame), §E3 (verification-check handler pattern)
5. `docs/adrs/028-deliberative-perspectives.md` (peer-review evaluation pattern)
6. `docs/adrs/015-meta-process-architecture.md` (additive-vs-structural rule at dispatch)
7. `docs/adrs/008-system-agents-and-process-templates.md` (system-agent registration + script-handler pattern)
8. `src/engine/system-agents/knowledge-extractor.ts` (closest existing pattern; scanner is same shape at higher abstraction)
9. `src/engine/system-agents/index.ts` (registration path)
10. `src/engine/harness-handlers/deliberative-perspectives.ts` (to invoke during proposal review)
11. `src/engine/harness-handlers/feedback-recorder.ts` (proposal outcomes recorded here)
12. `docs/adrs/026-multi-provider-purpose-routing.md` (scanner LLM call goes through `purpose: "analysis"` — model routing per ADR-026)
13. `processes/self-improvement.yaml` (existing stub — rewritten by this brief)
13. Brief 181 Research Report `docs/research/network-scale-rsi-tech-choices.md` §Topic 1 (signing — scanner produces inputs for Brief 191), §Topic 3 (canary — scanner targets release batches)
14. Darwin Gödel Machine (`github.com/jennyzzt/dgm`) — archive + probabilistic selection pattern (adopt)
15. Huxley-Gödel Machine (`github.com/metauto-ai/HGM`) — clade metaproductivity scoring

## Constraints

- MUST route the scanner agent through the harness pipeline (memory → step → metacognitive-check → deliberative-perspectives → trust-gate → feedback-recorder). No bypass. Scanner is a system agent, not a raw script.
- MUST pin scanner trust tier `critical` for proposals classified structural (engine-level, new-handler, schema-semantic-change). Additive proposals progress via normal trust ladder. Classification is part of the proposal payload, enforced at dispatch in Brief 191.
- MUST NOT mutate any live process template, cognitive content, or engine code. Scanner only writes proposals to `improvementProposals`. Mutation happens via Brief 191 release pipeline.
- MUST enforce frozen-path allowlist at proposal dispatch: `cognitive/core.md`, `cognitive/self.md`, `packages/core/src/interfaces.ts`, `docs/adrs/*`. A proposal targeting a frozen path is auto-rejected at the scanner with a typed reason code. Enforcement location is the scanner, not just the downstream release builder — defense in depth.
- MUST respect Insight-156 network-vs-workspace split: scanner consumes only aggregate evidence from `networkEvidence`, never per-node payloads. The aggregator's k-anonymity constraints are the only gate to raw data.
- MUST require `stepRunId` parameter on all dispatch functions per Insight-180 (proposal creation, sandbox invocation, archive writes).
- MUST require maintainer approval for every proposal that reaches "actionable" state. No proposal ships without explicit `ditto network-admin proposals approve <id>`.
- MUST include a kill switch (`ditto network-admin scanner pause`) that halts new scanner runs, freezes in-flight sandboxes, and stops new proposals. In-flight proposals retain state but are not promoted.
- MUST run sandbox only on proposals that pass scanner confidence threshold (default 0.5). Below-threshold proposals are archived as "draft" and not sandboxed — avoids burning sandbox compute on low-quality proposals.
- MUST sandbox minimum evidence: ≥10 replay traces from ≥5 distinct contributing nodes before sandbox can PASS. Below those thresholds, sandbox returns `insufficient-evidence` which is a non-PASS state — proposal stays in archive as `awaiting-evidence`.
- MUST enforce 5-dim homeostatic scoring per ADR-022 §4. Below-range on any dim is an auto-FAIL. Above optimal on any dim triggers concern flag (does not auto-fail but surfaces on the Improvement Card when Brief 193 renders it).
- MUST invoke deliberative-perspectives per ADR-028 on every proposal that passes sandbox (at least 3 lenses — per ADR-028 default). Perspectives that flag CONCERN block auto-promotion and require maintainer explicit override.
- MUST NOT invoke the scanner more than once per 24-hour window unless trigger-fired by accumulation (≥20 new correction signals since last run).
- MUST log every scanner run + proposal lifecycle state change to `activities` with `actorType: "system-agent"` + full evidence snapshot hash for reproducibility.

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| System agent registration | `src/engine/system-agents/index.ts` + ADR-008 | depend | Established pattern for script-handler agents |
| Meta-process YAML | `processes/self-improvement.yaml` (existing stub) | depend | Rewritten; pattern preserved |
| Scanner LLM-call pattern | `src/engine/system-agents/knowledge-extractor.ts` (Brief 060) | adopt | Same shape: aggregated evidence → LLM classifier → typed output; scanner differs at higher abstraction |
| Archive + probabilistic selection | Darwin Gödel Machine (`DGM_outer.py`, `self_improve_step.py`) | pattern | Proven pattern for evolutionary archive with fitness-weighted sampling |
| Clade-metaproductivity scoring | Huxley-Gödel Machine (`metauto-ai/HGM`) | pattern | Lineage-depth-aware fitness; simplified to approval-weighted at v1 until depth ≥3 |
| Sandbox replay validation | Brief 091 fleet-upgrade canary pattern + original replay harness | pattern | Combines existing rollout primitive with novel replay-against-historical-traces |
| 5-dim homeostatic scoring | ADR-022 §4 | depend | Already project framework |
| Deliberative perspectives review | `src/engine/harness-handlers/deliberative-perspectives.ts` (ADR-028) | depend | Multi-lens evaluation at peer-review scale |
| Confidence self-assessment | ADR-011 + Brief 016d trust-gate extension | depend | Scanner emits confidence per proposal; below-threshold filters apply |
| Critical-tier enforcement | ADR-015 additive-vs-structural | depend | Trust-tier pinning at proposal dispatch |
| Proposal schema + lineage | Original to Ditto (informed by compound-product `prd.json` pattern) | pattern | Each proposal carries boolean ACs; sandbox decides pass/fail |
| Maintainer CLI scaffold | Existing `src/cli/commands/admin-*.ts` conventions | depend | Reuse Brief 108 admin authentication pattern |

## What Changes (Work Products)

Engine-core (`packages/core/`):

| File | Action |
|------|--------|
| `packages/core/src/learning/proposal-types.ts` | **Create:** `ImprovementProposal` discriminated union. Variants: `TemplateEdit`, `RoleContractEdit`, `CognitiveModeEdit`, `EngineHandlerAddition`, `SchemaAddition`, `IntegrationPromotion`. Each carries predictedImpact, predictedShipCost, confidenceScore, evidenceSnapshotHash, targetPathAllowlistCheck. |
| `packages/core/src/learning/sandbox-verdict.ts` | **Create:** `SandboxVerdict` type with `status: "PASS" \| "FAIL" \| "DEGRADED" \| "INSUFFICIENT_EVIDENCE"`, per-dim scores, replay trace IDs, sampled-cohort size. |
| `packages/core/src/learning/clade-scoring.ts` | **Create:** Pure function `computeCladeScore(proposal, archive)` returning metaproductivity prior for selection sampling. |
| `packages/core/src/db/schema.ts` | **Modify:** Add `improvementProposals`, `improvementArchive`, `improvementSandboxRuns` table definitions. |

Ditto product layer — network-side:

| File | Action |
|------|--------|
| `src/engine/system-agents/improvement-scanner.ts` | **Create:** The scanner system agent. Reads `networkEvidence` via aggregator, classifies patterns, calls LLM with structured output (Zod schema matching `ImprovementProposal`), filters by confidence ≥ 0.5, writes to `improvementProposals`. Uses `createCompletion({ purpose: "analysis" })` per ADR-026 model routing. |
| `src/engine/network-learning/sandbox.ts` | **Create:** `runSandbox({ proposalId, stepRunId })`. Samples replay traces from contributing nodes, runs proposed change against both current + new (via LLM-call replay in anonymized form), computes 5-dim scores via LLM-judge vs current-and-original-human-edit references, persists `SandboxVerdict` to `improvementSandboxRuns`. `stepRunId` required per Insight-180. |
| `src/engine/network-learning/archive.ts` | **Create:** Append-only archive. `addProposal({ proposal, stepRunId })`, `findParent`, `siblings`, `descendants`, `sampleForNextGeneration(k=5)` — selection uses clade score as prior. `stepRunId` required on `addProposal` per Insight-180. |
| `src/engine/network-learning/classifier.ts` | **Create:** Pure function `classifyProposal(proposal)` returning `"additive" \| "structural"` per ADR-015. Structural = changes flow semantics, adds/removes steps, modifies cognitive-core, engine interfaces, trust computation. Additive = content-only tightening, new toolkit entries, new reflection prompts. |
| `processes/network-learning.yaml` | **Create (rewrite of `self-improvement.yaml`):** Meta-process definition. Triggers: scheduled (nightly) + event-fired (N evidence accumulation). Steps: scan → classify → (filter by confidence) → sandbox → deliberative-review → archive → surface. Cognitive mode: `improvement-scanning`. Trust tier: `critical`. |
| `processes/self-improvement.yaml` | **Delete:** Superseded by `network-learning.yaml`. |
| `cognitive/modes/improvement-scanning.md` | **Create:** Cognitive mode for the scanner — what "good proposal" looks like, red flags, silence-as-feature criteria, ROI-weighting over raw proposal count. Mode-dependent calibration per Brief 114 pattern. |
| `src/engine/network-learning/frozen-paths.ts` | **Create:** `FROZEN_PATHS` const array + `isFrozenPath(path)` predicate. Scanner rejects any proposal whose `targetPaths` intersects frozen set. |
| `src/cli/commands/network-admin.ts` | **Modify or Create:** Add `proposals list/show/approve/reject/rerun-sandbox` subcommands. `scanner pause/resume/status`. Guarded by admin auth per Brief 108. |
| `src/engine/network-learning/proposal-lifecycle.ts` | **Create:** State machine — `draft → sandboxed → reviewed → approved → shipped → attributed → (validated | invalidated)`. Every transition logged to `activities`. |
| `drizzle/NNNN_scanner_archive.sql` + snapshot | **Create:** Migration for `improvementProposals`, `improvementArchive`, `improvementSandboxRuns` tables. Next idx per Insight-190. |

Tests:

| File | Action |
|------|--------|
| `src/engine/system-agents/improvement-scanner.test.ts` | **Create:** Allowlist enforcement, confidence threshold, evidence-snapshot-hashing, structural-vs-additive classification, frozen-path rejection. Uses MOCK_LLM. |
| `src/engine/network-learning/sandbox.test.ts` | **Create:** 5-dim scoring, insufficient-evidence behavior, adversarial reward-hack proposals, cross-node-replay determinism. |
| `src/engine/network-learning/archive.test.ts` | **Create:** Lineage tracking, sibling queries, clade-score prior behavior on generation depth 1/2/3+. |
| `src/engine/network-learning/classifier.test.ts` | **Create:** Known-structural + known-additive fixtures. |

Documentation:

| File | Action |
|------|--------|
| `docs/state.md` | **Modify:** Checkpoint. |
| `docs/insights/NNN-scanner-proposal-patterns.md` | **Create on completion:** Durable patterns from first 30 days of production scanner output. |

## User Experience

- **Jobs affected:** Review (maintainer), Decide (maintainer). No end-user surface. No node-operator surface at this sub-brief (node operators interact with updates in Brief 191, not proposals).
- **Primitives involved:** None new at this sub-brief. Brief 193 introduces the Improvement Card; this brief ships CLI-only.
- **Process-owner perspective:** Invisible to node operators. Maintainer reviews proposals daily via CLI during first weeks of production; later via web dashboard (Brief 193).
- **Interaction states:** `ditto network-admin proposals list` shows `[pending | sandboxed | reviewed | approved | rejected]` with counts. `proposals show <id>` renders full proposal JSON with 5-dim scores + deliberative-perspectives findings.
- **Designer input:** Not invoked. Brief 193 invokes Designer for the maintainer web dashboard and Improvement Card.

## Acceptance Criteria

1. [ ] `ImprovementProposal` discriminated union covers six variants (template, role-contract, cognitive-mode, engine-handler, schema, integration-promotion). Type-level exhaustiveness enforced by classifier switch.
2. [ ] Scanner runs on cron schedule (nightly default) + on event-trigger (≥20 new correction signals). Verified by fake-clock test + event-injection test.
3. [ ] Frozen-path allowlist enforced at scanner: proposal targeting `cognitive/core.md`, `cognitive/self.md`, `packages/core/src/interfaces.ts`, or `docs/adrs/*` is auto-rejected with typed reason `"frozen_path"`. Verified by 4 test cases (one per path).
4. [ ] Scanner confidence filter ≥0.5 prevents below-threshold proposals reaching sandbox. Verified by test with mocked LLM outputs.
5. [ ] Sandbox requires ≥10 replay traces from ≥5 distinct nodes for PASS state. Below thresholds returns `INSUFFICIENT_EVIDENCE`. Verified by thresholded test.
6. [ ] 5-dim homeostatic scoring: proposal failing on any single dimension is auto-FAIL. Above-optimal flags concern but does not auto-fail. Verified by 5-case matrix.
7. [ ] Deliberative-perspectives pass invoked on every sandboxed proposal. CONCERN from any lens blocks auto-promotion and requires maintainer explicit override. Verified by test injecting CONCERN verdict.
8. [ ] Archive records full lineage: proposal has `parentProposalId`, `generation`, `cladeId`, ancestor chain queryable. Verified by 3-generation test.
9. [ ] Clade-scoring prior shifts sampling probability measurably after 3+ generations — later generations from successful clades are sampled more often. Verified by 1000-sample Monte Carlo on seeded archive.
10. [ ] Structural/additive classifier: 20-case test matrix (known-additive + known-structural) passes.
11. [ ] Trust tier pinned `critical` for structural proposals at scanner output. Enforced in code, asserted by test.
12. [ ] `ditto network-admin proposals list/show/approve/reject/rerun-sandbox` commands work. Guarded by admin auth. Verified by CLI integration tests.
13. [ ] Kill switch: `ditto network-admin scanner pause` halts new scanner runs within 1 heartbeat cycle. In-flight sandboxes complete (don't lose work). Verified by integration test.
14. [ ] All scanner runs + proposal state transitions logged to `activities` with actorType `"system-agent"` and evidence snapshot hash. Verified by integration test.
15. [ ] `stepRunId` required parameter on scanner, sandbox, archive-write functions per Insight-180. Verified by compile + runtime tests.
16. [ ] Seeded scanner run in test environment produces ≥1 proposal from known-pattern evidence fixture. Verified by end-to-end seed test.
17. [ ] Adversarial reward-hack fixtures rejected by sandbox ≥9/10. Fixture set hand-curated, includes proposals that optimize approval rate by softening quality criteria, etc.
18. [ ] Trigger coalescing: multiple threshold crossings within a single scanner-cooldown window (24h) fire the scanner at most once. 100 corrections in one hour result in one scanner invocation, not five. Verified by high-volume-injection test.
19. [ ] Kill-switch clean cancellation: `ditto network-admin scanner pause` during an in-flight scanner run cancels pending LLM calls for that run (via AbortController) while allowing the in-flight sandbox validation to complete (expensive work, don't waste). No orphaned LLM requests. Verified by injection test.

## Review Process

1. Spawn Dev Reviewer with `docs/architecture.md`, `docs/review-checklist.md`, ADR-033, ADR-022, ADR-015, ADR-028, this brief, Brief 189.
2. Reviewer specifically checks:
   - Can the scanner propose a change to a frozen path via any circumvention (path normalization, glob escape, symlink)?
   - Does the confidence threshold + sandbox gate + deliberative-review gate compose correctly? Any single-gate bypass path?
   - Is clade-scoring exploit-resistant? Can a scanner that learned to produce low-impact-high-approval proposals dominate the archive?
   - Does the LLM-judge in sandbox have scoring bias? Is there a case where sandbox PASS correlates with maintainer REJECT (meaning sandbox is mis-calibrated)?
   - Does the 24-hour rate limit interact safely with event-trigger firing? Edge case: 100 corrections in one hour, does scanner fire 5× or once?
   - Does the kill switch actually halt all scanner state — including in-flight LLM calls that may still return? Clean cancellation?
   - Replay-trace sampling: if a contributing node opts out of replay-trace tier mid-sandbox, is partial data handled correctly?
3. Adversarial read: "I'm a malicious scanner prompt. How do I make the network ship something bad?" Tests produced.
4. Present reviews + brief to human.

## Smoke Test

```bash
# On network (public deployment)
pnpm cli sync
pnpm cli inspect improvement-scanner
# Expect: agent registered, trust tier critical, cognitive mode improvement-scanning

# Seeded evidence + patterns (requires Brief 189 seed fixtures)
pnpm cli test:scanner --seed=./test/fixtures/known-patterns.sql
# Expect: ≥1 proposal produced, full lineage, evidence snapshot hash recorded

# Sandbox verdict
pnpm cli network-admin proposals list --status=sandboxed
# Pick one proposal id; inspect:
pnpm cli network-admin proposals show <id>
# Expect: 5-dim scores, replay trace count, contributing node count, deliberative-perspectives findings

# Adversarial reward-hack fixtures
pnpm cli test:scanner --adversarial=./test/fixtures/reward-hack-proposals.json
# Expect: ≥9/10 rejected before maintainer-visible state

# Frozen-path rejection
pnpm cli test:scanner --frozen-path-fixtures=./test/fixtures/frozen-path-proposals.json
# Expect: all rejected at scanner, reason code "frozen_path"

# Kill switch
pnpm cli network-admin scanner pause
pnpm cli network-admin scanner status
# Expect: "Paused"; in-flight sandboxes finishing; no new runs

# Maintainer approval flow
pnpm cli network-admin proposals approve <id>
# Expect: state transitions to "approved", logged to activities
# Note: actual shipping happens in Brief 191; this test stops at approved state

# Clade prior verification
pnpm cli test:scanner --clade-prior-seed=./test/fixtures/3-gen-archive.sql
# Run 1000 samples; expect successful-lineage proposals sampled with >60% frequency
```

## After Completion

1. Update `docs/state.md` with scanner live, first proposals surfaced, sandbox calibration baseline, clade-prior behavior.
2. Update `docs/roadmap.md` Phase 9 — Sub-brief 190 complete.
3. Unblock Brief 191 (Release Distribution — consumes approved proposals), Brief 192 (Scanner Self-Evolution — evolves scanner prompts).
4. Capture insights:
   - What makes a "good" proposal in the scanner's actual output (after 30 days)?
   - Does the sandbox calibration match maintainer judgment? Distance metric?
   - Clade-metaproductivity: does depth actually emerge, or is the archive still thin after 30 days?
5. Architect retro: was confidence ≥0.5 the right threshold? Did deliberative-perspectives add signal or noise? Recalibrate if needed.
