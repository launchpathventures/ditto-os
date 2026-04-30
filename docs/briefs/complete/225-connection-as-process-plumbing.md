# Brief 225: Connection-as-Process Plumbing — Project Onboarding seam #1

**Date:** 2026-04-27
**Status:** complete (2026-04-27, post-Builder + Reviewer + Documenter wrap; brief moved to `docs/briefs/complete/`. Status header normalised 2026-04-29 — was stale at `ready (post-Reviewer)` despite shipping.)
**Depends on:** Brief 215 (`projects` substrate, `validateStatusTransition` invariant, `'analysing'` status), Brief 223 (workItems brief-equivalent extension, `/api/v1/projects` POST handler, status webhook). Both implemented + merged. Brief 212 (Workspace Local Bridge) implemented; not directly consumed by this brief — sub-brief #3 retrofitter consumes it.
**Unlocks:** sub-brief #2 (in-depth analyser — fills in this brief's `clone-and-scan` + `surface-report` placeholder handlers); sub-brief #3 (retrofitter — fills in the post-confirm retrofitter trigger this brief queues); sub-brief #4 (project memory scope — independent, no dependency on #1).
**Parent brief:** 224 (Project Onboarding & Battle-Readiness)

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness — substrate plumbing.
- **Capabilities delivered:**
  - A `project-onboarding.yaml` system process that runs on `project.connected` event with TWO placeholder steps (`clone-and-scan` no-op, `surface-report` writes stub workItems row + harness_decisions audit row).
  - The `/projects/new` URL-paste form rendered inline in the chat-col as a `ConnectionSetupBlock` (existing block type — `serviceName: 'github-project'`). Both conversational entry (Self emits the block) and sidebar entry ("+ Connect a project" CTA seeds Self message) converge on the same conversation-embedded form.
  - The `/projects/:slug/onboarding` review surface (Next.js Server Component, env-var-gated).
  - The atomic three-write commit on `[Looks good — start the project]`: insert `project_runners` row + generate-and-hash bearer + flip `projects.status='active'`. Single transaction.
  - **Schema addition:** `projects.kind` text NOT NULL default `'build'` (`'build' | 'track'` enum per Designer spec — onboarding is build-only). Drizzle migration idx=14 → SQL `0015_<slug>.sql`.
  - Self gets one new tool: `start_project_onboarding`. Intent-recognition encoded in tool description (no separate intent-recognition file — Self uses tool-name prompting per existing 27 tools).
  - Form-submit dispatcher routing branch: when `serviceName === 'github-project'`, route to `/api/v1/projects` instead of `/api/credential` (existing default).
  - Env var `DITTO_PROJECT_ONBOARDING_READY` (default `false`) gates Self tool + sidebar CTA + Server Component + the `kickOffOnboarding: true` body field server-side.

## Context

Brief 224 (parent) decomposed Project Onboarding into 4 sub-briefs along Insight-205's seams. This brief is sub-brief #1 — the connection-as-process plumbing. Every other sub-brief plugs INTO this brief's process orchestration: #2 fills in placeholder analyser handlers; #3 fills in the retrofitter; #4 layers project-scoped memory filtering on top of process runs.

The §Open Question (analyser BEFORE or AFTER runner pick) was resolved BEFORE on 2026-04-26 — confirmed explicitly by the user. Brief 215 already shipped the structural support (`defaultRunnerKind`/`fallbackRunnerKind` NULLABLE; `'analysing'` status; `validateStatusTransition` invariant rejecting `analysing → active` without runner kind populated and an enabled `project_runners` row).

The Designer pass landed at `docs/research/analyser-report-and-onboarding-flow-ux.md` covering both this brief and sub-brief #2. The spec is grounded in the Anthropic Claude Design handoff bundle (id `iK3gPHe3rGAErdm4ua2V-A`) — visual identity tokens, layout (chat-col-as-second-column), and chat-block primitives (`block.evidence`, `block.decision`, `block.plan`) come from there. **This brief consumes the spec verbatim as its User Experience section.**

## Objective

Ship the smallest end-to-end plumbing that takes a user-pasted GitHub URL and produces a `projects` row with `status='analysing'` + a `project-onboarding` process run + a chat-col review surface ready for sub-brief #2's analyser to populate; user reviews + approves at `/projects/:slug/onboarding`; the atomic three-write commit on approval flips the project to `active` (with bearer generation), queues the retrofitter (sub-brief #3 placeholder).

