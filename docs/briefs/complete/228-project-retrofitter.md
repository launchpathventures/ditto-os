# Brief 228: Project Retrofitter — `.ditto/` Substrate Writer (Project Onboarding seam #3a)

**Date:** 2026-04-27
**Status:** complete (2026-04-28, post-Builder + Reviewer (REVISE → all CRIT/IMP/MIN fixed) + Documenter wrap; brief moved to `docs/briefs/complete/`. AC #11 user-edit-safety SURFACE partial — runner-side enforcement happens via the prompt template, but the runner_dispatches schema has no body-channel for the runner's `{ commitSha, actuallyChangedFiles, skippedFiles }` structured response. A follow-on schema-extension brief is named in `docs/state.md` to add `responseBody` + thread it through the cloud-runner adapters' status-handling. End-to-end skip-list display is deferred to that brief.)

**Builder note (Reviewer MIN-1):** AC #6 says "6 .ditto/ files." This is a brief miscount. Per ADR-043, the actual `.ditto/` directory carries **13 entries**: 7 role-contracts (one per `/dev-*` role) + 6 directory artefacts (skills.json, tools.json, guidance.md, onboarding-report.md, version.txt, .gitignore). ADR-043 is canonical; the brief's "6" was an off-by-N count.

**Builder follow-on flagged:** **Future brief — runner_dispatches response-body channel.** `runner_dispatches` schema (`packages/core/src/db/schema.ts:1165-1219`) has no field for the runner's structured response. Brief 228 MVP parses `commitSha` from `externalRunId` if hex-shaped; `actuallyChangedFiles` + `skippedFiles` flow through as undefined. The runner-side user-edit-safety enforcement (Q3 resolution) STILL HAPPENS — the prompt instructs the runner to compare on-disk hashes and skip user-edited files — but Ditto can't display the skip-list in `RetrofitPlanBlock.skippedUserTouchedFiles` until a future brief adds e.g. a `responseBody: text("response_body", { mode: "json" })` column to `runner_dispatches` + threads it through the cloud-runner adapters' status-handling code paths.
**Depends on:**
- Brief 215 (`projects` substrate; `defaultRunnerKind`; `runnerBearerHash`).
- Brief 225 (Connection-as-process plumbing; the confirm route's TODO breadcrumb at `packages/web/app/api/v1/projects/[id]/onboarding/confirm/route.ts:271-275` is exactly the trigger this brief fills in; the `data.trustTier` field already accepted at line 277 but currently dropped is wired through here).
- Brief 226 (In-depth analyser; the `AnalyserReportBlock` shape + `harness_decisions.reviewDetails` payload that this brief consumes as the retrofit-plan input).
- Brief 212 (`bridge.dispatch` for `runner=local-mac-mini`).
- Brief 216 (`claude-code-routine` adapter), Brief 217 (`claude-managed-agent` adapter), Brief 218 (`github-action` adapter) — all reachable via the unified `dispatchWorkItem` entry-point in `src/engine/runner-dispatcher.ts:93-300`. **Brief 224 §Sub-brief #3's "Path A vs Path B" question on the cloud-subprocess adapter is moot** — all four cloud-runner adapters are now shipped (verified `Status: complete` in `docs/briefs/complete/`).

**Unlocks:**
- The retrofit process for **autonomous + critical + spot_checked tiers**: when the user approves the analyser report + picks runner+tier at `/projects/:slug/onboarding/confirm`, `processes/project-retrofit.yaml` kicks off, generates a `.ditto/` substrate plan from the analyser report, and dispatches the writes through the picked runner (autonomous: silent; spot_checked: sample-review-then-dispatch; critical: rejection).
- **Brief 229 (supervised-tier per-file approval surface)** — Designer-blocked sibling sub-brief; reuses Brief 228's plan generator + dispatcher + `RetrofitPlanBlock` data shape; adds the `/retrofit/approval` route + the per-file rendering. Brief 228 ships the data shape + the autonomous/critical/spot_checked paths so 229 has only the UI seam to land.
- **ADR-043 (`.ditto/` Project Substrate Directory Shape) reaches `accepted` status.** Reserved by Brief 224 §Constraints; this brief writes the body.
- **Insight-201 absorption gate progresses but does NOT discharge alone.** Brief 199 (memory projection) has not yet shipped (verified — still in `docs/briefs/`, not `complete/`). Insight-201's criterion requires (a) at least one shipped brief applies it AND (b) a second independent brief applies it. If Brief 199 ships before Brief 228, the gate discharges with Brief 228 as application #2; if Brief 228 ships first, Brief 228 is application #1 and the gate stays open pending Brief 199. Documenter resolves at brief closeout based on ship order.
- **Insight-202 absorption gate stays open** but gains evidence (this brief is application #1.5 — `.ditto/` displaces a fuzzy category of vendor-shipped harness packages: Catalyst, agentskills.io, vendor-shipped `.cursorrules` templates — not a single named external service). Full absorption awaits a third unambiguous "Ditto-as-X" application per Brief 224 §AC #9b.
- **Insight-217 absorption progresses.** Brief 228 IS the third multi-step pipeline that needs `step_runs.outputs` querying (after Brief 226's analyser + the cron-driven outbound monitor). Per Insight-217's recommendation, this brief extracts the helper to `packages/core/src/harness/step-output-reader.ts` so onboarding handlers + retrofit handlers consume one source. Documenter folds the insight at closeout if Brief 228 ships the extraction cleanly.

**Parent brief:** 224 (Project Onboarding & Battle-Readiness)

---

## Sub-Brief Split (Reviewer pass — 2026-04-27)

The Reviewer's I7 finding flagged that the original Brief 228 (16 ACs) crossed Insight-004's "one integration seam" envelope. Five distinct seams existed: retrofit handlers, prompt template, Self tool, two new public web routes, the new ContentBlock + renderer. The supervised-tier per-file approval surface is the single largest contributor + is Designer-blocked + is a UI concern. Splitting that seam off lets the rest of the retrofit pipeline ship without a Designer dependency and keeps each sub-brief at the lower-middle of Insight-004's 8-17 envelope.

**Split applied:**

- **Brief 228 (this brief)** — Retrofitter pipeline for autonomous + critical + spot_checked tiers + ADR-043 + plan generator + idempotent re-run + the `RetrofitPlanBlock` data shape + minimal renderer (status pill + commit link only; no per-file approval rows). 11 ACs.
- **Brief 229 (sibling sub-brief, scheduled separately)** — Supervised-tier per-file approval surface. Designer-blocked (`docs/research/retrofit-supervised-approval-ux.md` MANDATORY before Builder). Adds the `/retrofit/approval` route, the per-file approval UI rendering, the `pending-review → partially-approved → dispatched` status transitions, and the supervised-tier branch in `dispatch-write`. Reuses Brief 228's `RetrofitPlan` types + dispatcher composition + `RetrofitPlanBlock` discriminated union slot — only the UI surface + one additional API route + one additional dispatch-write code path land in 229. ~6-7 ACs.

Both sub-briefs ship under Brief 224's Project Onboarding & Battle-Readiness phase. Brief 228 unlocks Brief 229 (the data shape + the autonomous-tier reference path are 229's prerequisites).

---

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness — retrofitter brain (autonomous + critical + spot_checked paths).
- **Capabilities delivered:**
  - **`.ditto/` substrate written into the target repo at connection time, under the user's chosen runner, for autonomous + critical + spot_checked trust tiers.** Supervised tier rendered as `RetrofitPlanBlock.status='pending-review'` but the per-file approval UI + the resume path land in Brief 229; in this brief, supervised tier produces the block but does not dispatch.
  - **Retrofit-plan generator** that consumes the analyser report (`AnalyserReportBlock` from Brief 226 — already persisted at `workItems.context` + `harness_decisions.reviewDetails`) and produces a `RetrofitPlan = { files: RetrofitFile[] }` containing the initial `.ditto/` files Ditto wants to write. Engine-side primitives: `RetrofitPlan` + `RetrofitFile` + `RetrofitDispatchPayload` types in `packages/core/src/onboarding/types.ts` (alongside Brief 226's existing analyser types).
  - **New `processes/project-retrofit.yaml` system process** with four steps: `generate-plan` → `surface-plan` → `dispatch-write` → `verify-commit`. Triggered as a separate process invocation by the confirm route — replaces the TODO at `confirm/route.ts:271-275` AND removes the `brief-226-or-later` TODO comment label.
  - **Trust tier flow wired through.** The confirm route's `data.trustTier` field — currently accepted at line 277 of confirm/route.ts but dropped on the floor with a TODO comment — is now passed via `startProcessRun("project-retrofit", { projectId }, "event", { parentTrustTier: data.trustTier })`. The harness's existing `parentTrustTier → trustTierOverride` discipline (`heartbeat.ts:1743-1750`) sets `processRuns.trustTierOverride`, which the trust-gate handler reads at the `surface-plan` step.
  - **New `RetrofitPlanBlock` content block type** (28th in the discriminated union — extends `packages/core/src/content-blocks.ts`). Shape: `{ type: 'retrofit_plan', planId, files: Array<{ id, path, contentPreview, byteSize, action: 'create' | 'update' | 'unchanged' }>, runnerKind, trustTier, status: 'pending-review' | 'pending-sample-review' | 'partially-approved' | 'dispatched' | 'committed' | 'rejected' | 'failed', commitSha?, commitUrl?, skippedUserTouchedFiles?: string[] }`. Renderer in `packages/web/components/blocks/retrofit-plan-block.tsx` — Brief 228 ships the renderer for `pending-sample-review` / `dispatched` / `committed` / `rejected` / `failed` states (5 states); Brief 229 extends with `pending-review` + `partially-approved` (the per-file approval UI).
  - **Trust-tier-bound depth** — consumes ADR-007 verbatim; introduces NO new TrustAction enum values. The `dispatch-write` handler reads the trust-gate decision from `step_runs.reviewDetails.trustAction` (the existing `pause | advance | sample_pause | sample_advance` enum at `packages/core/src/db/schema.ts:111-116`) and branches:
    - `advance` (autonomous tier) → silent dispatch of all files; the renderer surfaces the committed result.
    - `sample_pause` (spot_checked, sample requires review) → block dispatch; render `pending-sample-review` with a yes/no `block.evidence` + `block.decision` surface on the sampled subset; user advances via existing review-token surface (Brief 211); on advance, dispatch all files.
    - `sample_advance` (spot_checked, no sample required this run) → silent dispatch of all files; mark sampled files for post-hoc audit via `RetrofitPlanBlock` field.
    - `pause` + `canAutoAdvance=false` (critical) → reject dispatch with structured error; `RetrofitPlanBlock.status='rejected'`; user-facing message names that critical-tier projects must hand-author `.ditto/`.
    - `pause` (supervised) → write `RetrofitPlanBlock.status='pending-review'`; **DO NOT dispatch**. Brief 229 ships the resume path.
  - **Per-runner dispatch via the existing unified entry-point.** The retrofit doesn't add per-runner code — the four runner kinds (`local-mac-mini`, `claude-code-routine`, `claude-managed-agent`, `github-action`) are already wired through `dispatchWorkItem(input, deps)` in `src/engine/runner-dispatcher.ts:93-300`. The retrofit composes a structured `workItem`; the dispatcher and existing per-kind adapters handle the wire. The runner-side prompt template (`retrofit-prompt.ts`) instructs the runner to write the planned files, commit, and push — and to return `actuallyChangedFiles: string[]` (per Q1 resolution: trust-the-runner over two-dispatch flow).
  - **Re-runnable retrofit surface.** A "Re-run retrofit" button on `/projects/:slug/onboarding` (and a sibling Self tool `rerun_project_retrofit(projectId)`) kicks a fresh `project-retrofit.yaml` invocation via `startProcessRun`. The generator emits a fresh plan from current repo state; the trust-tier-bound depth applies again.
  - **Idempotency + autonomous-tier user-edit safety (Q3 resolution).** Re-runs are idempotent per Insight-212. The plan generator computes a content hash for each file in the plan; the `dispatch-write` handler queries the prior retrofit's `harness_decisions.reviewDetails` for prior-run hashes; under autonomous tier, files whose CURRENT-on-disk hash differs from the PRIOR retrofit's hash are flagged `skippedUserTouchedFiles` and excluded from the dispatch. Files with action `'unchanged'` (current matches plan) are excluded. Test: re-run twice; second run produces zero file writes. Test: user edits `guidance.md` between runs; second autonomous re-run leaves the user's edit intact + AlertBlock side-car "skipped 1 user-touched file." Documented in ADR-043.
  - **`harness_decisions` audit per dispatch** — the `dispatchWorkItem` orchestrator already writes a `harness_decisions` row per attempt at `runner-dispatcher.ts:262-275`; the `verify-commit` handler UPDATES that existing row with the runner-returned commit SHA + actuallyChangedFiles + commit URL.

## Context

Brief 224 (parent) split battle-ready onboarding into four sub-briefs along the seams Insight-205 §"Where it should land" enumerated. Sub-briefs #1 (Brief 225 — connection plumbing), #2 (Brief 226 — analyser brain), and #4 (Brief 227 — project memory scope) all shipped (2026-04-27). Sub-brief #3 — the retrofitter — is the natural follow-on per `docs/state.md` and discharges Insight-201's absorption gate (subject to Brief 199's ship order; see §Unlocks). Brief 225 left the trigger TODO breadcrumb; Brief 226 left the structured analyser report at the `workItems.context` + `harness_decisions.reviewDetails` seam this brief consumes.

Brief 224's parent design committed to a Path A / Path B choice for the cloud-subprocess `claude-code-routine` adapter dependency (sub-brief #3 ACs #4): split the adapter as a sibling sub-brief (Path A) or bundle (Path B). **Both paths are now moot** — the cloud-runner adapter situation evolved during Briefs 216–218: `claude-code-routine` (Brief 216), `claude-managed-agent` (Brief 217), and `github-action` (Brief 218) all ship working adapters reachable through the unified `RunnerAdapter` interface + `dispatchWorkItem` orchestration. The retrofit composes on this surface; no per-runner adapter work belongs in this brief.

The Reviewer pass (2026-04-27) split this brief along its largest seam: the supervised-tier per-file approval surface. That surface is Designer-blocked (Brief 224 §Sub-brief #3's escalation trigger fires given the `.ditto/` outline lands at 6+ files), is the largest UI concern, and is structurally independent of the autonomous + critical + spot_checked paths. Splitting it into Brief 229 lets this brief ship without the Designer dependency and keeps Brief 229 sized to a single seam (the per-file approval UI).

The `.ditto/` substrate is the load-bearing legibility decision. Per Insight-201 §Implications #1, "default to file-backed or file-projected"; the retrofit's writes are file-as-primary at the target-repo seam. The `.ditto/` directory sits sibling to `.git/`, `.github/`, `.claude/`, `.catalyst/` — a hidden config directory by convention. Brief 224 §Architectural Decisions Captured outlined the candidate file structure (role-contracts, skills.json, tools.json, guidance.md, onboarding-report.md, version.txt); ADR-043 finalises that outline + the versioning + the re-run discipline + the autonomous-tier user-edit safety mechanism (Q3 resolution).

The retrofit task — cloning the repo, writing files into `.ditto/`, committing, and pushing — does NOT happen on Ditto's side. It happens on the runner's side: a `local-mac-mini` daemon, a cloud `claude -p` subprocess (Brief 216), a Managed Agent session (Brief 217), or a GitHub Actions workflow (Brief 218). Each of these already has working git tooling and credentials. The retrofit's composed `workItem` carries: a runner-agnostic prompt instructing the agent what to write where + a structured `RetrofitDispatchPayload` with the file contents + content hashes. The runner-side agent reads the payload, performs the writes through its native git tooling, returns `{ commitSha, actuallyChangedFiles }`. Ditto's `verify-commit` handler reads the response back and updates the existing `harness_decisions` audit row.

## Objective

Ship the retrofit pipeline (autonomous + critical + spot_checked paths) that takes a project's analyser report + chosen runner+tier and produces a `.ditto/` substrate in the target repo via the unified runner-dispatch surface, with trust-tier-bound depth that maps cleanly to ADR-007, an idempotent + user-edit-safe re-run path, and a clean handoff seam for Brief 229's supervised-tier per-file approval surface.

## Non-Goals

- **NO supervised-tier per-file approval UI in this brief.** Deferred to Brief 229 (Designer-blocked). Brief 228 produces `RetrofitPlanBlock.status='pending-review'` for supervised tier but does NOT render a per-file approval surface AND does NOT dispatch under supervised — the user sees the plan in `pending-review` state with a "Review pending in Brief 229" placeholder, OR (architect's preferred MVP posture) supervised tier is temporarily mapped to a `[Re-run on autonomous tier]` CTA with a copy explainer until Brief 229 lands. Reviewer to decide between these two MVP placeholders.
- **NO per-runner dispatch code.** All four runner kinds reach through `dispatchWorkItem` in `src/engine/runner-dispatcher.ts:93`. The retrofit composes a `workItem`; the dispatcher and existing per-kind adapters handle the wire.
- **NO new `RunnerKind` values.** Brief 215's enum (`local-mac-mini | claude-code-routine | claude-managed-agent | github-action | e2b-sandbox` per `packages/core/src/runner/kinds.ts:14-20`) is the surface; the retrofit consumes `projects.defaultRunnerKind` directly.
- **NO new `TrustAction` values.** ADR-007's enum (`pause | advance | sample_pause | sample_advance` per `packages/core/src/db/schema.ts:111-116`) is the surface; the retrofit's trust-tier mapping consumes existing semantics.
- **NO new `workItemType` values.** The retrofit `workItems` row uses existing `type='feature'` + `source='system_generated'` discriminators (mirroring Brief 226's analyser report row pattern); the `RetrofitPlanBlock` shape in `context` is the type discriminator.
- **NO scheduled cron-driven re-run.** Per Brief 224 §Non-Goals — re-run-on-schedule is reserved for a follow-on enhancement; this brief ships only the on-demand re-run path (button + Self tool).
- **NO multi-user `.ditto/` ownership / per-developer overrides.** Solo-user shape per pipeline-spec; multi-user `.ditto/` is a future brief.
- **NO `claude` CLI invocation from inside Ditto.** All Claude calls happen runner-side per Insight-211 (no self-HTTP from engine context). The retrofit composes a prompt for the runner; never runs `claude -p` on Ditto's process.
- **NO writing to the user's git remote outside the runner's commit+push path.** Ditto never holds a git push token for the user's repo; the runner uses its own credentials (PAT/OAuth registered with the project per Brief 215).
- **NO `.ditto/version.txt` migrator tooling.** Versioning is reserved (`.ditto/version.txt` carries the schema version) but the migrator that translates between schema versions is a future brief. ADR-043 documents the version field; the retrofit always writes the current version.
- **NO retrofit on `track`-kind projects.** Brief 225 hard-defaults `kind='build'` for onboarded projects; track projects come from a different flow that this brief does NOT cover. No explicit guard needed (the retrofit triggers post-confirm; track projects don't reach confirm).
- **NO modifications to Brief 226's analyser pipeline contracts.** The analyser writes `AnalyserReportBlock` to `workItems.context`; this brief reads from there. The 9-step `processes/project-onboarding.yaml` is unchanged; the retrofit ships a SEPARATE process YAML (`project-retrofit.yaml`).
- **NO modifications to the `validateStatusTransition` invariant from Brief 215.** The project's `status` is already `'active'` after the confirm route's atomic three-write commit; the retrofit kicks off as a separate process AFTER that flip.
- **NO `harness_decisions.reviewDetails` shape change.** Audit rows continue to carry retrofit-specific structured payloads under existing fields; no schema growth.
- **NO new memory `scopeType` value.** Memories captured during retrofit inherit the existing `process`-scope discipline + Brief 227's project-aware filtering.
- **NO Telegram surface.** Per Designer pattern from Brief 227 — the retrofit confirmation sheet is web-only at MVP.

## Inputs

1. `docs/briefs/224-project-onboarding-and-battle-readiness.md` §Sub-brief #3 + §Architectural Decisions Captured (`.ditto/` Directory Shape) — parent specification.
2. `docs/briefs/complete/225-connection-as-process-plumbing.md` — the trigger seam at `confirm/route.ts:271-275` (TODO breadcrumb).
3. `docs/briefs/complete/226-in-depth-analyser.md` — the analyser report shape this brief consumes; the `readPriorStepOutputs` pattern at `src/engine/onboarding/handlers.ts:144` to extract.
4. `docs/insights/201-user-facing-legibility.md` — load-bearing for the `.ditto/` decision; this brief is application #1 OR #2 depending on Brief 199's ship order (Documenter resolves at closeout).
5. `docs/insights/202-ditto-as-x-before-external-x.md` — partial application (#1.5); evidence accumulates but gate stays open.
6. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every retrofit handler that emits a DB write or dispatches a workItem carries `stepRunId`. The DB-spy assertion test pattern from Brief 226 (`handlers.test.ts:46-80`) is the template.
7. `docs/insights/205-battle-ready-project-onboarding.md` (archived 2026-04-27 — read from `docs/insights/archived/`) — already absorbed; cited here for the trust-tier-bound depth + the "first contact demonstrates value" frame.
8. `docs/insights/212-system-agent-handlers-must-be-idempotent.md` — load-bearing for the re-run discipline; `unchanged` file detection lives here.
9. `docs/insights/215-steprun-guard-internal-vs-external-side-effects.md` — relevant: the dispatcher call is external-side-effecting (writes to the user's repo); the `harness_decisions` audit row is internal. Both regimes apply.
10. `docs/insights/217-multi-step-pipelines-query-step-runs-outputs.md` — the four retrofit handlers query `step_runs.outputs` by `processRunId` + the prior step's `stepId`. Brief 228 IS the third multi-step pipeline that needs the helper, and per Insight-217's recommendation extracts `readPriorStepOutputs` to `packages/core/src/harness/step-output-reader.ts` for shared consumption.
11. `docs/adrs/007-trust-earning.md` — trust-tier semantics; sample-hash discipline at §"Conjunctive Upgrade / Disjunctive Downgrade".
12. `packages/core/src/content-blocks.ts` — current discriminated union (27 types post-Brief-226); this brief adds `RetrofitPlanBlock` (28 total).
13. `packages/core/src/onboarding/types.ts` — Brief 226's analyser types live here; this brief adds `RetrofitPlan`, `RetrofitFile`, `RetrofitDispatchPayload`, `RetrofitFileAction`.
14. `packages/core/src/db/schema.ts:111-116` (TrustAction enum) + `:681-740` (`workItems` table — note: `type` discriminator, NOT `kind`; no schema growth in this brief) + `:1165-1203` (`runner_dispatches` table) — read-only references.
15. `packages/core/src/runner/kinds.ts:14-20` — `RunnerKind` enum (5 values).
16. `packages/core/src/harness/handlers/trust-gate.ts:58-141` — trust-tier decision logic; the retrofit's `surface-plan` step composes on top (the trust-gate handler decides pause/advance/sample for the step run; retrofit's `dispatch-write` reads the decision via `step_runs.reviewDetails.trustAction`).
17. `src/engine/runner-dispatcher.ts:93-300` — `dispatchWorkItem(input, deps): Promise<DispatchOutcome>` — the unified dispatch entry-point. Insight-180 guard at line 97-102. `harness_decisions` row written per attempt at line 262-275 (the verify-commit handler UPDATES this existing row; does NOT INSERT a new one).
18. `src/engine/heartbeat.ts:1726-1776` — `startProcessRun(slug, inputs, triggeredBy, options?: { parentTrustTier?: TrustTier })` — the function the confirm route + Re-run button + Self tool call to trigger the retrofit. The `parentTrustTier` option threads through to `processRuns.trustTierOverride`.
19. `src/engine/heartbeat.ts:1743-1750` — `parentTrustTier → moreRestrictiveTrust → trustTierOverride` discipline; the retrofit consumes this verbatim.
20. `packages/web/app/api/v1/projects/[id]/onboarding/confirm/route.ts:271-275` — the TODO breadcrumb this brief replaces. The TODO comment label `brief-226-or-later` ALSO removed.
21. `packages/web/app/api/v1/projects/[id]/onboarding/confirm/route.ts:277` — the existing `data.trustTier` field that's currently dropped on the floor; Brief 228 wires it through.
22. `processes/project-onboarding.yaml` — Brief 226's pattern for an `executor=script` + `systemAgent`-backed step pipeline; the `project-retrofit.yaml` mirrors this shape.
23. `src/engine/onboarding/handlers.ts:144` — Brief 226's `readPriorStepOutputs` helper (currently NOT exported); this brief extracts to `packages/core/src/harness/step-output-reader.ts` per Insight-217 + updates onboarding handlers to consume the new shared module. Both the analyser handlers + the retrofit handlers use the extracted helper.
24. `src/engine/onboarding/handlers.test.ts:46-80` — Brief 226's parameterised DB-spy guard test pattern; mirrored verbatim across the 4 new retrofit handlers.
25. `src/engine/system-agents/index.ts` — Brief 226's pattern for registering per-step systemAgent handlers; this brief adds 4 new entries.
26. `packages/web/components/blocks/block-registry.tsx` — Brief 226 added the `analyser_report` case; this brief adds the `retrofit_plan` case.
27. `packages/web/components/blocks/analyser-report-block.tsx` — Brief 226's renderer; mirror its design-package CSS class composition pattern.
28. `packages/web/app/projects/[slug]/onboarding/page.tsx` — Brief 226's Server Component branching pattern; this brief adds a `RetrofitPlanBlock` rendering branch + a "Re-run retrofit" button.
29. `docs/landscape.md:928-936` — `isomorphic-git` already DEPEND; this brief does NOT add new framework dependencies (the runner side handles the git work).
30. `docs/dictionary.md` — three terms reserved by Brief 224 (`Battle-Readiness`, `Project Substrate`, `Retrofit`); Builder writes entries at point of contact.
31. `.claude/commands/dev-builder.md` + `.claude/commands/dev-architect.md` + `.claude/commands/dev-pm.md` — the role-contract markdown that the retrofit's `.ditto/role-contracts/` files are derived from (the retrofit may seed simplified role contracts into the target project; ADR-043 specifies the seed strategy).
32. **Anthropic Claude Design package — `Workspace.html` + `colors_and_type.css` + `workspace/blocks.js`** (handoff bundle from claude.ai/design, fetched 2026-04-27 by user request). Canonical block primitives: `block.plan` (steps with checkmarks + per-step metadata — used here to render the planned `.ditto/` files as a step list), `block.evidence` (kv pairs with label + bold value — used here for runner kind / trust tier / commit SHA / status metadata cards), `block.decision` (radio-style options with optional `.dopt.rec` "I'd pick" badge + rationale footer — used here for the `pending-sample-review` yes/no on the spot_checked sample subset). Source-of-truth comment in `colors_and_type.css` confirms `packages/web/app/globals.css (@theme block)` is canonical; the design package mirrors the codebase tokens.
33. `packages/web/components/blocks/analyser-report-block.tsx:1-24` — Brief 226's renderer; documents the same design-package CSS-layer gap this brief inherits. The renderer comments name the gap explicitly: "the design-package's component CSS layer (`alex-line`, `block.evidence`, `block.decision`, `recbadge`, `.dopt.rec`) is not yet present in `packages/web/app/globals.css` ... uses Tailwind utilities mapped to tokens for now." Brief 228 inherits the same posture: utility-mapped composition until the design-package CSS layer ports (separate scope, see §Open Question 6 below).

## Constraints

- **Engine-first per CLAUDE.md.** Engine (`packages/core/src/`): `RetrofitPlan`, `RetrofitFile`, `RetrofitDispatchPayload`, `RetrofitFileAction` types in `onboarding/types.ts`; `RetrofitPlanBlock` in `content-blocks.ts`; the **shared `readPriorStepOutputs` helper** in a new `harness/step-output-reader.ts` module (extracted from Brief 226's local helper). Product (`src/engine/onboarding/`): retrofit-plan-generator, retrofit-prompt template, retrofit handlers, the `processes/project-retrofit.yaml` definition. UI (`packages/web/`): renderer for the 5 statuses Brief 228 ships + Re-run button + the route. Ask: "could ProcessOS use this?" — `RetrofitPlan` types yes (any consumer running write-to-target-repo retrofit-style flows produces this shape); `step_runs.outputs` reader yes (any multi-step harness pipeline needs this); the `.ditto/`-specific plan generator no (Ditto's opinion).

- **Side-effecting function guard (Insight-180) — MANDATORY for every retrofit handler.** Each handler in `src/engine/onboarding/retrofitter.ts` takes `stepRunId` first; rejects calls without it (Insight-180 guard). Every handler that calls `dispatchWorkItem`, writes to `harness_decisions`, or updates `workItems` carries the guard. **Insight-215 internal-vs-external regimes both apply:** the dispatch call is external (the runner writes to the user's repo); the `harness_decisions` audit + `workItems` update are internal. The DB-spy assertion test from Brief 226 (`handlers.test.ts:46-80` — the parameterised guard test for every handler) is the template; replicate one assertion per retrofit handler in `retrofitter.test.ts`.

- **`readPriorStepOutputs` extraction (Insight-217 absorption).** Brief 228 IS the third multi-step pipeline that needs the helper (after Brief 226's analyser + the cron-driven outbound monitor referenced in Insight-217's recommendation). Per the insight's "extract a reusable utility" recommendation, this brief extracts the helper from `src/engine/onboarding/handlers.ts:144` to `packages/core/src/harness/step-output-reader.ts` and updates BOTH the existing analyser handlers AND the new retrofit handlers to consume it. The extraction is small + risk-free (pure DB read) + the analyser's existing tests verify behaviour preservation.

- **Trust tier flow — `parentTrustTier` option through `startProcessRun`.** The confirm route's `data.trustTier` (currently dropped at line 277 of `confirm/route.ts`) is now passed via `startProcessRun("project-retrofit", { projectId }, "event", { parentTrustTier: data.trustTier })`. The harness's existing discipline at `heartbeat.ts:1743-1750` constrains the effective tier via `moreRestrictiveTrust` and writes `processRuns.trustTierOverride`. The trust-gate handler reads this at the `surface-plan` step's tier evaluation. The Re-run button + Self tool ALSO accept a `trustTier` parameter (defaulting to the project's last-known tier — read from the most recent prior `processRuns.trustTierOverride` for this project; if no prior exists, default to `supervised`).

- **Trust-tier-bound depth — read decision from `step_runs.reviewDetails.trustAction`, do NOT re-implement.** The existing `trust-gate.ts:58-141` handler decides `pause | advance | sample_pause | sample_advance` on the `surface-plan` step. The `dispatch-write` handler reads the decision via the new shared `readPriorStepOutputs(processRunId, stepId)` helper and branches:
  - `advance` (autonomous) → dispatch all files in the plan.
  - `sample_advance` (spot_checked, sampling-not-required-this-run) → dispatch all files; `RetrofitPlanBlock.sampledFileIds` is populated for post-hoc audit.
  - `sample_pause` (spot_checked, sample-required) → block dispatch; `RetrofitPlanBlock.status='pending-sample-review'`; the user advances via the existing `/review/[token]` surface (Brief 211); on advance, dispatch all files.
  - `pause` + `canAutoAdvance=false` (critical) → reject dispatch with structured error; `RetrofitPlanBlock.status='rejected'`; user-facing message names that critical-tier projects must hand-author `.ditto/`. Same posture as `bridge.dispatch` in Brief 212 §Constraints line 86.
  - `pause` (supervised) → write `RetrofitPlanBlock.status='pending-review'`; **DO NOT dispatch** in Brief 228. Brief 229 ships the resume path. Brief 228's MVP placeholder either renders an explanatory "Per-file review will land in Brief 229" message OR provides a `[Re-run on autonomous tier]` escalation CTA (Reviewer to choose).
  - The Builder MUST NOT compute the trust-gate decision in retrofit code; the trust-gate handler is the source of truth.

- **Re-runnable retrofit must be idempotent per Insight-212 + user-edit-safe per Q3 resolution.** Two layers of safety:
  - **`unchanged` files (idempotency).** The plan generator inspects the target repo's current `.ditto/` (via the runner's structured response on the prior dispatch — `actuallyChangedFiles` already lists what was written), compares against the planned files, and marks each as `'create' | 'update' | 'unchanged'`. `unchanged` files are NOT included in the dispatch payload. Re-runs that produce only `unchanged` files complete with `RetrofitPlanBlock.status='committed'` + `commitSha=null` (no commit needed) + an info AlertBlock noting "no changes to retrofit". Test: re-run twice in succession; second run produces zero file writes.
  - **`skippedUserTouchedFiles` (autonomous-tier user-edit safety).** For each planned file with action `'update'`, the generator queries the prior retrofit's `harness_decisions.reviewDetails` for the prior-run content hash. If the file's CURRENT-on-disk hash differs from the prior-run hash, the file was user-touched between retrofits. Under autonomous tier, user-touched files are EXCLUDED from the dispatch payload + populated into `RetrofitPlanBlock.skippedUserTouchedFiles: string[]`. The renderer surfaces an info AlertBlock side-car listing skipped files. Under spot_checked + supervised tiers, the user explicitly approves the overwrite (no automatic skip). Test: user edits `guidance.md` between two autonomous re-runs; second run dispatches only changed-by-Ditto files; `guidance.md` stays as the user wrote it; AlertBlock surfaces "skipped 1 user-touched file".

- **`.ditto/` directory shape — ADR-043 written this brief.** The ADR finalises Brief 224's outline:
  - `.ditto/role-contracts/{dev-pm,dev-architect,dev-builder,dev-reviewer,dev-documenter,dev-researcher,dev-designer}.md` — markdown files, one per `/dev-*` role, derived from `.claude/commands/` but rewritten in project-context (project name, build/test commands, runner kind, trust tier).
  - `.ditto/skills.json` — skill index: `{ version, skills: [{ name, scope, sourceCommit }] }`. MVP: `skills` empty array; Architect notes the placeholder for future briefs to populate.
  - `.ditto/tools.json` — tool allowlist: `{ version, allowed: string[], denied: string[] }`. MVP: `allowed` = built-in safe tools (Read, Grep, Glob, Edit, Write, Bash); `denied` = empty.
  - `.ditto/guidance.md` — project-specific guidance: build commands (from `detect-build-system`), test commands (from `detect-test-framework`), branch naming conventions (from `detect-ci`), "things that have surprised past contributors" (initially: empty + a comment "captured here as the project evolves").
  - `.ditto/onboarding-report.md` — the human-readable analyser report (the same content rendered in `AnalyserReportBlock`, written here for grep-ability + git-trackability per Insight-201).
  - `.ditto/version.txt` — schema version (e.g., `1`); future ADRs ship migrators.
  - `.ditto/.gitignore` — guidance for what NOT to commit (per-developer overrides; cache files; future brief territory).
  ADR-043 also documents:
  - Why `.ditto/` not `.catalyst/` / `.cursorrules` / `.claude/` (each is a competing or complementary shape; `.ditto/` is for projects opting INTO Ditto-driven onboarding).
  - Catalyst-coexistence stance: a project may have both `.catalyst/` AND `.ditto/`; **`.ditto/` writes never touch sibling directories** (no overlap, no overwrite of `.catalyst/` or `.claude/` content).
  - Versioning seam (`.ditto/version.txt`) + future migrator deferral.
  - Re-run discipline including the **autonomous-tier user-edit safety mechanism (Q3 resolution)**: hash-compare current-on-disk vs prior-retrofit hash; user-touched files skipped under autonomous tier.
  - Header convention: each Ditto-regenerated file carries a `# DO NOT EDIT — regenerated by Ditto retrofit (run <processRunId>)` comment as a secondary safety signal beyond hash-compare.

- **Retrofit prompt template — runner-agnostic, structured payload.** The prompt the runner receives composes from a single template at `src/engine/onboarding/retrofit-prompt.ts`. The runner reads a structured payload (`RetrofitDispatchPayload = { commitMessage, files: Array<{ path, content, contentHash, action }>, branch, instructions }`) and is instructed to: (a) checkout the project's default branch, (b) write each file at its path with the given content, (c) commit with the given message, (d) push to default branch, (e) return a structured response `{ commitSha, actuallyChangedFiles: string[], skippedFiles?: string[] }`. The prompt is identical across runner kinds; the per-runner adapter handles the wire (Brief 216/217/218 already do this via `RunnerAdapter.execute`). **The prompt MUST NOT contain the file contents inline** (token-heavy + diff-noisy) — it references the structured payload by name and instructs the runner to read it from the workItem `context`. The structured payload is part of the workItem's `context` field per the existing dispatcher's contract.

- **Commit message format.** `chore(ditto): retrofit substrate v<version> (run <processRunId>)` — grep-able from the user's git log; carries the run id for cross-reference back to `harness_decisions`. The `processRunId` is opaque (UUID); audit-trail benefit dominates the disclosure cost (Q5 resolution).

- **`verify-commit` handler UPDATES the existing `harness_decisions` row.** `dispatchWorkItem` already writes a `harness_decisions` row per dispatch attempt at `runner-dispatcher.ts:262-275`. The `verify-commit` handler reads the dispatch result, extracts `commitSha + actuallyChangedFiles + commitUrl` from the runner's structured response (via `runner_dispatches.externalUrl` + the runner's `responseBody` field), and UPDATES the existing audit row's `reviewDetails` payload. The `workItems.context.RetrofitPlanBlock` is also updated with `status='committed'` + `commitSha` + `commitUrl` + (optionally) `skippedUserTouchedFiles`.

- **Cleanup discipline — no clones on Ditto's side.** Unlike Brief 226, the retrofitter does NOT clone the target repo on Ditto's process. The runner clones (or, for `github-action`, the workflow checkout step does). Ditto holds the structured `RetrofitDispatchPayload` in-memory only for the duration of the `dispatch-write` handler. NO `mkdtemp` calls. NO cleanup-on-boot needed for retrofit.

- **Re-run trigger surface.** Two paths:
  - Web button on `/projects/:slug/onboarding/page.tsx` ("Re-run retrofit") — POSTs to a new route `/api/v1/projects/:id/retrofit` with `{ kind: 'on-demand-rerun', trustTier?: TrustTier }`. The route invokes `startProcessRun("project-retrofit", { projectId }, "manual", { parentTrustTier: trustTier ?? lastKnownProjectTier })`. Default `trustTier` reads from the most recent `processRuns.trustTierOverride` for this project's `processSlug='project-retrofit'`; if none, defaults to `supervised`.
  - Self tool `rerun_project_retrofit(projectId, trustTier?)` — exposed in `src/engine/self-tools/`. Carries `stepRunId` per Insight-180 (Insight-215 internal-side-effecting regime — the tool calls `startProcessRun` which writes a `process_runs` row but does NOT itself write to the user's repo; the dispatch step does that and carries its own real `stepRunId`).

- **No drift on Brief 215's `RunnerKind` enum, Brief 225's atomic three-write, Brief 226's analyser report shape, Brief 227's project-aware memory filtering.** Verified at brief-write time:
  - `RunnerKind` enum: 5 values (`packages/core/src/runner/kinds.ts:14-20`). Retrofit consumes via `projects.defaultRunnerKind`; never invents.
  - `workItems.type` discriminator: existing values; retrofit row uses `type='feature'` + `source='system_generated'` + `RetrofitPlanBlock` in `context` (NO new type value, NO new `kind` column).
  - Atomic three-write: untouched. Retrofit kicks off AFTER the project flips to `'active'`.
  - `AnalyserReportBlock`: untouched. Retrofit reads `workItems.context` + `harness_decisions.reviewDetails` for the report; never modifies.
  - Project-aware memory filtering: untouched. Retrofit-time memory writes inherit `processes.projectId` per Brief 227.

- **Renderer composition — design-package primitives (block.plan + block.evidence + block.decision).** The `RetrofitPlanBlock` renderer at `packages/web/components/blocks/retrofit-plan-block.tsx` composes from three canonical primitives in the Anthropic Claude Design package's `workspace/blocks.js`:
  - **`block.plan`** — the planned `.ditto/` files render as a step list. Each step carries an icon (✓ for `'unchanged'`, the action-letter `c|u|s` for `'create' | 'update' | 'skipped'`), the relative path as the step title, byte size + action descriptor as the metadata line. The `block-head` carries the icon + "Retrofit plan" + a status pill (the surfaceable status from §User Experience interaction states).
  - **`block.evidence`** — the metadata cards (runner kind / trust tier / commit SHA after success / skipped-user-touched-file count) render as `kv` pairs. The `eline` row format (`<span>${k}</span><b>${v}</b>`) is the spec.
  - **`block.decision`** — the spot_checked `pending-sample-review` surface renders the sample subset as decision options. The `.dopt.rec` "I'd pick" badge is NOT used here (no recommendation; the user is approving the sample); the dfoot rationale carries a one-liner like "Approving the sample lets Ditto write all 6 files; skipping returns to picker."
  - **Status-pill colour mapping** (per `colors_and_type.css` semantic tokens):
    - `pending-sample-review` → `--color-caution` background subtle + caution text.
    - `dispatched` → `--color-info` background subtle + info text.
    - `committed` → `--color-positive` background subtle + positive text.
    - `rejected` → `--color-negative` background subtle + negative text.
    - `failed` → `--color-negative` background subtle + negative text.
    - `pending-review` (Brief 228 placeholder; Brief 229 fills in) → `--color-caution` background subtle.
  - **Design-package CSS-layer gap** — same as Brief 226: `block.plan`, `block.evidence`, `block.decision`, `recbadge`, `.dopt.rec` are NOT yet ported into `packages/web/app/globals.css`. Tokens (`--color-vivid`, `--color-positive`, `--color-caution`, `--color-negative`, `--color-info`) ARE present. The renderer uses Tailwind utilities mapped to tokens (mirror Brief 226's `analyser-report-block.tsx:1-24` posture). Promotion to the bundled component classes is a SEPARATE scope (see §Open Question 6).

- **Reference docs touched in this brief** (Insight-043, point-of-contact discipline):
  - `docs/dictionary.md` — three new entries: `Battle-Readiness` (the connection-time experience), `Project Substrate` (the `.ditto/` directory + its files; cross-references ADR-043), `Retrofit` (the act of writing the substrate via a runner). Builder writes at implementation.
  - `docs/adrs/043-project-substrate-ditto-directory.md` — NEW ADR (body finalises Brief 224 outline + Q3 resolution + Catalyst-coexistence stance + header convention). Written in this brief's build cycle by Builder + reviewed by Reviewer.
  - `docs/architecture.md` §Layer 6 — Insight-201 absorption paragraph IFF Brief 199 has shipped by closeout (Documenter's call); §L3 — Insight-217 absorption paragraph (the shared `step-output-reader` module is the canonical multi-step pipeline pattern).
  - `docs/landscape.md` — NO update (no new framework dependency).
  - `docs/insights/201-user-facing-legibility.md` — moved to `docs/insights/archived/` IFF gate discharges (Brief 199 has shipped); Documenter at closeout.
  - `docs/insights/202-ditto-as-x-before-external-x.md` — body amended at §"Where It Should Land" (NOT a non-existent "Applications observed" section) to credit Brief 228 as application #1.5; insight stays `active`.
  - `docs/insights/217-multi-step-pipelines-query-step-runs-outputs.md` — IF the shared module extraction lands cleanly, the insight is archivable + the absorption paragraph in `docs/architecture.md` §L3 can land; Documenter at closeout.
  - `docs/state.md` — Architect checkpoint (this session) + Builder checkpoint + Documenter closeout.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `.ditto/` substrate in target repo | Insight-201 (legibility) + Insight-202 (Ditto-as-X) + Brief 224 §Architectural Decisions Captured | adopt (canonical insights) | Both insights converge on this shape; Brief 224 outlined the file structure. |
| Retrofit-as-process triggered post-confirm | Brief 225 `confirm/route.ts:271-275` TODO breadcrumb | adopt (existing seam) | The trigger point already exists; this brief replaces the TODO + lights up the dropped `data.trustTier` field. |
| Per-runner dispatch composition | `src/engine/runner-dispatcher.ts:93-300` (`dispatchWorkItem`) + Brief 215 `RunnerAdapter` interface | depend (existing) | Unified entry-point shipped by Brief 215; consumed by Briefs 216/217/218. Path A vs Path B from Brief 224 §Sub-brief #3 mootened by these shipped adapters. |
| Trust-tier-bound depth mapping | ADR-007 (`pause / advance / sample_pause / sample_advance`) + `trust-gate.ts:58-141` | depend (existing) | No new TrustAction values invented; consumes existing semantics. |
| Trust tier inheritance via `parentTrustTier` | `heartbeat.ts:1743-1750` | depend (existing) | Existing harness discipline; the retrofit lights up the `data.trustTier` flow that Brief 225 dropped. |
| `RetrofitPlanBlock` discriminated-union extension | Brief 226's `AnalyserReportBlock` extension at `packages/core/src/content-blocks.ts` | pattern (self-reuse) | Same shape as Brief 226's pattern; additive only. |
| `workItems` row discriminator via `type='feature' + source='system_generated' + context.RetrofitPlanBlock` | Brief 226's analyser report row pattern at `src/engine/onboarding/handlers.ts:949,1045` | pattern (self-reuse) | Reuses existing schema discriminators; no new `kind` column or `type` value. |
| Multi-step handler step-output passing | Brief 226 `readPriorStepOutputs(processRunId)` at `src/engine/onboarding/handlers.ts:144` + Insight-217 | adopt + extract | Helper exists module-local; this brief extracts to `packages/core/src/harness/step-output-reader.ts` per Insight-217's recommendation. |
| `stepRunId` guard at every retrofit handler | Insight-180 + Brief 226's parameterised DB-spy test pattern at `handlers.test.ts:46-80` | depend (existing pattern) | Test template proven across 9 onboarding handlers in Brief 226. |
| Idempotent re-run discipline | Insight-212 (system-agent handlers must be idempotent) | adopt (canonical insight) | The `unchanged` file detection + zero-commit-on-no-changes path is the canonical idempotency shape. |
| Autonomous-tier user-edit safety (Q3 resolution) | Original to Ditto (Reviewer-recommended) | original | Hash-compare current-on-disk vs prior-retrofit hash; skip user-touched files under autonomous; surface in renderer. |
| Cleanup-on-boot pattern (NOT applied) | Brief 226 `cleanup.ts` + `instrumentation.ts` | reference (intentionally-not-applied) | Documented as intentionally-not-applied because the retrofitter doesn't clone Ditto-side. |
| `processes/project-retrofit.yaml` step shape | `processes/project-onboarding.yaml` from Brief 225 + Brief 226 | pattern (self-reuse) | Same `executor: script` + `config.systemAgent` + outputs shape. |
| Re-run web button on `/projects/:slug/onboarding` | `packages/web/app/projects/[slug]/onboarding/page.tsx` Server Component branching pattern | pattern (self-reuse) | Brief 226's branching at this Server Component is the precedent; add a Re-run button next to the report. |
| Self tool `rerun_project_retrofit` | Brief 227's `promote_memory_scope` Self tool registration pattern at `src/engine/self-tools/` | pattern (self-reuse) | Same registration shape; carries `stepRunId` per Insight-180/215. |
| Commit message format | Original to Ditto | original | No prior pattern; finalised in this brief. Q5 accepted (`processRunId` opaque + audit-trail benefit dominates). |
| ADR-043 number reservation | Brief 224 §Constraints | depend (already reserved) | Verified open at brief-write time; ADR-040 latest committed; ADR-041/042 soft-reserved by Brief 209. |
| Renderer composition (block.plan + block.evidence + block.decision) | Anthropic Claude Design package `workspace/blocks.js` (handoff bundle from claude.ai/design fetched 2026-04-27 at user request) | depend (design-system source-of-truth) | Same package Brief 226's `AnalyserReportBlock` renderer already cites; primitives are canonical. Source-of-truth comment in `colors_and_type.css` confirms `packages/web/app/globals.css` is the upstream. |
| Status-pill colour semantic mapping | Anthropic Claude Design package `colors_and_type.css` `--color-positive` / `--color-caution` / `--color-negative` / `--color-info` / `--color-vivid` tokens (already in `packages/web/app/globals.css`) | depend (design-token surface-of-truth) | Tokens exist in codebase; renderer uses Tailwind utilities mapped to them per Brief 226's posture. |
| Design-package CSS-layer gap inheritance | Brief 226 `analyser-report-block.tsx:1-24` renderer comments | adopt (existing posture) | Brief 228 inherits the same "tokens exist; component CSS classes don't yet; use utilities" stance. Promotion to bundled component classes deferred to a separate scope (see §Open Question 6). |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/briefs/228-project-retrofitter.md` | **This brief.** |
| `docs/adrs/043-project-substrate-ditto-directory.md` | **Create:** the `.ditto/` directory shape ADR; finalises Brief 224's outline + documents the Q3 resolution (autonomous-tier user-edit safety mechanism + header convention) + Catalyst-coexistence stance. |
| `packages/core/src/onboarding/types.ts` | **Modify:** add `RetrofitPlan`, `RetrofitFile`, `RetrofitDispatchPayload`, `RetrofitFileAction` types alongside Brief 226's analyser types. Export via `packages/core/src/index.ts` barrel. |
| `packages/core/src/content-blocks.ts` | **Modify:** add `RetrofitPlanBlock` discriminant case (28th in the union) + the `RetrofitPlanBlock` interface (with the 7 status values; 5 surfaceable in Brief 228 + 2 reserved for Brief 229); update text fallback renderer. |
| `packages/core/src/harness/step-output-reader.ts` | **Create:** extract `readPriorStepOutputs(processRunId, stepId, db?)` from `src/engine/onboarding/handlers.ts:144` (Insight-217 absorption). Export via `packages/core/src/index.ts` barrel. |
| `src/engine/onboarding/handlers.ts` | **Modify:** replace the local `readPriorStepOutputs` with an import from `@ditto/core`; the existing analyser handlers consume the shared helper. Behaviour preservation verified by existing tests. |
| `processes/project-retrofit.yaml` | **Create:** new system process with 4 steps (`generate-plan` → `surface-plan` → `dispatch-write` → `verify-commit`); `trigger.type=event`, `trigger.event='project.retrofit_requested'` (NEW event constant — verified by grep no existing match in `processes/*.yaml` or codebase). The trigger event is emitted by the confirm route + the Re-run button + the Self tool. `trust.initial_tier` defaults to `supervised` (the safe default); the actual run-time tier comes from `processRuns.trustTierOverride` populated by `parentTrustTier` from the trigger surface. |
| `src/engine/onboarding/retrofitter.ts` | **Create:** four handler bodies + the in-module `STEP_IDS` constant + the helper `composeRetrofitPlan(report, project, priorRunHashes?)` used by `generate-plan`. Mirrors `src/engine/onboarding/handlers.ts` shape. |
| `src/engine/onboarding/retrofit-prompt.ts` | **Create:** `composeRetrofitPrompt(payload, project)` — runner-agnostic prompt template + structured payload. |
| `src/engine/onboarding/retrofitter.test.ts` | **Create:** per-handler tests + per-trust-tier dispatch path tests (autonomous / spot_checked sample_pause / spot_checked sample_advance / critical) + Insight-180 guard tests (parameterised across all 4 handlers, mirroring Brief 226's `handlers.test.ts:46-80` pattern) + idempotent re-run test + user-edit-safety test. |
| `src/engine/onboarding/retrofit-prompt.test.ts` | **Create:** unit tests for prompt composition (golden-string assertions on the rendered prompt; payload-by-reference NOT inline assertion). |
| `src/engine/system-agents/index.ts` | **Modify:** add 4 new entries (`project-retrofit-generate-plan`, `project-retrofit-surface-plan`, `project-retrofit-dispatch-write`, `project-retrofit-verify-commit`). |
| `src/engine/self-tools/rerun-project-retrofit.ts` | **Create:** Self tool `rerun_project_retrofit(projectId, trustTier?)`; carries `stepRunId`; emits `project.retrofit_requested` event via `startProcessRun(..., { parentTrustTier })`. |
| `src/engine/self-tools/index.ts` | **Modify:** register the new Self tool. |
| `packages/web/components/blocks/retrofit-plan-block.tsx` | **Create:** renderer for `RetrofitPlanBlock` covering 5 surfaceable status states in Brief 228 (`pending-sample-review` / `dispatched` / `committed` / `rejected` / `failed`) + the supervised-tier MVP placeholder (`pending-review` rendered with explainer + escalation CTA, NO per-file approval rows; Brief 229 extends). Composition of `block.evidence` + `block.decision` per design-package patterns. |
| `packages/web/components/blocks/retrofit-plan-block.test.tsx` | **Create:** renderer tests for the 5 Brief-228 surfaceable status states + the supervised placeholder. |
| `packages/web/components/blocks/block-registry.tsx` | **Modify:** add `retrofit_plan` case routing to the new renderer. |
| `packages/web/app/projects/[slug]/onboarding/page.tsx` | **Modify:** add `RetrofitPlanBlock` rendering branch + a "Re-run retrofit" button. Server Component fetches the latest retrofit `workItems` row when project is `'active'` AND has a prior retrofit. |
| `packages/web/app/api/v1/projects/[id]/retrofit/route.ts` | **Create:** POST route to trigger on-demand re-run; emits `project.retrofit_requested` via `startProcessRun(..., { parentTrustTier })`. Accepts `{ kind: 'on-demand-rerun', trustTier?: TrustTier }`. |
| `packages/web/app/api/v1/projects/[id]/onboarding/confirm/route.ts` | **Modify:** replace the TODO breadcrumb at lines 271-275 with `await startProcessRun("project-retrofit", { projectId: project.id }, "event", { parentTrustTier: data.trustTier })`. The `brief-226-or-later` TODO comment label removed. The `void (data.trustTier as TrustTier)` line at 277 + its TODO comment removed (the field is now consumed). |
| `docs/dictionary.md` | **Modify:** add three entries (`Battle-Readiness`, `Project Substrate`, `Retrofit`) at point of contact. |

## User Experience

- **Jobs affected:**
  - **Define** — the user defines (via the analyser confirm step) what they want retrofitted; Brief 228 writes it (autonomous + critical + spot_checked tiers).
  - **Review** — the user reviews the spot_checked sample at `/review/[token]` (existing Brief 211 surface); the user audits committed retrofits at `/projects/:slug/onboarding`.
  - **Decide** — the spot_checked sample yes/no is a Decide moment; the supervised-tier per-file approval Decide moment lands in Brief 229.
  - **Delegate** — autonomous tier is the user delegating "make my project battle-ready" to Ditto.
- **Primitives involved:** `block.evidence` + `block.decision` (existing design-package primitives, mirrored from Brief 226's `AnalyserReportBlock`); `KnowledgeCitationBlock` is NOT involved (no memory citation surface here); `SuggestionBlock` is NOT involved (no proactive Self proposal here — re-run is user-initiated).
- **Process-owner perspective:** Under autonomous tier — "I picked the runner and the trust tier; Ditto wrote `.ditto/` for me — here's the diff link." Under spot_checked tier with sample-required — "Ditto wants to write these files; here's a sampled subset to confirm before I greenlight the lot." Under critical tier — "Ditto won't auto-write `.ditto/` for this project; here's how to hand-author it." Under supervised tier (Brief 228 placeholder) — "Per-file review is coming in the next iteration; for now, switch to autonomous if you want this retrofitted today."
- **Interaction states:** `RetrofitPlanBlock` carries 7 `status` values; Brief 228 surfaces 5 + a supervised placeholder; Brief 229 extends with the per-file approval surface:
  - `pending-sample-review` (Brief 228) — spot_checked tier, sample-required; renders sampled subset for user confirmation; CTA via existing review-token surface.
  - `dispatched` (Brief 228) — runner is executing; CTA = none (in-flight).
  - `committed` (Brief 228) — success; commit SHA + URL displayed; `skippedUserTouchedFiles` listed if any; CTA = `[View diff in repo]` (link to `commitUrl`).
  - `rejected` (Brief 228) — critical tier; informative error; CTA = `[Read about hand-authoring .ditto/]` (link to ADR-043).
  - `failed` (Brief 228) — dispatch error; reason displayed; CTA = `[Re-run retrofit]`.
  - `pending-review` (Brief 228 placeholder; Brief 229 fills in) — supervised tier; placeholder explainer + escalation CTA in 228; per-file approval list in 229.
  - `partially-approved` (Brief 229) — user submitted a subset; awaiting dispatch.
- **Designer input:** **OPTIONAL for Brief 228.** Brief 228's surfaces compose three existing design-package primitives — `block.plan` (file list), `block.evidence` (runner/tier/status metadata), `block.decision` (spot_checked sample yes/no). Renderer uses Tailwind utilities mapped to design-token CSS variables (mirror Brief 226's `analyser-report-block.tsx:1-24` posture; see §Constraints "Renderer composition" for the precise primitive mapping + colour token reference). Designer activation **MANDATORY for Brief 229** (per Brief 224 §Sub-brief #3 escalation trigger; spec at `docs/research/retrofit-supervised-approval-ux.md` is Brief 229's prerequisite).
- **Cross-runner consistency:** the user-facing surface is identical across runner kinds. The runner only differs in the `dispatched → committed` latency (`local-mac-mini` ~10s, `claude-code-routine` ~30-60s, `claude-managed-agent` ~60-120s, `github-action` ~2-5min); the `RetrofitPlanBlock` doesn't carry runner-specific UX.

## Acceptance Criteria

How we verify this work is complete. Each criterion is boolean.

1. [ ] **ADR-043 written and reaches `accepted` status.** File `docs/adrs/043-project-substrate-ditto-directory.md` exists; Status header is `accepted`; finalises Brief 224's outline (file structure, versioning, Catalyst-coexistence stance, re-run discipline) AND documents Q3 resolution (autonomous-tier user-edit safety: hash-compare + skip + AlertBlock surface) AND documents the `# DO NOT EDIT — regenerated by Ditto retrofit` header convention.

2. [ ] **`RetrofitPlan`, `RetrofitFile`, `RetrofitDispatchPayload`, `RetrofitFileAction` types added to `packages/core/src/onboarding/types.ts`.** Exported via `packages/core/src/index.ts` barrel. `RetrofitPlanBlock` interface in `packages/core/src/content-blocks.ts` carries 7 status values (5 surfaceable in Brief 228 + 2 reserved for Brief 229) + the `skippedUserTouchedFiles?: string[]` field. Type-check clean at `pnpm --filter @ditto/core type-check`.

3. [ ] **`readPriorStepOutputs` extracted to `packages/core/src/harness/step-output-reader.ts` (Insight-217 absorption).** Exported via `packages/core/src/index.ts` barrel. `src/engine/onboarding/handlers.ts:144` (and any sibling local copies) deleted in favour of the shared import. All Brief 226 onboarding tests still pass with no behaviour change.

4. [ ] **`processes/project-retrofit.yaml` exists with 4 steps in order: `generate-plan`, `surface-plan`, `dispatch-write`, `verify-commit`.** Trigger event = `project.retrofit_requested` (verified by grep no collision with existing event constants). YAML's `trust.initial_tier` defaults to `supervised`; runtime tier comes from `processRuns.trustTierOverride` populated by `parentTrustTier`. YAML passes the validation that Brief 225 added for `processes/*.yaml`. Tool-name resolution check: NO new tool names referenced in YAML's `tools:` declarations.

5. [ ] **Four handler bodies in `src/engine/onboarding/retrofitter.ts` registered in `src/engine/system-agents/index.ts`.** Each handler takes `stepRunId` first; rejects calls without it (Insight-180 guard). Parameterised DB-spy test (mirroring Brief 226's `handlers.test.ts:46-80`) asserts zero DB calls before guard rejection for all 4 handlers in `retrofitter.test.ts`. Insight-215 internal-vs-external regimes both honoured: `dispatch-write` is external (writes to user repo); `surface-plan` + `verify-commit` are internal (DB writes only).

6. [ ] **`generate-plan` handler reads the analyser report from `workItems.context.AnalyserReportBlock` (or `harness_decisions.reviewDetails`) by `projectId`, composes a `RetrofitPlan` with the 6 `.ditto/` files (role-contracts directory + skills.json + tools.json + guidance.md + onboarding-report.md + version.txt), computes content hashes, queries the prior retrofit's `harness_decisions.reviewDetails` for prior-run hashes (if any), marks each file's action as `'create' | 'update' | 'unchanged'`, and writes the plan into `step_runs.outputs`.** Test: round-trip a fixture analyser report → plan → assert all 6 expected paths present + correct content shape + correct action determination.

7. [ ] **`surface-plan` handler writes a `RetrofitPlanBlock` into a NEW `workItems` row** (`type='feature'`, `source='system_generated'`, `projectId=<project.id>`, `briefState='backlog'`, the `RetrofitPlanBlock` in `context`). Initial `RetrofitPlanBlock.status` derives from the trust-gate decision via `readPriorStepOutputs(processRunId, 'surface-plan')` reading `step_runs.reviewDetails.trustAction`: `advance → 'dispatched'` (will flip to `committed` post-dispatch); `sample_advance → 'dispatched'`; `sample_pause → 'pending-sample-review'`; `pause + canAutoAdvance=false → 'rejected'`; `pause (supervised) → 'pending-review'`. Test: per-tier branching produces the right initial `status`.

8. [ ] **`dispatch-write` handler reads the trust-gate decision via `readPriorStepOutputs`, reads the plan via the same pattern, applies user-edit safety filtering (under autonomous tier, files whose current hash differs from prior-run hash are excluded + populated into `RetrofitPlanBlock.skippedUserTouchedFiles`), composes the runner prompt + structured payload via `composeRetrofitPrompt`, and invokes `dispatchWorkItem` with the workItem id + structured context.** Test: per-tier dispatch-path tests:
   - autonomous → dispatch all `'create'` + `'update'` files; `'unchanged'` excluded.
   - autonomous + user-touched file → user-touched file excluded; AlertBlock side-car asserted in resulting block.
   - spot_checked + sample_advance → dispatch all files; `sampledFileIds` populated.
   - spot_checked + sample_pause → dispatch BLOCKED (DB-spy asserts no `dispatchWorkItem` call); status stays `pending-sample-review`.
   - critical (`pause + canAutoAdvance=false`) → dispatch BLOCKED; `RetrofitPlanBlock.status='rejected'` written.
   - supervised (`pause`) → dispatch BLOCKED; `RetrofitPlanBlock.status='pending-review'` written; placeholder rendered.

9. [ ] **`verify-commit` handler reads the dispatch result, extracts `commitSha + commitUrl + actuallyChangedFiles` from the runner's structured response (via `runner_dispatches.externalUrl` + the runner's responseBody), UPDATES the existing `harness_decisions` row (written by `dispatchWorkItem` at `runner-dispatcher.ts:262-275`) with the commit reference, AND updates the `RetrofitPlanBlock` in `workItems.context` with `status='committed'` + `commitSha` + `commitUrl` + `skippedUserTouchedFiles`.** On dispatch failure: `RetrofitPlanBlock.status='failed'` + reason + AlertBlock side-car. Test: success path + failure path both verified; verify the audit row is UPDATED not duplicated.

10. [ ] **Trust-tier-bound depth maps verbatim to ADR-007 — NO new TrustAction enum values; trust tier flow lights up the dropped `data.trustTier`.** Verified by grep: `packages/core/src/db/schema.ts:111-116` is unchanged. Confirm route at `packages/web/app/api/v1/projects/[id]/onboarding/confirm/route.ts:271-277` no longer carries the TODO breadcrumb (label `brief-226-or-later` removed) AND no longer drops `data.trustTier` (the `void` line removed); the field is passed via `startProcessRun(..., { parentTrustTier: data.trustTier })`. Critical tier returns `pause + canAutoAdvance=false` matching Brief 212 §Constraints line 86. Existing confirm route tests still pass.

11. [ ] **Re-runnable retrofit is idempotent + user-edit-safe.** Two tests:
   - **Idempotency:** run retrofit on a fixture project; assert files written. Run retrofit again with no repo changes; assert zero file writes (`RetrofitPlanBlock.status='committed'` with `commitSha=null` + AlertBlock side-car "no changes to retrofit"). Insight-212 honoured.
   - **User-edit safety (Q3 resolution):** run retrofit autonomous on a fixture project; user simulates editing `guidance.md` between runs; second autonomous re-run leaves `guidance.md` untouched (the file is in `skippedUserTouchedFiles`); only files Ditto authored stay regenerated. Both tests live in `retrofitter.test.ts`.

12. [ ] **Re-run surfaces work end-to-end.** (a) Web button on `/projects/:slug/onboarding/page.tsx` POSTs to `/api/v1/projects/:id/retrofit` with `{ kind: 'on-demand-rerun', trustTier? }`; the route triggers a fresh `project-retrofit.yaml` run via `startProcessRun(..., { parentTrustTier })`. (b) Self tool `rerun_project_retrofit(projectId, trustTier?)` is registered in `src/engine/self-tools/index.ts`; carries `stepRunId`; test asserts the tool refuses the call without `stepRunId`. Both surfaces emit `project.retrofit_requested` event. (c) Renderer tests cover all 5 surfaceable Brief-228 status states (`pending-sample-review` / `dispatched` / `committed` / `rejected` / `failed`) + the supervised placeholder.

13. [ ] **Dictionary entries added.** `docs/dictionary.md` carries three entries: `Battle-Readiness` (the connection-time experience), `Project Substrate` (the `.ditto/` directory + its files; cross-references ADR-043), `Retrofit` (the act of writing the substrate via a runner).

**Total ACs: 13.** Within Insight-004's 8-17 envelope; reduced from the pre-Reviewer 16 by lifting supervised-tier UI into Brief 229.

## Review Process

1. Spawn fresh-context Reviewer agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 224 §Sub-brief #3 + Brief 226 + Insight-201 + Insight-180 + Insight-212 + Insight-215 + Insight-217 + ADR-007 + the runner-dispatcher source.
2. Reviewer specifically checks:
   - Path A vs Path B from Brief 224 §Sub-brief #3 is correctly resolved (the cloud-runner adapters are now shipped via Briefs 216/217/218, so no per-runner adapter work belongs here).
   - The 4-mode trust-tier mapping (autonomous → silent dispatch; spot_checked → sample-then-dispatch; critical → reject; supervised → placeholder + Brief 229) consumes existing TrustAction enum values verbatim — no new values invented.
   - `dispatchWorkItem` is the SOLE dispatch surface; no per-runner branching in retrofitter code.
   - Insight-180 guard at every retrofit handler entry; the parameterised DB-spy test pattern is faithfully copied from Brief 226 (`handlers.test.ts:46-80`).
   - Insight-215 internal-vs-external regimes are correctly invoked (dispatch external; surface-plan + verify-commit internal).
   - Insight-217 step-output query pattern — the `readPriorStepOutputs` helper is extracted to `packages/core/src/harness/step-output-reader.ts`; the analyser handlers also consume the shared module (no behavioural drift).
   - Insight-212 idempotency — the `unchanged` file detection + zero-commit-on-no-changes path is testable + tested.
   - Q3 resolution: autonomous-tier user-edit safety is implemented + tested (skipUserTouchedFiles); ADR-043 documents the mechanism + the `# DO NOT EDIT` header convention.
   - The `.ditto/` directory shape in ADR-043 finalises Brief 224's outline without contradiction; the Catalyst-coexistence stance is preserved (`.ditto/` writes never touch sibling directories).
   - The retrofit prompt template carries the structured payload BY REFERENCE (NOT inline file contents) — verifies token-budget discipline.
   - The re-run trigger event `project.retrofit_requested` is a NEW event constant; collisions with existing event constants checked by grep.
   - The supervised-tier placeholder is structurally correct in Brief 228 (does NOT dispatch; renders explainer + escalation CTA OR explainer-only — Reviewer picks).
   - Insight-201 absorption gate framing is honest (depends on Brief 199's ship order; Documenter resolves at closeout).
   - Insight-202 absorption gate stays open (this brief contributes evidence #1.5 — fuzzy displaced category — not a third unambiguous application). The Documenter instruction targets §"Where It Should Land" (NOT a non-existent "Applications observed" section).
   - The confirm route's TODO breadcrumb at `confirm/route.ts:271-275` is the only place modified in that file (apart from the `void (data.trustTier)` line at 277 also removed); existing tests for confirm route still pass.
   - The `workItems` row uses `type='feature'` + `source='system_generated'` discriminators (NOT a new `kind` column or `type` value).
   - The `verify-commit` handler UPDATES the existing `harness_decisions` row (does NOT INSERT a new one).
   - Trust tier flow uses `parentTrustTier` option through `startProcessRun` (NOT a `projects.defaultTrustTier` field; verified projects table has no tier column).
   - Brief sizing within Insight-004 (13 ACs; well within 8-17 envelope; one integration seam = the `dispatchWorkItem` surface; supervised UI lifted to Brief 229).
   - No drift on Brief 215's `RunnerKind` enum, Brief 225's atomic three-write, Brief 226's analyser report shape, Brief 227's project-aware memory filtering — all preserved.
   - The file-content payload security implications are addressed: Ditto sees the file contents (composes them), the runner sees the file contents (writes them via git tooling using its own credentials); the user's git remote is mutated only via the runner's commit+push path.
3. Present brief + review findings to human for approval.

## Smoke Test

End-to-end smoke (run after Builder lands):

```bash
# Pre-conditions:
#   - Test workspace with WORKSPACE_OWNER_EMAIL set + DITTO_PROJECT_ONBOARDING_READY=true.
#   - A test project at `projects.status='active'` with a prior analyser report row.
#   - A registered runner (any kind, but `local-mac-mini` is fastest if a paired daemon is online).

# 1. Per-handler unit + guard tests.
pnpm vitest run src/engine/onboarding/retrofitter.test.ts
# Expect: per-handler tests + parameterised guard tests + per-tier dispatch-path tests + idempotent re-run + user-edit-safety tests pass.

# 2. Shared-module extraction non-regression.
pnpm vitest run src/engine/onboarding/handlers.test.ts
# Expect: all Brief 226 onboarding tests still pass after readPriorStepOutputs extraction.

# 3. Render-time smoke for the new block.
pnpm vitest run packages/web/components/blocks/retrofit-plan-block.test.tsx
# Expect: 5 status-state renderer tests + supervised placeholder pass.

# 4. Manual web smoke (autonomous tier on local-mac-mini):
#    - Navigate to /projects/:slug/onboarding for an analysed project with autonomous tier.
#    - Hit POST /api/v1/projects/:id/retrofit (Re-run button).
#    - Wait ~10s.
#    - Verify the RetrofitPlanBlock surfaces with status='committed' + a commitSha + a [View diff in repo] link.
#    - Verify the target repo's working tree carries .ditto/ with the 6 expected files at the new commit SHA.
#    - Verify each file has the # DO NOT EDIT header.

# 5. Re-run idempotency smoke:
#    - Hit POST /api/v1/projects/:id/retrofit again immediately.
#    - Verify the new RetrofitPlanBlock surfaces with status='committed' + commitSha=null + an info AlertBlock "no changes to retrofit".

# 6. User-edit safety smoke (Q3 resolution):
#    - Manually edit .ditto/guidance.md in the target repo + commit.
#    - Hit POST /api/v1/projects/:id/retrofit again.
#    - Verify guidance.md is in skippedUserTouchedFiles + AlertBlock side-car "skipped 1 user-touched file".
#    - Verify guidance.md content unchanged on disk.

# 7. Critical-tier rejection smoke:
#    - Set the project's tier to critical (via re-run with trustTier='critical').
#    - Verify the RetrofitPlanBlock surfaces with status='rejected' + the informative error + the [Read about hand-authoring .ditto/] CTA.
#    - Verify NO dispatch row in `runner_dispatches` for this stepRun.

# 8. Spot_checked sample-required smoke:
#    - Set the project's tier to spot_checked + force samplingHash to land in the "review required" bucket.
#    - Verify the RetrofitPlanBlock surfaces with status='pending-sample-review' + sample subset.
#    - Approve via /review/[token].
#    - Verify dispatch proceeds + status flips to dispatched → committed.

# 9. Supervised-tier placeholder smoke:
#    - Set the project's tier to supervised.
#    - Verify the RetrofitPlanBlock surfaces with status='pending-review' + the explainer + the escalation CTA.
#    - Verify NO dispatch row in `runner_dispatches` for this stepRun.
#    - (Brief 229 ships the per-file approval UI + resume path.)
```

End-to-end network smoke (steps 4-8) is **deferred if a paired runner isn't available at build time** — same posture Brief 226 took. Per-handler unit tests + per-tier dispatch-path tests + renderer tests are the verification floor.

## After Completion

1. Update `docs/state.md` with what changed (Brief 228 complete; ADR-043 accepted; `processes/project-retrofit.yaml` shipped; the four retrofit handlers + 1 Self tool + 1 web route + 1 ContentBlock + 1 renderer; `readPriorStepOutputs` extracted to shared module; Insight-217 absorbed; Insight-201 absorption depends on Brief 199 ship order — Documenter checks).
2. Update `docs/roadmap.md` Project Onboarding & Battle-Readiness phase row — flip sub-brief #3a (Brief 228) from `draft` to `done`. Brief 229 (sub-brief #3b) stays at its scheduled status.
3. **Insight-201 absorption check.** IF Brief 199 (memory projection) has shipped by the time Brief 228 ships: move `docs/insights/201-user-facing-legibility.md` → `docs/insights/archived/201-user-facing-legibility.md` with `Status: absorbed` header; add a §Layer 6 paragraph to `docs/architecture.md` titled "Filesystem-like legibility at user-facing data seams" — names the principle, the three implementation conviction levels, the tradeoff checklist, and cites Brief 199 (memory projection — application #1) + Brief 228 (`.ditto/` substrate — application #2). IF Brief 199 has NOT shipped: insight stays `active`; Brief 228 is application #1; gate stays open pending Brief 199.
4. **Insight-202 status.** Stays `active`. Amend `docs/insights/202-ditto-as-x-before-external-x.md` §"Where It Should Land" (NOT a non-existent "Applications observed" section) to credit Brief 228 as application #1.5. Full absorption awaits a third unambiguous "Ditto-as-X-instead-of-named-external-X" brief.
5. **Insight-217 absorption.** The shared `readPriorStepOutputs` module ships in Brief 228 (per AC #3). Add a one-paragraph note in `docs/architecture.md` §L3 naming the multi-step pipeline pattern + the canonical helper at `packages/core/src/harness/step-output-reader.ts`. Move `docs/insights/217-multi-step-pipelines-query-step-runs-outputs.md` → `docs/insights/archived/` with `Status: absorbed` header.
6. Phase retrospective: did the autonomous-tier user-edit safety mechanism work cleanly in production-like smoke, or did the hash-compare miss edge cases (e.g., line-ending normalisation, BOM, CRLF)? Capture as insight if so. Did the supervised-tier placeholder strand any users (did anyone hit it AND couldn't escalate)? Capture as input for Brief 229 sizing.
7. ADR check: ADR-043 is the deliverable; no further ADRs.

---

## Open Questions Resolved (Reviewer pass — 2026-04-27)

The original Brief 228 surfaced 5 Open Questions. Per the Reviewer's findings, these are resolved:

- **Q1 (preflight list-files):** **Resolved per Reviewer recommendation (b).** Trust the runner — the runner's git tooling computes hashes locally + returns `actuallyChangedFiles` in the structured response. No two-dispatch flow. Documented in §Constraints "Retrofit prompt template".
- **Q2 (overload onboarding page vs new page):** **Architect's default accepted.** Overload `/projects/:slug/onboarding` per Brief 226's branching pattern. Designer can override in Brief 229 if multi-screen flow demands it.
- **Q3 (autonomous-tier overwrite footgun on user-edited `.ditto/` files):** **Resolved per Reviewer recommendation (b).** Hash-compare current-on-disk vs prior-retrofit hash; user-touched files excluded under autonomous tier; surfaced in `RetrofitPlanBlock.skippedUserTouchedFiles` + AlertBlock side-car. Header convention `# DO NOT EDIT — regenerated by Ditto retrofit (run <processRunId>)` adds a secondary safety signal. Documented in ADR-043 + AC #11.
- **Q4 (track-kind projects):** **Architect's default accepted.** Track projects don't reach confirm; no explicit guard needed in Brief 228.
- **Q5 (`processRunId` in commit message):** **Architect's default accepted.** UUID is opaque; audit-trail benefit dominates. Documented in §Constraints "Commit message format".

- **Q6 (NEW — design-package CSS-layer porting scope):** Brief 226 already flagged that the design-package's component CSS layer (`block.plan`, `block.evidence`, `block.decision`, `recbadge`, `.dopt.rec`, `alex-line`) is NOT yet in `packages/web/app/globals.css`; only the design tokens are. Brief 228 inherits the same posture (Tailwind utilities mapped to tokens). The user's 2026-04-27 ask "implement the relevant aspects of the design" surfaces this gap explicitly. **Architect's recommendation:** out-of-scope for Brief 228 (the porting touches every existing block renderer + the workspace shell + arguably warrants a sweep through the analyser surface to promote it from utility-mapped to bundled classes; this is a separate Architect activation). Surfaced to the user as a follow-on brief candidate; if approved, the next Architect session writes "Brief 230: Design-Package CSS Layer Adoption + Workspace Shell Alignment" (or similar — number to be claimed at PM scheduling time per `feedback_grep_before_claiming_shared_namespace.md`). **Resolved by Brief 230 (2026-04-28):** the six block-primitive bundled CSS classes + chrome + alex-line + Ditto-original `.block.findings` primitive are authored at `packages/web/app/design-system.css` and imported into `globals.css`. Brief 228's `RetrofitPlanBlock` renderer can compose `.block.plan` + `.pstep` + `.eline` (kv-pair metadata cards) + `.dopt.rec` (spot_checked sample yes/no) from day one; no per-renderer porting needed at Brief 228 build time. Workspace shell adoption remains a separate follow-on candidate (deferred per Brief 230 §Non-Goals).
