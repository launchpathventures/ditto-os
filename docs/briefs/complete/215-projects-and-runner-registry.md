# Brief 215: Projects table + Runner Registry schema (sub-brief of 214)

**Date:** 2026-04-25
**Status:** complete (2026-04-26 — built, reviewed, post-review fixes shipped, documented; brief moved to `docs/briefs/complete/`)
**Depends on:** Brief 212 (Workspace Local Bridge — for drizzle idx parity; 212 reserves idx 11 with tag `0011_local_bridge`, this brief lands at idx 12 unless 212 ships first in which case idx aligns at merge time per Insight-190)
**Unlocks:** sub-briefs 216 (Routine), 217 (Managed Agents), 218 (GitHub Actions), 219 (Greptile/Argos optional), 220 (Deploy gate), 221 (Mobile UX). Also unlocks Brief 223 (workItems brief-equivalent + status webhook + CRUD) and Brief 224 (Project Onboarding & Battle-Readiness parent — analyser/retrofitter/memory-scope sub-briefs all depend on the `projects` substrate landed here).
**Parent brief:** 214 (Cloud Execution Runners Phase)

## Collision Reconciliation Resolved (2026-04-25)

A parallel architect session shipped Brief 223 (Projects Schema + CRUD) and Brief 224 (Project Onboarding parent) which independently designed a `projects` table from the user's pipeline-spec field set. Brief 224 flagged a collision and enumerated three reconciliation paths. **Architect call: Path 1+ (refined) — both briefs ship, but Brief 215 absorbs the pipeline-spec fields it missed and Brief 223 rescopes to its genuinely additive layer.**

What this brief now owns (post-amendment):
- The `projects` table with the union of pipeline-spec fields + cloud-runner fields
- The `project_runners` table (per-(project × kind) config, FK pointer into credentials vault)
- The `runner_dispatches` table (dispatch lifecycle audit)
- `processes.projectId` real FK tightening
- `workItems.runner_override` + `workItems.runner_mode_required` (the runner-routing fields only — Brief 223 owns the brief-equivalent extension fields)
- Seed projects (`agent-crm`, `ditto`) at boot

What Brief 223 owns (rescoped to additive):
- `workItems` extension with brief-equivalent fields (title, body, briefState, riskScore, confidence, modelAssignment, linkedCaptureId, linkedProcessRunId, stateChangedAt) + 2 CHECK constraints partitioning by projectId
- Status webhook handler `POST /api/v1/work-items/:id/status` (bearer-token auth via `projects.runnerBearerHash` LANDED HERE in Brief 215)
- CRUD endpoints `/api/v1/projects` (GET / POST / PATCH / DELETE) — pure adapters over Brief 215's tables; the bearer-generation logic on POST writes `projects.runnerBearerHash` per the discipline this brief specifies

What Brief 224 (parent) depends on after reconciliation: BOTH Brief 215 (this) for substrate + Brief 223 for the brief-equivalent layer.

