# Brief 214: Cloud Execution Runners Phase (parent)

**Date:** 2026-04-25
**Status:** ready (2026-04-25 — user delegated decision authority; architect locked-in per checkpoint #8: parent design approved; all 8 sub-briefs decomposed; Greptile/Argos optional integration model held)
**Depends on:** Brief 212 (Workspace Local Bridge — needs to ship to lock the local-mac-mini runner shape we're peering with). Sub-brief 215 (this brief's first seam) can begin schema work in parallel; sub-briefs 216+ wait on Brief 212 merging so the adapter contract is finalized.
**Unlocks:** the user's full agentic-engineering pipeline (intake → triage → approve → dispatch → PR → review → checks → ready-to-deploy) running phone-only when the Mac mini is off; Insight-205 battle-ready project onboarding (which also needs the `projects` table from sub-brief 215).

## Goal

- **Roadmap phase:** Phase 9+ (substrate — runner distribution, peer to Brief 212). Sits alongside Brief 212's local-bridge runner as the cloud-mode arm of the same primitive.
- **Capabilities:** make execution location a per-project + per-work-item decision with an ordered fallback chain, mode discrimination (`local | cloud`), and unified status/observability across five runner kinds. End-state: the user's iPhone (Ditto Railway URL + GitHub Mobile) is sufficient to drive intake → triage → approve → dispatch → PR → review → checks → ready-to-deploy → deploy for any project.

## Context

`docs/research/cloud-runners.md` (2026-04-25) scouts the cloud peers to Brief 212's local-mac-mini bridge. The user's revised pipeline spec (`.context/attachments/pasted_text_2026-04-25_21-14-58.txt`) names cloud as **additive**: cloud runners are siblings to the local runner, selectable per-project, per-work-item, with a fallback chain — not replacements.

Today (commit `5f74ebb`): no `projects` table exists; `processes.projectId` is a free-text string with no FK. The step executor at `src/engine/step-executor.ts:48` switches on `step.executor` (`ai-agent | cli-agent | script | handoff | integration | rules`) — that's a *step-level* concern about how to invoke a step *inside Ditto's process loop*. Runners are a different abstraction: **work-item-level dispatch** that hands a whole work item to an external execution surface (Anthropic Routine, Managed Agents session, GitHub Actions workflow, local-bridge subprocess) which runs its own loop internally. Step.executor stays unchanged; runners sit above it.

Brief 212 ships the local-bridge daemon + `bridgeCliAdapter` but explicitly defers `src/engine/adapter-selection.ts` because no `projects.runner` field exists. This phase introduces that field and the four cloud peers around it.

Insight-205 (battle-ready project onboarding) needs the same `projects` table; sub-brief 215 here is shared substrate.

## Objective

Ship the smallest end-to-end primitive that lets the user pick *where* a project's work executes — across five runner kinds, with override + chain + mode-required filter — while preserving Brief 212's local-bridge path verbatim and unifying status/audit/UX across cloud + local. The standard is: smoke-test agent-crm and a native-Ditto project end-to-end, both modes, from a phone.

## Non-Goals

- **Removing or regressing the local-mac-mini runner.** Brief 212's bridge primitive is the local arm; this phase adds peers, not replacements. AC #2 verifies non-regression.
- **Auto-deploying to production.** Manual approval in GitHub Mobile remains the gate (sub-brief 220).
- **Migrating Ditto itself off Railway.** ADR-018 Track A stands.
- **Cross-runner data sharing inside a single dispatch.** A `runner_dispatch` row targets exactly one (project × work item × runner). Fan-out / cross-runner aggregation is a future concern.
- **Replacing Routines / Managed Agents / GitHub Actions / E2B with Ditto-built equivalents.** Ditto is a thin client to each.
- **Multi-tenant runners.** Each runner is workspace-scoped through the credential vault; cross-workspace runner sharing is out of scope.
- **Bridging non-Catalyst processes inside cloud runners.** Cloud runners receive the work-item body as prompt input; they do NOT execute Ditto's process YAML internally. Native-Ditto coding work via cloud runners is one big Claude Code session, not a Ditto-process-loop run.
- **Live PTY streaming for cloud runners.** Routine and Managed Agents stream events via SSE; that's enough. No xterm.js view at MVP.
- **`e2b-sandbox` runner implementation.** Deferred per user input. The runner kind enum reserves the value; no adapter shipped this phase.
- **Greptile self-hosting.** Cloud SaaS only at MVP (sub-brief 219).
- **Greptile / Argos / other AI-review-or-visual-check tools as REQUIRED steps.** They are OPTIONAL per-project integrations detected via `detectIntegrations()` (per D11). The default review path is `/dev-review` skill in-session + human review on PR; the default visual check is the Vercel preview URL inline card. Sub-brief 219 ships the detector + opt-in wiring.
- **Auto-installing GitHub Apps on user repos.** Detection is read-only (queries existing installations + repo file presence). The user installs Greptile / Argos themselves on the repos they want covered; Ditto observes and adapts.
- **Unifying credentials across runners and step.executor adapters.** They share the credential vault; they do not share config schemas.

## Inputs

1. `docs/research/cloud-runners.md` — research report; the §"Architecture-input observations" section is binding for this phase unless a contrary architectural finding emerges
2. `docs/research/local-bridge.md` (companion) — the local arm at the same granularity
3. `docs/briefs/212-workspace-local-bridge.md` — the local-mac-mini runner; this phase does NOT modify it but inherits its trust-tier semantics, `stepRunId` guard pattern, and adapter shape
4. `.context/attachments/pasted_text_2026-04-25_21-14-58.txt` — user's revised pipeline spec; the additive-not-replacing position is binding
5. `docs/landscape.md` §"Cloud Execution Runners (2026-04-25)", §"Cloud Code Review + Visual Diff (2026-04-25)", §"Mobile-First Deploy Gate (2026-04-25)", §"Managed Agent Infrastructure (2026-04-09)" — building-block evaluations
6. `docs/adrs/005-integration-architecture.md` — credential vault + integration registry pattern. Runners reuse the vault; runner-config is a NEW table (not the integration registry — different scope). Brief explains the distinction
7. `docs/adrs/018-runtime-deployment.md` — Track A (Railway-hosted) is the deployment context; cloud runners dispatch from Track A engines. Track B is out of scope
8. `docs/adrs/025-centralized-network-service.md` — Track A topology assumption verified compatible with cloud-runner dispatch (no shared-runtime requirement between engine and runners)
9. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every runner adapter dispatches external side-effects; MUST require `stepRunId` parameter
10. `docs/insights/190-drizzle-migration-discipline.md` — schema additions follow journal idx parity; this phase reserves idx ≥ 12 (Brief 212 reserves idx 11)
11. `docs/insights/004-brief-sizing.md` (absorbed into `docs/dev-process.md:179-194`) — this is a parent brief with phase-level ACs; sub-briefs 215-222 each carry 8-17 of their own
12. `docs/insights/205-battle-ready-project-onboarding.md` — shares the `projects` substrate from sub-brief 215; phase-coupling note in §Cross-cutting below
13. `src/adapters/cli.ts`, `src/adapters/claude.ts`, `src/adapters/script.ts` — existing adapter contract: `{ execute, status, cancel }`. New cloud runners are siblings at `src/adapters/<kind>.ts`
14. `src/engine/step-executor.ts:48` — step.executor router. Runner dispatch is ABOVE this — happens at work-item level, not step level
15. `packages/core/src/db/schema.ts:198` — `processes.projectId` is currently text-with-no-FK. This phase adds the `projects` table and tightens the FK
16. `packages/core/src/db/schema.ts:495-522` — `harness_decisions` table. Each runner dispatch writes one row per Insight-180; no new audit table for trust decisions (separate `runner_dispatches` row records dispatch lifecycle)
17. `drizzle/meta/_journal.json` — last entry idx=9 (`0010_thread_titles`). Brief 212 reserves idx=10 (`0011_local_bridge`). Sub-brief 215 reserves idx ≥ 11 (depends on 212 merge order)
18. `packages/web/middleware.ts` — webhook endpoints follow the bearer-token-not-cookie exemption pattern Brief 200 + Brief 212 introduced

## Architectural Decisions

**D1: Runner is a work-item-level dispatch primitive, NOT a step.executor value.** Step.executor (`ai-agent | cli-agent | script | …`) stays unchanged. When a project-bound work item transitions to `ready-to-execute`, the dispatcher resolves a runner (per the chain), and that runner takes the whole work item — not Ditto's per-step loop. For native-Ditto coding work this means: the runner runs *one* Claude Code session whose prompt is the work-item body; Ditto's process YAML for those work items is not interpreted by the runner. Internal Ditto processes (GTM pipeline, scanner, RSI loops) stay on step.executor as today.

**D2: Five runner kinds with mode discrimination.**
- `local-mac-mini` (mode `local`) — implementation per Brief 212 (`bridgeCliAdapter`)
- `claude-code-routine` (mode `cloud`) — Anthropic Routine HTTP `/fire` (sub-brief 216)
- `claude-managed-agent` (mode `cloud`) — Anthropic Managed Agents SDK (sub-brief 217)
- `github-action` (mode `cloud`) — GitHub workflow_dispatch + workflow_run webhook (sub-brief 218)
- `e2b-sandbox` (mode `cloud`, **DEFERRED** — enum value reserved, adapter not shipped)

**D3: Three new tables (sub-brief 215).**
- `projects` — id, slug, name, github_repo, harness_kind enum (`catalyst | native-ditto`), default_runner_kind, fallback_runner_kind (nullable), runner_chain (JSON array, nullable; overrides default+fallback when present), created/updated. Existing `processes.projectId` gains FK constraint via this table.
- `project_runners` — id, projectId FK, kind enum, mode enum (`local | cloud`), enabled bool, config_json (Zod-validated per kind), credential_ids (JSON array of pointers into the existing `credentials` table), last_health_check_at, last_health_status enum (`healthy | unauthenticated | rate_limited | unreachable | unknown`), created/updated. UNIQUE on (projectId, kind).
- `runner_dispatches` — id, workItemId FK, projectId FK, runnerKind, runnerMode, externalRunId (nullable), externalUrl (nullable), attemptIndex (0=primary, 1=fallback#1, …), startedAt, finishedAt, status enum (`queued | dispatched | running | succeeded | failed | timed_out | rate_limited | cancelled | revoked`), errorReason (nullable), stepRunId FK (Insight-180 audit), created.

**D4: Two `workItems` extensions (sub-brief 215).**
- `runner_override` (nullable string) — overrides the project-level chain for this work item
- `runner_mode_required` (nullable enum: `local | cloud | any`) — soft constraint that filters the chain at resolution time. `any` (or null) imposes no constraint.

**D5: Dispatcher resolution algorithm (sub-brief 215).** Pure function in `packages/core/src/runner/resolution.ts`:
1. Build chain: `workItem.runner_override ? [override, ...project.fallback?] : (project.runner_chain ?? [project.default_runner_kind, project.fallback_runner_kind].filter(Boolean))`
2. Apply mode filter: drop kinds whose mode doesn't match `workItem.runner_mode_required` (when set and not `any`)
3. For each kind in the filtered chain, verify a `project_runners` row exists with `enabled = true` and `last_health_status ∈ { healthy, unknown }` (skip kinds known-unhealthy unless they are the only option, in which case attempt and let the dispatch surface the error)
4. Return the ordered, filtered, validated chain
5. If empty after filtering, return `Err('no_eligible_runner')` — the dispatcher surfaces this to the conversation surface as a notification with a "configure runner" action

**D6: Runner config is NOT in the integration registry.** ADR-005's integration registry is workspace-scoped, declarative-YAML-keyed, multi-protocol (CLI/MCP/REST). Runners are project-scoped, kind-keyed, single-purpose (dispatch a work item). The shape rhymes (credentials in the vault, kind-specific config, dispatcher invokes) but the table is separate. The brief is explicit on this so a future architect doesn't conflate them.

**D7: Status webhook polymorphism.** Single endpoint `POST /api/v1/work-items/:id/status` validates a discriminated-union Zod schema keyed on `runner_kind`. Each adapter ships its own decoder. Persisted to `runner_dispatches` (lifecycle-state transition) and `harness_decisions` (audit row per Insight-180). Recovery for missed webhooks: each runner adapter's `status()` method polls the external `external_run_id` on a configurable cron until terminal.

**D8: Trust integration consistent with Brief 212.** Runner adapter's `execute()` calls `trust-gate.ts` BEFORE dispatching. Mapping (using existing `TrustAction` enum from `packages/core/src/db/schema.ts:110-116`):
- `supervised` → `pause`. `runner_dispatches` row state `queued`; wait for /review/[token] approval; on approve → `dispatched`.
- `spot_checked` sampled-in → `sample_pause`. Same.
- `spot_checked` sampled-out / `autonomous` → `sample_advance` / `advance`. Wire send immediately.
- `critical` → runner.execute() rejected pre-dispatch (matches Brief 212's critical-tier behaviour).
- Orphaned dispatch (cloud-side staleness sweeper detects no terminal status within `dispatch_max_age_ms`) → write `harness_decisions.trustAction = "pause"` + `reviewDetails.runner.orphaned = true`.

**D9: Engine-core boundary.** Goes to `packages/core/src/runner/`: runner kind enum, mode enum, dispatch state machine, `resolveChain()` pure function, polymorphic webhook Zod schema (one entry per kind), `RunnerAdapter` interface (extends Brief 212's pattern), `runner_dispatches` table schema. Stays in `src/engine/` and `src/adapters/`: adapter implementations (Routine HTTP shape, Managed Agents SDK calls, GitHub Octokit calls), webhook handlers, the per-project `/projects/[slug]/runners` admin UI. **Test:** could ProcessOS use `packages/core/src/runner/resolution.ts`? Yes — chain-resolution + mode-filter + state-machine are generic.

**D10: Insight-180 stepRunId guard.** Every runner adapter's `execute()` requires `stepRunId` as the first parameter. `runner_dispatches.stepRunId` FK enforced at the DB. `harness_decisions` row written keyed on stepRunId. The dispatcher rejects calls without it (except `DITTO_TEST_MODE`).

**D11: Default review path + Greptile/Argos as OPTIONAL per-project integrations (revised 2026-04-25 per user steer).**

- **Default review path (always on):** the `/dev-review` skill running inside the Routine session (or whichever runner dispatched the work) PLUS human review on the PR. No third-party SaaS required. The Routine prompt is composed to invoke `/dev-review` after the implementation phase; its output appears as a PR comment authored by the routine's GitHub identity. Human review is the gate the work-item state machine waits on.
- **Default visual check (always on):** Vercel preview URL link surfaced in the work-item conversation surface as an inline card. Vercel produces the preview URL via its existing GitHub integration (no Ditto code required beyond reading the `deployment_status` event for `state: "success"` + `environment: "Preview"` and posting the URL to the work-item conversation). For non-Vercel projects, the equivalent preview-URL signal from Netlify / Cloudflare Pages / etc. is detected the same way (any `deployment_status` with non-production environment).
- **Optional integrations (Greptile, Argos, others) — detected per-project:** sub-brief 219 ships a `detectIntegrations(projectId)` function that, on project creation AND on a daily cron, inspects:
  - `project.github_repo`'s installed GitHub Apps (queried via `GET /repos/{owner}/{repo}/installation`) → if Greptile App is installed, set `project.has_greptile = true`
  - `project.github_repo` root files at the default branch (queried via `GET /repos/{owner}/{repo}/contents/argos.config.js` and similar — non-200 means absent) → if `argos.config.js` (or `.argos.config.ts`, or `argos` key in `package.json`) is present AND the Argos GitHub App is installed, set `project.has_argos = true`
  - Future: `cursor.json`, `.codescan/`, etc. — same pattern
- **Pipeline composition rule:** when running the work-item's PR-review pipeline, Ditto includes only the integrations whose `has_*` flag is true. Greptile present → wait for Greptile comment + apply `approved-by-greptile` label automation as previously specified. Argos present → gate `ready-to-deploy` on `argos-ci` check. Neither present → fall through to the default path (human review on the PR is the only gate; Vercel preview URL is the visual signal).
- **`approved-by-greptile` label automation runs only when `project.has_greptile = true`.** Asymmetry from earlier draft removed: when Greptile is absent, no label, no synthesis; the human-on-PR signal stands alone.
- **Argos check signal runs only when `project.has_argos = true`.** When absent, the work-item state machine does not wait on a visual-diff check; the user reviews the Vercel preview URL manually.
- **Sub-brief 219 scope is the detector + opt-in pipeline composition, not always-on substrate.** The brief ships: `detectIntegrations()` function, `project.has_greptile` + `project.has_argos` boolean columns on `projects` (or a `project_integrations` table — sub-brief 219 architect call), the conditional pipeline branch, the daily detection cron, and a "redetect now" admin button. Greptile/Argos webhook handlers ship behind the flag.

This change reflects: (a) Ditto's default pipeline must work end-to-end on a fresh repo with zero third-party SaaS configured; (b) users who already have Greptile / Argos / other tools installed get them surfaced automatically without per-project Ditto config; (c) the user does not pay for tools they don't use.

**D12: Deploy-gate state machine.** `workItems.status` gains transitions: `ready-to-deploy → deploying → deployed | deploy_failed`. Driven by `deployment_status` webhook from GitHub. Sub-brief 220 owns this + the GitHub Environment + required-reviewer template repos can copy.

**D13: Mobile UX.** Three surfaces, all sub-brief 221:
- `/projects/[slug]` — runner pill per work item ("Local · macmini", "Cloud · routine", "Chain ⤳", color-coded by mode).
- `/review/[token]` — small "Run on:" selector under the approve buttons; defaults to project's chain; "Force cloud for this approval" toggle sets `runner_mode_required = cloud`.
- Conversation surface — "runner started" inline cards include runner kind, mode, and external URL (deep-link to Routine session / GitHub Actions run / GitHub PR).
- Retry-next-in-chain affordance on dispatch failures.

**D14: Cross-cutting with Insight-205.** The `projects` table from sub-brief 215 is shared substrate with the future battle-ready-onboarding parent brief (Insight-205). This brief delivers the schema and admin CRUD; the onboarding brief layers analyser/retrofitter/.ditto-directory on top. **Insight-205-specific fields the onboarding brief will need (NOT shipped by 215, schema-additive at onboarding-brief time):** `last_analysed_at` (timestamp), `analysis_summary_id` (FK to a future `project_analyses` table), `retrofit_plan_id` (FK), `battle_readiness_score` (integer 0-100 nullable), `dotditto_dir_committed_at` (timestamp). Sub-brief 215's `projects` schema is deliberately minimal (slug, name, github_repo, harness_kind, default/fallback runner, runner_chain) — every onboarding-specific field is a strictly additive ALTER TABLE later. The shared substrate works because both phases agree on `projects.id` as the FK target; everything else extends.

## Sub-Brief Decomposition

Eight sub-briefs along dependency seams. Bodies for sub-briefs 216-222 are deferred to subsequent Architect sessions per the parent-then-sub-brief sequence (Brief 209 precedent).

| # | Sub-brief | Seam | What it ships | ACs target |
|---|-----------|------|---------------|-----------|
| 215 | **Projects table + Runner Registry schema** | substrate | The three new tables (`projects`, `project_runners`, `runner_dispatches`), `workItems` extensions, drizzle migration, dispatcher resolution algorithm in `packages/core/src/runner/`, per-project `/projects/[slug]/runners` admin scaffold (list view + CRUD + "test dispatch" button stub), tightening of `processes.projectId` FK. **Critical path.** Full body in `docs/briefs/215-projects-and-runner-registry.md` this session. | 12-15 |
| 216 | **Routine dispatcher (claude-code-routine)** | first cloud runner | `routineAdapter` (`src/adapters/claude-code-routine.ts`); HTTP client; `runner_status_handlers/routine.ts` decoder; in-prompt completion-callback shape (the routine's prompt is told how to POST to Ditto's status webhook); GitHub `pull_request`/`workflow_run` event subscription as fallback signal; bearer-credential health check; smoke-test against agent-crm. | 10-13 |
| 217 | **Managed Agents dispatcher** | second cloud runner | `managedAgentAdapter` (`src/adapters/claude-managed-agent.ts`); `@anthropic-ai/sdk` Managed Agents calls (session create + event send); 30-second polling cron for terminal status; SSE optional layer; `runner_status_handlers/managed-agent.ts`; agent-version pinning per project_runners config. | 10-13 |
| 218 | **GitHub Actions dispatcher** | third cloud runner | `githubActionAdapter` (`src/adapters/github-action.ts`); `@octokit/rest` `workflow_dispatch` + `workflow_run` + `pull_request` + `check_run` webhook handlers; cancel + log-zip retrieval; multi-repo dispatch helper. Reuses Ditto's existing GitHub integration credential model. | 10-13 |
| 219 | **Optional review/visual-check integrations (detection + opt-in wiring)** | review substrate | `detectIntegrations(projectId)` function (queries GitHub installations + repo root for `argos.config.js` / `argos.config.ts` / `package.json` argos key); `project.has_greptile` + `project.has_argos` boolean columns (or `project_integrations` table — sub-brief 219 architect call); daily detection cron; "redetect now" admin button on `/projects/[slug]`; CONDITIONAL Greptile webhook handler (`issue_comment.created` → label automation, only fires when `has_greptile = true`); CONDITIONAL Argos check_run handler (only fires when `has_argos = true`); Vercel preview-URL inline card on the work-item conversation surface (always on, surfaces from `deployment_status` non-production events; equivalent for Netlify / Cloudflare Pages). Default review path (`/dev-review` skill inside Routine + human review on PR) is wired by sub-brief 216 — sub-brief 219 only adds optional layers above it. | 9-12 |
| 220 | **Deploy gate + GitHub Mobile** | deploy substrate | `deployment_status` webhook handler; `workItems.status` enum extension (`deploying`, `deployed`, `deploy_failed`); template `deploy-prod.yml` GitHub Action shipped as docs (users copy into their repos); GitHub Environment + required-reviewer setup runbook; one-tap mobile-approve link in conversation surface. | 8-10 |
| 221 | **Mobile UX (runner pill + Run-on selector + retry)** | UX | `/projects/[slug]` runner-pill component; `/review/[token]` "Run on:" selector + force-cloud toggle; conversation-surface runner-started/finished cards; retry-next-in-chain button; `/admin` runner-metrics card (success rate, mean duration, rate-limit hits, fallback-triggered rate). Mobile-first (≥44pt taps, no horizontal scroll, sticky bottom action bar). | 10-13 |
| 222 | **End-to-end smoke tests** | proof | Playwright e2e suite covering: agent-crm cloud (Mac off, phone-only), agent-crm local (Mac on, runner forced local), native-Ditto cloud, native-Ditto local; runner-chain fail-over; runner_mode_required filter. Each scenario produces an artefact PR + Greptile review + Argos check + deploy approval. | 8-10 |

**Sub-brief 215 is the critical path.** 216, 217, 218 can run in parallel after 215 merges. **220 (deploy-gate) and 221 (mobile UX) can ship as soon as 216 merges** — they do NOT depend on 219, because the default review path (`/dev-review` inside the Routine + human review on PR) is wired by 216 itself, and the default visual signal (Vercel preview URL inline card) is surfaced by 216's status-handler reading `deployment_status` non-production events. 219 layers OPTIONAL integrations on top after detection; it can ship at any point post-216 without blocking deploy or UX. 222 is last.

**Cross-coupling note.** Although each sub-brief is independently testable for its own ACs, **sub-brief 219 cannot validate its Greptile / Argos signal path live without sub-brief 216 having shipped** (Greptile reviews require a real PR; Argos check_runs require a real PR with Playwright tests). Sub-brief 219's body must include unit/integration tests using GitHub-event fixtures so the brief can pass review independently; the live optional-integration flow is verified at sub-brief 222 (phase smoke) only on a repo that has the integration installed. The default review + visual paths are exercised at every smoke regardless of optional-integration presence.

## What Changes (Work Products) — phase-level

| File | Action |
|------|--------|
| `docs/briefs/215-projects-and-runner-registry.md` | **Create** (this session) — full body, 12-15 ACs |
| `docs/briefs/216-routine-dispatcher.md` | **Create** in subsequent Architect session post-215-approval |
| `docs/briefs/217-managed-agent-dispatcher.md` | **Create** in subsequent Architect session post-215-approval |
| `docs/briefs/218-github-action-dispatcher.md` | **Create** in subsequent Architect session post-215-approval |
| `docs/briefs/219-greptile-argos-review.md` | **Create** in subsequent Architect session post-216-merge |
| `docs/briefs/220-deploy-gate.md` | **Create** in subsequent Architect session post-216-merge |
| `docs/briefs/221-runner-mobile-ux.md` | **Create** in subsequent Architect session post-216-merge (Designer pass first) |
| `docs/briefs/222-cloud-runners-smoke.md` | **Create** in subsequent Architect session post-220 |
| `docs/architecture.md` | **Modify** post-build (one paragraph in §L2 Agent + one paragraph in §L3 Harness — see §"Reference doc updates" below) |
| `docs/adrs/005-integration-architecture.md` | **Modify** post-build (one note distinguishing runner-config from integration-registry) |
| `docs/dictionary.md` | **Modify** post-build (new terms: Project, Runner, Runner Kind, Runner Mode, Runner Chain, Runner Dispatch, Mode-Required Constraint, Fallback Runner) |
| `docs/landscape.md` | **No change** — already updated by Researcher |
| `docs/roadmap.md` | **Modify** post-215-merge (new "Cloud Execution Runners" phase row pointing to this brief) |

## Constraints

- **Engine-first per CLAUDE.md.** `packages/core/src/runner/` holds: kind/mode/state enums, chain-resolution pure function, state-machine transition table, `RunnerAdapter` interface, `runner_dispatches` schema, polymorphic webhook Zod discriminated union (one schema per kind, the kind enum is core; payload shapes are core because they're cross-runner contracts). `src/adapters/<kind>.ts` and `src/engine/runner-status-handlers/<kind>.ts` are product layer. Test: could ProcessOS use core? Yes — generic dispatch substrate.

- **No Ditto opinions in core.** Core must not reference Self, personas, network, workspace-slug semantics. Adapter implementations (Routine endpoints, Managed Agents SDK calls, Octokit calls) live in `src/adapters/` and may be Ditto-flavored.

- **DB injection (CLAUDE.md core rule 5).** Core defines the runner schemas and resolution function but does NOT create database connections. The cloud-side dispatcher passes the existing `db` from the workspace at boundary call sites.

- **Side-effecting function guard (Insight-180) — MANDATORY.** Every runner adapter's `execute()` must require `stepRunId`. `runner_dispatches.stepRunId` FK is enforced at the DB; the function rejects calls without it (except `DITTO_TEST_MODE`). `harness_decisions` row written per dispatch.

- **Trust integration via existing `trust-gate.ts`.** Runners do NOT make trust decisions; `trust-gate.ts` returns a `TrustAction` BEFORE the runner adapter's `execute()` is called and the adapter honours it. Mapping per D8 above. No new `TrustAction` enum values.

- **`harness_decisions` is the canonical audit destination** for every dispatch (`processRunId`, `stepRunId`, `trustTier`, `trustAction`, `reviewDetails.runner = { runnerKind, runnerMode, externalRunId, attemptIndex }`). No new audit table for trust; `runner_dispatches` is the dispatch-lifecycle table only.

- **Schema migration discipline (Insight-190).** Sub-brief 215 introduces three new tables + workItems extensions in one migration. Tag depends on Brief 212's idx parity at merge time (this brief reserves idx ≥ 12; Brief 212 reserves idx 11 with tag `0011_local_bridge`). On idx race: resequence per `docs/insights/190-drizzle-migration-discipline.md`.

- **Mobile-first per ADR-018 §UX-Constraint-Mapping.** Every UI surface introduced (`/projects/[slug]/runners`, `/projects/[slug]` runner pill, `/review/[token]` "Run on:" selector, retry buttons, admin runner-metrics card) MUST work on a phone. Touch targets ≥44pt, no horizontal scroll on long external URLs (truncate with ellipsis + tap-to-expand), sticky bottom action bar on `/review/[token]`.

- **No Ditto-side replacement for any of the four cloud runners.** Ditto is a thin client to Routines, Managed Agents, GitHub Actions, E2B. We dispatch + observe; we do not re-implement.

- **Local-mac-mini runner is byte-for-byte preserved.** Brief 212's behaviour (`bridgeCliAdapter`, JSON-RPC over WebSocket, pairing-code → JWT, queue persistence, mid-job disconnect resume, 60s heartbeat, `harness_decisions` audit) does not change. This phase only adds the `local-mac-mini` value to the runner kind enum and wires the dispatcher to call `bridgeCliAdapter.execute()` when that kind is selected.

- **Harness-agnostic.** Native-Ditto coding work via cloud runners must work without filesystem-brief assumptions: the work-item body is encoded into the runner's prompt input. Each adapter owns the encoding.

- **No auto-deploy.** Production deploys gated by GitHub Environment + required-reviewer (the user) approving in GitHub Mobile. Sub-brief 220 enforces this.

- **Reuse existing primitives.** Credential vault (AES-256-GCM, `src/engine/credential-vault.ts`), `harness_decisions` audit, conversation surface inline cards (existing ContentBlock types), review surface (`/review/[token]`). Do not invent parallel orchestrators.

- **Webhook recovery via polling.** Each adapter's `status()` method polls the external `external_run_id` on a kind-specific cron (Managed Agents 30s per user spec; GitHub Actions 60s; Routines 5min — slow because the primary path is GitHub events). Configurable per kind in `packages/core/src/runner/poll-cadences.ts`.

- **Output cap discipline.** Runner adapters that capture stdout/logs (GitHub Actions logs, Managed Agents SSE events) cap at 4 MB per dispatch; truncate with marker. Matches Brief 212's bridge-job cap.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| Adapter contract `{ execute, status, cancel }` | `src/adapters/cli.ts:114-220` (existing Ditto pattern, Paperclip-derived) | depend (existing) | Same shape as Brief 212's `bridgeCliAdapter`; preserves consistency across all five runners. |
| Anthropic Claude Code Routines HTTP `/fire` | code.claude.com/docs/en/routines | depend (service) | Direct dispatch surface. Bearer + beta header + `text` body. Preview API; breaking changes behind dated headers. |
| Anthropic Managed Agents session/events | platform.claude.com/docs/en/managed-agents | depend (`@anthropic-ai/sdk` already in stack) | Same SDK Ditto already uses for `claude-api`; beta header `managed-agents-2026-04-01`. |
| GitHub workflow_dispatch + webhook events | docs.github.com/en/rest/actions | depend (`@octokit/rest` already in stack) | Workflow dispatch returns run ID since 2026-02-19; status via `workflow_run`/`pull_request`/`check_run` webhooks. |
| Greptile GitHub App | greptile.com | depend (service, $30/dev/mo) | AI PR review; comments-only delivery; label automation Ditto-side. |
| Argos GitHub App | argos-ci.com (real $0 Hobby tier, 5,000 screenshots) | depend (service) | GitHub-native check status for visual diffs; check_run.completed event for the gate. |
| GitHub Environments + required reviewers + GitHub Mobile | docs.github.com/en/actions; github.blog/changelog/2021-04-01 | depend (configuration) | Mobile-first deploy gate; `deployment_status` webhook closes the loop. |
| `bridgeCliAdapter` — local-mac-mini runner | `docs/briefs/212-workspace-local-bridge.md` | depend (sibling brief) | The local arm of this phase. Not modified here. |
| `trust-gate.ts` for `TrustAction` resolution | `packages/core/src/db/schema.ts:110-116` + Brief 212's mapping | depend (existing) | Same trust-tier semantics as Brief 212; runners use existing enum values, no invention. |
| Insight-180 stepRunId guard | `docs/insights/180-steprun-guard-for-side-effecting-functions.md` | pattern (project-internal) | Bridge dispatch and runner dispatch are both side-effecting functions — same guard. |
| Drizzle migration journal idx parity | `docs/insights/190-drizzle-migration-discipline.md` | pattern (project-internal) | Schema additions follow journal idx order; race resolution defined. |
| Brief sizing (parent + sub-briefs) | `docs/dev-process.md:179-194` (originated as Insight-004, absorbed) | pattern (project-internal) | This is a phase brief; sub-briefs each independently testable. |
| Project-as-primitive sketch | User's pipeline spec `.context/attachments/pasted_text_2026-04-25_21-14-58.txt:23-41` + Insight-205 | original to Ditto | The `projects` table satisfies BOTH cloud-runners AND battle-ready-onboarding; designed minimal-additive so each phase extends without rewrite. |
| Chain-resolution algorithm with mode filter | researcher report Gap 2 + user's pipeline spec :59-64 | original to Ditto | No surveyed orchestration framework has runner-mode-required + chain + per-attempt audit. |
| Polymorphic status webhook with `runner_kind` discriminator | researcher report §"Architect-input observations" | original to Ditto | Single endpoint, kind-keyed Zod discriminated union, kind-specific decoder. |
| `approved-by-greptile` label automation | researcher report Gap 5 | original to Ditto | Greptile ships no native label; Ditto-owned webhook handler synthesizes one from comments. |

## User Experience

- **Jobs affected:** Delegate (primary — choosing where work runs), Decide (approving + selecting runner), Capture (runner-started/finished cards), Review (PR + Greptile + Argos all surface uniformly).
- **Primitives involved:** new "Runner Pill" affordance on work-item rows; "Run on:" selector inline on `/review/[token]`; runner-metrics card on `/admin`; new `/projects/[slug]/runners` admin page.
- **Process-owner perspective:** picking a project's runner becomes a first-class affordance. The user can mark a single work item "cloud-only" because they're on a phone, OR force-local because they want hands-on, OR let the chain handle it. Failures (rate-limit, daemon-offline) advance to the next runner automatically; the user sees one notification per chain-completion-or-exhaustion, not per-attempt.
- **Interaction states:** loading (dispatching), dispatched (external link rendered), running (live external link with status), succeeded (PR opened, link to Greptile review), failed/timed_out/rate_limited (retry button + auto-advance to next in chain), no-eligible-runner (clear "configure a runner" CTA → /projects/[slug]/runners), revoked (credential vault detected expired bearer; "re-pair routine" CTA).
- **Designer input:** **Designer not yet invoked for sub-brief 221.** Lightweight UX section here is interim; sub-brief 221 will spawn `/dev-designer` for a full interaction spec before its body is written.

## Acceptance Criteria (phase-level)

These are gates the parent brief enforces — exercised at the END of sub-brief 222 (phase complete). Sub-briefs each carry 8-17 of their own ACs.

1. [ ] All five runner kinds (`local-mac-mini`, `claude-code-routine`, `claude-managed-agent`, `github-action`, plus `e2b-sandbox` reserved-but-deferred) are valid values of the `runnerKind` enum and routable through one dispatcher code path.
2. [ ] Existing `local-mac-mini` flow (Brief 212) continues to work end-to-end without regression — verified by Brief 212's smoke tests passing post-215-merge AND post-216-merge.
3. [ ] Each new cloud runner adapter has a tested dispatch path: integration test creates a `runner_dispatches` row, calls the adapter, verifies state transitions queued→dispatched→running→succeeded against a recorded HTTP fixture (Routine), SDK fixture (Managed Agents), or Octokit fixture (GitHub Actions).
4. [ ] Schema additions (`projects`, `project_runners`, `runner_dispatches`, `workItems.runner_override`, `workItems.runner_mode_required`) pass `pnpm run type-check` AND have drizzle migration with idx parity per Insight-190.
5. [ ] `runner_chain` works: integration test forces a `rate_limited` failure on the primary runner; dispatcher advances to the secondary; `runner_dispatches` rows record both attempts with `attemptIndex = 0` and `attemptIndex = 1`; the work item completes via the secondary.
6. [ ] `runner_mode_required = "cloud"` filters the chain: integration test sets the constraint, project chain has `[local-mac-mini, claude-code-routine]`; dispatcher returns `[claude-code-routine]` only.
7. [ ] `runner_mode_required = "cloud"` does NOT auto-fail-over to a local runner even if all clouds are exhausted — the work item is marked `blocked` with a clear `noEligibleRunner` reason. Symmetric for `local`.
8. [ ] Status webhook `POST /api/v1/work-items/:id/status` accepts payloads from all four implemented runner kinds via the discriminated-union Zod schema; payloads with unknown `runner_kind` reject with 400; valid payloads transition `runner_dispatches.status` AND emit a conversation-surface inline card.
9. [ ] **Default review path always works:** for any project (no Greptile installed, no other AI review tool), the dispatched runner invokes the `/dev-review` skill in-session; its output appears as a PR comment authored by the runner's GitHub identity; the work-item state advances on human PR approval (PR `approved` review state) regardless of any optional-integration presence.
10. [ ] **Default visual check always works:** the work-item conversation surface renders a Vercel preview URL inline card the moment the runner-opened PR's `deployment_status` event fires with `state: "success"` and a non-production environment. Equivalent path tested for Netlify (verified in sub-brief 222 if a Netlify-deployed project is used). Default visual check is independent of Argos presence.
11. [ ] **Optional Greptile integration wires only when detected:** for a project where `detectIntegrations()` returns `has_greptile = true` (Greptile GitHub App installed on the repo), `issue_comment.created` webhook handler logs Greptile's comment to the work item's activity feed and applies `approved-by-greptile` label on no-findings. For a project where `has_greptile = false`, the handler is inert — no label, no synthesis, no waiting.
12. [ ] **Optional Argos integration wires only when detected:** for a project where `detectIntegrations()` returns `has_argos = true` (Argos GitHub App installed AND `argos.config.{js,ts}` or `package.json#argos` present in repo root), `check_run.completed` with `name: "argos-ci"` advances the work item from `review` to `ready-to-deploy` on `success`; on `failure` keeps it in `review` with the diff URL surfaced. For a project where `has_argos = false`, no waiting; the default visual check (Vercel preview URL) is the user's manual gate.
13. [ ] **Detection cron + manual redetect:** `detectIntegrations()` runs on project creation and daily; admin can click "Redetect integrations" on `/projects/[slug]` to refresh `has_greptile` / `has_argos` flags out-of-cycle.
14. [ ] GitHub Environment `production` + required-reviewer (the user) approval flow works on GitHub Mobile (push notification → tap → approve → workflow continues). `deployment_status` `success` transitions the work item to `deployed`.
15. [ ] Deploy state machine: `ready-to-deploy → deploying → deployed | deploy_failed` transitions are persisted; reverse transitions are rejected.
16. [ ] Mobile-first verification: the runner pill on `/projects/[slug]` rows, the "Run on:" selector on `/review/[token]`, and the retry-next-in-chain button all pass mobile-viewport e2e (375 × 667, no horizontal scroll, ≥44pt taps).
17. [ ] **End-to-end smoke A — agent-crm cloud, Mac mini off, phone-only:** intake → triage → approve → cloud runner dispatch → `/dev-review` runs in-session as PR comment → Vercel preview URL appears in conversation → human approves PR → deploy approval in GitHub Mobile → work item closes. If agent-crm has Greptile or Argos installed, those signals appear additively. Manual smoke executed by user.
18. [ ] **End-to-end smoke B — agent-crm local, Mac mini on, runner forced local:** same flow via `local-mac-mini`. Verifies non-regression of Brief 212. Default review + Vercel preview path identical regardless of mode.
19. [ ] **End-to-end smoke C — native-Ditto cloud:** a work item against the Ditto repo itself (no Catalyst, work-item body as prompt) dispatches via `claude-code-routine`, opens a PR, `/dev-review` runs, Vercel preview surfaces, completes the same review/deploy cycle. No optional integrations expected on the Ditto repo (yet).
20. [ ] **End-to-end smoke D — native-Ditto local:** same as C but via `local-mac-mini`.
21. [ ] Insight-180 audit: every `runner_dispatches` row has a non-null `stepRunId` FK; integration test verifies a dispatch with no stepRunId is rejected pre-DB-write.
22. [ ] Trust-tier semantics: integration test exercises all four trust tiers + sampling outcomes against each cloud runner; behaviour matches D8 mapping (supervised/sample-in pause; sample-out/autonomous advance immediately; critical rejected pre-dispatch).
23. [ ] `/projects/[slug]/runners` admin (PHASE-COMPLETION GATE — verified post-sub-briefs 216-218 merge): from a fresh project, the user can add a runner of EACH of the four implemented kinds (local-mac-mini, claude-code-routine, claude-managed-agent, github-action), fill the kind-specific config form, store credentials in the vault, click "Test dispatch" and see the runner's `last_health_status` update to `healthy`; enable/disable per-runner toggles work; mobile-friendly. **Note:** sub-brief 215 ships only the local-mac-mini scaffold (the four cloud kinds appear disabled in its kind selector); each subsequent sub-brief 216/217/218 enables its kind and ships its kind-specific config form + health check.
24. [ ] Per-runner metrics surface on `/admin`: success rate, mean duration, rate-limit hit rate, fallback-triggered rate. Computed from `runner_dispatches`. No regressions in existing admin views.

**24 ACs — above the 8-17 band for a single build brief.** This is deliberate for a **parent brief**: these are phase-level gates spanning 8 sub-briefs, not a single build session. Sub-briefs 215-222 each ship with 8-17 of their own ACs per `docs/dev-process.md:179-194` (brief sizing rule).

## Review Process

Each sub-brief carries its own review process. At phase level:

1. The parent brief itself reviewed against `docs/architecture.md` + `docs/review-checklist.md` in this Architect session
2. Each sub-brief gets its own Reviewer pass at write-time
3. **Phase review** at sub-brief 222 merge: spawn a separate Reviewer agent reading all 8 sub-briefs + this parent + the smoke-test results, challenging the integrated phase against the architecture spec
4. Human approves phase-complete

## Smoke Test (phase-completion)

Exercised at sub-brief 222 merge:

```
# Smoke A — agent-crm cloud (Mac mini off, phone-only)
1. Power off Mac mini.
2. From iPhone, open Ditto Railway URL.
3. Capture work item: "Add a /healthz endpoint to agent-crm app router."
4. Triage runs (system agent classifies → coding work).
5. Tap Approve in /review/[token].
6. Verify: runner pill shows "Cloud · routine"; tap external URL → Anthropic session live in browser.
7. Wait for PR.
8. Verify /dev-review skill output appears as a PR comment authored by the routine's GitHub identity (default review path).
9. Verify Vercel preview URL inline card appears in the work-item conversation surface (default visual check).
10. (Optional, only if agent-crm has Greptile installed) Verify Greptile comment in activity feed; if no findings → `approved-by-greptile` label applied.
11. (Optional, only if agent-crm has Argos installed + argos.config.js present) Verify Argos check passes.
12. Approve PR manually from iPhone (GitHub Mobile).
13. Receive GitHub Mobile push: "Approve deploy to production?"; approve.
14. Verify work item state: ready-to-deploy → deploying → deployed.
15. Verify Vercel deploy succeeded; close work item.

# Smoke B — agent-crm local (Mac mini on, forced local)
Same as A but: Mac mini on; on /review/[token] tap "Run on:" → "local-mac-mini"; verify dispatch goes via Brief 212 bridge to the Mac. Default review path (/dev-review in-session + human PR review) and default visual check (Vercel preview URL) identical to A.

# Smoke C — native-Ditto cloud
Work item against the Ditto repo itself: "Update copyright year in packages/web/app/layout.tsx footer." No Catalyst structures present. No Greptile or Argos installed on the Ditto repo (default path only).
Verify: routine receives work-item body as prompt input; PR opened against ditto/main; /dev-review comment appears; Vercel preview URL surfaces; human approves PR; deploy gate fires.

# Smoke D — native-Ditto local
Same as C but forced local via Brief 212 bridge.

# Smoke E (optional, run only if a project with Greptile + Argos is available) — full optional-integration coverage
Pick a project with both Greptile App + Argos App installed AND argos.config.js present. Run smoke A. Verify:
- detectIntegrations() detected has_greptile = true and has_argos = true on project create.
- Greptile comment surfaces in activity feed.
- Argos check_run gates ready-to-deploy.
- Both signals appear additively alongside the default /dev-review + Vercel paths.
```

## After Completion

1. Update `docs/state.md` (this Architect session adds a checkpoint; sub-brief 222 adds a phase-complete checkpoint)
2. Update `docs/roadmap.md` with new "Cloud Execution Runners" phase row
3. Architecture.md amendments per "Reference doc updates" below
4. Phase retrospective (run by Documenter): what worked, what surprised, what to change. Verify Insight-205 onboarding brief can land on the now-built `projects` substrate without schema rewrite.
5. Consider an ADR if a significant architectural decision emerges that contradicts current ADRs (none expected — this phase EXTENDS, doesn't contradict).

## Reference doc updates

- `docs/architecture.md` §L2 (Agent) — **DRAFT amendment** (to be inserted after the existing adapter-pattern paragraph; final wording confirmed at phase-completion):
  > **Runners.** A runner is a work-item-level dispatch primitive distinct from step.executor. Step.executor (`ai-agent | cli-agent | script | …`) decides how a single step inside a Ditto process runs. A runner decides where a *whole work item* executes when that work item is project-bound (a coding-pipeline target — repo, branch, harness kind). The runner dispatches the work-item body to an external execution surface (Anthropic Routine, Managed Agents session, GitHub Actions workflow, or the local-bridge daemon from Brief 212), which runs its own loop internally; Ditto's per-step process loop is not invoked for runner-dispatched work. Five runner kinds are recognized: `local-mac-mini` (mode `local`), `claude-code-routine | claude-managed-agent | github-action` (mode `cloud`), and `e2b-sandbox` (mode `cloud`, reserved-deferred). Runners are project-scoped (`project_runners` table) and selected per-project + per-work-item with an ordered fallback chain.

- `docs/architecture.md` §L3 (Harness) — **DRAFT amendment** (to be appended to the existing trust-pipeline subsection):
  > **Runner-dispatch pipeline.** Runner dispatches traverse the same harness pipeline as step executions. The order is: chain-resolution (`packages/core/src/runner/resolution.ts`) → trust-gate (existing `trust-gate.ts`) → adapter dispatch (kind-specific). The trust-gate produces a `TrustAction` exactly as it does for step execution; `pause` and `sample_pause` block the wire send until human approval at `/review/[token]`; `advance` and `sample_advance` proceed; `critical` rejects pre-dispatch. `harness_decisions` rows are written per dispatch keyed on `stepRunId` (Insight-180). One new pre-trust-gate constraint applies: `workItems.runner_mode_required` (`local | cloud | any`) filters chain-eligibility before chain-resolution runs; if the constraint produces an empty chain, the work item is marked `blocked` with `noEligibleRunner` and no trust-gate decision is taken.

  These draft paragraphs are reviewed at phase-completion (sub-brief 222 merge). They do not contradict existing L2 (which says nothing about work-item-level dispatch) or L3 (which establishes the trust pipeline; runner dispatch slots in alongside step dispatch).
- `docs/adrs/005-integration-architecture.md` post-build amendment note: runners are NOT integrations (different scope: project-scoped vs workspace-scoped; different purpose: work-item-dispatch vs agent-tool-use/process-I-O). The shape rhymes (credential vault reuse) but the table is separate.
- `docs/dictionary.md` post-build: Project, Runner, Runner Kind, Runner Mode, Runner Chain, Runner Dispatch, Mode-Required Constraint, Fallback Runner, Approved-by-Greptile Label.
- `docs/landscape.md` already updated by Researcher; no further drift this session.
- `docs/insights/004-brief-sizing.md` was absorbed into `docs/dev-process.md:179-194` — referenced by section, not by file path. No changes.
- `docs/insights/205-battle-ready-project-onboarding.md` post-215-merge: add note that `projects` table is now built; onboarding brief can layer onto it.
