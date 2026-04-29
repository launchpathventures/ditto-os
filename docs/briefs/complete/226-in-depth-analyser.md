# Brief 226: In-Depth Analyser — Project Onboarding seam #2

**Date:** 2026-04-27
**Status:** complete (2026-04-27, post-Builder + dev-review fixes; AC #11 partial-success path + AC #14 cleanup discipline both verified; smoke test deferred — needs network + public repo)
**Depends on:** Brief 225 (Connection-as-process plumbing — owns the `project-onboarding.yaml` system process this brief fills in, the `clone-and-scan` + `surface-report` placeholder handlers this brief replaces, the `/projects/:slug/onboarding` Server Component this brief's report renders into). Brief 215 (substrate — `projects.id` to attach the report to). Brief 199 (memory projection — only if the analyser's findings should be projected; cross-reference, not a build-time dependency).
**Unlocks:** sub-brief #3 (retrofitter — consumes the structured analyser report as its input plan); the `featureFlag.projectOnboardingReady` env var flips from `false` to `true` when this brief ships (the user-facing surface lights up only when the analyser produces real reports).
**Parent brief:** 224 (Project Onboarding & Battle-Readiness)

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness — analyser brain.
- **Capabilities delivered:**
  - Replace Brief 225's `clone-and-scan` placeholder handler with a real read-only repo analyser: clones the target repo via `isomorphic-git` (already evaluated in `docs/landscape.md:928-934` as DEPEND); enumerates files; classifies the project shape.
  - Add detection sub-handlers for: build system (Node/Python/Rails/Go/Rust/Ruby/PHP — minimum viable detector list), test framework (vitest/jest/playwright/pytest/RSpec/cargo-test/go-test), CI status (`.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`, `azure-pipelines.yml`), existing AI/agent harness (`.claude/`, `.cursorrules`, `AGENTS.md`, `.catalyst/`, `.ditto/`).
  - Persona-fit scoring: produce a user-facing descriptor like "mid-size org tooling, mature CI" (NOT "Jordan-shaped" — Designer spec dropped persona-name labels at the user surface).
  - Gold-standard nearest-neighbour from `docs/landscape.md` corpus: pick 1-3 closest matches based on detected stack + scope.
  - Runner + trust-tier recommendation grounded in detected evidence (tests-exist + CI-green + branch-protection-on → `spot_checked` reasonable; no-tests + no-CI → `supervised` recommended).
  - **New ContentBlock type** `AnalyserReportBlock` (additive to the existing 26 ContentBlock types — registers in `packages/core/src/content-blocks.ts` discriminated union). Renders as a sequence of design-package chat-block primitives: at-a-glance card + `block.evidence` cards for Strengths/Watch-outs/Missing + two `block.decision` cards for Runner + Trust-tier pickers.
  - Replace Brief 225's `surface-report` placeholder body: instead of a stub workItems row, write the populated `AnalyserReportBlock` data into `harness_decisions.reviewDetails` + the workItems row's structured field; the chat-col Server Component picks it up.
  - Additional process steps in `processes/project-onboarding.yaml` between `clone-and-scan` and `surface-report`: `detect-build-system`, `detect-test-framework`, `detect-ci`, `detect-existing-harness`, `score-persona-fit`, `match-gold-standard`, `recommend-runner-tier`. The architect of THIS brief designs the full decomposition (Brief 225 deliberately deferred this).

## Context

Brief 225 (sub-brief #1) shipped the connection-as-process plumbing: the user pastes a GitHub URL → `projects.status='analysing'` → the `project-onboarding.yaml` process kicks off → two placeholder handlers run (`clone-and-scan` no-op + `surface-report` writes a stub) → the `/projects/:slug/onboarding` Server Component shows the stub. The user-facing surface is feature-flagged behind `DITTO_PROJECT_ONBOARDING_READY=true` precisely so the placeholder doesn't ship to production users — the flag flips when this brief lands.

This brief replaces the placeholders with the actual analyser brain. Per Insight-205 §6, the analyser report IS the user's first signal of value when connecting a project. The Designer's spec at `docs/research/analyser-report-and-onboarding-flow-ux.md` covers Stage 3 of the four-stage flow: at-a-glance / strengths (✓) / watch-outs (⚠) / missing (✗) / runner+tier picker, all rendered inline in the chat-col, all using the design-package's existing `block.evidence` + `block.decision` primitives.

The analyser is read-only (clones, greps, classifies — never writes to the target repo) and runner-agnostic (runs as a Ditto-side ad-hoc worker; the user hasn't picked a runner yet under the BEFORE flow). It uses `isomorphic-git` (already in landscape.md as DEPEND, already pulled in by Brief 200's workspace git server). Cloning a public repo needs no credentials; private repos use the GitHub OAuth pattern Brief 200/Brief 212 established.

The persona-fit scoring is a Ditto-specific opinion — it consumes `docs/personas.md` + the detected stack signals to produce a user-facing descriptor. The descriptor is intentionally NOT a persona name (Reviewer Critical #4 on the Designer's spec removed "Jordan-shaped" / "Lisa-shaped" labels — internal classification language doesn't surface to the user). Examples of acceptable descriptors: "mid-size org tooling, mature CI", "team-output review with quality gating", "customer-facing ecommerce content", "five-script glue repo, no test harness yet."

The gold-standard nearest-neighbour leverages `docs/landscape.md`'s corpus of evaluated projects: when the detected stack is "TypeScript + Next.js + Vercel + GitHub Actions", the nearest neighbours might be Vercel's own templates or other TS+Next.js entries already in landscape.md. Output: 1-3 named projects with one-line rationale each. This is itself a "first signal of value" — the user sees Ditto cross-referencing against a known corpus.

## Objective

Ship the read-only analyser that takes a `projects.id` with `status='analysing'`, clones the target repo, produces a structured `AnalyserReportBlock` rendered inline in the chat-col, and sets the workItems `briefState='backlog'` ready for the user's review + runner+tier confirmation per Brief 225's atomic three-write commit.

## Non-Goals

- **NO retrofitter logic** (sub-brief #3 territory). This brief produces the analyser report; #3 consumes it as input and writes `.ditto/` artefacts to the target repo.
- **NO modifications to Brief 225's plumbing CONTRACT.** The `project-onboarding.yaml` trigger event, env-var gate, Server Component, Self tool, and `ConnectionSetupBlock` renderer extension stay unchanged. This brief inserts ADDITIONAL steps between `clone-and-scan` and `surface-report` and REPLACES the two placeholder handler BODIES — `surface-report` flips from "stub workItems INSERT" (Brief 225) to "populated AnalyserReportBlock INSERT" (this brief). The placeholder behaviour is fully replaced; both versions do NOT coexist at runtime. Architect's clarification per Reviewer Important #11. The trigger, the env-var gate, the `/projects/:slug/onboarding` Server Component, the `start_project_onboarding` Self tool, the `ConnectionSetupBlock` renderer extension — none of these change.
- **NO new runner kinds.** Brief 215 + 216 + 217/218 own the runner taxonomy; the analyser RECOMMENDS a runner kind from the existing enum, not invents one.
- **NO trust-tier reconsideration.** ADR-007's enum (`supervised | spot_checked | autonomous | critical`) is the recommendation set; the analyser maps detected evidence to a tier, not invents new tiers.
- **NO project memory scope filtering** (sub-brief #4 territory).
- **NO analyser cron / scheduled re-run.** Insight-205 §7 names re-runnable retrofit machinery; the re-run trigger lands in sub-brief #3. This brief ships only the on-demand, BEFORE-flow first-run. **Retry distinction (Reviewer MINOR #12):** the `[Retry]` CTA in the failure-mode AlertBlock (per §AC #11) kicks a FRESH `project-onboarding` process run for the same project — does NOT resume the failed run. Single-attempt retry only; multi-retry / scheduled retry is a follow-on.
- **NO embeddings-based gold-standard match.** Pure stack-signal matching against landscape.md (e.g., "TypeScript + Next.js" → search landscape entries with those terms). Embedding-based matching is a future enhancement.
- **NO `track`-kind project analysis.** Brief 225 hard-defaults `kind='build'` for onboarded projects; track projects come from a manual flow that this brief does NOT cover.
- **NO Designer re-pass.** Designer's existing spec at `docs/research/analyser-report-and-onboarding-flow-ux.md` covers this brief's UX. Sub-brief #4's separate Designer pass for memory promotion is independent.

## Inputs

1. `docs/briefs/224-project-onboarding-and-battle-readiness.md` §Sub-brief #2 (lines 186-196) — parent specification.
2. `docs/briefs/225-connection-as-process-plumbing.md` — placeholder seam this brief fills in (clone-and-scan + surface-report handlers; YAML structure; Server Component).
3. `docs/research/analyser-report-and-onboarding-flow-ux.md` — Designer's UX spec for Stage 3 report rendering. Consumed verbatim.
4. `docs/insights/205-battle-ready-project-onboarding.md` §6 (primary user-acquisition surface) — load-bearing for the report's content prioritisation.
5. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every analyser handler emitting DB writes carries `stepRunId` per Brief 225's existing pattern.
6. `docs/landscape.md:928-934` — `isomorphic-git` DEPEND entry; already pulled in by Brief 200's workspace git server. No new dependency.
7. `docs/personas.md` — for the persona-fit scoring's input vocabulary; output is descriptor-only (no persona names at user surface).
8. `docs/adrs/007-trust-earning.md` — trust-tier semantics. The analyser RECOMMENDS but doesn't decide; user picks per ADR-007 §"earned, not configured."
9. `packages/core/src/content-blocks.ts` — current discriminated union (26 types post-Brief-225); this brief adds `AnalyserReportBlock` (27 total).
10. `packages/core/src/db/schema.ts` `harness_decisions` table — analyser writes structured `reviewDetails` here per Brief 225's `surface-report` contract.
11. `processes/project-onboarding.yaml` (created by Brief 225) — this brief modifies it to add additional steps.
12. `src/engine/onboarding/handlers.ts` (created by Brief 225) — this brief replaces the two placeholder handler bodies + adds new sibling handlers for the new steps.
13. `packages/web/components/blocks/` — block renderer directory; this brief adds `analyser-report-block.tsx` to render the new ContentBlock type via design-package CSS classes.

## Constraints

- **Engine-first per CLAUDE.md.** Schema for `AnalyserReportBlock` (the discriminated-union type + sub-types like `Finding`, `RunnerRecommendation`) lives in `packages/core/src/content-blocks.ts` (engine — content-block taxonomy is portable). Analyser handler logic + persona-fit scoring + gold-standard matching live in `src/engine/onboarding/` (Ditto product layer — uses Ditto's persona model + landscape corpus). Block renderer lives in `packages/web/components/blocks/` (product). Ask: "could ProcessOS use this?" — `AnalyserReportBlock` type yes (any consumer running an analyser would produce this shape); the analyser implementation no (Ditto-specific).

- **`isomorphic-git` for cloning — DEPEND, no new dependency.** Already in `package.json` per Brief 200's workspace git server (`docs/landscape.md:928-935`). Use `git.clone({ fs, http, url, dir, singleBranch: true, depth: 1 })` for shallow clones. Default branch comes from `projects.defaultBranch` (Brief 215). For private repos, OAuth credentials come from the GitHub integration (Brief 200/212 patterns); private-repo handling is a separate concern from public-repo handling but uses the same call shape. **Depth=1 limit — explicit non-goal:** commit-cadence detection, contributor metrics, recent-activity scoring all require deeper clones; THIS brief does NOT ship those detectors. If a future detector needs commit history, a follow-on brief introduces a deeper-clone or `git ls-remote --heads` strategy.

- **Side-effecting function guard (Insight-180) — MANDATORY for every new handler.** Each new step's handler in `src/engine/onboarding/handlers.ts` takes `stepRunId` as the first parameter. The analyser handlers DO write to DB (clone results to a temp dir; report findings into harness_decisions.reviewDetails). DB-spy assertion pattern: zero DB calls before guard rejection.

- **No drift on Brief 225's plumbing contracts.** Specifically: (a) `project-onboarding.yaml`'s trigger event `project.connected` stays unchanged; (b) `surface-report` handler still writes the workItems row + harness_decisions audit row + notification — but with the populated `AnalyserReportBlock` data instead of a stub; (c) the `validateStatusTransition` invariant from Brief 215 stays untouched; (d) the env-var gate `DITTO_PROJECT_ONBOARDING_READY` continues to gate the user-facing surface.

- **`AnalyserReportBlock` schema is additive.** Discriminated union extension (the `type: 'analyser_report'` discriminant) — no breaking change to existing block consumers. Existing block renderers don't need modification; only the chat-col + workspace block list must register the new renderer.

- **Stack-signal detection is best-effort, not authoritative.** A repo with `package.json` AND `Cargo.toml` (a polyglot monorepo) returns multiple build systems; the report shows them all. The user can override the recommendation in the UI per Designer spec. The analyser's job is to surface evidence, not adjudicate.

- **Detector handlers fail in isolation; partial-success path is first-class.** When a detector throws (malformed config file, parse error, transient FS issue), `surface-report` renders the report with available findings AND an `info`-severity `AlertBlock` listing the detectors that failed. NO whole-report blocking on single-detector failure. Test cases for each detector's failure path land alongside the success-path tests.

- **Persona-fit scoring is descriptor-only at user surface — type-system enforced.** Internal scoring uses persona-shape vocabulary (`agentcrm-shaped` etc. as internal labels); the user-visible output is descriptor-only ("mid-size org tooling"). **The `scorePersonaFit` function returns ONLY `{ descriptor: string }` — internal labels are NOT exported from `persona-fit.ts`.** Discipline enforced at the type system, not just in prose. A unit test asserts the descriptor string never matches the internal-label pattern.

- **Gold-standard match — corpus indexed via Researcher-curated `docs/landscape-index.json`, NOT raw landscape.md parsing.** Reviewer flagged that `docs/landscape.md` is freeform markdown (bucket headers, narrative prose, table fragments) and not robustly parseable. **Architect's call:** Researcher curates a structured index file (`docs/landscape-index.json` or `.yaml` — Architect picks shape) that the analyser reads at boot. Each entry: `{ name, url, stackSignals: string[], oneLineRationale }`. Researcher updates the index when landscape.md changes (one-line discipline addition to the Researcher's role contract). **At MVP scope: if the index doesn't exist yet, the gold-standard match returns an empty array gracefully, and the report renders without nearestNeighbours.** Builder verifies at builder-time whether the index file exists; if not, ship the analyser without gold-standard match and add the index in a Researcher follow-on. NOT a live web search; NOT embedding similarity.

- **Runner + trust-tier recommendation grounded in evidence.** The mapping from detected signals to recommendations:
  - Tests exist + CI green + branch protection on → `spot_checked` reasonable; runner depends on stack (TS/Next.js → `claude-code-routine`, large monorepo → `local-mac-mini`).
  - No tests, no CI → `supervised` recommended (override-able to `local-mac-mini` for fast iteration).
  - Catalyst harness detected → `claude-code-routine` likely (Catalyst already runs there); `harnessType` from Brief 215 stays as-is.
  - GitHub Actions but no Vercel/Fly → `github-action` runner reasonable for hands-off projects.
  These are heuristics, not invariants. The architect of THIS brief writes the mapping table; the user can override at the picker.

- **Cleanup of cloned repo — try/finally + cleanup-on-boot.** The clone goes to a temp dir (`mkdtemp`-based path under `/tmp/ditto-analyser-*`). Cleanup happens in a `try { … } finally { rm -rf }` block in the `surface-report` handler — runs on success AND on parent-step throw. Engine startup ALSO sweeps `/tmp/ditto-analyser-*` directories older than 24 hours (cleanup-on-boot pattern; protects against engine-crash-mid-handler dir leaks). NO long-lived clones — the retrofitter (sub-brief #3) re-clones to its own working directory.

- **Failure modes — first-class, audited via `activities` (NOT `harness_decisions.actorType` which doesn't exist on that table).** Reviewer Critical fix: `harness_decisions` has no `actor_type` column (verified at `packages/core/src/db/schema.ts:585-613`); `actorType` lives on `activities` (`schema.ts:760`). When the clone fails (404, network, auth), the analyser writes (a) a `harness_decisions` row with `processRunId` + `stepRunId` (both NOT NULL — both available at clone-step entry) + `reviewDetails.error = { stage: 'clone', message }`, AND (b) a sibling `activities` row with `actorType='analyser'`, `action='analyser_clone_failed'`, `entityType='project'`, `entityId=<projectId>`, `metadata={ stage, message, ...}`. The workItems row gets `briefState='blocked'`. The chat-col Server Component renders an `AlertBlock` instead of the report; user can retry from the same surface. NO silent failure; NO stranded `analysing` projects.

- **Reference docs touched in this brief** (Insight-043):
  - `docs/dictionary.md` — three new entries: Analyser Report (the AnalyserReportBlock type + its data shape), Persona-fit Descriptor (user-facing string), Gold-standard Match (the landscape.md cross-reference). Builder writes at implementation.
  - `docs/state.md` — architect checkpoint for this brief.
  - `human-layer.md` — already flagged in Brief 225's After Completion for Documenter; this brief does NOT update directly.
  - `docs/architecture.md` — NOT updated; absorption gates per Insight-205 + Insight-201 (sub-brief #3 ships first to discharge them).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Repo cloning | `isomorphic-git` (`docs/landscape.md:928-934`, Brief 200) | depend (existing) | Already pulled in; pure-JS, runs in Node + browser. |
| Stack-signal detection patterns | `package.json` / `Cargo.toml` / `pyproject.toml` / `Gemfile` / `go.mod` parsing — established conventions | pattern (industry-standard) | File-based detection is the canonical approach (Vercel, Render, Railway, Render all use this). |
| Test-framework detection | Vitest config search (`vitest.config.ts`), jest config search, playwright presence | pattern (industry-standard) | Same shape as IDE auto-detection. |
| CI detection (.github/workflows + .gitlab-ci.yml + .circleci) | Filesystem-pattern detection | pattern (industry-standard) | Universal CI conventions. |
| Existing-harness detection | `.claude/` / `.cursorrules` / `AGENTS.md` / `.catalyst/` / `.ditto/` filesystem markers | pattern (Ditto-specific cataloging) | Each is a known harness flavour Ditto interoperates with. |
| Persona-fit scoring vocabulary | `docs/personas.md` four personas + their tooling JTBD | adopt (canonical) | Ditto's own persona model; output is descriptor-only at user surface. |
| Gold-standard nearest-neighbour | `docs/landscape.md` Researcher-curated corpus | depend (existing corpus) | Reuses existing curation; no new research surface introduced. |
| Runner + trust-tier recommendation heuristics | Brief 215 runner taxonomy + ADR-007 trust enum | pattern (self-reuse) | Maps evidence to existing decision space; NO new enums. |
| `AnalyserReportBlock` discriminated-union extension | `packages/core/src/content-blocks.ts` (existing 28 types) | pattern (self-reuse) | Same shape as Brief 072's `WorkItemFormBlock` extension; additive only. |
| Block renderer composition (`block.evidence` + `block.decision` + `block.plan`) | Anthropic Claude Design package `Workspace.html` | depend (design-system source-of-truth) | Existing CSS classes + Designer spec verbatim. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/content-blocks.ts` | **Modify:** add `AnalyserReportBlock` interface + sub-types (`Finding`, `RunnerRecommendation`, `TrustTierRecommendation`, `GoldStandardMatch`). Export from the discriminated-union ContentBlock type. The shape per Designer spec: `entityType + entityId` (FK to workItems row), `projectId` (FK to projects), `atAGlance: { stack, metadata, looksLike, nearestNeighbours }`, `strengths/watchOuts/missing: Finding[]`, `recommendation: { runner, trustTier }`. |
| `packages/core/src/onboarding/types.ts` | **Create:** engine-side type definitions for the analyser's intermediate shapes — `BuildSystemDetection`, `TestFrameworkDetection`, `CIDetection`, `HarnessDetection`, `StackSignals`. These types are portable (ProcessOS could analyse repos too); they live in core. |
| `processes/project-onboarding.yaml` | **Modify:** insert new steps between `clone-and-scan` and `surface-report`: `detect-build-system`, `detect-test-framework`, `detect-ci`, `detect-existing-harness`, `score-persona-fit`, `match-gold-standard`, `recommend-runner-tier`. All `executor: script`. Trigger + filename + first/last steps unchanged from Brief 225. |
| `src/engine/onboarding/handlers.ts` | **Modify:** replace `clone-and-scan` body (was no-op) with real `isomorphic-git` clone to a temp dir. Replace `surface-report` body (was stub) with real `AnalyserReportBlock` write to harness_decisions.reviewDetails + workItems row. Each new step from the YAML gets a corresponding handler. ALL handlers retain Insight-180 `stepRunId` guard. |
| `src/engine/onboarding/detectors/build-system.ts` | **Create:** `detectBuildSystem(repoDir): BuildSystemDetection[]` — pure function, returns 0+ build systems detected (multi-stack repos return multiple). Detects Node (package.json + manager from lockfile), Python (pyproject.toml/requirements.txt/setup.py), Ruby (Gemfile), Rust (Cargo.toml), Go (go.mod), PHP (composer.json), Java (pom.xml/build.gradle). |
| `src/engine/onboarding/detectors/test-framework.ts` | **Create:** `detectTestFramework(repoDir, buildSystem): TestFrameworkDetection[]` — detects vitest (vitest.config.{ts,js,mjs}), jest (jest.config.* or "jest" key in package.json), playwright (playwright.config.ts), pytest (pytest.ini, conftest.py), RSpec (.rspec or spec/spec_helper.rb), cargo-test (Cargo.toml `[dev-dependencies]`), go-test (any `*_test.go` file). |
| `src/engine/onboarding/detectors/ci.ts` | **Create:** `detectCI(repoDir): CIDetection` — checks `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `Jenkinsfile`. Returns the CI provider + workflow file paths + last-known status if accessible (GitHub Actions API for `.github/workflows/`; for others, just presence). |
| `src/engine/onboarding/detectors/harness.ts` | **Create:** `detectHarness(repoDir): HarnessDetection` — checks for `.claude/`, `.cursorrules`, `AGENTS.md`, `.catalyst/`, `.ditto/`, `CLAUDE.md`, `CURSOR.md`. Returns the harness flavour(s) detected + version/config-file paths. |
| `src/engine/onboarding/persona-fit.ts` | **Create:** `scorePersonaFit(signals: StackSignals): { descriptor: string }` — small lookup table mapping detected-stack-signature to user-facing descriptor. Multi-key match for descriptors like "mid-size org tooling, mature CI" (= TypeScript + GitHub Actions + branch protection + tests). Returns the top-scoring descriptor. NO persona names at the user surface. |
| `src/engine/onboarding/gold-standard.ts` | **Create:** `matchGoldStandard(signals: StackSignals): GoldStandardMatch[]` — parses `docs/landscape.md` (loaded via filesystem at engine boot, cached) and ranks entries by stack-signal overlap. Returns top 1-3 with one-line rationale. |
| `src/engine/onboarding/recommend.ts` | **Create:** `recommendRunner(signals): { kind, rationale, alternatives }` + `recommendTrustTier(signals): { tier, rationale, alternatives }` — the heuristic mapping table from §Constraints. |
| `src/engine/onboarding/handlers.test.ts` | **Modify:** replace placeholder tests with real-handler tests. Mock `isomorphic-git` for clone path; assert detector outputs against fixture repos in `src/engine/onboarding/__fixtures__/`. |
| `src/engine/onboarding/__fixtures__/` | **Create:** small fixture repos for testing — a TypeScript+Next.js+vitest repo, a Python+pytest+GitHub-Actions repo, a no-tests Bash-script repo. Just the config files, not full source. |
| `src/engine/onboarding/detectors/*.test.ts` | **Create:** unit tests for each detector against the fixtures. |
| `packages/web/components/blocks/analyser-report-block.tsx` | **Create:** React renderer for `AnalyserReportBlock`. Renders the section sequence per Designer spec: at-a-glance card → strengths (`block.evidence` with `text-positive`) → watch-outs (`block.evidence` with `text-caution`) → missing (`block.evidence` with `text-negative`) → runner picker (`block.decision` with `.dopt.rec` recommended) → tier picker (`block.decision`) → CTA row. Uses existing design-package CSS classes. |
| `packages/web/components/blocks/analyser-report-block.test.tsx` | **Create:** rendering tests for each section + interaction states (loading, error, edit-mode). |
| `packages/web/components/blocks/index.ts` (or wherever block registry lives — grep) | **Modify:** register the new `analyser-report` block renderer with the existing block registry. |
| `packages/web/components/blocks/error-block.tsx` (or use existing `AlertBlock`) | **Verify:** the analyser's failure-mode rendering reuses the existing AlertBlock; no new error component needed. |
| `docs/dictionary.md` | **Modify:** 3 new entries (Analyser Report, Persona-fit Descriptor, Gold-standard Match). Builder writes at implementation. |
| `docs/landscape.md` | **No update from this brief.** The corpus stays as-is; the analyser consumes it read-only. If gold-standard matching reveals gaps in the corpus, Architect/Researcher fold those in via separate work. |

## User Experience

**Per `docs/research/analyser-report-and-onboarding-flow-ux.md`** (Designer pass, post-Reviewer, post-design-package integration). Spec consumed verbatim — Stage 3 (analyser report rendering) is THIS brief's UX scope.

- **Jobs affected:** Review (the analyser report is a review surface — user reviews findings), Decide (runner+tier picker is a decision moment), Orient (at-a-glance card is an orient surface — "what does Ditto see about this repo"). Brief 225 covered Define + Capture upstream.
- **Primitives involved:** new `AnalyserReportBlock` ContentBlock type. Renders via existing design-package CSS classes (`block.evidence`, `block.decision`, `alex-line`) — no new CSS. The block joins the existing 28-type ContentBlock registry.
- **Process-owner perspective:** Jordan finishes pasting his URL (Brief 225) → wait state shows (`block.plan` with steps) → 30-90 seconds later the analyser report renders inline in the chat-col → he reads the at-a-glance, scans strengths/watch-outs/missing, sees runner+tier pre-selected with rationale → taps `[Looks good — start the project]` → Brief 225's confirm endpoint flips to active.
- **Visual identity:** Anthropic Claude Design handoff bundle (id `iK3gPHe3rGAErdm4ua2V-A`). Severity colour washes use semantic tokens (`text-positive` / `bg-positive/5` for strengths; `text-caution` for watch-outs; `text-negative` for missing). Runner + tier `block.decision` cards use `.dopt.rec` for the recommended option with `.recbadge` and visible rationale (`dfoot` row).
- **Failure mode UX:** clone failure / detector failure → render `AlertBlock` (existing) with the failure category + retry CTA. NO silent stranded `analysing` projects.

## Acceptance Criteria

1. [ ] **`AnalyserReportBlock` ContentBlock type lands.** `packages/core/src/content-blocks.ts` exports `AnalyserReportBlock` interface + its sub-types (`Finding`, `RunnerRecommendation`, `TrustTierRecommendation`, `GoldStandardMatch`). Discriminant `type: 'analyser_report'`. The discriminated-union ContentBlock type is updated. `pnpm run type-check` (root) passes.

2. [ ] **`processes/project-onboarding.yaml` extended with 7 new steps** between `clone-and-scan` and `surface-report` (`detect-build-system`, `detect-test-framework`, `detect-ci`, `detect-existing-harness`, `score-persona-fit`, `match-gold-standard`, `recommend-runner-tier`). YAML loads cleanly; `loadProcess('project-onboarding')` returns valid `ProcessDefinition`. Trigger event + first/last step names unchanged from Brief 225.

3. [ ] **`clone-and-scan` handler clones the target repo via `isomorphic-git`.** Public repos: clones to a temp dir (`mkdtemp`-based path); shallow clone (`depth: 1`); single-branch (uses `projects.defaultBranch`). On success: returns the temp dir path in handler context for downstream steps. On failure: writes `harness_decisions` row with `reviewDetails.error = { stage: 'clone', ...}` and the workItems row gets `briefState='blocked'`.

4. [ ] **All seven new detector/scoring handlers run and produce structured output** (matching the 7 new YAML steps from §AC #2: `detect-build-system`, `detect-test-framework`, `detect-ci`, `detect-existing-harness`, `score-persona-fit`, `match-gold-standard`, `recommend-runner-tier`). Each handler reads from the cloned repo dir + writes its findings into the in-memory handler context (passed to `surface-report`). Detector unit tests pass against the fixture repos. Reviewer MINOR #14 alignment: AC count matches YAML step count.

5. [ ] **`match-gold-standard` returns 1-3 named landscape.md entries** with one-line rationale each. Test: with stack signals matching a known landscape entry, the matcher returns it; with no matches, returns an empty array (gracefully degraded).

6. [ ] **`recommend-runner-tier` produces grounded recommendations.** Mapping table from §Constraints implemented; test cases for each of the four mapping rules (tests+CI+protection / no-tests-no-CI / catalyst-detected / GitHub-Actions-only). Output shape matches `RunnerRecommendation` + `TrustTierRecommendation` types.

7. [ ] **`surface-report` INSERTs the populated `AnalyserReportBlock` data — Brief 225's placeholder is fully replaced.** Brief 225's `surface-report` placeholder behaviour (which inserted a stub workItems row) is REPLACED by this brief's populated-INSERT path; both versions do NOT coexist at runtime. The `surface-report` handler INSERTs a single workItems row with: `title='Onboarding report for <slug>'`, `body=<markdown rendering of the report>`, `briefState='backlog'`, the structured `AnalyserReportBlock` data stored in `workItems.context` (existing JSON-mode column at `packages/core/src/db/schema.ts:697-699` — verified the title-or-content invariant at schema.ts:736 is satisfied since both `title` and `body` are populated). The `harness_decisions` row carries the full report in `reviewDetails`. The notification fires via the existing rail. Reviewer Critical #3 + #11 fix.

8. [ ] **`AnalyserReportBlock` renderer renders the full section sequence.** `packages/web/components/blocks/analyser-report-block.tsx` produces: at-a-glance card → strengths/watch-outs/missing as three `block.evidence` cards with severity colour washes → two `block.decision` cards (runner + tier) with `.dopt.rec` recommended + `dfoot` rationale → CTA row. Renders in chat-col per Designer spec.

9. [ ] **Block registry registers the new renderer.** `packages/web/components/blocks/index.ts` (or equivalent) exports the new renderer mapped to `type: 'analyser_report'`. Existing renderers untouched.

10. [ ] **`/projects/:slug/onboarding` Server Component renders the populated report.** End-to-end: project created with `kickOffOnboarding: true` (Brief 225) → process kicks off → analyser runs → report renders inline. Verified with a public-repo fixture (e.g., a small TS+Next.js test repo).

11. [ ] **Failure modes are surfaced, not silent — partial-success path is first-class.** Clone failure (whole-process blocker) → `harness_decisions` row + sibling `activities` row (`actorType='analyser'`); workItems `briefState='blocked'`; chat-col Server Component shows `AlertBlock` with retry CTA. **Per-detector failure (partial-success path):** detector handlers that throw individually do NOT block the report — `surface-report` renders with available findings + an `info`-severity `AlertBlock` listing detectors that failed. Test cases: clone-404, clone-auth-failure, single-detector-throws, multiple-detectors-throw.

12. [ ] **`DITTO_PROJECT_ONBOARDING_READY` env var still gates the surface end-to-end.** Brief 225's gating remains intact; this brief doesn't bypass it. Test: with env false, the analyser's full output is invisible (Server Component returns 404 per Brief 225).

13. [ ] **All new handlers Insight-180-guarded.** Each handler in `src/engine/onboarding/handlers.ts` (the 7 new + the 2 modified) takes `stepRunId` first; DB-spy assertion verifies zero DB calls before guard rejection. NO regression of the guard discipline Brief 225 established.

14. [ ] **Cloned repo cleanup is crash-safe.** Cleanup runs in `try { … } finally { rm -rf <tempDir> }` — fires on success AND parent-throw. Engine startup sweeps `/tmp/ditto-analyser-*` dirs older than 24 hours (cleanup-on-boot). Test: post-run filesystem shows no residue; simulated mid-handler crash followed by engine restart shows residue cleaned within 24h boot sweep.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 224 + Brief 225 + Designer's UX spec + actual schema state + `packages/core/src/content-blocks.ts`.
2. Reviewer challenges:
   - Does this brief leave Brief 225's plumbing contracts untouched, or silently modify them?
   - Are the 7 new steps + 5 detectors + 2 modified handlers the right step decomposition, or is this over-decomposed (each step is one DB write — could collapse)?
   - Does `isomorphic-git` shallow-clone work for typical repos, or do private repos / large repos hit limits the brief doesn't address?
   - Is persona-fit scoring genuinely producing user-valuable descriptors, or is it cosmetic?
   - Does the gold-standard match scale with landscape.md growth (currently ~50 entries; will grow)?
   - Is the failure-mode UX (clone-failure, detector-failure) sufficient, or does it need more granular states?
   - Is the temp-dir cleanup path race-free (e.g., what if the engine crashes mid-handler — does the dir leak)?
   - Does AC count (14) appropriately cover one integration seam? Reviewer's split call.
   - Engine-vs-product split honoured?
3. Present brief + review findings to human for approval.

## Smoke Test

```bash
# Prerequisite: Brief 225 merged + DITTO_PROJECT_ONBOARDING_READY=true
DITTO_PROJECT_ONBOARDING_READY=true pnpm dev:engine &
sleep 3

# 1. Create a project against a small public repo
RESP=$(curl -s -X POST http://localhost:3000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"slug":"smoke-analyser","name":"Smoke Analyser","githubRepo":"vercel/next-app-router-playground","kickOffOnboarding":true}')
PROJ_ID=$(echo "$RESP" | jq -r '.project.id')

# 2. Watch the analyser process run
sleep 60
sqlite3 data/dev.db "SELECT step_id, status FROM step_runs WHERE process_run_id IN (SELECT id FROM process_runs WHERE process_id='project-onboarding');"
# Expected: 9 step_runs (clone-and-scan + 7 detectors + surface-report), all 'success'

# 3. Verify the analyser report row (the AnalyserReportBlock data lives in workItems.context, the existing JSON column)
sqlite3 data/dev.db "SELECT brief_state, json_extract(context, '$.atAGlance.stack') FROM work_items WHERE project_id='$PROJ_ID';"
# Expected: backlog | ["TypeScript", "pnpm", "next.js", ...]

# 4. Open the onboarding page
open "http://localhost:3000/projects/smoke-analyser/onboarding"
# Verify visually: at-a-glance card + strengths/watch-outs/missing + runner/tier pickers + CTA

# 5. Failure mode: invalid repo
RESP=$(curl -s -X POST http://localhost:3000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"slug":"smoke-fail","name":"Smoke Fail","githubRepo":"nonexistent-org/does-not-exist","kickOffOnboarding":true}')
PROJ_ID=$(echo "$RESP" | jq -r '.project.id')
sleep 30
sqlite3 data/dev.db "SELECT brief_state FROM work_items WHERE project_id='$PROJ_ID';"
# Expected: blocked
sqlite3 data/dev.db "SELECT action, json_extract(metadata, '$.stage') FROM activities WHERE entity_type='project' AND entity_id='$PROJ_ID' AND action='analyser_clone_failed' ORDER BY created_at DESC LIMIT 1;"
# Expected: analyser_clone_failed | clone

# 6. Cleanup verification
ls /tmp/ | grep ditto-analyser
# Expected: no residue
```

## Reviewer Pass Summary (2026-04-27)

Fresh-context Reviewer ran with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 224 + Brief 225 + Designer's UX spec + actual schema state. **Verdict: FAIL on first pass.** All CRITICAL findings (3) + IMPORTANT findings (8) + MINOR findings (3) addressed in-session. Brief promoted to `Status: ready` only after fixes verified.

- **CRITICAL #1 (Designer spec missing on disk) FIXED:** `docs/research/analyser-report-and-onboarding-flow-ux.md` was lost in the same workspace reset that wiped Brief 225 from a prior session; recreated 2026-04-27 with all post-Reviewer-fixes baked in. Brief 226 now consumes a real on-disk spec.
- **CRITICAL #2 (`harness_decisions.actorType` doesn't exist) FIXED:** Reviewer verified `harness_decisions` schema at `packages/core/src/db/schema.ts:585-613` has no `actor_type` column; `actorType` lives on `activities` (`schema.ts:760`). §Constraints failure-mode + §AC #11 rewritten — clone failure writes BOTH a `harness_decisions` row (with `processRunId` + `stepRunId` + `reviewDetails.error`) AND a sibling `activities` row (with `actorType='analyser'`).
- **CRITICAL #3 (`workItems.structured_field` doesn't exist) FIXED:** Reviewer verified `workItems.context` (JSON-mode column at `schema.ts:697-699`) is the real carrier. Smoke test + AC #7 reference `workItems.context` instead. AC #7 also resolves Reviewer Important #11 (Brief 225's placeholder is fully REPLACED, not "updated" — both versions don't coexist).
- **IMPORTANT #4 (ContentBlock count off by 2) FIXED:** Reviewer counted 26 types in `content-blocks.ts:450-476`; brief's "28 → 29" claim corrected to "26 → 27".
- **IMPORTANT #5 (landscape citation) FIXED:** updated to `docs/landscape.md:928-935`.
- **IMPORTANT #6 (`depth: 1` limitation) FIXED:** explicit non-goal added to §Constraints — commit-cadence/contributor metrics out of scope; future detector needing history is a follow-on.
- **IMPORTANT #7 (landscape.md parsing hand-wavy) FIXED:** §Constraints commits to a Researcher-curated `docs/landscape-index.json` corpus rather than freeform-markdown parsing. At MVP scope, missing index → analyser ships without gold-standard match (graceful degradation).
- **IMPORTANT #8 (persona-fit type-system enforcement) FIXED:** §Constraints + §What Changes specify `scorePersonaFit` returns ONLY `{ descriptor: string }`; internal labels NOT exported; unit test asserts descriptor never matches the internal-label pattern.
- **IMPORTANT #9 (failure-mode partial-success) FIXED:** §Constraints + §AC #11 add explicit partial-success path — single-detector throws don't block the whole report; rendered with available findings + `info`-severity AlertBlock.
- **IMPORTANT #10 (cleanup race on engine crash) FIXED:** §Constraints + §AC #14 add `try/finally` cleanup AND cleanup-on-boot sweep of `/tmp/ditto-analyser-*` older than 24 hours.
- **IMPORTANT #11 (surface-report INSERT-vs-UPDATE) FIXED:** AC #7 + §Non-Goals explicit — Brief 225's placeholder is fully replaced; `surface-report` INSERTs the populated row.
- **MINOR #12-#14 incorporated:** §Non-Goals retry-vs-no-rerun clarified; AC count alignment with YAML steps verified; Insight-205 absorption claim re-verified against Brief 224 §AC #8.

**Reviewer's parent-brief coverage check:** Brief 224 §Sub-brief #2 estimated ~12-14 ACs covering the analyser handler + 5 detectors + persona-fit + gold-standard + recommendation + report write + UX. Brief 226 lands at 14 ACs after fixes; coverage 9/10 with the parent's "structured report write to harness_decisions.reviewDetails + workItems row" intent now correctly mapped to real columns. **Net: 14 ACs, one integration seam (the analyser report writeback), within Insight-004's 8-17 range — no split needed.**

## After Completion

1. Update `docs/state.md` with what changed.
2. Update `docs/roadmap.md` Project Onboarding & Battle-Readiness phase row — sub-brief #2 marked complete; `DITTO_PROJECT_ONBOARDING_READY=true` flag flipped.
3. Phase retrospective: did `isomorphic-git` shallow-clone work for typical repos? Did the persona-fit descriptor produce genuinely user-valuable strings, or was it cosmetic? Did the gold-standard match's landscape.md parsing perform acceptably, or does it need an indexed cache?
4. **Insight-205 absorption progress:** this brief is sub-brief #2 of Brief 224. Per Brief 224 §AC #8, Insight-205 stays `active` until at least one of #2 or #3 ships. **THIS BRIEF discharges that gate.** Insight-205 absorbs into `docs/architecture.md` §L1 Process Layer with a one-paragraph note on connection-as-process. Documenter handles.
5. **Insight-201 absorption progress:** parent brief 224 names sub-brief #3's `.ditto/` artefacts as application #2. THIS brief does NOT discharge Insight-201; sub-brief #3 does.
6. ADR check: no ADR required for this brief. ADR-043 (`.ditto/`) is sub-brief #3 territory.