## Non-Goals

- **NO analyser logic** (sub-brief #2's territory). Placeholder `clone-and-scan` is a true no-op; `surface-report` writes a stub `workItems` row titled "Onboarding report for `<slug>`" with `briefState='backlog'` + a one-line body "Awaiting analyser implementation (sub-brief #2)."
- **NO retrofitter logic** (sub-brief #3 territory). This brief queues the retrofitter as a placeholder process step; #3 fills it in.
- **NO `AnalyserReportBlock` rendering** (sub-brief #2 introduces the type).
- **NO `track`-kind project creation flow.** This brief ships `kind='build'` only.
- **NO project memory scope filtering** (sub-brief #4 territory).
- **NO `claude-code-routine` cloud-subprocess adapter** (Brief 216 sibling).
- **NO new feature-flag system** — env var `DITTO_PROJECT_ONBOARDING_READY` is the only gate.
- **NO `/projects/new` route as a dedicated page.** The URL-paste form renders inline in conversation as a `ConnectionSetupBlock`. The sidebar CTA seeds a Self message; references to "/projects/new" in Designer spec are aspirational naming for the conversation entry, NOT a route.
- **NO `human-layer.md` update in this brief.** Documenter folds in chat-col-as-second-column layout divergence post-build.
- **NO sub-brief number reservation** for #2/#3/#4. Architects claim at scheduling time per `feedback_grep_before_claiming_shared_namespace.md`.

## Inputs

1. `docs/briefs/224-project-onboarding-and-battle-readiness.md` §Sub-brief #1 — parent specification.
2. `docs/research/analyser-report-and-onboarding-flow-ux.md` — Designer's UX spec (consumed verbatim).
3. `docs/insights/205-battle-ready-project-onboarding.md` — load-bearing insight.
4. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — every onboarding handler emitting DB writes carries the `stepRunId` guard.
5. `docs/insights/190-drizzle-migration-discipline.md` — strict-monotonic Drizzle journal idx; verified 2026-04-27: last entry idx=13 / tag `0014_routine_callback_token` (Brief 216's Routine dispatcher landed during a parallel session). This brief claims idx=14 → SQL `0015_<slug>.sql`. Builder MUST re-grep `_journal.json` at session start.
6. `packages/core/src/content-blocks.ts:234-241` — existing `ConnectionSetupBlock` definition; this brief reuses the type with `serviceName: 'github-project'`. NO new block type.
7. `packages/core/src/db/schema.ts:1047-1077` — current `projects` table; this brief adds one column (`kind`).
8. `packages/core/src/db/schema.ts:243-249` — `projectStatusValues = ['analysing', 'active', 'paused', 'archived']`. No additions.
9. `packages/core/src/projects/invariants.ts:60-113` — `validateStatusTransition`. Verified at brief-write time: already permits `analysing → archived` (only `archived → *` and `* → active without runner` are rejected). NO change to invariant; just one regression-guard test.
10. `packages/web/app/api/v1/projects/route.ts` — existing POST handler (Brief 223); this brief extends with optional `kickOffOnboarding: true`.
11. `processes/onboarding.yaml` (existing user onboarding — different scope, no name collision verified) + `processes/project-orchestration.yaml` (existing daily intelligence — different trigger, no collision).
12. `src/engine/self-tools/` — existing 27 tools; new `start_project_onboarding` tool registers here.
13. `packages/web/components/blocks/connection-setup-block.tsx` — existing renderer for `ConnectionSetupBlock`; this brief extends it (30-80 LOC of real product work — see §Constraints).

## Constraints

- **Engine-first per CLAUDE.md.** Schema in `packages/core/`. YAML + handlers + Self tool in `processes/` + `src/engine/onboarding/` + `src/engine/self-tools/` (Ditto product layer — onboarding is Ditto-specific). Route handlers in `packages/web/app/api/v1/`. Ask: "could ProcessOS use this?" — `projects.kind` yes (concept of build-vs-track is portable); the YAML + handlers + Self tool no.

- **Side-effecting function guard (Insight-180) — MANDATORY.** Each handler in `src/engine/onboarding/handlers.ts` takes `stepRunId` as the first parameter; the function rejects calls without it (DB-spy pattern). The `clone-and-scan` no-op handler STILL takes `stepRunId` per the guard — the guard is preserved through the placeholder so sub-brief #2 inherits the function shape.

- **Atomic three-write commit on `[Looks good — start the project]`.** One DB transaction: (1) insert `project_runners` row for picked default-runner-kind, (2) generate runner bearer + bcrypt-hash (cost 12) + write to `projects.runnerBearerHash`, (3) flip `projects.status='active'` + set `projects.defaultRunnerKind`, (4) mark onboarding `workItems` row `briefState='approved'`, (5) queue retrofitter (placeholder via `triggerProcess`). Brief 215's `validateStatusTransition` runs server-side; rejection rolls back the transaction → 400 with structured error. Bearer surfaced ONCE in the confirm response with `bearerOnceWarning: true` — preserves Brief 223's bearer-once contract, just deferred from create-time to flip-time.

- **Schema migration discipline (Insight-190) — strict-monotonic.** Migration idx=**14** (verified 2026-04-27 against `drizzle/meta/_journal.json`); SQL `0015_<slug>.sql`. Builder rule: at session start, re-read journal; if a parallel session has claimed idx=14 since this brief was written, take next-free; rename SQL + snapshot files. SQL is `ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'build'`. Verify drizzle-kit didn't emit unnecessary table-recreate (precedent at `drizzle/0007_purple_zarda.sql` + `0008_even_joystick.sql` shows additive ALTER ADD COLUMN is established).

- **`ConnectionSetupBlock` block-TYPE reuse — but the RENDERER needs a non-trivial extension** (30-80 LOC). The block-TYPE is reused as-is (`packages/core/src/content-blocks.ts:234-241` accepts `serviceName: string` unconstrained). The existing renderer at `packages/web/components/blocks/connection-setup-block.tsx:73-135` is a credentials-paste form with no inline `[Verify access]` button, no `.alex-line` rendering, and renders `serviceName` as raw subtitle text. The renderer extension is real product work — see AC #10. The block-level `connectionStatus` maps URL-probe states verbatim: probing → `connecting`; public/probed-OK → `connected`; private-needs-auth → `disconnected` + `errorMessage`; invalid-or-unreachable → `error` + `errorMessage`.

- **Conversational entry through Self — no new architectural primitive.** Self gets one tool: `start_project_onboarding(repoUrl)`. Intent-recognition is encoded in the tool's description string (existing pattern — Self uses tool-name prompting via tool descriptions; verified 27 tools at `src/engine/self-tools/`). Tool emits the `ConnectionSetupBlock` with `serviceName: 'github-project'`. Gated by env var.

- **Sidebar entry — Self-mediated.** Sidebar CTA seeds a Self message ("Connect a new project") which Self responds to with the block. Both paths converge in conversation. NO new center-column mode; NO `/projects/new` route.

- **Form-submit dispatcher routing branch.** Existing dispatcher routes `connection_setup` block submissions to `/api/credential`. This brief adds a branch: when `serviceName === 'github-project'`, route to `POST /api/v1/projects` with `kickOffOnboarding: true` instead. All other `serviceName` values continue to route to `/api/credential` (no regression).

- **Env-var gating.** `DITTO_PROJECT_ONBOARDING_READY=true` enables: Self tool registration, sidebar CTA visibility, `/projects/:slug/onboarding` Server Component (404 when false), AND the `kickOffOnboarding: true` POST body field (silently coerced to `false` when env unset — prevents stranded `analysing` projects). Default `false`. Matches Brief 212/215 env-var pattern; no new feature-flag library.

- **Reference docs touched** (Insight-043): `docs/dictionary.md` (3 new entries: Project Kind, Onboarding Run, Connection Form — builder writes at implementation time); `docs/state.md` (architect checkpoint); `human-layer.md` flagged for Documenter post-build (chat-col-as-second-column layout divergence).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Connection-as-process framing | `docs/insights/205-battle-ready-project-onboarding.md` | adopt (canonical) | Load-bearing insight; cite, don't re-derive. |
| `ConnectionSetupBlock` reuse for URL-paste form | `packages/core/src/content-blocks.ts:234-241` (Brief 072) | depend (existing) | Block already has `connectionStatus` state machine; perfect fit for URL-probe behaviour. |
| `start_project_onboarding` Self tool pattern | Existing 27 tools at `src/engine/self-tools/` | pattern (self-reuse) | Same shape as `start_pipeline`/`generate_process`. Intent in description string. |
| Atomic three-write commit | Brief 215's POST handler transactional pattern | pattern (self-reuse) | Same transactional shape; extend, don't invent. |
| `validateStatusTransition` server-side invariant | `packages/core/src/projects/invariants.ts:60-113` (Brief 215) | depend (existing) | Already permits all needed transitions; consume as-is. |
| Env-var gating | Brief 212/215 patterns | pattern (self-reuse) | No new feature-flag system. |
| `projects.kind: 'build' \| 'track'` | Anthropic Claude Design package `workspace/projects-data.js` | pattern (adopted) | Design package taxonomy; build for AI-driven repos, track for monitor-only. |
| Visual identity (chat-col, block primitives, tokens) | Anthropic Claude Design package `colors_and_type.css` + `Workspace.html` | depend (design-system source-of-truth) | Pixel-perfect targets. |
| BEFORE-flow | User's explicit answer (2026-04-26) to Brief 224 §Open Question | adopt (user decision) | User confirmed BEFORE. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | **Modify:** add `projectKindValues = ['build', 'track'] as const`, `ProjectKindValue` type, `projects.kind` text NOT NULL default `'build'`, optional index on `projects.kind` (architect's call — likely yes for future Projects-list-view filter UX). |
| `drizzle/0015_<slug>.sql` | **Generated** by `drizzle-kit generate` against journal idx=14. SQL is `ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'build'` plus optional index creation. |
| `drizzle/meta/_journal.json` | **Modify (generated):** new entry idx=14. |
| `drizzle/meta/0015_snapshot.json` | **Generated.** |
| `processes/project-onboarding.yaml` | **Create:** new system process. Trigger: event `project.connected`. Two placeholder steps only: `clone-and-scan` (executor: `script` — runs on Ditto, no runner needed; placeholder no-op for sub-brief #1) + `surface-report` (writes stub `workItems` row titled "Onboarding report for `<slug>`" with `briefState='backlog'` + emits `harness_decisions` audit row + notifies user via existing notification rail — NOT a no-op; produces the surface artefact the chat-col renders against). Sub-brief #2 designs full step decomposition. |
| `src/engine/onboarding/handlers.ts` | **Create:** handler implementations. Each handler signature `(stepRunId: string, ctx: HandlerContext) => Promise<HandlerResult>` per Insight-180. `clone-and-scan` is a true no-op + structured-log line. `surface-report` writes the stub workItems + audit + notification. |
| `src/engine/onboarding/handlers.test.ts` | **Create:** unit tests — guard rejects calls without `stepRunId` (DB-spy); `surface-report` writes the stub row + audit row. |
| `src/engine/onboarding/system-agent.ts` | **Create:** registers placeholder handlers with system-agent registry; module barrel for `src/engine/onboarding/`. |
| `src/engine/self-tools/start-project-onboarding.ts` | **Create:** Self tool. Definition `{ name, description (encodes intent: "Use when user wants to connect a project repo to Ditto, e.g., 'Connect github.com/foo/bar', 'Onboard the agent-crm repo', or pastes a bare GitHub URL"), inputSchema: { repoUrl } }`. Implementation emits `ConnectionSetupBlock` with `serviceName: 'github-project'`, `connectionStatus: 'disconnected'`, `fields: [{ repoUrl }, { displayName }, { slug }]`. Gated by env var. |
| `src/engine/self-tools/start-project-onboarding.test.ts` | **Create:** registration gating + block emission shape + description-includes-intent-pattern. |
| `packages/web/app/api/v1/projects/route.ts` | **Modify:** POST accepts `kickOffOnboarding: true`. When set AND env var enabled: project created with `kind='build'`, `status='analysing'`, `defaultRunnerKind=null`, `runnerBearerHash=null` (deferred to confirm). Triggers `project-onboarding` process. Returns 201 + `{ project, conversationUrl: '/projects/:slug/onboarding' }`. When env unset/false, `kickOffOnboarding: true` silently coerces to legacy Brief 223 path. |
| `packages/web/app/api/v1/projects/[id]/onboarding/route.ts` | **Create:** GET returning onboarding run state (`{ projectId, status, onboardingRunId, currentStep, reportWorkItemId? }`). 404 if no onboarding run. |
| `packages/web/app/api/v1/projects/[id]/onboarding/confirm/route.ts` | **Create:** POST. Body `{ defaultRunnerKind, mode, runnerConfig, trustTier, edits? }`. Atomic three-write transaction: insert project_runners + generate-and-hash bearer + flip status + mark workItems approved + queue retrofitter. Returns 200 + `{ projectId, bearerToken, bearerOnceWarning: true, conversationUrl: '/projects/:slug' }`. Rollback on any failure → 400. |
| `packages/web/app/api/v1/projects/[id]/onboarding/cancel/route.ts` | **Create:** POST. Flips `'analysing' → 'archived'`; `workItems.briefState='blocked'` for the onboarding report row. Returns 200. Single UPDATE; no transaction needed. |
| `packages/web/app/projects/[slug]/onboarding/page.tsx` | **Create:** Next.js Server Component. 404 unless `projects.status='analysing'` AND `DITTO_PROJECT_ONBOARDING_READY=true`. Renders workspace shell with chat-col loaded against project's onboarding conversation thread. |
| `packages/web/components/blocks/connection-setup-block.tsx` | **Modify (30-80 LOC):** when `serviceName === 'github-project'`: title "Connect a GitHub repository"; suppress raw `serviceName` from subtitle; render `.alex-line` annotation above form; URL field gets inline `[Verify access]` button; URL-probe state drives block-level `connectionStatus`; other fields independent. |
| Form-submit dispatcher (file location grep at builder time — likely `packages/web/lib/form-submit.ts` per Brief 072) | **Modify:** add branch — when `connection_setup` block submits with `serviceName === 'github-project'`, route to `POST /api/v1/projects` with `kickOffOnboarding: true`. All other `serviceName` values continue to route to `/api/credential`. |
| `packages/web/app/(workspace)/sidebar.tsx` (or wherever sidebar lives — grep) | **Modify:** add "+ Connect a project" CTA in Projects section, gated by env var. CTA seeds Self message "Connect a new project". |
| `packages/core/src/projects/invariants.test.ts` | **Modify (test-only):** add unit test asserting `validateStatusTransition({ from: 'analysing', to: 'archived' })` returns `{ ok: true }`. NO change to `invariants.ts` itself. |
| `.env.example` | **Modify:** add `DITTO_PROJECT_ONBOARDING_READY` documented as `false` by default. |
| `docs/dictionary.md` | **Modify:** 3 new entries (Project Kind, Onboarding Run, Connection Form). Builder writes at implementation. |

## User Experience

**Per `docs/research/analyser-report-and-onboarding-flow-ux.md`** (Designer pass). Spec consumed verbatim.

- **Jobs affected:** Define (URL-paste defines "this repo is in scope"), Capture (conversational paste-URL is capture), Orient (Stage 2 wait state). Sub-brief #2 covers Review + Decide + Delegate.
- **Primitives involved:** existing `ConnectionSetupBlock`, existing `ProgressBlock` rendered via design-package `block.plan` CSS.
- **Process-owner perspective:** Jordan pastes a GitHub URL on his commute → Self responds inline with Connect form → tap `[Verify access]` → OAuth if private → tap `[Begin analysis →]` → wait state → analyser report (sub-brief #2) → pick runner+tier → confirm → project goes active. Lisa's path is identical structurally; private-repo OAuth catches her closed repos cleanly.
- **Visual identity:** Anthropic Claude Design handoff bundle (id `iK3gPHe3rGAErdm4ua2V-A`). Renderer extension uses tokens `--color-vivid` + `--color-vivid-deep` + `--color-vivid-subtle`; semantic `text-positive`/`text-caution`/`text-negative` for severity coding; chat-col-as-second-column layout (440px default, draggable).

## Acceptance Criteria

1. [ ] **`projects.kind` schema column lands.** `packages/core/src/db/schema.ts` defines `projectKindValues = ['build', 'track'] as const`, `ProjectKindValue` type, and `projects.kind` NOT NULL default `'build'`. `pnpm run type-check` (root) passes.

2. [ ] **Drizzle journal entry at next-free idx ≥14.** `drizzle/meta/_journal.json` has the new entry. SQL file `0015_<slug>.sql` exists. Snapshot matches. SQL is `ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'build'`. `pnpm drizzle-kit migrate` against `data/dev.db` succeeds; existing rows backfill via default; idempotent re-run is no-op.

3. [ ] **`processes/project-onboarding.yaml` exists** with two placeholder steps (`clone-and-scan` + `surface-report`). Trigger event `project.connected`. YAML loads cleanly; `loadProcess('project-onboarding')` returns valid `ProcessDefinition`.

4. [ ] **Placeholder handlers Insight-180-guarded.** `src/engine/onboarding/handlers.ts` exports both handlers. `clone-and-scan` is true no-op; `surface-report` writes stub workItems + harness_decisions audit row. Each handler enforces `stepRunId` guard (DB-spy: zero DB calls before rejection). System-agent registry registers them.

5. [ ] **`POST /api/v1/projects` accepts `kickOffOnboarding: true`** when env var enabled. Project created with `kind='build'`, `status='analysing'`, `defaultRunnerKind=null`, `runnerBearerHash=null`. Triggers `project-onboarding` process run. Returns 201 + `{ project, conversationUrl }`. Test: POST with `kickOffOnboarding: true` succeeds; `process_runs` row exists for `project-onboarding`.

6. [ ] **`POST /api/v1/projects/:id/onboarding/confirm` is the atomic three-write commit (with bearer generation at flip).** One transaction: insert `project_runners` row, generate runner bearer + bcrypt-hash + write `runnerBearerHash`, flip `status='active'` + set `defaultRunnerKind`, mark workItems `briefState='approved'`, queue retrofitter. Returns 200 + `{ projectId, bearerToken, bearerOnceWarning: true, conversationUrl }` — bearer surfaced once. On failure (UNIQUE collision, invariant rejection), rolls back atomically; returns 400.

7. [ ] **`POST /api/v1/projects/:id/onboarding/cancel` flips `'analysing' → 'archived'`.** Returns 200. `workItems.briefState='blocked'` for onboarding report row.

8. [ ] **`GET /projects/:slug/onboarding` Server Component** returns the onboarding workspace view when `status='analysing'` AND env var enabled; 404 otherwise. Chat-col hydrates against project's onboarding conversation thread.

9. [ ] **`start_project_onboarding` Self tool registers when env var set.** Tool description includes intent-recognition examples. Tool absent when env unset (graceful — no errors). Test: with env true, message containing GitHub URL pattern + verb triggers tool + emits `ConnectionSetupBlock`.

10. [ ] **`ConnectionSetupBlock` renderer extension for project-connect semantics** (30-80 LOC of real product work). When `serviceName === 'github-project'`: title "Connect a GitHub repository"; suppress raw `serviceName` from subtitle; render `.alex-line` annotation above form; URL field gets inline `[Verify access]` button; other fields render independent of probe state.

11. [ ] **Form-submit dispatcher branches on `serviceName`.** When `connection_setup` block submits with `serviceName === 'github-project'`, dispatcher routes to `POST /api/v1/projects` with `kickOffOnboarding: true`. All other `serviceName` values continue to `/api/credential`. Test verifies both routing paths.

12. [ ] **Sidebar "+ Connect a project" CTA renders when env var set.** Tapping seeds Self message; `start_project_onboarding` tool fires; `ConnectionSetupBlock` appears inline. Hidden when env unset.

13. [ ] **`kickOffOnboarding: true` body field is env-var-gated server-side.** When env unset/false, POST handler silently coerces `kickOffOnboarding: true` to `false` (legacy Brief 223 path: project created with `status='active'` if runner provided, immediate bearer). Architectural rationale: prevents stranded `analysing` projects.

14. [ ] **`validateStatusTransition` permits `analysing → archived`** (regression guard test only). NO change to `invariants.ts`; verified at brief-write that the invariant already permits.

## Review Process

1. Spawn fresh-context Reviewer with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Brief 224 + Designer's UX spec + actual schema state.
2. Reviewer challenges: ConnectionSetupBlock renderer extension sizing honest? Atomic three-write commit transaction shape correct? Bearer-deferred-to-flip preserves Brief 223's contract? Insight-180 guard on placeholder is justified? `projects.kind` migration uses ALTER TABLE not table-recreate? Drizzle journal idx claim re-verified at brief-write time? Form-submit dispatcher routing branch is real and named? AC count appropriate vs Insight-004?
3. Present brief + review findings to human for approval.

## Smoke Test

```bash
# 1. Migration
rm -f /tmp/ditto-test.db
DATABASE_URL=file:/tmp/ditto-test.db pnpm drizzle-kit migrate
sqlite3 /tmp/ditto-test.db "PRAGMA table_info(projects);" | grep kind
# Expected: kind | TEXT | 1 | 'build' | 0

# 2. Engine with env var
DITTO_PROJECT_ONBOARDING_READY=true DATABASE_URL=file:/tmp/ditto-test.db pnpm dev:engine &
sleep 3
curl -s http://localhost:3000/api/v1/self/tools | jq '.tools[] | select(.name=="start_project_onboarding") | .name'
# Expected: "start_project_onboarding"

# 3. Create with onboarding
RESP=$(curl -s -X POST http://localhost:3000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"slug":"smoke","name":"Smoke","githubRepo":"facebook/react","kickOffOnboarding":true}')
echo "$RESP" | jq '.project | {slug, status, kind, defaultRunnerKind}'
# Expected: { slug: "smoke", status: "analysing", kind: "build", defaultRunnerKind: null }

# 4. Process kicked off
sqlite3 /tmp/ditto-test.db "SELECT process_id, status FROM process_runs WHERE process_id='project-onboarding';"

# 5. Confirm
PROJ_ID=$(echo "$RESP" | jq -r '.project.id')
RESP2=$(curl -s -X POST http://localhost:3000/api/v1/projects/$PROJ_ID/onboarding/confirm \
  -H 'Content-Type: application/json' \
  -d '{"defaultRunnerKind":"local-mac-mini","mode":"local","runnerConfig":{},"trustTier":"supervised"}')
echo "$RESP2" | jq '.bearerToken' | head -c 8
# Expected: bearer surfaced once

# 6. Atomic flip verified
sqlite3 /tmp/ditto-test.db "SELECT slug, status, default_runner_kind FROM projects WHERE id='$PROJ_ID';"
# Expected: smoke | active | local-mac-mini
sqlite3 /tmp/ditto-test.db "SELECT kind, mode, enabled FROM project_runners WHERE project_id='$PROJ_ID';"
# Expected: local-mac-mini | local | 1

# 7. Env-disabled 404 (clean restart)
kill %1; sleep 1
DITTO_PROJECT_ONBOARDING_READY=false pnpm dev:engine &
sleep 3
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/projects/smoke/onboarding
# Expected: 404
```

## After Completion

1. Update `docs/state.md` with what changed.
2. Update `docs/roadmap.md` Project Onboarding & Battle-Readiness phase row — sub-brief #1 marked complete.
3. Phase retrospective: did `ConnectionSetupBlock` reuse work cleanly, or did URL-probe semantics force a new block type? Capture as insight.
4. **Documenter follow-up flagged:** absorb chat-col-as-second-column layout divergence into `human-layer.md` §Workspace Architecture. Documenter's call on whether to update doc now or wait for sub-brief #2 (more chat-col surfaces).
5. ADR check: no ADR required. ADR-043 (`.ditto/`) is sub-brief #3 territory.

---

## Reviewer Pass Summary (2026-04-27)

This brief was authored, Reviewer-passed (HARD FAIL on first pass — 3 CRITICAL + 5 IMPORTANT + 5 MINOR), and fixed in-session in a prior conversation turn. The fixes are baked into this version. Reviewer's load-bearing findings:

- **CRITICAL #1 (Drizzle idx stale):** original draft claimed idx=13; verified `drizzle/meta/_journal.json` 2026-04-27 — idx=13 was taken by Brief 216's `0014_routine_callback_token`. This version claims idx=14 → SQL `0015_<slug>.sql`. Builder MUST re-grep at session start.
- **CRITICAL #2 (`ConnectionSetupBlock` reuse over-claimed):** original draft framed renderer change as "one-line copy override"; verified renderer is fundamentally a credentials-paste form requiring 30-80 LOC of real extension work. Block-TYPE reuse stands; renderer-side honesty restored.
- **CRITICAL #3 (form-submit dispatcher routing branch silently missing):** original draft assumed `connection_setup` → project-creation routing; existing dispatcher routes to `/api/credential`. AC #11 + What-Changes entry now explicit.
- **IMPORTANT fixes:** bearer-deferred-to-flip path explicit (preserves Brief 223 bearer-once contract); `validateStatusTransition` amendment unnecessary (verified already permits `analysing → archived`); GET endpoint added on `/api/v1/projects/:id/onboarding` for REST consistency; phantom `intent-recognition.ts` dropped (Self uses tool descriptions); YAML step list trimmed from 8 placeholders to 2 (sub-brief #2 designs full decomposition); env-var gate extended to body field server-side.

**Workspace state note:** This brief was originally authored in a prior session in this same conversation; the workspace was reset by a parallel agent's commit between that session and now, wiping the brief from disk. Recreated 2026-04-27 with the post-Reviewer-fixes baked in.
