# Brief 223: WorkItems Brief-Equivalent Extension + Status Webhook + Projects CRUD

**Date:** 2026-04-25
**Status:** ready (2026-04-25 — user delegated decision authority; architect locked-in: Path 1+ reconciliation approved per architect checkpoint #8; rescoped to additive layer atop Brief 215)
**Depends on:** Brief 215 (Projects + Runner Registry — owns the `projects` substrate, `project_runners`, `runner_dispatches`, `processes.projectId` FK tightening, `runnerBearerHash` column, seed projects, and `projectStatusValues` enum). Coordinates with Brief 212 on Drizzle journal idx.
**Unlocks:** Brief 224 (Project Onboarding & Battle-Readiness parent — analyser/retrofitter/memory-scope sub-briefs need both Brief 215's substrate AND this brief's brief-equivalent workItems extension + status webhook), the user's broader pipeline-spec (`runner=local-mac-mini` adapter selection wiring deferred from Brief 212:182, the catalyst-brief-sync system process, the `/projects` UX surface, the runner dispatcher process — all consume Brief 215's substrate; the brief-equivalent layer + status webhook this brief lands enables runner callbacks).
**Renumbered from:** Brief 214 (in-session rename: 2026-04-25). Originally claimed 214 per PM grep at session start; the parallel session's `docs/briefs/214-cloud-execution-runners-phase.md` (parent) and `docs/briefs/215-projects-and-runner-registry.md` (substrate sub-brief) landed during my drafting. Renamed to next genuinely-free number ≥223 (the parallel session reserves 216-222 for cloud-runner sub-briefs).

---

## Collision Reconciliation Resolved (2026-04-25)

**Path chosen: Path 1+ (refined)** — Brief 215 absorbs the pipeline-spec `projects`-table fields it missed; Brief 223 (this) is rescoped to its genuinely additive layer. Both briefs ship; HOLD lifted.