Field-naming reconciliation:
- `harnessKind` (215 original) → **`harnessType`** (matches pipeline spec); enum extended from `catalyst | native-ditto` to `catalyst | native | none` (the `none` value covers the BEFORE-flow case where a project has no harness scaffolding yet)
- `defaultRunnerKind` (215 original) stays — captures the chain-default runner. Now NULLABLE (transient `status='analysing'` projects have no runner picked)
- `fallbackRunnerKind` stays — captures the simple-fallback when no full chain is configured
- `runnerChain` stays — JSON array overriding default+fallback
- `runner` (223's single-runner field) — DROPPED. Brief 215's `defaultRunnerKind` is the single-runner equivalent
- `runnerConfig` JSON on projects (223's field) — DROPPED. Brief 215's `project_runners.config_json` is per-(project × kind) and more flexible per the user's spec
- New on `projects` (absorbed from 223): `status`, `briefSource`, `briefPath`, `deployTarget`, `runnerBearerHash`

## Goal

- **Roadmap phase:** Phase 9+ (substrate). First seam of Brief 214.
- **Capabilities:** the `projects` primitive + the runner-registry schema + the dispatcher resolution algorithm + a thin per-project `/projects/[slug]/runners` admin scaffold. Substrate only — no actual cloud-runner adapters in this brief; sub-briefs 216-218 ship those.

## Context

Today (commit `5f74ebb`): `processes.projectId` is text-with-no-FK at `packages/core/src/db/schema.ts:198`. There is no `projects` table. Brief 212 ships `local-mac-mini` runner via `bridgeCliAdapter` but explicitly defers adapter-routing because no `projects.runner` field exists. Brief 214 (parent) defines the runner shape across five kinds and decomposes into 8 sub-briefs; this is the first.

Two phases need this substrate: **cloud-runners (Brief 214)** and **battle-ready-onboarding (Insight-205, parent brief not yet written)**. The schema here covers both — minimal-additive so each phase extends without rewrite.

## Objective

Ship the `projects` primitive + runner-registry schema + dispatcher resolution function + admin CRUD scaffold so that sub-briefs 216-218 can implement runner adapters against a stable substrate, and Insight-205's onboarding brief can layer on top without schema rewrites.

## Non-Goals

- **No cloud-runner adapters in this brief.** `claude-code-routine`, `claude-managed-agent`, `github-action` adapter implementations belong to sub-briefs 216-218. This brief ships the dispatcher resolution algorithm + the `RunnerAdapter` interface only.
- **No regression of `local-mac-mini`.** Brief 212's `bridgeCliAdapter` is wired into the new dispatcher post-merge but its behaviour is byte-for-byte preserved. Verified by AC #11.
- **No Greptile/Argos/deploy-gate logic.** Sub-briefs 219, 220.
- **No mobile pill / "Run on:" selector.** Sub-brief 221.
- **No work-item state-machine extensions for deploy.** Sub-brief 220 (`deploying`, `deployed`, `deploy_failed`).
- **No project-onboarding analyser/retrofitter.** Insight-205's onboarding brief.
- **No Catalyst-vs-native auto-detection.** `harness_kind` is set explicitly by the user when creating a project; auto-detection is a separate brief.
- **No multi-user / shared-project model.** Projects are workspace-scoped; one user, n projects.
- **No e2b-sandbox config schema.** The runner kind is reserved in the enum but `project_runners.config_json` shape for that kind is not defined here.
- **No per-runner rate-limit tracking beyond `last_health_status`.** Detailed rate-limit telemetry is sub-brief 221's `/admin` runner-metrics.

## Inputs

1. `docs/briefs/214-cloud-execution-runners-phase.md` — parent; §"Architectural Decisions" D2-D6, D9-D10 are binding for this brief
2. `docs/research/cloud-runners.md` — research; §"Existing primitives Ditto already has" maps the reuse points
3. `docs/insights/205-battle-ready-project-onboarding.md` — `projects` substrate co-tenant; §"Project memories scoped per-project" notes future extensions
4. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every adapter dispatched through the resolver must require `stepRunId`
5. `docs/insights/190-drizzle-migration-discipline.md` — idx parity rules; on Brief 212 idx race resolution
6. `packages/core/src/db/schema.ts:175-205` — current `processes` table (the `projectId` column gets FK constraint)
7. `packages/core/src/db/schema.ts:583-617` — current `workItems` table (gets two new nullable columns)
8. `packages/core/src/db/schema.ts:110-116` — `TrustAction` enum (the dispatcher honours, does not extend)
9. `packages/core/src/db/schema.ts:495-522` — `harness_decisions` table (audit destination per Insight-180)
10. `src/adapters/cli.ts:114-220` — adapter contract reference (`{ execute, status, cancel }` shape)
11. `src/engine/credential-vault.ts` — credential vault (AES-256-GCM); `project_runners.credential_ids` are pointers into this
12. `src/engine/integration-registry.ts` + `integrations/00-schema.yaml` — integration registry. Runners are NOT integrations (per parent §D6); pattern reference only
13. `drizzle/meta/_journal.json` — last entry idx=9; Brief 212 reserves idx=10 (tag `0011_local_bridge`); this brief reserves idx=11 (tag `0012_projects_runners`) unless 212 hasn't shipped at merge time, in which case resequence per Insight-190
14. `packages/web/app/admin/page.tsx` — the existing /admin top-level admin page; this brief adds a "Projects" card linking to `/projects` index

## Constraints

- **Engine-first per CLAUDE.md.** `packages/core/src/runner/` (new directory) holds: `kinds.ts` (kind + mode + status enums), `state-machine.ts` (8-state transition table for `runner_dispatches.status`), `resolution.ts` (chain-resolution pure function with mode filter and health filter), `interface.ts` (`RunnerAdapter` contract), `webhook-schema.ts` (Zod discriminated union over `runner_kind`, kind-specific payload schemas exposed but kept abstract — concrete decoders ship in product layer). All schema additions go to `packages/core/src/db/schema.ts`.

- **No Ditto opinions in core.** `packages/core/src/runner/` must not import from `src/`. Must not reference Self, personas, network, workspace-slug semantics. Adapter implementations ship to `src/adapters/` (next sub-briefs).

- **DB injection (CLAUDE.md core rule 5).** Core defines schemas + resolution function + state machine but does NOT create database connections. Resolver receives `db` as parameter at boundary call sites.

- **Side-effecting function guard (Insight-180) — MANDATORY.** The `RunnerAdapter` interface declares `execute(stepRunId: string, …)` as the first parameter. The dispatcher (sub-briefs 216-218 call site, but the interface is set here) rejects calls without it (except `DITTO_TEST_MODE`). `runner_dispatches.stepRunId` FK enforced at the DB.

- **Schema migration discipline (Insight-190).** This brief introduces three new tables + two `workItems` columns + tightens `processes.projectId` FK in ONE migration. Generated via `drizzle-kit generate` against next-free idx. On Brief 212 idx race: resequence. On any other concurrent migration: resequence per the insight.

- **Trust integration via existing `trust-gate.ts`.** Resolver does NOT make trust decisions. The trust gate runs BEFORE adapter dispatch. The state machine encodes the wait-for-approval transition (`queued → dispatched`) but does not re-check trust internally.

- **Mobile-first per ADR-018.** The `/projects` index, `/projects/[slug]`, and `/projects/[slug]/runners` admin pages must work on a phone (≥44pt taps, no horizontal scroll, sticky bottom action bar where edits are made).

- **Reuse credential vault.** `project_runners.credential_ids` are pointers into `credentials` table (existing). No parallel credential storage.

- **No new conversation-surface primitives in this brief.** "Runner started/finished" inline cards are sub-brief 221. This brief surfaces dispatch state through the existing activity log only.

- **Tightening `processes.projectId` to FK is a breaking schema change.** All existing rows with non-null `projectId` must reference a valid `projects.id` post-migration, OR the migration must NULL out unmatched values + emit a warning. This brief picks: NULL out + warn, with a one-line note in the migration's `down` describing the rollback caveat.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|-----------------|
| Adapter contract `{ execute, status, cancel }` | `src/adapters/cli.ts` (existing) + Brief 212's `bridgeCliAdapter` | depend (existing) | Same shape across all five runners; no fragmentation. |
| Chain-resolution pure function | Brief 214 §D5 | original to Ditto | No surveyed orchestration framework has runner-mode-required + chain + per-attempt audit. |
| Drizzle migration idx parity | `docs/insights/190-drizzle-migration-discipline.md` | pattern (project-internal) | On idx race, resequence. |
| `harness_decisions` audit row per dispatch | `packages/core/src/db/schema.ts:495` (existing) | depend (existing) | Reuses existing trust-gate audit table; no new audit table for trust decisions. |
| `project_runners` UNIQUE on (projectId, kind) | user pipeline spec `.context/attachments/pasted_text_2026-04-25_21-14-58.txt:42-54` | original to Ditto | One config row per kind per project; matches user's per-runner config examples. |
| 8-state dispatch state machine | Brief 212 bridge-job state machine (8 states) | adopt (sibling brief) | Same pattern: `queued | dispatched | running | succeeded | failed | timed_out | rate_limited | cancelled | revoked`. (Note: 9 states total — Brief 212 is 8 because it lacks `timed_out` and `rate_limited` but adds `orphaned`; this brief drops `orphaned` and adds the two cloud-shaped failures. Architect call: cloud runners report rate-limit/timeout distinctly.) |
| Credential vault reuse | `src/engine/credential-vault.ts` (AES-256-GCM, existing) | depend (existing) | No parallel credential storage. |
| `processes.projectId` FK tightening | researcher report Gap context | original to Ditto | Existing column is text-no-FK; this brief introduces the table FK can reference. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/runner/kinds.ts` | **Create** — `RunnerKind` enum (`local-mac-mini | claude-code-routine | claude-managed-agent | github-action | e2b-sandbox`), `RunnerMode` enum (`local | cloud`), `RunnerDispatchStatus` enum (9 values per state machine), `kindToMode()` map function, `RunnerKindSchema` Zod literal union for runtime validation. ~50 LOC. |
| `packages/core/src/runner/state-machine.ts` | **Create** — `transition(from: RunnerDispatchStatus, event: TransitionEvent): RunnerDispatchStatus | Error` pure function with full transition table. Events: `dispatch | start | succeed | fail | timeout | rate_limit | cancel | revoke | reset`. Illegal transitions return `Error`. No DB calls. ~80 LOC. |
| `packages/core/src/runner/interface.ts` | **Create** — `RunnerAdapter` TypeScript interface; type-only file (no implementation), ~60 LOC. Full shape:<br>```ts<br>export interface WorkItemRef {<br>  id: string;<br>  content: string;        // work item body, used as prompt input for cloud runners<br>  goalAncestry: string[]; // existing field on workItems<br>  context: Record<string, unknown>;<br>}<br>export interface ProjectRunnerRef {<br>  id: string;<br>  projectId: string;<br>  kind: RunnerKind;<br>  mode: RunnerMode;<br>  configJson: Record<string, unknown>; // kind-specific shape; each adapter validates via Zod<br>  credentialIds: string[]; // pointers into credentials table<br>}<br>export interface DispatchResult {<br>  externalRunId: string | null; // null if dispatch failed before external system created an ID<br>  externalUrl: string | null;<br>  startedAt: Date;<br>  // terminal states only — non-terminal status reported via the status() method<br>  finalStatus?: 'succeeded' \| 'failed' \| 'timed_out' \| 'rate_limited' \| 'cancelled';<br>  errorReason?: string;<br>}<br>export interface DispatchStatusSnapshot {<br>  status: RunnerDispatchStatus;<br>  externalRunId: string \| null;<br>  externalUrl: string \| null;<br>  exitCode?: number;<br>  errorReason?: string;<br>  lastUpdatedAt: Date;<br>}<br>export interface RunnerAdapter {<br>  kind: RunnerKind;<br>  mode: RunnerMode;<br>  configSchema: ZodType; // Zod schema for project_runners.config_json<br>  execute(stepRunId: string, dispatchId: string, workItem: WorkItemRef, projectRunner: ProjectRunnerRef): Promise<DispatchResult>;<br>  status(dispatchId: string, externalRunId: string): Promise<DispatchStatusSnapshot>;<br>  cancel(dispatchId: string, externalRunId: string): Promise<{ ok: boolean }>;<br>  healthCheck(projectRunner: ProjectRunnerRef): Promise<{ status: RunnerHealthStatus; reason?: string }>;<br>}<br>```<br>Sub-briefs 216-218 implement this contract for their kinds; the interface is finalized here so downstream briefs do not redefine. |
| `packages/core/src/runner/resolution.ts` | **Create** — `resolveChain(workItem: WorkItemRef, project: ProjectRef, projectRunners: ProjectRunnerRef[]): Result<RunnerKind[], ResolutionError>` pure function per Brief 214 §D5. Pure: no DB, no I/O. ResolutionError variants: `noEligibleRunner | modeFilteredEmpty | configMissing`. ~100 LOC. |
| `packages/core/src/runner/webhook-schema.ts` | **Create** — Zod discriminated union schema keyed on `runner_kind` for `POST /api/v1/work-items/:id/status` payloads. Each kind's payload-shape Zod schema is a placeholder (`z.unknown()`) here; sub-briefs 216-218 fill them in for their respective kinds. The discriminator structure ships now. ~60 LOC. |
| `packages/core/src/runner/index.ts` | **Create** — module barrel; exports kinds, state machine, interface, resolver, webhook schema. Hooked into `packages/core/src/index.ts` exports. |
| `packages/core/src/db/schema.ts` | **Modify** — add type unions: `runnerKindValues`, `runnerModeValues`, `runnerDispatchStatusValues`, `harnessTypeValues = ['catalyst', 'native', 'none']` (renamed from `harnessKindValues`; `none` value added for BEFORE-flow), `runnerHealthStatusValues = ['healthy', 'unauthenticated', 'rate_limited', 'unreachable', 'unknown']`, `briefSourceValues = ['filesystem', 'ditto-native', 'github-issues']`, `deployTargetValues = ['vercel', 'fly', 'manual']`, `projectStatusValues = ['analysing', 'active', 'paused', 'archived']`. Add tables: `projects`, `projectRunners`, `runnerDispatches`. `projects` columns: `id`, `slug` UNIQUE, `name`, `githubRepo`, `defaultBranch` (default `'main'`), `harnessType` enum, `briefSource` enum NULLABLE, `briefPath` text NULLABLE, **`defaultRunnerKind` enum NULLABLE** (transient `status='analysing'`), `fallbackRunnerKind` enum NULLABLE, `runnerChain` JSON array NULLABLE, `deployTarget` enum NULLABLE, `status` enum DEFAULT `'analysing'`, **`runnerBearerHash` text NULLABLE** (bcrypt cost 12, used by Brief 223's status webhook for inbound auth), `createdAt`, `updatedAt`. Add two new columns on `workItems`: `runnerOverride` text NULLABLE, `runnerModeRequired` text NULLABLE. Tighten `processes.projectId` to FK referencing `projects.id` (still nullable). Add indices: `projects.slug` UNIQUE, `projects.status`, `projectRunners.projectId+kind` UNIQUE, `runnerDispatches.workItemId`, `runnerDispatches.projectId`, `runnerDispatches.status`. **Other brief-equivalent workItems columns (title, body, briefState, riskScore, confidence, modelAssignment, linkedCaptureId, linkedProcessRunId, stateChangedAt) + 2 CHECK constraints are SHIPPED BY BRIEF 223 — not this brief.** |
| `drizzle/0012_projects_runners.sql` | **Generated** by `drizzle-kit generate`. Tag and idx must match journal entry. |
| `drizzle/meta/_journal.json` | **Modify (generated)** — new entry idx=11 (or higher per resequence rule). |
| `drizzle/meta/0012_snapshot.json` | **Generated.** |
| `packages/core/src/runner/state-machine.test.ts` | **Create** — unit tests for every legal/illegal transition; round-trip queued→dispatched→running→succeeded; rejection of revoked→succeeded; reset only from terminal. |
| `packages/core/src/runner/resolution.test.ts` | **Create** — unit tests for: empty chain returns noEligibleRunner; runner_override prepends and dedupes; runner_mode_required filters; disabled project_runners filtered; unhealthy filtered unless only-option; chain dedupe (same kind appearing twice). |
| `packages/web/app/admin/page.tsx` | **Modify** — add a "Projects" card linking to `/projects`. Mobile-friendly. |
| `packages/web/app/projects/page.tsx` | **Create** — `/projects` index. Lists all projects with: slug, name, github_repo, default_runner_kind pill, last-activity timestamp. "New project" button at top. Mobile-first. |
| `packages/web/app/projects/new/page.tsx` | **Create** — new-project form: name, slug (auto-generated, editable), github_repo, harness_kind (`catalyst | native-ditto` radio), default_runner_kind (`local-mac-mini` is the only option until sub-briefs 216-218 ship). Mobile-first. |
| `packages/web/app/projects/[slug]/page.tsx` | **Create** — project detail page. Tabs: Overview, Runners, Activity (placeholder for sub-brief 221's metrics). Overview shows project metadata + recent `runner_dispatches` rows. |
| `packages/web/app/projects/[slug]/runners/page.tsx` | **Create** — per-project runner admin. Lists configured runners. "Add runner" CTA opens kind-selector dialog. Selector renders ALL five kinds; only `local-mac-mini` is selectable. The other four are rendered with `aria-disabled="true"`, `disabled` attribute on the radio, 60% opacity, and a tooltip on hover/long-press: `"Claude Routine — coming in sub-brief 216"`, `"Managed Agents — coming in sub-brief 217"`, `"GitHub Actions — coming in sub-brief 218"`, `"E2B sandbox — deferred"`. Tapping a disabled option emits a no-op + the tooltip pops up on touch. Form submission is rejected client-side AND server-side (`POST /api/v1/projects/:id/runners` returns 501 — see AC #13). Per-row: enable/disable toggle, "Test dispatch" button (this brief: calls `bridgeCliAdapter.healthCheck()` for local-mac-mini rows; for any other kind a row would not exist yet, so this case can't be reached). Sub-briefs 216-218 register their `healthCheck()` implementations on the in-process registry; `runner_dispatches.last_health_status` updates accordingly when they ship. "Edit config" → kind-specific form; this brief ships only the `local-mac-mini` form (ssh_host, ssh_user, tmux_session, credential_id picker — credential_id is a dropdown of existing vault entries). Mobile-first (≥44pt taps, no horizontal scroll on long ssh_host strings — wrap or truncate-with-tap-to-expand). |
| `packages/web/app/api/v1/projects/route.ts` | **Create** — `GET` lists, `POST` creates. Validates schema. Slug uniqueness check. |
| `packages/web/app/api/v1/projects/[id]/route.ts` | **Create** — `GET` retrieves, `PATCH` updates, `DELETE` deletes (cascades to project_runners but NOT to runner_dispatches — historical rows preserved). |
| `packages/web/app/api/v1/projects/[id]/runners/route.ts` | **Create** — `GET` lists for project, `POST` adds new project_runner. Validates kind-specific config_json against the kind's Zod schema (where one exists in core; otherwise accepts only `local-mac-mini` until subsequent briefs land their schemas). |
| `packages/web/app/api/v1/projects/[id]/runners/[kind]/route.ts` | **Create** — `PATCH` updates one row, `DELETE` removes one row, `POST` to `/test` subroute triggers a stub health check (sub-briefs 216-218 will register real health-check functions per kind). |
| `src/engine/runner-dispatcher.ts` | **Create** — `dispatchWorkItem(stepRunId, workItem, project, db)` async function: calls `resolveChain()`, walks the chain, looks up `RunnerAdapter` by kind from a registry map (this brief registers only `bridgeCliAdapter` for `local-mac-mini` — sub-briefs 216-218 register their kinds), persists `runner_dispatches` row per attempt, advances on `failed`/`rate_limited`/`timed_out` per the state machine, writes `harness_decisions` row keyed on stepRunId. |
| `src/engine/runner-dispatcher.test.ts` | **Create** — integration tests: stepRunId guard rejection; chain advance on rate_limit; mode_required filter; happy path with `local-mac-mini`; full-chain failure surfaces noEligibleRunner with correct work-item state. |
| `src/engine/runner-registry.ts` | **Create** — in-process `Map<RunnerKind, RunnerAdapter>` with register/get methods. This brief seeds it with `bridgeCliAdapter` for `local-mac-mini`. Future briefs add their adapters here. |
| `src/engine/runner-registry.test.ts` | **Create** — unit tests for register/get; rejects double-registration; rejects get for unregistered kind. |
| `src/engine/projects/seed-data.ts` | **Create** — pure-function `getSeedProjects(): Project[]` returning two seed rows per pipeline-spec §1: `{ slug: 'agent-crm', name: 'Agent CRM', githubRepo: '<owner>/agent-crm', harnessType: 'catalyst', briefSource: 'filesystem', briefPath: 'docs/briefs', defaultRunnerKind: 'claude-code-routine', fallbackRunnerKind: 'local-mac-mini', deployTarget: 'vercel', status: 'active' }` and `{ slug: 'ditto', name: 'Ditto', githubRepo: '<owner>/ditto', harnessType: 'native', briefSource: 'ditto-native', defaultRunnerKind: 'local-mac-mini', deployTarget: 'manual', status: 'active' }`. NO DB writes; pure function. The actual github_repo owners are filled at boot from env (`SEED_GITHUB_OWNER` defaulting to the workspace owner) — keeps the seed data Ditto-flavored without hardcoding the user's username. |
| `src/engine/projects/seed-on-boot.ts` | **Create** — boot-time idempotent seed (Ditto product layer). On engine startup: if `projects` table is empty, insert the rows from `getSeedProjects()`. If non-empty, no-op. Wired into the existing engine-boot sequence. **No bearer hash is generated here** — Brief 223's `POST /api/v1/projects` route is the bearer-generation surface; seed projects start with `runnerBearerHash = NULL` and the user runs `PATCH /api/v1/projects/<slug>` with `rotateBearer: true` (Brief 223's endpoint) to get a bearer when ready. |
| `packages/core/src/projects/invariants.ts` | **Create** — pure-function `validateStatusTransition(current: ProjectStatus, next: ProjectStatus, project: Project): Result<void, InvariantError>`. Rule: transition to `'active'` requires `defaultRunnerKind` populated AND a `project_runners` row exists with `enabled: true` for that kind. Rule: any transition is permitted from `'analysing'` to any state if the projection-active invariants hold; transitions OUT of `'archived'` rejected (archive is one-way). Used by Brief 223's `PATCH /api/v1/projects/:slug` handler. |
| `packages/core/src/projects/invariants.test.ts` | **Create** — unit tests for: `analysing → active` requires defaultRunnerKind; `archived → active` rejected; `active → paused` allowed always. |
| `docs/dictionary.md` | **Modify** — add: Project, Runner, Runner Kind, Runner Mode, Runner Chain, Runner Dispatch, Mode-Required Constraint, Fallback Runner. |
| `.env.example` | **Modify** — no new env vars (credential pointers reuse existing vault). |

## User Experience

- **Jobs affected:** Delegate (selecting a project's runner config), Decide (creating/configuring a project), Capture (project-detail page surfaces dispatch history).
- **Primitives involved:** new "Projects" admin section under `/admin`. New `/projects` index. New `/projects/[slug]` detail. New `/projects/[slug]/runners` per-runner admin scaffold.
- **Process-owner perspective:** the user creates a project once (name, slug, github_repo, harness_kind, default runner). Configures a runner (initially only `local-mac-mini`). The "Test dispatch" button validates the runner is wired correctly. Future cloud runners appear in the kind selector as sub-briefs 216-218 land.
- **Interaction states:**
  - Empty: `/projects` shows empty state with "Create your first project" CTA.
  - Loading: form submission shows a small inline spinner; admin pages render skeletons during fetch.
  - Error: validation errors appear inline (slug uniqueness, missing required fields, malformed github_repo); credential-pointer-not-found shows "Add a credential first" CTA.
  - Success: new project redirects to `/projects/[slug]/runners` with a one-time toast "Project created — add a runner to start dispatching."
  - Disabled: runner-kind selector shows non-`local-mac-mini` kinds disabled with tooltip "Available in sub-brief 216" (etc.).
- **Designer input:** **Designer not invoked.** Lightweight UX section here; `/projects/[slug]/runners` UX is light enough at this stage (basic CRUD list + form) that Designer pass at sub-brief 221 covers the polished mobile UX.

## Acceptance Criteria

1. [ ] **Schema lands cleanly.** `packages/core/src/db/schema.ts` updated with three new tables (`projects`, `projectRunners`, `runnerDispatches`), two new `workItems` columns (`runnerOverride`, `runnerModeRequired`), and tightened `processes.projectId` FK. `pnpm run type-check` passes at root. New migration file `drizzle/0012_projects_runners.sql` (or whatever drizzle-kit assigns; idx parity verified) generated and committed; `drizzle/meta/_journal.json` entry matches the SQL filename per Insight-190.

2. [ ] **Migration up + down works.** Applying the migration to a fresh DB succeeds. Applying to a DB with non-null `processes.projectId` rows that don't match any project: those rows are NULL'd with a `console.warn` per orphaned row, and migration succeeds. Down migration reverses cleanly (drops three tables, removes two `workItems` columns, restores `processes.projectId` to text-no-FK).

3. [ ] **Core runner module exports correctly.** `import { RunnerKind, RunnerMode, RunnerDispatchStatus, transition, resolveChain, runnerWebhookSchema, type RunnerAdapter } from '@ditto/core'` works without errors from a consumer file.

4. [ ] **`packages/core/src/runner/` has zero Ditto-product imports.** A grep verifies no `from "../../src/"`, no Self/personas/network references. Engine-first per CLAUDE.md core rule 4.

5. [ ] **State machine transitions correct.** Unit tests in `state-machine.test.ts` cover all legal transitions and reject illegal ones. Specifically: `queued→dispatched→running→succeeded` happy path; `queued→cancelled` direct (no dispatch yet); `running→rate_limited` and `running→timed_out` and `running→failed` are distinct terminal failures; `revoked` from any non-terminal state; `reset` is only valid from terminal states (allows requeue after fix). **No `orphaned` state.** Brief 212's `orphaned` concept is preserved in `harness_decisions.reviewDetails.bridge.orphaned = true` (per Brief 212's existing schema) AND mapped to `runner_dispatches.status = 'failed'` with `errorReason = 'orphaned'`. There are no pre-existing `runner_dispatches` rows to migrate (the table is net-new in this brief), so no state-mapping migration needed; new code writes the new shape from day one.

6. [ ] **Resolution algorithm correct.** Unit tests in `resolution.test.ts` cover: workItem.runner_override prepended (and deduped if also in chain); runner_chain overrides default+fallback when present; mode_required `cloud` filters out `local-mac-mini`; mode_required `local` filters out cloud kinds; disabled project_runners filtered; unhealthy filtered unless only-option-remaining; empty result returns `noEligibleRunner` error variant.

7. [ ] **`stepRunId` guard verified.** Integration test in `runner-dispatcher.test.ts` calls `dispatchWorkItem` without a stepRunId and asserts it throws BEFORE any DB write (DB-spy assertion: zero `runner_dispatches` rows + zero `harness_decisions` rows after the rejected call). `DITTO_TEST_MODE` bypass tested separately.

8. [ ] **Discriminated webhook schema parses local-mac-mini payloads.** `packages/core/src/runner/webhook-schema.ts` correctly accepts a sample `local-mac-mini` payload (Brief 212's bridge-job-result shape) and rejects payloads with unknown `runner_kind`. Cloud kind payloads accepted as `z.unknown()` placeholders (sub-briefs 216-218 tighten).

9. [ ] **Dispatcher registers `local-mac-mini` adapter.** `runner-registry.ts` seeds `bridgeCliAdapter` for `local-mac-mini` post-Brief-212-merge. Integration test: dispatch a real local-mac-mini work item end-to-end through `dispatchWorkItem` → calls `bridgeCliAdapter.execute()` → produces a `runner_dispatches` row state-transitioning queued→dispatched→running→succeeded.

10. [ ] **`harness_decisions` row written per dispatch.** Integration test verifies one row per dispatch with `processRunId`, `stepRunId`, `trustTier`, `trustAction`, `reviewDetails.runner = { runnerKind, runnerMode, externalRunId, attemptIndex }`. Brief 212's review-detail bridge field still works (no schema overload).

11. [ ] **Brief 212 non-regression — observable contract preserved with new audit rows.** Brief 212's smoke test passes after this brief merges. Specifically the contract:
    - **Identical:** callback flow (cloud → daemon → cloud), reconnect semantics, mid-job-disconnect resume, 60s heartbeat cadence, JWT pairing/revocation flow, final work-item status, `harness_decisions.reviewDetails.bridge.{stdoutTail, stderrTail, exitCode, durationMs}` shape.
    - **New (additive, not a regression):** the dispatch is now mediated by `runner-dispatcher.ts` which writes ONE additional `runner_dispatches` row per work item (state-transitioning queued→dispatched→running→succeeded). The `harness_decisions.reviewDetails.runner = { runnerKind, runnerMode, externalRunId, attemptIndex }` block is added alongside the existing `reviewDetails.bridge` block — neither overwrites the other.
    - **Brief 212's orphan path adapted:** Brief 212's existing `reviewDetails.bridge.orphaned = true` flag continues to be written by the bridge-server's staleness sweeper. In the new `runner_dispatches` lifecycle, an orphaned local-mac-mini job lands in state `failed` (not a new `orphaned` state — see AC #5 below) with `errorReason = "orphaned"` AND the `reviewDetails.bridge.orphaned = true` flag preserved on `harness_decisions`. The state machine here is purposefully simpler than Brief 212's bridge-internal one; orphan is a kind of failure for accounting.
    - Verified by re-running Brief 212's full test suite (`pnpm vitest run src/engine/bridge-server.test.ts`, `packages/bridge-cli/src/index.test.ts`, the Brief 212 spike test) post-merge of this brief.

12. [ ] **`/projects` admin pages render.** Manual + e2e: navigate to `/admin` → see "Projects" card → click → `/projects` index with empty state → click "New project" → form renders → submit valid project → redirected to `/projects/[slug]/runners` → "Add runner" → kind selector shows `local-mac-mini` enabled and the four other kinds disabled with the correct tooltip → fill local-mac-mini form → submit → row appears with enabled toggle and "Test dispatch" button. All steps pass mobile e2e (375 × 667 viewport, no horizontal scroll, ≥44pt taps).

13. [ ] **API endpoints validate.** `POST /api/v1/projects` rejects malformed bodies (missing required fields, slug collision, github_repo not in `owner/repo` shape). `POST /api/v1/projects/:id/runners` for kind=`claude-code-routine` rejects with 501 "Runner kind not yet implemented (sub-brief 216)" — the schema is reserved but the runner is not pluggable until 216 lands. For kind=`local-mac-mini` the config validates (ssh_host, ssh_user, tmux_session, credential_id) and stores correctly.

14. [ ] **Insight-190 idx parity verified.** Migration journal entry idx matches SQL filename. If Brief 212 has not shipped at merge time and idx 11 is taken by 212's PR-in-flight, this brief's PR resequences to idx 12 with a one-line note in the PR description per Insight-190.

15. [ ] **Dictionary entries land.** `docs/dictionary.md` updated with: Project, Runner, Runner Kind, Runner Mode, Runner Chain, Runner Dispatch, Mode-Required Constraint, Fallback Runner, Harness Type, Brief Source, Deploy Target, Project Status. Each entry under 50 words.

16. [ ] **`projects` schema covers the union of cloud-runner + pipeline-spec field sets.** The table includes (a) cloud-runner fields: `defaultRunnerKind` NULLABLE, `fallbackRunnerKind` NULLABLE, `runnerChain` JSON NULLABLE; (b) pipeline-spec fields absorbed from collision reconciliation: `harnessType` enum (`catalyst | native | none`), `briefSource` enum NULLABLE, `briefPath` text NULLABLE, `deployTarget` enum NULLABLE, `status` enum DEFAULT `'analysing'`, `runnerBearerHash` text NULLABLE. Type-check passes.

17. [ ] **Status enum + transient analysing state.** `projectStatusValues = ['analysing', 'active', 'paused', 'archived']`. New rows default to `'analysing'`. `defaultRunnerKind` and `fallbackRunnerKind` are NULLABLE precisely because `analysing` projects have no runner picked yet (Brief 224's BEFORE-flow). Unit test: a project created via `INSERT INTO projects (slug, name, github_repo, harness_type)` succeeds with all runner fields NULL and `status='analysing'`.

18. [ ] **`validateStatusTransition` invariants enforced (engine-core).** Unit tests in `invariants.test.ts` cover: transition `analysing → active` REJECTED if `defaultRunnerKind` is NULL or no enabled `project_runners` row exists for that kind (returns `InvariantError`); transition `analysing → active` ACCEPTED when invariants satisfied; transition `archived → *` REJECTED (one-way archive); transition `active → paused` ACCEPTED. The function lives in `packages/core/src/projects/invariants.ts` (pure, no DB calls). Brief 223's `PATCH /api/v1/projects/:slug` handler calls this function before persisting.

19. [ ] **Seed projects land at boot.** On engine start with an empty `projects` table, `seed-on-boot.ts` inserts two rows: `agent-crm` (catalyst, claude-code-routine default + local-mac-mini fallback, vercel) and `ditto` (native, local-mac-mini default, manual deploy). Both seed rows have `status='active'` AND `runnerBearerHash = NULL`. The github_repo owner is read from `SEED_GITHUB_OWNER` env var (or workspace owner if unset). Idempotent: re-boot does NOT re-insert. Verified by integration test using a fresh test DB.

20. [ ] **Field-name reconciliation honest.** Schema uses `harnessType` (NOT `harnessKind`); enum values include `none`. The `runner` single-field shape proposed by Brief 223 is NOT present (use `defaultRunnerKind` + `runnerChain`). The `runnerConfig` JSON column on `projects` proposed by Brief 223 is NOT present (use `project_runners.config_json`). Brief 223 file post-amendment confirms it does not re-add either field — verified by grep on Brief 223 + Brief 215 schemas in CI.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief.
2. Reviewer checks: (a) does `packages/core/src/runner/` honour the engine-first boundary (no src/ imports, no Ditto-product references)? (b) does the schema reuse `harness_decisions` correctly (no parallel audit table for trust)? (c) does the resolution algorithm correctly drop unhealthy kinds AND attempt them when only-option (not-quite-greedy)? (d) is the migration safe for existing `processes.projectId` rows (NULL'ing path documented)? (e) are the disabled-but-reserved cloud kinds clearly tooltipped so a builder doesn't accidentally start implementing them here? (f) does `runner_dispatches` correctly link to `harness_decisions` via `stepRunId` per Insight-180?
3. Present brief + review findings to human for approval.
4. **Confirmation point per user's first-step instruction:** the user explicitly asked to confirm the schema additions, especially `runner_chain` and `runner_mode_required` semantics. Reviewer should flag any ambiguity in those two fields' resolution-time behaviour for explicit user approval before this brief moves to `Status: ready`.

## Smoke Test

Manual smoke after this brief merges:

```bash
# 1. Apply migration
pnpm drizzle-kit push

# 2. Create a project via UI (or curl)
curl -X POST https://ditto.you/<workspace>/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"slug":"agent-crm","name":"Agent CRM","githubRepo":"<owner>/agent-crm","harnessKind":"catalyst","defaultRunnerKind":"local-mac-mini"}'

# 3. Add a local-mac-mini runner config
curl -X POST https://ditto.you/<workspace>/api/v1/projects/<id>/runners \
  -H "Content-Type: application/json" \
  -d '{"kind":"local-mac-mini","config":{"sshHost":"macmini.tail-xxxx.ts.net","sshUser":"thg","tmuxSession":"ditto-runner","credentialId":"<id>"}}'

# 4. From the UI: navigate to /projects/agent-crm/runners. Verify list shows the configured runner.
#    Click "Test dispatch". Verify health status updates to "unknown" (sub-brief 216 implements the real check for cloud kinds; for local-mac-mini, the test is implemented per Brief 212's pairing flow).

# 5. Trigger a real dispatch (script test — not via UI, since the dispatcher is engine-internal at this stage):
pnpm vitest run src/engine/runner-dispatcher.test.ts -t "happy path local-mac-mini"
# Verify: one runner_dispatches row state queued → dispatched → running → succeeded; one harness_decisions row.

# 6. Insight-180 spike: dispatch without stepRunId
pnpm vitest run src/engine/runner-dispatcher.test.ts -t "rejects without stepRunId"
# Verify: zero new runner_dispatches rows after the rejected call.

# 7. Brief 212 non-regression
pnpm vitest run src/engine/bridge-server.test.ts
# All Brief 212 tests pass.
```

## After Completion

1. Update `docs/state.md` with what changed (substrate landed; sub-briefs 216-218 unblocked).
2. Update parent brief (`docs/briefs/214-cloud-execution-runners-phase.md`) Status field if appropriate (parent stays draft until phase complete; 215 transitions to `complete`).
3. Update `docs/insights/205-battle-ready-project-onboarding.md` with a one-line note: "`projects` substrate built per Brief 215 — onboarding brief can now layer on top without schema rewrites."
4. Update `docs/roadmap.md` with one row in the new "Cloud Execution Runners" phase indicating "Substrate built (Brief 215); cloud runner adapters pending sub-briefs 216-218."
5. No ADR needed — this is substrate per a parent brief. ADR-005 amendment (note distinguishing runner-config from integration-registry) is deferred to phase-completion (parent's After Completion).
6. Phase retrospective for Brief 215 (run by Documenter): what worked (engine-first boundary, schema-additive design), what surprised, what to change.
