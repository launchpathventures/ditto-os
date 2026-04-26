# Brief 224: Project Onboarding & Battle-Readiness — Phase Parent Brief

**Date:** 2026-04-25
**Status:** ready (post-Reviewer; collision reconciliation resolved 2026-04-25 — Path 1+ refined; HOLD lifted)
**Depends on:** Brief 215 (Projects + Runner Registry — owns the `projects` substrate including `harnessType`, `briefSource`, `briefPath`, `deployTarget`, `status` enum with `analysing` value for BEFORE-flow, `runnerBearerHash`, seed projects, `validateStatusTransition` invariant, `processes.projectId` FK tightening, `project_runners` per-kind config table, `runner_dispatches` audit table) AND Brief 223 (workItems brief-equivalent extension fields, status webhook handler, projects CRUD endpoints). Brief 212 (Workspace Local Bridge — required ONLY by sub-brief #3 retrofitter for `runner=local-mac-mini` dispatch; the analyser sub-brief is read-only and runs against any runner). All three are substrate dependencies; sub-briefs of 224 wait on them.
**Unlocks:** Each connected project becomes battle-ready: an in-depth analysis runs at connection time, a retrofit pass writes `.ditto/` substrate INTO the target repo (role contracts, skill index, tool allowlist, project-specific guidance) under the project's runner, project memories scope per-project with a cross-project promotion UX. The user's primary acquisition surface — connection becomes "this is what Ditto sees about my work" instead of a dead form submission.
**Renumbered from:** Brief 215 (in-session rename: 2026-04-25). Originally claimed 215 per PM grep at session start; the parallel session's `docs/briefs/215-projects-and-runner-registry.md` landed during my drafting. Renamed to next genuinely-free number ≥223 (the parallel session reserves 216-222 for cloud-runner sub-briefs).

---

## Collision Reconciliation Resolved (2026-04-25)

**Path chosen: Path 1+ refined.** Brief 215 absorbed the pipeline-spec fields that this brief needs (`harnessType` rename + `none` value, `briefSource`, `briefPath`, `deployTarget`, `status` enum including `analysing`, `runnerBearerHash`, seed projects, `validateStatusTransition` invariant, `defaultRunnerKind` made nullable for transient analysing). Brief 223 rescoped to its genuinely additive layer (workItems brief-equivalent extension, status webhook handler, projects CRUD endpoints). Both ship; Brief 224 depends on both.

This decoupling means **the BEFORE-flow specified in §Open Question below works** with the amended Brief 215 schema — `projects.defaultRunnerKind` is nullable, `projects.status='analysing'` is supported, and `validateStatusTransition` enforces that `analysing → active` requires a runner kind to be picked. The analyser sub-brief (sub-brief #1 of this parent) creates a `projects` row with `status='analysing'`, runs the read-only repo analysis, surfaces the report; the user then picks runner + tier; transition to `active` is gated by the invariant.

**Insight-205 absorption is unchanged.** Insight-205 stays `active` until at least one sub-brief of 224 ships; the absorption gate is unchanged.

**HOLD lifted.** Sub-brief #1 architect can pick up Brief 224 once Brief 215 (substrate, post-amendment) and Brief 223 (rescoped) are both human-approved.

---

## Resolved: Analyser-Flow Sequence — BEFORE (2026-04-25)

**Decision: BEFORE.** Analyser runs before runner/tier is picked. Architect-locked-in per checkpoint #8 — user delegated decision authority. The architect's BEFORE-default rationale stands; AFTER preserved as Rejected Alternative for future architects.

**Architect default in this parent brief: BEFORE.**

**Rationale for BEFORE:**
1. The analyser is read-only — cloning + grepping + classifying. It needs no runner: a Ditto-side `clone-and-analyse` worker spawned on connection can run before `projects.runner` is set. (For private repos, the user provides clone credentials; this is the same OAuth/PAT flow Brief 200 / Brief 212 already use.)
2. The analyser's output IS the signal that should drive the runner/tier choice. If the analyser detects "this is a tightly-managed Rails 7 monorepo with mature CI" the user picks `claude-code-routine` + spot_checked; if it detects "this is a five-script glue repo with no tests" the user picks `local-mac-mini` + supervised. **Asking the user to choose a runner before the analyser sees the repo is asking them to choose without information.**
3. This is the user-acquisition surface (Insight-205 §6: *"the in-depth analysis IS the user's first signal of value"*). The "first contact" feeling for a new project should be Ditto demonstrating insight, not Ditto making the user fill in a form.
4. Trust-tier choice in particular benefits from analyser data: the analyser reports "tests exist / tests don't exist", "CI exists / CI doesn't exist", "branch protection enabled / disabled" — these are the inputs that calibrate trust-tier. ADR-007 already names trust as **earned, not configured** (§"Conjunctive Upgrade / Disjunctive Downgrade") — the analyser's report is the first earning signal.

**Rationale for AFTER (preserved for the human to override):**
1. Architectural symmetry: every other Ditto process has a `runner`/`tier` set before execution; the analyser becoming a "pre-runner" exception is a special case.
2. Resource pre-flight: if the user has only one paired Mac mini and it's offline at connection time, `local-mac-mini` won't work — the user might want to pick the runner first to surface that constraint.
3. The analyser's clone-side cost (network, disk) is small but non-zero; some users might want to defer it to "after I've committed to onboarding this project."

**How the architect's BEFORE default plays out structurally:**
- The `projects` row is created with `runner=NULL, runnerConfig=NULL, status='analysing'` at the moment the user pastes the repo URL. Brief 223 (post-Reviewer revision) commits `runner` + `runnerConfig` as **DB-level nullable** with a **handler-level invariant**: PATCH attempts to set `status='active'` while `runner` or `runnerConfig` is NULL return 400. The `projectStatusValues` enum includes `"analysing"` for this transient state. **Cross-brief dependency confirmed:** if Brief 223 ships before this brief's sub-brief #1 architect-session, the schema is already BEFORE-compatible; if Brief 223 ships with `runner` NOT NULL by mistake, sub-brief #1 must amend Brief 223 or fall back to the AFTER flow.
- A `project-onboarding-analyse.yaml` system process runs immediately, with its own ad-hoc cloud-side execution (no runner needed for the read-only analyser).
- The analyser writes its report as a `harness_decisions` row + a `work_items` row of type `feature` and `briefState='backlog'` titled "Onboarding report for `<project-slug>`". The user reviews via the existing `/review/[token]` surface.
- After the user reviews + approves the analysis, they pick `runner` + trust-tier (informed by the report). `projects.runner` is populated; `projects.status` flips to `'active'`.
- The retrofitter then runs as the project's first real process, dispatched via the chosen `runner` (Brief 212's bridge for local-mac-mini, cloud-subprocess for claude-code-routine, PR for github-action).

**If the human picks AFTER:** sub-brief #1 (connection-as-process plumbing) inverts: the runner picker is the first form, the analyser runs as `runner`'s first process. Schema is unchanged (`projects.runner` always nullable transiently). This is reversible — sub-brief #1 honours whichever order the human chooses; only its UI flow + the seed YAML for the first process differ.

**Sub-brief #1 architect implements BEFORE flow.** Sub-briefs #2-#4 are insensitive to the answer.

---

## Goal

- **Roadmap phase:** Project Onboarding & Battle-Readiness (new phase added by Brief 223 to `docs/roadmap.md`). This is the parent brief; it decomposes into **four sub-briefs** along the seams Insight-205 §"Where it should land" enumerates.
- **Capabilities delivered (across the four sub-briefs):**
  - **Connection is a process, not a form.** When the user pastes a repo URL, a `project-onboarding` process kicks off — clone (via the user's chosen runner OR via a Ditto-side ad-hoc worker if BEFORE-runner), analyse, propose retrofit plan, execute retrofit (after approval), register `projects.status='active'`. The connection moment is interactive and produces a visible artefact (the analysis report), not a dead row.
  - **In-depth analyser** — the `/dev-researcher`-shaped pass on the target repo. Builds: (a) project shape (build system, package manager, language stack, test framework, CI status, lint config, branch protection), (b) existing harness/skills/tools detection (`.claude/`, `.cursorrules`, `AGENTS.md`, `.github/workflows`, `.catalyst/`, etc.), (c) persona-fit assessment (does this repo's complexity fit Rob / Lisa / Jordan / Nadia's working pattern?), (d) gold-standard cross-references (similar OSS repos that solved adjacent problems well — Ditto's existing landscape.md + research/ corpus is the comparison set), (e) recommendations on `runner` + trust-tier given (a)-(d). Output: a structured report rendered on the `/projects/:slug/onboarding` page.
  - **Retrofitter** — the `/dev-architect` + `/dev-builder`-shaped pass that writes `.ditto/` artefacts INTO the target repo. Trust-tier-bound depth: supervised approves every file, autonomous retrofits silently + the user audits the diff after, critical rejects (the project's harness must be hand-authored). Dispatch via Brief 212's `bridge.dispatch` for `runner=local-mac-mini`, via cloud-side subprocess invoking `claude -p` (existing `src/adapters/cli.ts`) for `runner=claude-code-routine`, via a generated PR using the existing GitHub integration for `runner=github-action`. The harness pipeline + `stepRunId` guard (Insight-180) is traversed for every retrofit dispatch — the retrofitter is not a side channel that bypasses the harness.
  - **Project memories scope.** Memories scope per-project: a correction taught while working on `agent-crm` does NOT bleed to `ditto`, unless the user explicitly cross-promotes. The implementation extends the existing `process` scope filtering to honour `processes.projectId` (no new `memoryScopeTypeValues` enum value — Brief 223's call). UX: a "promote to self-scope" button on the memory detail surface that lets the user lift a project-scoped memory to cross-project applicability. (Designer activation flagged on this sub-brief; UX is deferred to a `/dev-designer` pass before sub-brief #4 builds.)
  - **Re-runnable harness maintenance.** The retrofitter is not a one-shot install; the same machinery re-runs on schedule (or on-demand) to update `.ditto/` artefacts as the project evolves. A new test framework lands → re-running the retrofitter detects it and updates the skill index. This is captured as part of sub-brief #3 (retrofitter); cron schedule + on-demand trigger surfaces both included.

## Context

Insight-205 (`docs/insights/205-battle-ready-project-onboarding.md`, 2026-04-25) names the broader frame:

> The harness does not stop at Ditto's boundary; it extends into every repo Ditto manages. Connecting a repo is not a metadata operation — it is a process. That process inspects, decides, and writes (with user approval) the substrate the project needs to be Ditto-driveable.

Today, project connection is hypothetical (the `projects` table is being added by Brief 223; before that, only `processes.projectId` exists as a loose-text placeholder). Before this work lands, "connecting a project" is a row-level concern — Ditto has no opinion about what a new repo *needs* to be Ditto-driveable. Each new project is a green-field onboarding that re-litigates the basics (what's the build command? what tests exist? what skills are pre-loaded? what tools are allowlisted? what's the user already taught past projects that should be inherited here?).

This brief is the parent design that absorbs Insight-205 into a structured plan. Its sub-briefs ship:
1. **Connection-as-process plumbing** — the `project-onboarding.yaml` system process + the `/projects/:slug/onboarding` review surface + the URL-paste form. This sub-brief depends on Brief 223 (the `projects` row to land against).
2. **In-depth analyser** — a `/dev-researcher`-shaped harness handler that produces the structured analysis report. Read-only on the repo; runner-agnostic per the BEFORE default.
3. **Retrofitter** — the `/dev-architect` + `/dev-builder`-shaped pass that writes `.ditto/` artefacts under the project's chosen runner. Depends on Brief 212 (for local-mac-mini dispatch), Brief 223 (for project + runnerConfig), Brief 200 (cross-reference for any artefact-projection patterns).
4. **Project memory scope + cross-project promotion UX** — extends `process`-scope filtering on `processes.projectId` (no schema enum growth per Brief 223's call) + a "promote to self-scope" UX. Designer activation flagged.

The brief uses Ditto's existing `/dev-*` role pipeline mapped onto a *project* instead of a *Ditto feature*: `/dev-researcher` does the analysis, `/dev-architect` produces the retrofit plan, `/dev-builder` executes the retrofit, `/dev-reviewer` audits, `/dev-documenter` records project memories. Insight-205 §Implications #2 names this — no new development roles needed. **Verified by grep against `.claude/commands/dev-*.md`:** the existing role contracts cover the analyser/retrofitter/reviewer/documenter passes without modification.

The retrofit's output landing IN the target repo at `.ditto/` (not in Ditto's DB) honours **two existing insights**: Insight-201 (user-facing legibility — the harness state is grep-able in the repo where the work happens), and Insight-202 (Ditto-as-X before external-X — Ditto provides the in-repo harness substrate without requiring the project to install Ditto code). The `.ditto/` directory shape needs an architectural decision; this brief reserves **ADR-043** (verified open by grep) for the decision and outlines the candidate shape in §Architectural Decisions Captured.

The trust-tier-bound retrofit depth is captured at the parent-brief level and threaded into sub-brief #3's ACs. Per Insight-205 §3:
- **Supervised:** Ditto proposes everything, user approves every file. The retrofit's `.ditto/` writes go through `/review/[token]` per-file.
- **Spot-checked:** Deterministic sample of additions reviewed (per ADR-007 sampling discipline).
- **Autonomous:** Ditto retrofits silently; user audits the diff after via the existing diff surface.
- **Critical:** Retrofit is rejected. Critical projects must hand-author their `.ditto/` substrate. (Same posture as `bridge.dispatch` in Brief 212 for critical-tier.)

## Objective

Decompose the battle-readiness onboarding into 4 sub-briefs along clean dependency seams; lock the parent-level architectural decisions (the `.ditto/` directory shape, the analyser-runs-when question, the retrofit dispatch path per runner, the memory scope extension); reserve sub-brief numbers for sequencing; and surface the ADR shape (`.ditto/` directory) for human approval — without writing the four sub-brief bodies in this session (that's Insight-004 splitting discipline).

## Non-Goals

- **NO sub-brief bodies in this session.** Per Insight-004, the parent brief sets the architecture and the seams; sub-briefs decompose in subsequent architect sessions. PM should claim sub-brief numbers at scheduling time per `feedback_grep_before_claiming_shared_namespace.md`.
- **NO `.ditto/` directory shape committed in detail beyond the ADR-043 outline below.** The detailed shape (file list, frontmatter conventions, role-contract template) is sub-brief #3's territory; this brief reserves the ADR number and names the architectural shape, not the file-level detail.
- **NO UX for the analyser report rendering.** This is Designer territory; flagged as a follow-on `/dev-designer` pass before sub-brief #2 builds. The brief specifies the *data shape* of the report (§Sub-brief #2) but not the rendering.
- **NO multi-user / team-scope retrofit.** Solo-user shape per pipeline-spec; multi-user `.ditto/` ownership is a future brief.
- **NO automated retrofit on schedule for autonomous-tier projects in MVP.** Re-run-on-schedule is captured as part of sub-brief #3, but only the on-demand path lands in the first MVP cycle; cron-driven re-run is a follow-on enhancement (called out in sub-brief #3's §Non-Goals when it's written).
- **NO `claude-code-routine` adapter wiring as part of THIS phase.** The current `src/adapters/cli.ts` is local-only by construction; the cloud-subprocess adapter for `claude-code-routine` is a separate infra brief (or it lands inside sub-brief #3 if the architect chooses to bundle). This brief's sub-brief #3 §Constraints calls it out as a dependency to resolve at sub-brief-write time, not at parent-brief time.
- **NO custom-domain deployment (separate ADR-041 reserved by Brief 209) interaction.** The `.ditto/` directory landing in the target repo's working tree is not a deployment concern; the retrofitter writes files in the cloned repo and commits them via the runner's normal commit path.
- **NO architecture.md amendment in this brief beyond the §L1 paragraph Brief 223 already reserves.** Parent-brief absorption into architecture.md happens after at least one sub-brief ships (Insight-205 absorption gate).
- **NO new memory scope_type values.** Per Brief 223 §Constraints + Reviewer-validation: extend `process`-scope filtering on `processes.projectId`; do NOT add `project` to `memoryScopeTypeValues`.
- **NO retrofit decisions for repos NOT cloned to Ditto's workspace volume.** The retrofitter operates on a clone (cloud-side or local via Brief 212); the user's "raw" git remote is never directly mutated except via the runner's commit+push path.

## Inputs

1. `docs/insights/205-battle-ready-project-onboarding.md` — load-bearing input. Cite, don't re-derive. Sub-brief decomposition is its §"Where it should land" mapped 1:1 onto sub-briefs #1-#4.
2. `docs/briefs/214-projects-schema-and-crud.md` — substrate; sub-brief #1 builds against the schema + APIs Brief 223 ships.
3. `docs/briefs/212-workspace-local-bridge.md` — bridge dispatch for `runner=local-mac-mini`; sub-brief #3 composes on top via `bridge.dispatch` + the `bridgeCliAdapter`.
4. `docs/insights/201-user-facing-legibility.md` — the legibility principle; `.ditto/` artefacts in the target repo IS the legibility seam at the project level. Sub-brief #3's `.ditto/` directory shape is application #2 of Insight-201 (Brief 199's memory projection is application #1).
5. `docs/insights/202-ditto-as-X-before-external-X.md` — relevant but the absorption claim is **conditional**, not automatic (per Reviewer challenge). Insight-202 is about *"Ditto-as-X before reaching for external X"* — Brief 200 (Ditto-as-git-server-instead-of-GitHub) is a clean application because GitHub IS the displaced external service. Sub-brief #3's `.ditto/` artefacts in target repo IS at a different seam, but the displaced external is more abstract: "Ditto-as-harness-vendor-instead-of-{Catalyst-package, vendor-shipped-`.cursorrules`-template, agentskills.io-package, npm-installable-AI-harness}". This **partially** satisfies Insight-202 — sub-brief #3 counts as **application #1.5**, not a clean #2. **Absorption gate:** Insight-202 requires a third unambiguous application before absorbing into architecture.md (e.g., a future Ditto-as-object-store-instead-of-S3 brief, or Ditto-as-search-instead-of-Algolia). Sub-brief #3 contributes evidence; it does not discharge the gate alone.
6. `docs/adrs/007-trust-earning.md` — trust-tier semantics that gate retrofit depth (sub-brief #3); confirms trust is earned, not configured (§"Conjunctive Upgrade / Disjunctive Downgrade").
7. `docs/adrs/003-memory-architecture.md` — memory scope discipline; `process` scope (with extension on `processes.projectId`) is the seam for project memory per Brief 223's call.
8. `docs/adrs/018-runtime-deployment.md` — Two-Track deployment context; this brief is Track-A primary, but `.ditto/` artefacts work identically on Track B (self-hosted) since they're target-repo-local.
9. `docs/dev-process.md` + `.claude/commands/dev-*.md` — confirms Insight-205's claim that existing roles map cleanly onto project onboarding (no new role definitions needed); verified at brief-write time.
10. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to retrofitter dispatches (every `.ditto/` write that goes through `bridge.dispatch` carries a `stepRunId`).
11. `docs/research/local-bridge.md` — research that informed Brief 212; sub-brief #3 will not re-research, just compose.
12. `packages/core/src/db/schema.ts:583-617` — the `workItems` table that sub-brief #2's analyser report writes to (as a `briefState='backlog'` item titled "Onboarding report for `<project-slug>`").
13. `packages/core/src/db/schema.ts:495-522` — `harnessDecisions` table; analyser + retrofitter both audit here.
14. `processes/onboarding.yaml` — existing **user**-onboarding system process. Project onboarding is a DIFFERENT process; sub-brief #1 creates `processes/project-onboarding.yaml` (different filename — verified no name collision).
15. `processes/project-orchestration.yaml` — existing daily project-intelligence meta-process. Project onboarding is a DIFFERENT process at a DIFFERENT trigger (event-driven on `project.connected`, not cron). Names do not collide.
16. `docs/landscape.md` §"Workspace Local Bridge" + §"User-Facing Legibility & File-Backed Storage" — building blocks for sub-brief #3's `.ditto/` write path.
17. `.context/attachments/pasted_text_2026-04-25_20-19-53.txt` — pipeline-spec; the `runner` enum semantics and trust-tier-as-earned posture are the binding boundaries.

## Constraints

- **Engine-first per CLAUDE.md, with sub-brief-level boundary calls.** This parent brief does NOT make engine-vs-product calls below the sub-brief level (each sub-brief makes its own); but at the phase level: any *primitive* that emerges from this work (e.g., the `OnboardingReport` type if structured, the `RetrofitPlan` type if structured) belongs in `packages/core/src/onboarding/`; any *Ditto opinion* (analyser prompts, retrofit templates, persona-fit logic) belongs in `src/engine/onboarding/`. Ask: "could ProcessOS use this?" — if yes, core; if no, src/engine.

- **Retrofit emits artefacts IN the target repo at `.ditto/`, NOT in Ditto's DB.** This is the load-bearing legibility decision (Insight-201 application #2). Ditto's DB tracks the *act* of retrofit (`harness_decisions` row, `processRuns` row) but the *substrate* lives in the target repo where the work happens. The retrofitter's commit message + diff IS the audit trail; the cloud-side `harness_decisions` row links to the SHA.

- **`.ditto/` directory shape needs an ADR-class decision — reserved as ADR-043** (verified open: ADR-040 is the latest committed; ADR-041 + ADR-042 are soft-reserved by Brief 209 / ADR-040 §Future Decisions for "user-chosen domain deployment" + "catalog extension model" — Brief 224 takes the next clearly-free number, ADR-043). The ADR's outline is captured in §Architectural Decisions Captured below; the full ADR is written when sub-brief #3 lands. Builder of sub-brief #3 owns the ADR draft; Reviewer signs off.

- **Trust-tier-bound retrofit depth.** Sub-brief #3 acceptance criteria MUST include trust-tier mapping per Insight-205 §3:
  - `supervised` → every `.ditto/` file write goes through `/review/[token]` per-file approval.
  - `spot_checked` → deterministic sampling per ADR-007's sampling-hash discipline; sampled files reviewed, others auto-approved.
  - `autonomous` → silent retrofit; user audits the diff after via the existing diff surface (`/admin/runs/[id]/diff` or equivalent — sub-brief #3 grep-verifies the path).
  - `critical` → retrofit rejected; the user must hand-author `.ditto/`.

- **Retrofitter dispatches MUST traverse the harness pipeline + `stepRunId` guard (Insight-180).** Per-runner dispatch path:
  - `runner=local-mac-mini` → `bridge.dispatch` (Brief 212's built-in tool); the existing tool resolver carries `stepRunId` automatically.
  - `runner=claude-code-routine` → cloud-side subprocess invoking `claude -p ...` via `src/adapters/cli.ts` (or a successor adapter that runs in cloud — sub-brief #3 resolves this); the adapter is wrapped in a harness handler that injects `stepRunId`.
  - `runner=github-action` → cloud-side GitHub PR generation via the existing GitHub integration; the integration call carries `stepRunId` per the integration broker's pattern.
  None of these paths are side channels; all traverse `harness_decisions` writes.

- **No drift on Brief 212's wire shape, trust-tier mapping, or audit destination.** The retrofitter (sub-brief #3) consumes `bridge.dispatch` exactly as Brief 212 ships it: discriminated-union by `kind`, `harness_decisions` audit row per dispatch, `pause / advance / sample_pause / sample_advance` trustAction enum. No new TrustAction values invented. No new audit table.

- **No drift on Brief 223's schema, FK relationships, or auth model.** The `projects.runner` field, `projects.runnerBearerHash`, the `workItems` extension (with `briefState`, `riskScore`, `linkedProcessRunId`), the `processes.projectId` real FK — sub-briefs of 215 consume these as they land in Brief 223; do not duplicate or re-shape.

- **Project memories scope discipline.** Per Brief 223's call, sub-brief #4 extends `process`-scope memory filtering on `processes.projectId`; does NOT add a new `memoryScopeTypeValues` enum value. Memory assembly: when loading process-scoped memories for a step run, the assembly function joins `memories.scopeId → processes.id → processes.projectId`, and (a) returns memories whose process belongs to the same project, plus (b) memories the user has explicitly promoted to self-scope (cross-project). Memory writes inherit the process's `projectId` via the same join.

- **Side-effecting function guard (Insight-180) — applies to all retrofit writes.** Every function in `src/engine/onboarding/retrofitter/` that emits a `.ditto/` file write requires `stepRunId` at function entry. The DB-spy assertion pattern from Brief 212 (AC #2, AC #4) applies: zero DB calls before the guard rejection.

- **Reference docs touched at parent-brief level** (Insight-043):
  - `docs/state.md` — architect checkpoint for this brief (§After Completion).
  - `docs/roadmap.md` — Project Onboarding & Battle-Readiness phase row (Brief 223 already adds the row; this brief annotates it with the four sub-brief seams).
  - `docs/dictionary.md` — three new terms reserved (`Battle-Readiness`, `Project Substrate`, `Retrofit`); entries land at sub-brief-build time, not parent time.
  - `docs/architecture.md` — NOT updated by this brief; absorption gate per Insight-205 + Insight-201 + Insight-202 (each requires shipped sub-briefs, not just designed parent).

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Connection-as-process framing | `docs/insights/205-battle-ready-project-onboarding.md` | adopt (canonical) | The insight is the load-bearing input; do not re-derive. |
| `.ditto/` directory in target repo | Insight-201 application #2 + Insight-202 application #2 | pattern (self-reuse) | Both insights converge on this shape; Brief 200's git server (Insight-202 application #1) and Brief 199's memory projection (Insight-201 application #1) are the precedents. |
| Existing `/dev-*` role pipeline mapped onto a project | `docs/dev-process.md` + `.claude/commands/dev-*.md` | depend (existing) | Insight-205 §2 names this; verified at brief-write time. No new role contracts needed. |
| Trust-tier-bound retrofit depth | `docs/adrs/007-trust-earning.md` + Insight-205 §3 | depend (existing) | ADR-007 §"Conjunctive Upgrade / Disjunctive Downgrade" + Insight-205's tier-mapping table. No new trust semantics. |
| Per-runner dispatch path | Brief 212 (`bridge.dispatch`), `src/adapters/cli.ts` (claude-code-routine), GitHub integration (github-action) | depend (existing) | Each runner already has a dispatch primitive in the codebase; sub-brief #3 composes them. |
| `stepRunId` guard on retrofit writes | `docs/insights/180-steprun-guard-for-side-effecting-functions.md` | depend (existing) | Insight-180 is the authoritative guard discipline; Brief 212 demonstrates the pattern. |
| Project memory scope as join through `processes.projectId` | ADR-003 + Brief 223 §Constraints | pattern (self-reuse) | Avoids enum sprawl; preserves Brief 223's call. |
| Cross-project memory promotion UX | Original to Ditto | original | No prior pattern; Designer pass owed before sub-brief #4 builds. |
| Re-runnable retrofit machinery | Insight-205 §7 ("retrofits compose") | adopt | Insight directly names this; sub-brief #3 surfaces it as schedule + on-demand. |

## Sub-Brief Decomposition

The four sub-briefs decompose along the seams Insight-205 §"Where it should land" already names. Each ships independently; each has its own ACs, Reviewer pass, and approval gate. **Sub-brief numbers are NOT pre-reserved here** (per Insight-200 + `feedback_grep_before_claiming_shared_namespace.md`); PM claims numbers at sub-brief scheduling time. The architect of each sub-brief grep-verifies the next-free number.

### Sub-brief #1 — Connection-as-process plumbing

**One-line scope:** The user pastes a repo URL → a `project-onboarding.yaml` system process kicks off → analyser runs (sub-brief #2) + retrofitter runs (sub-brief #3) under the user's chosen runner → `projects.status` flips to `'active'` when complete. Review surface lives at `/projects/:slug/onboarding`.

**Seam dependency:** Brief 223 (substrate). NO dependency on sub-briefs #2/#3 at the *plumbing* level — the plumbing ships the process orchestration with placeholder analyser+retrofitter handlers; #2 and #3 fill in the handlers as they land. **User-facing-surface gating (Reviewer Important #3):** the `/projects/new` URL-paste form + `/projects/:slug/onboarding` review surface MUST be feature-flagged behind `featureFlag.projectOnboardingReady` until at least sub-brief #2 (analyser) ships. Empty/dummy reports rendered at the user-acquisition surface are worse than no surface — Insight-205 §6 names this as the "first contact demonstrates value" moment. Sub-brief #1 ships the plumbing; the flag flips to `true` when #2's analyser handler lands.

**Estimated scope:** ~10-12 ACs covering: the `project-onboarding.yaml` definition; the URL-paste form (`/projects/new` or `POST /api/v1/projects` extended with `kickOffOnboarding: true`); the `/projects/:slug/onboarding` review surface (gated by feature flag); the schema for the `projectOnboardingRuns` (or reuse of `processRuns` keyed on the process); the analyser-before-or-after-runner flow per the §Open Question's resolution; the feature-flag mechanism if not already present in the codebase (grep `featureFlag` to verify).

**Engine scope:** product (the onboarding YAML + the review surface are Ditto opinions; the `processRuns` table is shared core).

### Sub-brief #2 — In-depth analyser

**One-line scope:** A `/dev-researcher`-shaped harness handler that produces a structured report on the target repo: build system, test framework, CI status, existing harness/skills/tools, persona-fit assessment, gold-standard cross-references, runner+tier recommendations.

**Seam dependency:** Brief 223 (the `projects.id` to attach the report to). Optionally Brief 200 (if the analyser uses the workspace git server to clone) — but more likely the analyser uses a Ditto-side ad-hoc clone via `simple-git` or `isomorphic-git` (already in landscape.md per Brief 200's research). Read-only; runner-agnostic.

**Estimated scope:** ~12-14 ACs covering: clone-and-analyse handler; build-system detection (package.json / Cargo.toml / pyproject.toml / Gemfile / etc. — minimum viable detector list); test-framework detection (vitest / jest / pytest / RSpec / etc.); CI status (.github/workflows / .gitlab-ci.yml / .circleci/); existing-harness detection (`.claude/`, `.cursorrules`, `AGENTS.md`, `.catalyst/`, `.ditto/`); persona-fit scoring; gold-standard nearest-neighbour from `docs/landscape.md` corpus; structured report write to `harness_decisions.reviewDetails` + `workItems` row; the `/projects/:slug/onboarding` rendering of the report (Designer activation flagged here).

**Engine scope:** product (the analyser logic is Ditto-specific — uses Ditto's persona model, Ditto's landscape corpus, Ditto's runner taxonomy). Some primitive types (`AnalysisReport`, `BuildSystem`, `TestFramework`) may go in core if they prove portable; sub-brief architect decides.

**Designer activation:** YES — invoke `/dev-designer` before this sub-brief's body is written. The analyser report's rendering is a discoverability + trust-earning surface (Insight-205 §6: *"primary user-acquisition surface"*) — the UX needs intentional design, not a default form-field render. Designer outputs a `analyser-report-ux.md` interaction spec. **Designer pass should also cover sub-brief #1's URL-paste form** (Reviewer Minor #8) — empty/loading/error/success states; "now we're cloning, then analysing, then proposing" timeline UX; runner-picker timing per §Open Question's BEFORE/AFTER resolution. The two-sub-brief Designer pass can land in one combined `analyser-report-and-onboarding-flow-ux.md` spec.

### Sub-brief #3 — Retrofitter

**One-line scope:** A `/dev-architect` + `/dev-builder`-shaped pass that writes `.ditto/` artefacts (role contracts, skill index, tool allowlist, project-specific guidance) INTO the target repo under the project's chosen runner. Trust-tier-bound depth. Re-runnable.

**Seam dependency:** Brief 212 (for `runner=local-mac-mini` dispatch via `bridge.dispatch`). Brief 223 (for `projects.runner` + `runnerConfig`). Sub-brief #2 (the analysis report seeds the retrofit plan). **A SIBLING sub-brief on the cloud-subprocess `claude-code-routine` adapter is a hard dependency** (Reviewer Important #4) — sub-brief #3 cannot ship the per-runner dispatch ACs covering `claude-code-routine` without that adapter. Two paths the parent brief commits to (architect of sub-brief #3 picks one BEFORE writing the body, NOT during the body):
- **Path A (split):** the cloud-subprocess adapter ships as **sub-brief #3a** (estimated ~8-10 ACs, isolated infra primitive); sub-brief #3 (the retrofitter proper) depends on it. Total: 5 sub-briefs in this phase.
- **Path B (bundle):** the cloud-subprocess adapter ships INSIDE sub-brief #3, pushing it past 17 ACs and forcing a per-runner split (3a = local-mac-mini retrofitter, 3b = claude-code-routine adapter + retrofitter, 3c = github-action retrofitter). Total: 6 sub-briefs.
- **Architect default for parent brief:** Path A. Cleaner seam; isolated adapter brief is independently buildable; retrofitter brief consumes it. Path B reserved if architect at sub-brief-write time finds Path A's seam awkward (e.g., the adapter shape is so retrofitter-specific that splitting is artificial).
Brief 200 cross-referenced for any artefact-projection primitive reuse.

**Estimated scope (assuming Path A):** ~14-17 ACs. Covers: `.ditto/` directory shape (ADR-043 written here); retrofit-plan generator from analyser report; per-runner dispatch (local-mac-mini / claude-code-routine / github-action); trust-tier-bound depth (4 modes); commit + push via runner; re-run-on-demand surface; harness_decisions audit per dispatch; `stepRunId` guard at every retrofit write entry. **Trust-tier mapping detail (Reviewer Important #5):** spot_checked tier uses ADR-007's existing `samplingHash` discipline + `sample_pause`/`sample_advance` TrustAction values verbatim (verified at `packages/core/src/db/schema.ts:113-114`); supervised → existing `pause`; autonomous → existing `advance`; critical → tool-resolver-rejection (matching Brief 212 §Constraints line 86). **NO new TrustAction enum values introduced.** Sub-brief #3 inherits Brief 212's trust-gate semantics verbatim.

**Engine scope:** product (retrofit logic is Ditto-specific). Some primitive types (`RetrofitPlan`, `DittoDirectoryShape`) may go in core; architect decides.

**Designer activation:** OPTIONAL by default — the retrofit's review surface is the existing `/review/[token]` page (Brief 211's stomp fix preserves it); per-runner UX is mostly text + diff. **Explicit escalation trigger (Reviewer Minor #9):** if sub-brief #3's supervised-tier per-file approval flow exceeds N=5 files in the median project (likely true given the `.ditto/` outline at §Architectural Decisions Captured — 4 directories + 2 files at minimum, so likely 6-10 files for an autonomous retrofit), escalate Designer at sub-brief-architect time. Bulk-approve, batched-diff, or per-file-with-clear-progress UX patterns are within scope of Designer's pass.

### Sub-brief #4 — Project memory scope + cross-project promotion UX

**One-line scope:** Extend `process`-scope memory filtering to honour `processes.projectId`; add a "promote to self-scope" UX that lifts a project-scoped memory to cross-project applicability; memory writes inherit the process's `projectId`.

**Seam dependency:** Brief 223 (the `processes.projectId` real FK). Brief 199 (if shipped — the memory projection brief; cross-references the projection format if a project-scoped section is added). No hard dependency on sub-briefs #1/#2/#3.

**Estimated scope:** ~10-13 ACs covering: memory-assembly join through `processes.projectId` — **NOTE the surgery scope (Reviewer Important #6): the existing `src/engine/harness-handlers/memory-assembly.ts` has TWO `process`-scope read sites** (verified by reviewer at lines 143 + 283 of that file at the time of brief-write); both convert from `eq(memories.scopeId, processRun.processId)` to a join query through `processes.projectId`; `HarnessContext` extends with a `projectId` field (derived at handler entry from `processes.projectId`); existing call sites of memory-assembly are updated to populate `HarnessContext.projectId`. Plus: cross-project filter at retrieval time; "promote to self-scope" tool/UX; memory-write inheritance of `projectId`; existing memory backfill (a one-time migration that nullifies `projectId`-scope filtering for memories whose source process had a NULL `projectId` — pre-project-era memories remain visible across all projects, intentionally; no automated guess at which project they belong to).

**Engine scope:** mostly core (memory-scope filtering is a primitive — ProcessOS could use it). The promotion UX is product. Split per file: assembly logic in core, UX in product.

**Designer activation:** YES — invoke `/dev-designer` before this sub-brief's body is written. The cross-project promotion UX has trust-architecture implications (a memory promoted from `agent-crm` scope to self-scope now applies to `ditto` too — the user must understand the blast radius). Designer outputs a `memory-cross-project-promotion-ux.md` interaction spec.

## Architectural Decisions Captured

### `.ditto/` Directory Shape (ADR-043, deferred to sub-brief #3)

The full ADR is written when sub-brief #3 lands. **Outline reserved here:**

- **Title:** Project Substrate via `.ditto/` Directory in Target Repo
- **Status (when written):** proposed → accepted upon sub-brief #3 merge
- **Decision:** Ditto-driven projects carry their harness substrate in a `.ditto/` directory at the target repo root (sibling to `.git/`, `.github/`, `.claude/`, etc. — naming convention follows the established hidden-config-directory pattern).
- **Candidate file structure** (sub-brief #3 finalises):
  - `.ditto/role-contracts/` — markdown files for each `/dev-*` role customised to this project
  - `.ditto/skills.json` — skill index (the project's available skills, version-locked)
  - `.ditto/tools.json` — tool allowlist (which built-in tools may run; any per-project denylist)
  - `.ditto/guidance.md` — project-specific guidance for agents (build commands, test commands, branch naming conventions, "things that have surprised past contributors")
  - `.ditto/onboarding-report.md` — the human-readable analyser report (also written to `harness_decisions` for audit; the file is for grep-ability + git-trackability per Insight-201)
  - `.ditto/.gitignore` — guidance for what NOT to commit (e.g., per-developer overrides if introduced)
- **Why `.ditto/` and not `.catalyst/` (Brief 223 supports `harnessType='catalyst'` via different convention):** Catalyst is a *competing* harness shape with its own conventions (`catalyst/briefs/` per pipeline-spec §1); `.ditto/` is for projects opting INTO Ditto-driven onboarding. A project may have both `.catalyst/` AND `.ditto/` if it uses Catalyst for briefs but Ditto for the harness substrate (analyser report, role contracts) — the two are not exclusive.
- **Versioning:** `.ditto/version.txt` carries the schema version of the directory shape; future ADRs revising the shape bump the version and ship a migrator.
- **Re-run discipline:** Re-running the retrofitter against an existing `.ditto/` directory diffs each file and produces a new commit per file (or per group, sub-brief #3 finalises). The user reviews the diff per trust tier.

### Project Memory Scope as `process`-extension via `projectId` Join (sub-brief #4)

- **Decision:** Add NO new `memoryScopeTypeValues` value. Extend the existing `process`-scope filtering at memory-assembly time to honour `processes.projectId` via a join: `memories.scopeId → processes.id → processes.projectId`.
- **Implementation seam:** The memory-assembly function (`packages/core/src/memory/assembly.ts` or wherever it lives — sub-brief #4 grep-verifies) gains a `projectId` parameter; when set, it filters the loaded memories to those whose process belongs to the same project, plus self-scoped memories the user has explicitly promoted.
- **Backfill:** Existing memories that lack a `projectId` (because their process had a NULL `projectId`) remain visible across all projects — they are pre-project-era memories. The user can manually mark them per-project after Brief 223 + sub-brief #4 ship; no automated backfill (intentional — automated guesses would be wrong).
- **No schema change in this seam.** The schema change was already made in Brief 223 (`processes.projectId` is now a real FK).

### Analyser-Before-or-After-Runner (DEFERRED — §Open Question for the human)

See top-of-brief §Open Question. The architectural decision is parametric on the human's answer; this brief records the choice point but does not foreclose it.

## What Changes (Work Products) — at parent brief level

| File | Action |
|------|--------|
| `docs/briefs/215-project-onboarding-and-battle-readiness.md` | **This brief.** |
| `docs/state.md` | **Modify:** architect checkpoint for both Brief 223 + Brief 224 (this brief) — combined entry per the architect-checkpoint convention. |
| `docs/roadmap.md` | **Modify (light):** annotate the "Project Onboarding & Battle-Readiness" phase row (Brief 223 adds the row; this brief annotates with the four sub-brief seams). |
| `docs/dictionary.md` | **Reserved (no edit yet):** entries for `Battle-Readiness`, `Project Substrate`, `Retrofit` land at sub-brief-build time. |
| `docs/adrs/043-<slug>.md` | **Reserved (no file yet):** sub-brief #3 builder authors when retrofit lands. ADR number reserved per ADR-040 §Future Decisions precedent. |
| (no new code, no new processes, no new schema) | Parent brief is design-only. |

## User Experience

- **Jobs affected (across the four sub-briefs):**
  - **Define** (sub-brief #1) — the user defines a project explicitly: "this repo is now in scope for Ditto."
  - **Review** (sub-brief #2) — the user reviews the analyser report at `/projects/:slug/onboarding`.
  - **Decide** (sub-brief #3) — the user decides whether to approve the retrofit plan (per trust tier).
  - **Capture** (sub-brief #2 + #4) — the analyser captures project context as memories; the cross-project promotion UX is itself a Capture moment.
  - **Delegate** (sub-brief #3) — the retrofit is the user delegating "make this project battle-ready" to Ditto.
- **Primitives involved (across the four sub-briefs):** the existing `/review/[token]` surface (sub-brief #1 + #3); a NEW `/projects/:slug/onboarding` page rendering the analyser report (sub-brief #2; Designer pass owed); a NEW memory-detail surface "promote to self-scope" affordance (sub-brief #4; Designer pass owed).
- **Process-owner perspective:** "Connection should feel like first contact — Ditto demonstrates what it can see about my project, then asks me how much rein it has." Insight-205 §6 captures this: the analyser report turns connection from "dead form" into "primary user-acquisition surface."
- **Interaction states:** sub-brief #1 + #2 + #4 all need empty / loading / error / success / partial states explicitly. Designer pass on each.
- **Designer input:** flagged for sub-brief #2 (analyser report rendering) + sub-brief #4 (cross-project memory promotion). Sub-brief #1 + #3 default to skipping Designer; can escalate at sub-brief-architect time.

## Acceptance Criteria

This is a parent brief; per Insight-004, parent briefs ship phase-level architectural decisions, not implementation ACs. **Parent-level ACs below are architectural assertions** (the decomposition is correct; the seams are dependency-clean; the ADR namespace is reserved without collision; trust-tier mapping doesn't invent enum values; etc.) — NOT boolean smoke tests. Boolean smoke tests live in each sub-brief. The four sub-briefs each have their own ACs at their own architect-write time. **Parent-level ACs are limited to:**

1. [ ] **Sub-brief decomposition is unambiguous and consumable by future architects.** Each of the four sub-briefs (§Sub-Brief Decomposition above) names: scope, seam dependency, estimated AC count, engine scope, Designer activation. Future architect can pick any sub-brief and write its body without re-deriving the parent design.

2. [ ] **The §Open Question is surfaced for the human BEFORE sub-brief #1's body is written.** Sub-brief #1's architect re-checks `docs/state.md` for the human's answer; if no answer is recorded, the architect surfaces the question again before writing.

3. [ ] **ADR-043 number is reserved by this brief and visible in `docs/state.md` checkpoint.** The reservation is recorded per `feedback_grep_before_claiming_shared_namespace.md` discipline; sub-brief #3 builder authors the ADR body.

4. [ ] **`docs/roadmap.md` Project Onboarding & Battle-Readiness phase row is annotated** with the four sub-brief seams + the named dependencies on Brief 212 + Brief 223.

5. [ ] **No new memory scope_type value introduced.** The architectural decision is captured (§Architectural Decisions Captured / Project Memory Scope) — sub-brief #4 implements the join, not the enum.

6. [ ] **Trust-tier-bound retrofit depth is captured at parent level** (§Constraints / Trust-tier mapping). Sub-brief #3 inherits this as ACs verbatim; no re-litigation.

7. [ ] **Per-runner dispatch path is named at parent level** (§Constraints / Retrofitter dispatches). Sub-brief #3 inherits this as ACs verbatim.

8. [ ] **Insight-205 absorption checkpoint:** this parent brief IS the absorption of Insight-205 into a structured plan. Insight-205 stays `active` until at least sub-brief #1 or #2 ships (per Insight-205's own absorption criterion). After the first sub-brief ships, Insight-205 absorbs into `docs/architecture.md` §L1 Process Layer (a one-paragraph addition naming "connecting a project is itself a process") + this parent brief becomes the historical reference.

9a. [ ] **Insight-201 absorption tracker** updated. Insight-201's absorption criterion (two independent briefs apply the principle and ship): Brief 199 = application #1 (memory projection on Ditto's workspace-internal seam), sub-brief #3 of THIS brief = application #2 (`.ditto/` artefacts on the target-repo-side seam — a different seam). When sub-brief #3 ships, Insight-201 absorbs into `docs/architecture.md` §Layer 6.

9b. [ ] **Insight-202 absorption tracker** updated — but ABSORPTION GATE NOT YET DISCHARGED (Reviewer Critical #2). Insight-202's criterion: two unambiguous applications of "Ditto-as-X before reaching for external X." Brief 200 (Ditto-as-git-server-instead-of-GitHub) is a clean application #1; sub-brief #3's `.ditto/` artefacts in target repo are application #1.5 — sub-brief #3 displaces a fuzzier external category ("vendor-shipped harness packages: Catalyst, agentskills.io packages, vendor-shipped `.cursorrules` templates"), not a single named external service. Sub-brief #3 contributes evidence; full absorption awaits a third unambiguous application (e.g., a future Ditto-as-object-store, Ditto-as-search, Ditto-as-OAuth-broker brief). When sub-brief #3 ships, Insight-202 stays `active`; full absorption into `docs/architecture.md` §Cross-Cutting Governance defers to the third application.

10. [ ] **Designer activation map (post-Reviewer revision):** sub-brief #2 (analyser report rendering) — MANDATORY. Sub-brief #1 (URL-paste form + onboarding flow ordering) — MANDATORY (Reviewer Minor #8 escalation; flow on the primary acquisition surface). Sub-brief #4 (cross-project memory promotion) — MANDATORY (trust-architecture implications). Sub-brief #3 (retrofitter) — DEFAULT SKIP, with explicit escalation trigger when supervised-tier per-file approval flow exceeds 5 files in median project (likely true; escalate at sub-brief-architect time per Reviewer Minor #9). The Designer pass for sub-briefs #1 + #2 may combine into one `analyser-report-and-onboarding-flow-ux.md` spec.

11. [ ] **Parent brief does NOT pre-reserve sub-brief numbers.** Per `feedback_grep_before_claiming_shared_namespace.md` and Insight-200's hygiene rule, sub-brief numbers are claimed at scheduling time by the future architect. The four sub-briefs are referenced positionally (#1, #2, #3, #4) in this parent brief.

12. [ ] **Existing `/dev-*` role contracts are confirmed adequate** (no new role contracts needed). Verified at brief-write time via grep: `/dev-researcher`, `/dev-architect`, `/dev-builder`, `/dev-reviewer`, `/dev-documenter` cover the analyser/retrofit/audit/memory passes without modification.

## Review Process

1. Spawn fresh-context Reviewer agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief
2. Reviewer specifically checks:
   - Insight-205's frame is absorbed faithfully (no re-derivation, no scope drift)
   - The §Open Question is genuinely open — the architect's BEFORE-default is *defaulted* not *decided*; the AFTER path is preserved structurally
   - The four sub-brief seams are dependency-clean (e.g., sub-brief #4 does NOT secretly depend on #3; sub-brief #1 plumbing ships with placeholder handlers so #2 + #3 can land independently)
   - The ADR-043 reservation does not collide with existing ADR numbers (verified by grep at brief-write time; Reviewer re-verifies)
   - The trust-tier-bound retrofit depth maps cleanly to ADR-007 (no new TrustAction enum values invented)
   - The per-runner dispatch path honours Brief 212's wire shape AND Insight-180's stepRunId guard
   - The project-memory-as-process-scope-extension preserves Brief 223's call (no new memoryScopeTypeValues value)
   - Insight-201 + Insight-202 absorption tracking is honest (sub-brief #3 IS application #2 of both — verified by reading the insights' absorption criteria)
   - Insight-004 size discipline: this is a parent brief; the 12 phase-level ACs are appropriate scope; sub-brief AC counts (10-17 each) are stated estimates, not commitments
   - The `.ditto/` directory shape (§Architectural Decisions Captured) is outline-only at parent level and defers detailed file-list to sub-brief #3
3. Present brief + review findings to human for approval

## Smoke Test

Parent briefs do not have a runtime smoke test (nothing executes from a parent brief). The smoke test for this brief is **legibility**: a future architect picking up sub-brief #1 should be able to write its body without re-reading Insight-205 or this parent brief from scratch. Verification:

```bash
# A future architect should answer "yes" to all of the following:
# 1. Can I tell from §Sub-Brief Decomposition what sub-brief #1 ships, in <60 seconds?
# 2. Is the §Open Question resolved (or am I being told to re-surface it)?
# 3. Do I know the seam dependencies — what must be merged before this sub-brief builds?
# 4. Do I know the engine-vs-product split for the sub-brief?
# 5. Do I know whether Designer is activated for this sub-brief?
# 6. Do I know what NOT to ship (Non-Goals at the parent level constrain the sub-brief)?
```

If any answer is "no," the parent brief failed the legibility smoke test and needs revision.

## After Completion

1. Update `docs/state.md` with what changed (parent brief, sub-brief decomposition, ADR-043 reservation, §Open Question surfaced)
2. Update `docs/roadmap.md` Project Onboarding & Battle-Readiness phase row (annotated with four sub-brief seams)
3. Phase retrospective: did the BEFORE-default for the analyser hold up against the human's response, or did the user pick AFTER? If AFTER, capture as an insight ("user-onboarding flows benefit from explicit-runner-pre-flight"); if BEFORE, the rationale already in this brief is sufficient.
4. ADR check: ADR-043 deferred to sub-brief #3. No ADR written this session.

---

## Reviewer Pass Summary (2026-04-25)

Fresh-context Reviewer ran with `docs/architecture.md` + `docs/review-checklist.md` + this brief + Insight-205 + Insight-201 + Insight-202 + Insight-180 + ADR-007 + Brief 223 + Brief 212 + `.claude/commands/dev-{researcher,architect,builder}.md` + ADR-041/042 namespace check + `processes/onboarding.yaml` + `packages/core/src/db/schema.ts:126` as inputs. **Verdict: PASS WITH FLAGS.** All CRITICAL findings (2) and IMPORTANT findings (5) fixed in-session before promotion to `Status: ready`. MINOR findings (6): all 6 incorporated or verified-without-action.

- **CRITICAL fixes applied:**
  - **C1 — `projects.runner` nullability cross-brief dependency:** Brief 223 was amended in this same session (the architect updated Brief 223 §What Changes table + AC #1) to make `runner` and `runnerConfig` DB-level nullable with handler-level invariant ("PATCH to `status='active'` while `runner` or `runnerConfig` is NULL returns 400"). The `projectStatusValues` enum gains a `"analysing"` value beyond pipeline-spec § for Brief 224 §Open Question's BEFORE flow. Brief 224 §Open Question prose updated to cite the cross-brief amendment explicitly.
  - **C2 — Insight-202 absorption claim downgraded from #2 to #1.5:** sub-brief #3 displaces a fuzzy external category (vendor-shipped harness packages) not a clean single external service like Brief 200's GitHub displacement; absorption gate not yet discharged; awaits a third unambiguous application. AC #9 split into 9a (Insight-201, sound) and 9b (Insight-202, contested + gated).
- **IMPORTANT fixes applied:**
  - **I3 — Sub-brief #1 placeholder-handler seam:** added explicit `featureFlag.projectOnboardingReady` gating; user-acquisition surface hidden until at least sub-brief #2's analyser handler ships. "First contact demonstrates value" preserved.
  - **I4 — `claude-code-routine` adapter dependency made explicit:** parent brief now commits to **Path A default** (sibling sub-brief #3a for the cloud-subprocess adapter ahead of sub-brief #3 retrofitter); Path B (bundle into #3) reserved if Path A's seam proves artificial. Architect of sub-brief #3 picks at sub-brief-architect time, BEFORE writing body.
  - **I5 — Trust-tier mapping cross-reference:** sub-brief #3 estimated-scope now states verbatim that NO new TrustAction enum values are introduced; cross-references Brief 212 §Constraints line 86 + ADR-007's `samplingHash` discipline. Reviewer's Insight-180-style guard verification preserved.
  - **I6 — Memory-assembly surgery scope:** sub-brief #4 estimated-scope expanded to name the two existing call sites (memory-assembly.ts:143 + 283), the `eq → join` surgery, the `HarnessContext.projectId` extension, and the existing-call-sites update. The architectural work is not re-architecture but is real work — now visible.
  - **I7 — AC #9 split into #9a + #9b:** Insight-201 absorption sound (different seam); Insight-202 absorption gated (third application required).
- **MINOR fixes applied:**
  - **M8 — Designer activation flipped for sub-brief #1:** primary acquisition surface deserves Designer; combined with sub-brief #2's Designer pass into one spec.
  - **M9 — Sub-brief #3 supervised-tier escalation trigger:** explicit ">5 files in median project" trigger.
  - **M10 — Parent-brief AC framing as "architectural assertions":** explicit note added at top of §Acceptance Criteria.
  - **M11/M12/M13 — name-collision, ADR-043, memoryScopeTypeValues claims:** all verified by reviewer; no action needed.
- **§Coverage check vs Insight-205 §Implications:** All 7 implications mapped to sub-briefs; the only gap (#6 user-acquisition surface) was sub-brief #1 lacking Designer flag — fixed in M8.
- **Reviewer's independent take on §Open Question:** BEFORE (matches architect default). The AFTER rationale was not strawman; the architect's BEFORE default holds with the new structural support from Brief 223's nullable `runner` amendment.
- **Reviewer's independent take on Designer activation:** matches the post-revision map (sub-briefs #1, #2, #4 mandatory; #3 default-skip with escalation trigger).