**This brief's owned scope post-reconciliation (subtractive vs original draft):**
- ✗ DROPPED — `projects` table creation (Brief 215 owns)
- ✗ DROPPED — `processes.projectId` FK tightening (Brief 215 owns)
- ✗ DROPPED — seed projects (Brief 215 owns)
- ✗ DROPPED — `runner` single-string column on projects (Brief 215's `defaultRunnerKind` + `runnerChain` is the canonical shape)
- ✗ DROPPED — `runnerConfig` JSON column on projects (Brief 215's `project_runners.config_json` is per-(project × kind) and more flexible)
- ✗ DROPPED — `harnessType` / `briefSource` / `briefPath` / `deployTarget` / `status` / `runnerBearerHash` columns (all absorbed into Brief 215's `projects` table per the reconciliation)
- ✓ KEPT — `workItems` extension with brief-equivalent fields (title, body, briefState, riskScore, confidence, modelAssignment, linkedCaptureId, linkedProcessRunId, stateChangedAt) + 2 CHECK constraints partitioning by projectId
- ✓ KEPT — Status webhook handler `POST /api/v1/work-items/:id/status` (bearer auth via `projects.runnerBearerHash` LANDED BY BRIEF 215; this brief implements the verification + state transition)
- ✓ KEPT — Projects CRUD endpoints `/api/v1/projects` (GET/POST/PATCH/DELETE) — pure adapters over Brief 215's tables; the `POST` handler generates the bearer + writes `projects.runnerBearerHash` (the column landed by 215, populated here)
- ✓ KEPT — `PATCH /api/v1/projects/:slug` rotateBearer flag for bearer rotation
- ✓ KEPT — bearer-once-warning shape on POST response (the plaintext bearer is shown once and never stored)
- ✓ KEPT — invariant: `PATCH status='active'` calls Brief 215's `validateStatusTransition` from `packages/core/src/projects/invariants.ts` — rejects 400 if `defaultRunnerKind` is null or no enabled `project_runners` row exists for that kind
- ✓ KEPT — Insight-180 status-webhook guard with bounded waiver (the original constraint stands; rephrased to use Brief 215's `runner_dispatches` table as the cross-reference for stepRunId)

**Why Path 1+ was chosen over Path 2 or Path 3:**
- Path 2 (Brief 215 absorbs everything, Brief 223 retracted): would push Brief 215 well past 17 ACs, force a split into 215a+215b, and lose the natural seam between substrate (Brief 215) and brief-equivalent + webhook + CRUD layer (this brief). The brief-equivalent and webhook layer is genuinely a different concern from the runner-registry substrate; collapsing them buys nothing and obscures the architecture.
- Path 3 (true two-migration approach): introduces field redundancy (two `projects` migrations to land different fields, with rename collisions to manage). Path 1+ collapses the redundancy by absorbing Brief 215's projects-table fields once, and lets Brief 223 be cleanly subtractive about its scope.
- Path 1+ preserves the maximum value: cloud-runners gets its tables on schedule; the brief-equivalent + webhook + CRUD layer ships shortly after with no schema-collision risk; Brief 224 has a clean two-substrate dependency.

**Brief 215 amendments triggered by this reconciliation (verified by reading 215 post-amendment):**
- Renamed `harnessKind` → `harnessType`; enum extended `catalyst | native-ditto` → `catalyst | native | none`
- Added: `projects.status` enum (default `'analysing'`), `projects.briefSource`, `projects.briefPath`, `projects.deployTarget`, `projects.runnerBearerHash`
- Made: `projects.defaultRunnerKind` and `projects.fallbackRunnerKind` NULLABLE (transient `analysing` state)
- Added: seed projects (agent-crm, ditto) at boot via `seed-on-boot.ts`
- Added: `validateStatusTransition` pure-function invariant in `packages/core/src/projects/invariants.ts`

---

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness (the brief-equivalent + status-webhook + CRUD layer atop Brief 215's substrate). Brief 224 is the parent for the analyser/retrofitter/memory-scope decomposition.
- **Capabilities delivered (post-rescope):**
  - `workItems` extended with brief-equivalent fields (`projectId` FK to projects, `title`, `body`, `briefState`, `riskScore`, `confidence`, `modelAssignment`, `linkedCaptureId`, `linkedProcessRunId`, `stateChangedAt`) — as **additive nullable columns** alongside the existing `status`/`content` semantics, with two CHECK constraints partitioning by projectId.
  - REST CRUD endpoints for projects (`GET /api/v1/projects`, `POST /api/v1/projects`, `GET /api/v1/projects/:slug`, `PATCH /api/v1/projects/:slug`, `DELETE /api/v1/projects/:slug`) — pure adapters over Brief 215's `projects` and `project_runners` tables. The `POST` handler generates the bearer token, hashes it, and writes `projects.runnerBearerHash` (the column landed by Brief 215). The `PATCH` handler with `rotateBearer: true` invalidates and re-issues. Each call to `PATCH status='active'` invokes Brief 215's `validateStatusTransition` invariant.
  - Status webhook for runner back-channels (`POST /api/v1/work-items/:id/status` per pipeline-spec §7) gated by per-project bearer token (separate auth model from session cookies — the runner is not a browser session). Bearer compared against `projects.runnerBearerHash` (read-only consumer of Brief 215's column).
- **NOT delivered (per reconciliation):**
  - The `projects` table itself, `processes.projectId` FK, seed projects, runner registry — all owned by Brief 215.

## Context

The user's broader pipeline-spec (`.context/attachments/pasted_text_2026-04-25_20-19-53.txt:3-19`) introduces a `projects` concept with seven enum-shaped fields (`harnessType | briefSource | runner | deployTarget | status` + subtypes) and asks for it as the substrate the rest of the pipeline (catalyst-brief-sync, runner dispatcher, status webhook, `/projects` UX, multi-model routing) builds on top of. **It does not exist today.** Grep confirms: no `projects` table in `packages/core/src/db/schema.ts`; the only existing concept is `processes.projectId`, which is a loose `text("project_id")` field with **no foreign-key reference** (`schema.ts:198`) — it was scaffolded as a placeholder, never wired.

Brief 212 (Workspace Local Bridge) explicitly **deferred** the `runner=local-mac-mini` adapter-selection wiring to "a future projects-table brief" (`docs/briefs/212-workspace-local-bridge.md:182`). Brief 223 (this brief) is that brief — alongside the parallel session's Brief 215. Brief 212's bridge primitive is callable today (post-merge) via the `bridge.dispatch` built-in tool from any process YAML; what's missing is the *project-aware* adapter routing that says "this work item belongs to project P; project P's `runner` is `local-mac-mini`; therefore route the CLI step over the bridge to project P's paired device." That routing wires up in a follow-on brief — Brief 223 just lands the substrate that the user's pipeline-spec names; Brief 215 (parallel session) lands the cloud-runners-flavored substrate.

Insight-205 (`docs/insights/205-battle-ready-project-onboarding.md`) names the broader frame: connecting a project is a multi-step **process**, not a metadata operation. The analyser/retrofitter pipeline that delivers battle-readiness needs a row to land against; Brief 223 ships that row, the FK to `processes`, and the minimal CRUD to create/list/inspect/delete it. Brief 224 (parent) decomposes the analyser, retrofitter, project memory scope, and connection-as-process plumbing into separate sub-briefs that all consume Brief 223's schema.

**Important schema reality:** `workItems` already exists at `packages/core/src/db/schema.ts:583`, but with an *intake-routing* shape (`type` enum is `question | task | goal | insight | outcome`; `status` enum is `intake | routed | in_progress | waiting_human | completed | failed`; key field is `content`, not `title`+`body`). The pipeline-spec's `workItems` is a *brief-equivalent* with a different lifecycle (`backlog | approved | active | review | shipped | blocked | archived`), different type enum (`feature | fix | refactor | content | spike`), and different fields (`title`, `body`, `riskScore`, `confidence`, `modelAssignment`). The user's pipeline-spec was written without knowledge that `workItems` already existed — the architectural call here is to **extend** the existing table additively (one primitive, two views into it) rather than create a parallel `projectWorkItems` table that would split the "discrete unit of work" concept across two surfaces. This decision is documented inline (§Constraints, §What Changes) and called out in §Open Questions for the human — the alternative (separate `projectWorkItems` table) is preserved as a Rejected Alternative.

## Objective

Land the brief-equivalent layer atop Brief 215's substrate: extend `workItems` with brief-equivalent fields, ship the minimal CRUD endpoints + status webhook the rest of the pipeline-spec depends on, and wire bearer-token auth (Brief 215 lands the `runnerBearerHash` column; this brief generates and verifies the bearer). Without scope-creeping into the analyser, retrofitter, runner dispatcher, catalyst-brief-sync, multi-model routing, or `/projects` UI surfaces (those are downstream briefs).

## Non-Goals

- **No analyser, no retrofitter, no `.ditto/` directory shape decision.** Those are Brief 224's territory; this brief stops at "the row exists, the API works, the FK is real."
- **No `/projects` or `/projects/[slug]` web UI.** Pipeline-spec §5 names this; it's a separate UX brief (and `/dev-designer` flag — see Brief 224 §User Experience). This brief ships APIs only.
- **No runner dispatcher process (`dispatch-runner.yaml`).** Pipeline-spec §6 names it; deferred to a follow-on brief (or it could land alongside the runner=local-mac-mini wire-up). The schema this brief ships supports it (the `runner`/`runnerConfig` columns are populated); the process YAML and the adapter-selection logic are not.
- **No catalyst-brief-sync system process body.** §Open Questions Q1 below decides whether catalyst-brief-sync **fits inside** Brief 223's size cap or spins to a sibling sub-brief. The brief is sized assuming **spin-out** (sibling sub-brief); the catalyst-bridge fields on the schema (`harnessType='catalyst'`, `briefPath`, `briefSource='filesystem'`) are wired so the sibling sub-brief can drop in cleanly without further schema changes.
- **No multi-model routing / Gemini integration / OpenRouter wiring.** Pipeline-spec §8 names it; deferred. The `modelAssignment` column on `workItems` is added and indexed, but the routing logic (Haiku triage → write `modelAssignment`) is a separate brief.
- **No router process extension (`router.yaml` taking workItem inputs).** Pipeline-spec §4. Schema supports it; YAML is downstream.
- **No `/review/[token]` page changes.** Pipeline-spec §5's "Approve / Reject / Tweak" buttons land in a follow-on UX brief; the existing `/review` surface continues to work for everything it already supports.
- **No work-item state migration.** Existing `workItems` rows keep their existing `status` value; new `briefState` defaults to NULL; rows are tagged "non-project work item" by the absence of `projectId`. The two state machines coexist.
- **No external-app deploy targets** (`deploy_target=vercel | fly | manual` is recorded as data; the actual deploy machinery is a separate brief).
- **No multi-user scaffolding changes.** Solo-user shape per pipeline-spec; `networkUsers` and per-project ACL are not introduced. (The `projects` table owner is implicit — single-workspace, single-user; the row has no `userId` column. ACL deferred to a future multi-user brief.)
- **No `.ditto/` directory ADR.** Brief 224's parent brief reserves ADR-043 (next-free) for the `.ditto/` directory shape decision. Brief 223's schema is `.ditto/`-agnostic.

## Inputs

1. `.context/attachments/pasted_text_2026-04-25_20-19-53.txt` — pipeline-spec; **§1 (project model), §2 (native work-item model), §7 (status webhook), §10 (acceptance criteria)** are binding for the schema and API shapes.
2. `docs/insights/205-battle-ready-project-onboarding.md` — the load-bearing insight for the broader phase. Brief 223 is application #1 (substrate); Brief 224's sub-briefs are applications #2-#5.
3. `docs/briefs/212-workspace-local-bridge.md:62, 182, 195` — Brief 212's `What Changes` row that **DEFERS** runner adapter-selection wiring to "a future projects-table brief" — Brief 223 is that brief (but Brief 223 stops at schema; the wire-up is a downstream brief).
4. `packages/core/src/db/schema.ts:175-205` — current `processes` table; `projectId` at line 198 is the loose-text column being promoted.
5. `packages/core/src/db/schema.ts:583-617` — current `workItems` table; the brief extends it.
6. `packages/core/src/db/schema.ts:144-169` — current `WorkItemTypeValues`, `WorkItemStatusValues`, `WorkItemSourceValues` constants; the brief extends them additively.
7. `packages/core/src/db/schema.ts:126-127` — `memoryScopeTypeValues = ["agent", "process", "self", "person"]`. Project-scoped memories are intentionally NOT a new scope_type in this brief; instead, Brief 224's sub-brief on project memory extends `process`-scope filtering to honour `processes.projectId` (one less schema enum to grow).
8. `drizzle/meta/_journal.json` — last entry idx=9 (tag `0010_thread_titles`); idx=10 claimed by Brief 212 (draft, not merged); **Brief 223 claims idx=11**. Insight-190 resequence procedure (§Constraints) applies if Brief 212 lands first or both land in unexpected order.
9. `docs/insights/190-drizzle-migration-journal-as-bottleneck.md` (or wherever it lives — grep if path differs) — schema-migration discipline for parallel-session journal collisions.
10. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to the status webhook (external side effect: a runner posting back state-transitions). The webhook handler MUST require `stepRunId` parity in the audit row, even though the auth is bearer-token (the bearer comes IN to a webhook; the side effect is the row update + activity log).
11. `docs/adrs/003-memory-architecture.md` — memory scope discipline; project memories defer to Brief 224's sub-brief.
12. `docs/adrs/007-trust-earning.md` — trust-tier semantics; this brief does NOT introduce trust gates on CRUD endpoints (project creation/deletion are direct user actions, not agent-initiated side effects); the Brief 224 analyser/retrofitter SUB-BRIEFS are where trust-tier mapping lands.
13. `packages/web/app/api/v1/integrations/unipile/route.ts:19-34` — the `ditto_workspace_session` cookie + `WORKSPACE_OWNER_EMAIL` auth pattern that the `/api/v1/projects` endpoints reuse. Status webhook does NOT use this pattern (uses bearer instead).
14. `processes/intake-classifier.yaml`, `processes/router.yaml` — existing system processes that pipeline-spec §4 will extend to take workItem inputs; **out of scope for Brief 223** but cited so the schema supports the future extension.
15. `docs/dev-process.md` + `.claude/commands/dev-*.md` — confirms Insight-205's claim that existing roles map cleanly to project onboarding (no new roles needed); not directly consumed by Brief 223 but the parent brief (215) cites it.
16. `docs/dictionary.md` — six new terms land here at build-time (Project, Project Slug, Harness Type, Brief Source, Runner, Runner Config). Builder adds the entries during implementation per Insight-043 (Architect updates reference docs as designs land).
17. `packages/core/src/db/schema.ts:495-522` — `harnessDecisions` is the audit destination if any project mutation produces a side-effect that needs trust-gate audit (e.g., the status webhook recording a runner-driven state transition with `stepRunId` traceability).

## Constraints

- **Engine-first per CLAUDE.md.** Schema lives in `packages/core/src/db/schema.ts`. New type unions (`HarnessType`, `BriefSource`, `Runner`, `DeployTarget`, `ProjectStatus`, `BriefStateValues`, extended `WorkItemTypeValues`) live alongside the other enum-shaped constants in `packages/core/src/db/schema.ts:1-170`. Engine-core does NOT create DB connections (CLAUDE.md core rule 5) — the existing pattern (consumers pass `db` at boundary) holds. CRUD route handlers (Ditto product layer) live in `packages/web/app/api/v1/projects/` and `packages/web/app/api/v1/work-items/[id]/status/`. Ask: "could ProcessOS use this?" — yes for the schema (a generic "what project does this process belong to" concept is portable); the CRUD handlers are Ditto-product-specific. Engine scope: **both**.

- **Schema migration discipline (Insight-190) — strict-monotonic journal idx.** Brief 223 introduces ONE new table (`projects`) and modifies TWO existing tables (`processes` to add a real FK; `workItems` to add ten nullable columns + extend three string-union types + add two CHECK constraints). The migration lands at the **next-free Drizzle journal idx — strict-monotonic, no gaps**. Builder rule (deterministic; no ambiguity): at build session start, read `drizzle/meta/_journal.json`. **Take the lowest unclaimed idx ≥ 10** (i.e., if Brief 212 is unmerged at the moment of build, Brief 223 takes idx=10; if Brief 212 has merged at idx=10, Brief 223 takes idx=11; if both idx=10 and idx=11 have been claimed by parallel sessions, take idx=12; etc.). The SQL filename slug follows whatever drizzle-kit chooses (it is `0011_*.sql` if idx=10, `0012_*.sql` if idx=11, etc. — the leading number is `idx + 1` per the existing journal pattern, *not* hard-coded). Drizzle's journal is strict-monotonic; gaps break the migration runner — never leave a gap. **Resequence procedure if a parallel session lands first during the build:**
  1. Re-run `drizzle-kit generate`. Drizzle chooses the next available number based on the current journal state.
  2. If the journal entry idx differs from the one you originally generated, drizzle-kit will already have updated `_journal.json`, the SQL file, and `_<idx>_snapshot.json` consistently — verify the three artefacts agree.
  3. If you manually edit the journal idx for any reason: rename the SQL file AND the snapshot file to match, and verify every journal entry has a corresponding SQL file post-resequence.
  4. If type-check or migration tests fail post-resequence, the resequence is wrong — do not commit.

- **`processes.projectId` FK promotion uses SQLite's table-recreate dance, NOT in-place ALTER.** SQLite cannot add a FK constraint to an existing column via ALTER TABLE — drizzle-kit emits the standard table-recreate pattern (verified at `drizzle/0003_pm_triage_migrations.sql:29-46`): `PRAGMA foreign_keys=OFF` → `CREATE TABLE __new_processes (… FK …)` → `INSERT INTO __new_processes SELECT … FROM processes` → `DROP TABLE processes` → `ALTER TABLE __new_processes RENAME TO processes` → `PRAGMA foreign_keys=ON`. This means **the cleanup of orphaned `project_id` values MUST run BEFORE the `INSERT INTO __new_processes SELECT …`** step, because the new table enforces the FK at insert time and a stale value crashes the migration mid-recreate with no clean rollback. **Required statement order in the generated migration SQL:**
  1. `CREATE TABLE projects (…)` — projects table created (no dependencies).
  2. Idempotent seed `INSERT OR IGNORE INTO projects (…) VALUES (…)` for `agent-crm` and `ditto` — seeds present before any reference checks.
  3. `UPDATE processes SET project_id = NULL WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects)` — pre-recreate orphan cleanup. Even if today no rows have stale `project_id` values (the column was loose text, never wired), the migration must be defensive against the future.
  4. `PRAGMA foreign_keys=OFF` → table-recreate dance for `processes` (now safe; `project_id` values are either NULL or match a real project).
  5. Table-recreate dance for `work_items` to add the ten new nullable columns + two CHECK constraints (`(title IS NULL AND content IS NOT NULL) OR (title IS NOT NULL AND body IS NOT NULL)` AND `(project_id IS NULL AND brief_state IS NULL) OR (project_id IS NOT NULL)` — the second CHECK partitions the dual state machine semantically by `projectId` per Reviewer recommendation, not just convention). Also runs the additive enum extension via the schema's TypeScript-side `$type<>` annotations — no SQL change for that, since SQLite stores enums as text and the migration relies on schema enforcement at app boundary.
  6. `PRAGMA foreign_keys=ON`.
  Drizzle-kit may not emit this order automatically when both schemas change in one generate pass; **builder must read the generated SQL and manually re-order statements if needed before committing the migration**, and the migration test (run on a copy of `data/dev.db` with a synthetic stale `project_id` row injected) verifies the order is correct.

- **`workItems` extension is additive only — no destructive enum collapse, partitioned by `projectId` at the DB level.** The existing `WorkItemStatusValues` (`intake | routed | in_progress | waiting_human | completed | failed`) STAYS; `briefState` is a SEPARATE column with a SEPARATE enum (`backlog | approved | active | review | shipped | blocked | archived`). Existing rows have `briefState = NULL`. New brief-flavored work items (with non-null `projectId`) populate `briefState` and may leave `status` at the default. **The two state machines coexist semantically partitioned by `projectId` via a DB-level CHECK constraint** (`(project_id IS NULL AND brief_state IS NULL) OR (project_id IS NOT NULL)`) — non-project items can never accidentally hold a `briefState`, project items must declare `projectId`. The API surfaces decide which state the consumer sees (project-aware endpoints surface `briefState`; existing intake/router endpoints surface `status`). The existing `WorkItemTypeValues` enum is **extended** with the pipeline-spec's five values (`feature | fix | refactor | content | spike`) added alongside the existing five (`question | task | goal | insight | outcome`) — total ten. The existing `content` field STAYS; `title` and `body` are NEW nullable columns. For project-flavored work items, `title` + `body` is canonical; for legacy intake-flavored items, `content` is canonical. Consistency enforced via a second CHECK constraint: `(title IS NULL AND content IS NOT NULL) OR (title IS NOT NULL AND body IS NOT NULL)`.

- **Field-naming convention.** TypeScript identifiers use camelCase; SQL column names use snake_case via Drizzle's column-name argument (e.g., `runnerConfig: text("runner_config", { mode: "json" })`). Pipeline-spec snake_case names (`runner_config`, `harness_type`, `risk_score`, `model_assignment`, `brief_source`, `default_branch`, `repo_url`, `state_changed_at`) map 1:1 to the SQL column names; the TS-side identifiers are the camelCase equivalents. This matches existing schema convention (e.g., `processes.projectId` → `project_id` at `packages/core/src/db/schema.ts:198`).

- **Side-effecting function guard (Insight-180) — applies to the status webhook with a CONSEQUENTIAL bounded waiver.** The status webhook (`POST /api/v1/work-items/:id/status`) IS a side-effecting endpoint: a runner posts back, Ditto updates state, Ditto fires a downstream event (notify the conversation, post an audit row). The webhook handler signature MUST accept a `stepRunId` from the runner payload (the runner records its dispatched step's `stepRunId` and replays it on callback) and writes the audit row keyed on `stepRunId`. If the runner cannot replay `stepRunId` (e.g., a runner architecture without Ditto-side bookkeeping), the webhook accepts the call but writes `stepRunId=NULL` and `metadata.webhook.guardWaived = true` with the rationale captured in the audit row. **Audit destination is `activities`, NOT `harness_decisions`** (per Insight-207 + Brief 223 builder discovery): `harness_decisions.stepRunId` is NOT NULL FK, so a webhook callback with no step context cannot write there at all. `activities` is the canonical destination for events that don't originate from a governed step (the `actorType` column is also on `activities`, not `harness_decisions`). **The bounded waiver is consequential, not inert**: rows with `guardWaived=true` (a) surface in a separate "ungated runner callbacks" review queue at `/admin/runner-callbacks` (deferred UI — for MVP, queryable via `sqlite3 data/dev.db "SELECT … FROM activities WHERE actor_type='runner-webhook' AND json_extract(metadata, '$.webhook.guardWaived')='true'"`), and (b) accumulate as a downgrade signal on the project: if a project's last 5 runner callbacks all carry `guardWaived=true`, the project's trust posture flags for human re-review (the project is functionally operating ungated). This preserves the guard's discipline without making `github-action` runners unworkable: the waiver is allowed but visible and bounded. Ditto's MVP `claude-code-routine` and `local-mac-mini` runners both CAN replay `stepRunId` (the cloud injects it into the dispatch payload; the runner echoes it on callback) — so the waiver is reserved for the genuinely-can't-replay edge case (e.g., a custom external runner). This pattern matches Brief 212's `orphaned: true` precedent (`docs/briefs/212-workspace-local-bridge.md:87`) where post-hoc trust signal is captured as a flag, not dropped.

- **Bearer-token auth for status webhook is per-project, with rotation auditability.** The INBOUND webhook bearer (Runner → Ditto) is generated at project-creation time, surfaced once in the `POST /api/v1/projects` response with a "you'll only see this once" warning, and stored bcrypt-hashed (cost 12) on `projects.runnerBearerHash`. The plaintext is NEVER stored. Verifying the inbound webhook token is the same bcrypt-compare pattern Brief 200 uses for clone credentials and Brief 212 uses for pairing codes. Token rotation: `PATCH /api/v1/projects/:slug` with a `rotateBearer: true` body invalidates the old hash and issues a new bearer atomically; the rotation event writes an `activities` row with `actorType='admin-cookie'`, `action='project_bearer_rotated'`, `metadata.bearerRotation = { rotatedAt, projectSlug }` for forensic auditability (Insight-017 security checklist; Insight-207 audit-targeting). Audit destination is `activities` (not `harness_decisions`) because admin-cookie operations have no step-run context. Per-project, NOT per-workspace — different projects have different runners with different shared secrets.

- **OUTBOUND bearer storage uses the existing credential-vault pattern.** When `runner='claude-code-routine'`, Ditto must HOLD a bearer for outbound calls to the Routine's endpoint (this bearer cannot be hashed because Ditto needs to use it). Storage path: AES-256-GCM via existing `src/engine/credential-vault.ts` into the existing `credentials` table (`packages/core/src/db/schema.ts:665-684`), keyed on `service = "runner.<projectSlug>.bearer"` (matches pipeline-spec §9 line 94 phrasing literally — *"store it encrypted in Ditto's credential vault as routine.agent-crm.bearer"*). NO new column on `credentials`; no schema change. `runnerConfig` JSON for `claude-code-routine` stores `{ endpoint, credentialService: "runner.<projectSlug>.bearer" }` — the credential lookup happens at dispatch time. The CRUD `POST /api/v1/projects` handler, when `runner='claude-code-routine'`, accepts `runnerConfig.bearer` plaintext at the boundary, immediately writes the encrypted `credentials` row, and replaces the `runnerConfig.bearer` field with `runnerConfig.credentialService` before persisting `projects` — plaintext bearer is never written to `projects`. This is the same boundary-encryption pattern existing integrations use.

- **No drift on Brief 212's wire shape, trust-tier semantics, or audit destination.** The retrofitter sub-brief (Brief 224 sub-brief #3) WILL dispatch via Brief 212's `bridge.dispatch` for `runner=local-mac-mini`; that dispatch traverses the harness pipeline + `stepRunId` guard (Insight-180). Brief 223's `runnerConfig` JSON column for local-mac-mini stores `{ deviceId: string }` (referencing `bridgeDevices.id` from Brief 212) — the schema is FK-soft (no Drizzle FK reference, because Brief 223 must not hard-dep on Brief 212's tables; coordination is via the `bridgeDevices.id` matching at API call time and a `runnerConfig` validation function in `packages/core/src/projects/validation.ts` that opportunistically verifies the device exists when Brief 212 has merged).

- **Project memories scope discipline.** This brief does NOT add `project` to `memoryScopeTypeValues`. Brief 224's sub-brief on project memory extends `process`-scope filtering to honour `processes.projectId` — i.e., when retrieving process-scoped memories, the assembly function joins `memories.scopeId → processes.id → processes.projectId` and optionally filters by project. This avoids a new enum and reuses the existing `process` scope filtering. Documented in the Brief 224 parent for traceability; called out here so the brief 214 schema is project-aware (`processes.projectId` real FK) without growing memory enums.

- **Solo-user shape per pipeline-spec.** No `userId` column on `projects`. Multi-user `networkUsers` scaffolding stays intact (un-touched). Any future multi-project-per-user split is a separate brief.

- **CRUD endpoints gated by existing workspace-session cookie pattern** (`packages/web/app/api/v1/integrations/unipile/route.ts:19-34`). Local dev (`WORKSPACE_OWNER_EMAIL` unset) — accessible without auth. Production — gated by signed cookie matching the configured owner email. The status webhook is the ONLY exception (bearer-token gated, see above).

- **Engine-core boundary (`@ditto/core`).** `packages/core/src/projects/` is a new module: type unions + Zod schemas for `runnerConfig` discriminated by `runner` value + a pure-function validator. NO DB calls in this module. The CRUD handlers in `packages/web/` import the validator and call DB themselves. NO Ditto opinions (Self / personas / network) in core. Ask: "could ProcessOS use this?" — yes; ProcessOS could have its own runners with its own `runnerConfig` shapes, but the *concept* of "a project has a runner with a config" is portable.

- **Reference docs touched in this brief** (Insight-043):
  - `docs/dictionary.md` — six new entries (Project, Project Slug, Harness Type, Brief Source, Runner, Runner Config). Builder adds at implementation time.
  - `docs/roadmap.md` — new "Project Onboarding & Battle-Readiness" phase row with Brief 223 as the substrate sub-brief and Brief 224 as the parent. Architect adds at brief-write time (this brief).
  - `docs/architecture.md` — §L1 paragraph noting that `processes.projectId` is now a real FK and projects are first-class entities. Builder amends post-merge.
  - `docs/state.md` — architect checkpoint for this brief.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Project model field set | User pipeline-spec `.context/attachments/pasted_text_2026-04-25_20-19-53.txt:5-15` | adopt (canonical) | The user's named field set is binding — don't re-litigate field names. |
| Native work-item brief equivalent | User pipeline-spec `.context/attachments/pasted_text_2026-04-25_20-19-53.txt:23-31` | adopt | Pipeline-spec is the source of truth for native work-item shape. |
| Status webhook (`POST /api/v1/work-items/:id/status`) | User pipeline-spec `.context/attachments/pasted_text_2026-04-25_20-19-53.txt:79-84` | adopt | Pipeline-spec specifies the route; we ship it as written. |
| Bearer-token auth + bcrypt cost 12 hash | Brief 200 §Constraints (clone credentials), Brief 212 §Constraints (pairing codes) | depend (self-reuse) | Existing Ditto convention; do not invent a parallel auth model. |
| `harnessDecisions` audit row pattern | `packages/core/src/db/schema.ts:495` | depend (existing) | Reuses the table the harness already writes for trust-gate decisions; status-webhook side effects log here. |
| Workspace-session cookie auth | `packages/web/app/api/v1/integrations/unipile/route.ts:19-34` | depend (existing) | Same auth shape Ditto's existing v1 routes use; do not invent. |
| Drizzle journal idx claim + resequence | `docs/insights/190-drizzle-migration-journal-as-bottleneck.md` | pattern (self-reuse) | Insight-190 is the canonical procedure for parallel-session journal collisions. |
| Discriminated-union JSON Schema for `runnerConfig` | Brief 212 AC #4 (the `bridge.dispatch` discriminated union by `kind`) | pattern (self-reuse) | The same pattern works here: `runner` is the discriminator, the JSON shape varies. Zod's `discriminatedUnion()` is the implementation. |
| Additive-enum extension over destructive collapse | Original to Ditto (no precedent in codebase) | original | Two coexisting state machines on one table is unusual but justified — the existing `status` and the new `briefState` describe different lifecycles (intake/routing vs brief-equivalent); collapsing them would lose semantic precision. |
| Bounded waiver for Insight-180 guard | Original to Ditto (Brief 212's `orphaned: true` precedent at AC #10) | pattern (self-reuse) | Brief 212 shows the pattern: when the guard cannot apply, capture its absence as a first-class signal (`reviewDetails.bridge.orphaned = true`); applied here as `reviewDetails.webhook.guardWaived = true`. |

## What Changes (Work Products)

> **Post-reconciliation scope (2026-04-25):** Rows marked **OWNED BY BRIEF 215** in this table are NO LONGER PART OF THIS BRIEF — they ship in the substrate sub-brief and this brief consumes them. Rows marked **THIS BRIEF** stay in scope. Each retained row is purely additive on Brief 215's schema (workItems columns + bearer-write logic on a column Brief 215 lands).

| File | Action |
|------|--------|
| `packages/core/src/db/schema.ts` | **OWNED BY BRIEF 215 (substrate):** type unions for `harnessTypeValues`, `briefSourceValues`, `deployTargetValues`, `projectStatusValues` AND the `projects` table itself AND `processes.projectId` FK tightening AND `projects.runnerBearerHash`. **THIS BRIEF — additive on workItems only:** add `briefStateValues = ["backlog", "approved", "active", "review", "shipped", "blocked", "archived"]`; **extend** `workItemTypeValues` from 5 to 10 (add `feature`, `fix`, `refactor`, `content`, `spike` alongside existing); add columns to `workItems`: `projectId text REFERENCES projects(id)` (FK to Brief 215's table), `title text`, `body text`, `briefState text $type<BriefState>`, `riskScore integer` (0-100, NULL allowed), `confidence real` (0-1, NULL allowed), `modelAssignment text`, `linkedCaptureId text`, `linkedProcessRunId text REFERENCES process_runs(id)`, `stateChangedAt integer { mode: 'timestamp_ms' }`. All new columns NULL-allowed; two CHECK constraints: `(title IS NULL AND content IS NOT NULL) OR (title IS NOT NULL AND body IS NOT NULL)` AND `(project_id IS NULL AND brief_state IS NULL) OR (project_id IS NOT NULL)`. |
| `drizzle/<NNNN>_<slug>.sql` | **Generated** by `drizzle-kit generate` against the next-free journal idx after Brief 215's migration. Brief 215 lands the projects substrate at idx ≥11 (post-Brief-212); this brief lands at the next-free idx ≥12 with workItems table-recreate dance only. SQL: PRAGMA foreign_keys=OFF + work_items table-recreate (with new columns + 2 CHECK constraints) + PRAGMA foreign_keys=ON. **Brief 215's projects table must already exist when this migration runs** — the workItems FK to projects.id depends on it. |
| `drizzle/meta/_journal.json` | **Modify (generated):** new entry at the next-free idx after Brief 215. |
| `drizzle/meta/<NNNN>_snapshot.json` | **Generated** with matching idx. |
| `packages/core/src/projects/types.ts` | **OWNED BY BRIEF 215** (TypeScript types re-exported from schema). This brief consumes them. |
| `packages/core/src/projects/validation.ts` | **OWNED BY BRIEF 215** (the `validateRunnerConfig` for `project_runners.config_json` discriminated union lives there per Brief 215's reconciliation; this brief reads it). |
| `packages/core/src/projects/invariants.ts` | **OWNED BY BRIEF 215** (the `validateStatusTransition` invariant for `analysing → active` lives there). |
| `packages/core/src/work-items/brief-types.ts` | **THIS BRIEF — Create:** TypeScript types for the brief-equivalent layer (`BriefState`, `WorkItemBriefInput` etc.). Pure types, no runtime. Engine-core because the brief-equivalent layer is portable. |
| `packages/core/src/work-items/brief-validation.ts` | **THIS BRIEF — Create:** Pure-function validators for the workItems brief-equivalent input shape. Zod-based. NO DB calls. |
| `packages/core/src/index.ts` | **Modify:** Add `export * from "./work-items"` to expose the brief-equivalent layer types/validators. |
| `src/engine/projects/seed-data.ts` | **OWNED BY BRIEF 215** (`agent-crm`, `ditto` seed rows). |
| `src/engine/projects/seed-on-boot.ts` | **OWNED BY BRIEF 215**. |
| `packages/web/app/api/v1/projects/route.ts` | **Create:** `GET /api/v1/projects` (list all, gated by workspace-session cookie); `POST /api/v1/projects` (create; body validated via `validateProject`; bearer token generated, hashed, surfaced once in response with `bearerOnceWarning: true`). Returns 400 on validation failure, 409 on slug collision, 201 on success. |
| `packages/web/app/api/v1/projects/[slug]/route.ts` | **Create:** `GET` (fetch by slug); `PATCH` (update; supports `rotateBearer: true` body); `DELETE` (soft-delete: sets `status='archived'`, NOT a real DB delete). Each gated by workspace-session cookie. |
| `packages/web/app/api/v1/work-items/[id]/status/route.ts` | **Create:** `POST` only; bearer-token gated (compare against `projects.runnerBearerHash` for the project owning the work item — i.e., look up `workItems.projectId → projects.runnerBearerHash`); body `{ state: BriefState, prUrl?: string, error?: string, notes?: string, stepRunId?: string }`. On success: updates `workItems.briefState`, `workItems.stateChangedAt`, optionally `workItems.linkedProcessRunId`; writes `harness_decisions` row (`actorType='runner-webhook'`, `stepRunId` from payload OR NULL with `reviewDetails.webhook.guardWaived=true`); writes `activities` row. Returns 200 on success. |
| `packages/web/app/api/v1/projects/__tests__/route.test.ts` | **Create:** Unit tests covering: list returns seed rows, create with valid body succeeds + returns bearer once, create with duplicate slug returns 409, create with invalid runnerConfig (e.g., `runner='claude-code-routine'` with no `endpoint`) returns 400, fetch missing returns 404, patch rotateBearer issues new bearer + invalidates old, delete sets status=archived. |
| `packages/web/app/api/v1/work-items/[id]/status/__tests__/route.test.ts` | **Create:** Unit tests covering: missing bearer returns 401, wrong bearer returns 401, valid bearer + valid body updates briefState + writes harnessDecisions, missing stepRunId allowed (writes guardWaived=true), invalid state value returns 400. |
| `docs/dictionary.md` | **Modify:** Add six new entries — Project, Project Slug, Harness Type, Brief Source, Runner, Runner Config. Builder writes at implementation time; one-paragraph each, cross-referenced to the schema. |
| `docs/roadmap.md` | **Modify:** Add new phase row "Project Onboarding & Battle-Readiness" (between current last phase and "Future" — exact placement to confirm at write-time). Brief 223 as the substrate sub-brief; Brief 224 as the parent (cross-reference both). Architect adds at brief-write time. |
| `docs/architecture.md` | **Modify (one paragraph):** §L1 Process Layer gains a paragraph noting that processes belong to projects via `processes.projectId` real FK; projects are first-class L1 entities (not just metadata). Builder amends post-merge. |
| `data/dev.db` | **No-op (untracked):** the migration runs against the local dev DB at `pnpm drizzle-kit migrate`; the file changes but is not committed. |

## User Experience

- **Jobs affected:** Define (a project is a discrete unit the user defines explicitly — "I'm onboarding the agent-crm repo"), Capture (a work item flowing through the brief states is a captured-and-tracked unit). No Orient/Review/Delegate/Decide changes in this brief — those land in downstream UX briefs.
- **Primitives involved:** None (no UI work in this brief). The downstream `/projects` UX brief introduces a `ProjectListBlock` + `ProjectDetailBlock` (deferred per §Non-Goals).
- **Process-owner perspective:** API-only. The user does not see this brief directly — they interact with the projects table via the downstream `/projects` UI brief, the catalyst-brief-sync system process, the runner dispatcher, etc. The visible artefacts are the seed rows themselves (auditable via `sqlite3 data/dev.db "SELECT * FROM projects"`).
- **Interaction states:** N/A (no UI).
- **Designer input:** Not invoked — this is API + schema work. Designer is flagged as a follow-on `/dev-designer` pass for the `/projects` UX brief (and for Brief 224's analyser-report-rendering sub-brief).

## Acceptance Criteria

> **Post-reconciliation:** Original ACs #1 (projects table), #2 (processes FK), #5 (seed projects boot) are SUPERSEDED by Brief 215. Brief 223's ACs are renumbered below; #3 (workItems extension) and #4 (drizzle journal) and #6-#12 (CRUD endpoints + status webhook) remain in scope. Brief 215 must merge first.

1. [ ] **`workItems` extension is additive only, partitioned by `projectId` at the DB level.** Existing `WorkItemStatusValues` and `WorkItemTypeValues` (5 values each) are preserved; new `WorkItemTypeValues` total 10 (existing 5 + new 5). New `briefStateValues` is a separate constant. New columns `projectId`, `title`, `body`, `briefState`, `riskScore`, `confidence`, `modelAssignment`, `linkedCaptureId`, `linkedProcessRunId`, `stateChangedAt` all NULL-allowed. **Two CHECK constraints enforced:** (a) `(title IS NULL AND content IS NOT NULL) OR (title IS NOT NULL AND body IS NOT NULL)` — title-or-content invariant; (b) `(project_id IS NULL AND brief_state IS NULL) OR (project_id IS NOT NULL)` — projectId-partitions-state-machine invariant. Migration uses `__new_work_items` table-recreate. Existing rows survive migration unchanged (verified via row-count parity before/after AND a verification INSERT that attempts to violate each CHECK and is rejected). The `projectId` FK references `projects.id` (the table landed by Brief 215).

2. [ ] **Drizzle journal entry exists at the next-free idx after Brief 215's migration** per the strict-monotonic rule (§Constraints). `drizzle/meta/_journal.json` has the new entry; SQL file exists; snapshot exists; no gaps. **Brief 215 must merge first** so its `projects` table exists for the workItems FK to land cleanly. `pnpm drizzle-kit migrate` succeeds; re-run is idempotent.

3. [ ] **`POST /api/v1/projects` creates a project, returning the bearer token once.** Body validated against Brief 215's `validateProject` (consumed from `packages/core/src/projects/validation.ts`). Response `{ project, bearerToken, bearerOnceWarning: true }`. Bearer is bcrypt-hashed (cost 12) before storage in `projects.runnerBearerHash` (the column landed by Brief 215); plaintext is NEVER persisted. Subsequent fetch of the project does NOT return the bearer (only `runnerBearerHash`). When body specifies `runnerConfig`, the handler internally dispatches to Brief 215's `project_runners` insert (one row per runner-kind in the config) — the brief's `POST /api/v1/projects` is a convenience wrapper that creates the project AND its first project_runner row in one transaction.

4. [ ] **`GET /api/v1/projects` lists all projects** filtered by `status != 'archived'` by default; query param `?includeArchived=true` returns archived too. Returns the two seed rows from Brief 215 on a fresh DB.

5. [ ] **`GET /api/v1/projects/:slug` fetches a single project by slug** (not by id). Returns 404 if no match. Joins `project_runners` to surface the project's runner configurations alongside the project row.

6. [ ] **`PATCH /api/v1/projects/:slug` updates fields** (excluding `id`, `slug`, `createdAt`); body `{ rotateBearer: true }` issues a new bearer atomically and returns it once. **PATCH on `status` field calls Brief 215's `validateStatusTransition`** — invalid transitions return 400 with the invariant error (e.g., `analysing → active` while `defaultRunnerKind` is NULL). **Rotation event writes an `activities` row** with `actorType='admin-cookie'`, `action='project_bearer_rotated'`, `metadata.bearerRotation = { rotatedAt, projectSlug }` (Insight-017 forensic auditability; Insight-207 — admin-cookie has no step-run context, so `activities` is the canonical destination, not `harness_decisions`).

7. [ ] **`DELETE /api/v1/projects/:slug` is a soft-delete** (sets `status='archived'`, returns 200, does NOT remove the row). Does not cascade delete processes (existing `processes.projectId` FK rows survive; downstream brief decides whether to surface them as "orphaned").

8. [ ] **`POST /api/v1/work-items/:id/status` is bearer-token gated AND posts to the conversation per pipeline-spec §7.** Looks up `workItems.projectId → projects.runnerBearerHash`; returns 401 if no Authorization header, 401 if bcrypt-compare fails, 200 on success. Body `{ state, prUrl?, error?, notes?, stepRunId?, runnerKind?, externalRunId? }`. On success, updates `workItems.briefState` to `state`, `workItems.stateChangedAt` to `Date.now()`, sets `workItems.linkedProcessRunId` if the runner provides it. **If `runnerKind` and `externalRunId` are present, also transitions the matching `runner_dispatches` row** (the table landed by Brief 215) — the webhook bridges the dispatch lifecycle managed by Brief 215's adapter pipeline. **Posts a conversation message** — for MVP, an `activities` row with `action='work_item_status_update'` consumed by the existing activity-stream consumer.

9. [ ] **Status webhook writes an `activities` row** (Insight-207: webhook callbacks may have no step-run context, so the audit destination is `activities`, not `harness_decisions`) with `actorType='runner-webhook'`, `action='work_item_status_update'`, `metadata.webhook.stepRunId` from payload OR NULL with `metadata.webhook.guardWaived=true` + rationale. The `guardWaived=true` rows are queryable for the bounded-waiver downgrade signal; 5 consecutive waivers per project flags that project for human re-review per §Constraints.

13. [ ] **`runnerConfig` discriminated-union validation** works for all three runner values. Test: `runner='claude-code-routine'` with `runnerConfig={endpoint, bearer}` succeeds; with missing `endpoint` returns 400. `runner='local-mac-mini'` with `runnerConfig={deviceId}` succeeds; with missing `deviceId` returns 400. `runner='github-action'` with `runnerConfig={repo, workflowFile}` succeeds.

14. [ ] **CRUD endpoints respect workspace-session auth** (`packages/web/app/api/v1/integrations/unipile/route.ts:19-34` pattern). Local dev (`WORKSPACE_OWNER_EMAIL` unset): accessible without cookie. Production: missing/invalid cookie → 401. The status webhook endpoint is the only exception (bearer-only).

## Review Process

1. Spawn fresh-context Reviewer agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief
2. Reviewer specifically checks:
   - Schema migration is reversible OR the irreversibility is explicitly justified (per Insight-190)
   - The data-cleanup step in the migration is ordered BEFORE the FK constraint add
   - `runnerConfig` discriminated union is validated server-side, not just typed (TypeScript types alone are not validation; Zod is the runtime gate)
   - Bearer-token storage NEVER persists plaintext (grep migration SQL + handler code)
   - The status webhook honours the Insight-180 guard semantics (either `stepRunId` provided or `guardWaived=true` in audit row — not silently dropped)
   - The "extend `workItems` additively" decision is honoured — no values removed from existing enums; the CHECK constraint enforces title-or-content invariant
   - The `processes.projectId` migration handles orphaned existing rows gracefully (UPDATE … SET … = NULL) before adding the FK
   - The Drizzle journal idx claim coordinates honestly with Brief 212 (idx=11 vs idx=10 ordering)
   - No new memory scope_type values introduced (project memory is Brief 224's sub-brief territory)
   - The brief is sized to one focused build session (Insight-004): 14 ACs is at the upper end; if the Reviewer counts more than 17 effective ACs, propose a split
3. Present brief + review findings to human for approval

## Smoke Test

```bash
# 1. Run migration on a fresh DB
rm -f /tmp/ditto-test.db
DATABASE_URL=file:/tmp/ditto-test.db pnpm drizzle-kit migrate

# 2. Verify schema
sqlite3 /tmp/ditto-test.db "SELECT name FROM sqlite_master WHERE type='table' AND name='projects';"
# Expected: projects

sqlite3 /tmp/ditto-test.db "PRAGMA foreign_key_list(processes);"
# Expected: a row showing project_id → projects.id

# 3. Boot engine; verify seed
DATABASE_URL=file:/tmp/ditto-test.db pnpm dev:engine &
sleep 3
sqlite3 /tmp/ditto-test.db "SELECT slug, harness_type, runner FROM projects;"
# Expected:
#   agent-crm | catalyst | claude-code-routine
#   ditto     | native   | local-mac-mini

# 4. Hit the API
curl -s http://localhost:3000/api/v1/projects | jq '.projects[].slug'
# Expected: "agent-crm" "ditto"

# 5. Create a project
BEARER=$(curl -s -X POST http://localhost:3000/api/v1/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","slug":"test","repoUrl":"https://github.com/x/test","defaultBranch":"main","harnessType":"native","briefSource":"ditto-native","runner":"github-action","runnerConfig":{"repo":"x/test","workflowFile":"ci.yml"},"deployTarget":"manual","status":"active"}' \
  | jq -r '.bearerToken')
echo "Bearer captured: ${BEARER:0:8}..."

# 6. Fetch — bearer is gone
curl -s http://localhost:3000/api/v1/projects/test | jq 'has("bearerToken")'
# Expected: false (only runnerBearerHash is present)

# 7. Status webhook with bearer
WID=$(sqlite3 /tmp/ditto-test.db "INSERT INTO work_items (id, type, status, content, source, project_id, title, body, brief_state) VALUES ('wi-test', 'feature', 'intake', 'test body', 'system_generated', (SELECT id FROM projects WHERE slug='test'), 'Test work item', 'test body', 'backlog') RETURNING id;")
curl -s -X POST http://localhost:3000/api/v1/work-items/wi-test/status \
  -H "Authorization: Bearer $BEARER" \
  -H 'Content-Type: application/json' \
  -d '{"state":"approved","stepRunId":"sr-test"}'
# Expected: 200; sqlite3 query confirms briefState='approved'

# 8. Status webhook without bearer
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/v1/work-items/wi-test/status \
  -H 'Content-Type: application/json' -d '{"state":"shipped"}'
# Expected: 401
```

## After Completion

1. Update `docs/state.md` with what changed (FK promotion, `workItems` extension, seed rows, two new API surfaces)
2. Update `docs/roadmap.md` Project Onboarding & Battle-Readiness phase row: substrate sub-brief (this brief) → marked complete
3. Phase retrospective: did the additive `workItems` extension prove maintainable, or did the dual-state-machine pattern create read-path confusion? If the latter, capture an insight ("dual state machines on one table is fragile"); if the former, capture an insight that vindicates the pattern for future dual-purpose-table decisions.
4. ADR check: an ADR is NOT required for this brief — the field set is the user's pipeline-spec, not an architectural choice the architect made. The downstream `.ditto/` directory shape decision (Brief 224) IS an ADR (reserved as ADR-043 in Brief 224).

---

## Open Questions for the Human

**Q1. Catalyst-brief-sync system process — fold in or sibling sub-brief?**
The pipeline-spec §3 names a `catalyst-brief-sync.yaml` system process: cron every 5 min, glob `{briefPath}/*.md`, parse state prefix, upsert into `workItems`, round-trip state changes. This brief is **sized for spin-out** — the schema supports it (catalyst projects have `briefPath` populated; `workItems.briefState` is the round-trip target), but the YAML body is a separate sub-brief (call it Brief 216 or similar; PM to claim at scheduling time). **Architect default:** spin out. **Override path:** if you'd rather see catalyst-brief-sync land alongside the schema in this brief, name it; it adds ~6 ACs (cron schedule, parse logic, sync direction conflict-resolution per spec §3, end-to-end smoke test) and pushes the brief total to ~20 ACs (over the size cap).

**Q2. `workItems` extend vs separate `projectWorkItems` table — REVIEWER-VALIDATED with second CHECK.**
The architect's call is to **extend** the existing `workItems` table additively rather than create a parallel `projectWorkItems` table. Rationale: one primitive ("discrete unit of work"), two views (intake-routing semantics for non-project items; brief-equivalent semantics for project items). Reviewer (post-Reviewer pass) validated the call AND added a second CHECK constraint to make the dual-state-machine semantically partitioned by `projectId` at the DB level (§Constraints, AC #3): `(project_id IS NULL AND brief_state IS NULL) OR (project_id IS NOT NULL)`. Non-project items can never accidentally hold a `briefState`; project items must declare `projectId`. The fragility concern (cross-contamination via app code) is mitigated structurally. Alternative (separate `projectWorkItems` table) is preserved in §Rejected Alternatives. If during the build the dual-CHECK proves operationally awkward, builder may surface a follow-on architecture note for re-consideration.

**Q3. Bearer-token storage for `claude-code-routine` outbound bearer — RESOLVED post-Reviewer.**
*Resolved:* outbound bearer stored via existing `credential-vault.ts` AES-256-GCM into the existing `credentials` table, keyed on `service = "runner.<projectSlug>.bearer"` per pipeline-spec §9 line 94 (*"store it encrypted in Ditto's credential vault as routine.agent-crm.bearer"*). NO new column on `credentials`; NO `credentialId` indirection — the service-name convention is the lookup key. `runnerConfig` for `claude-code-routine` stores `{ endpoint, credentialService: "runner.<projectSlug>.bearer" }`. Reviewer flagged this resolution; architect adopted. See §Constraints "OUTBOUND bearer storage" for the boundary-encryption pattern detail.

## Reviewer Pass Summary (2026-04-25)

Fresh-context Reviewer ran with `docs/architecture.md` + `docs/review-checklist.md` + this brief + the pipeline-spec + Insight-205 + Insight-180 + Brief 212 + `packages/core/src/db/schema.ts` + `drizzle/meta/_journal.json` + CLAUDE.md as inputs. **Verdict: PASS WITH FLAGS.** All CRITICAL findings (3) and IMPORTANT findings (4 actionable) fixed in-session before promotion to `Status: ready`. MINOR findings (4): all 4 incorporated.

- **CRITICAL fixes applied:** (1) Migration shape rewritten to use SQLite table-recreate (`__new_processes` pattern verified at `drizzle/0003_pm_triage_migrations.sql:29-46`), with explicit statement order in §Constraints + AC #2; (2) Drizzle journal idx claim tightened to "next-free idx ≥10, strict-monotonic, no gaps" with deterministic builder rule; SQL filename leading-number is `idx + 1` (derived, not hard-coded); (3) Migration ordering — cleanup `UPDATE` runs BEFORE table-recreate `INSERT … SELECT`, with synthetic-stale-row migration test in AC #2.
- **IMPORTANT fixes applied:** (4) `getSeedProjects()` moved from `packages/core/src/projects/seed.ts` to `src/engine/projects/seed-data.ts` (Ditto product layer; slugs are Ditto opinions, not portable); (5) Q3 outbound bearer resolved using `credentials` table with `service = "runner.<projectSlug>.bearer"` convention per pipeline-spec §9 line 94 — NO new column, NO `credentialId` indirection; (6) AC count noted at 14, single brief retained (split overhead exceeds gain); natural seam at AC #11 documented for budget-pressured split path; (7) Insight-180 bounded waiver made consequential — `guardWaived=true` rows (a) surface in queryable audit, (b) accumulate as downgrade signal (5 consecutive flags project for re-review). 
- **MINOR fixes applied:** (8) camelCase TS / snake_case SQL convention note added to §Constraints; (9) AC #2 verifier invokes `PRAGMA foreign_keys = ON;` explicitly; (10) AC #9 rotation event writes `harness_decisions` row for forensic auditability; (11) Zod confirmed already in codebase via grep (`packages/web/lib/data-part-schemas.ts:14`); no new landscape entry needed.
- **§Coverage check vs pipeline-spec:** §1 project model fields PASS (12/12); §2 native work-item model PASS (12/12 mapped to additive `workItems` extension); §7 status webhook PASS including the "posts to the conversation" semantic added to AC #11; §10 in-scope acceptance criteria PASS for the substrate sub-brief subset.
- **Reviewer's independent take on the open questions:** Q1 spin out catalyst-brief-sync (matches architect default); Q2 extend with second CHECK partitioning by `projectId` (architect adopted); Q3 use existing credentials-table with `service=runner.<slug>.bearer` (architect adopted).

## Rejected Alternatives

- **Separate `projectWorkItems` table.** Considered (see Q2). Rejected because two work-item-shaped tables on one primitive is fragile — query unions become the default read pattern, the catalyst-brief-sync round-trip would have to choose, and the cross-project promotion UX (Brief 224 sub-brief #4) gets harder. Captured here for the human to revisit; not foreclosed.
- **Add `project` to `memoryScopeTypeValues`.** Considered. Rejected because `processes.projectId` is the real FK; project-scoped memories naturally extend `process`-scope filtering by joining through. Adding a new scope_type would duplicate the linkage. Brief 224 sub-brief #4 (project memory) ratifies this; if the design surfaces a pain point, the human can revisit.
- **Hard FK from `projects.runnerConfig.deviceId` to `bridgeDevices.id`.** Considered. Rejected because Brief 223 must not hard-dep on Brief 212's tables (Brief 223 may merge first; Brief 212 is in flight). Soft FK + opportunistic validation in `validateRunnerConfig` is the loose-coupling that lets either order merge.
- **Skip the data-cleanup step in the migration; just add the FK.** Considered. Rejected because existing `processes` rows with non-null `projectId` whose value is not a valid `projects.id` would block the FK constraint. The data-cleanup step is defensive against the unknown — even if today no such rows exist (`processes.projectId` was loose text and never wired), the migration must be safe against the future where someone added a row by hand.
- **Webhook authentication via JWT (matching Brief 212 device tokens).** Considered. Rejected for this brief — JWT requires a signing-key infrastructure that doesn't pay back at this scope. Bearer + bcrypt-hash is simpler and matches the existing `credentials` table pattern. Future brief can promote to JWT if the runner ecosystem demands it.
