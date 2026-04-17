# Brief 188: Cross-Brief Autopilot — Drain-Queue + Autobuild Adapted to Ditto

**Date:** 2026-04-17
**Status:** draft
**Depends on:** Existing dev-role pipeline (`/dev-pm`, `/dev-architect`, `/dev-builder`, `/dev-reviewer`, `/dev-documenter`); existing `/dev-review` skill at `.catalyst/skills/dev-review/` (already installed identically to Catalyst source). No Brief NNN dependencies — the dev-role pipeline is the substrate, not a brief.
**Unlocks:** Hands-off execution of the `Status: ready` brief queue. Human stays on planning + merge-time taste; dispatch between roles becomes machine work. Enables N parallel Conductor workspaces to drain the queue concurrently. Non-recursive prerequisite for Brief 181 (Recursive Self-Improvement).

## Goal

- **Roadmap phase:** Dev-process / meta — not a Phase X capability. This brief upgrades the Ditto dev pipeline itself (the way every other brief gets built), so it pays back across the rest of the roadmap.
- **Capabilities:** Two new skills (`/drain-queue`, `/autobuild`) that automate the dispatch loop sitting on top of Ditto's existing `/dev-*` roles. `/dev-review` is already installed (Catalyst-source-identical) and is patched in this brief for Ditto's `pnpm run type-check` script name and `origin/main` base ref.

## Context

Today, building a brief requires the human to dispatch through several role invocations: `/dev-pm` to pick what's next, `/dev-architect` (when needed) to refine, `/dev-builder` to implement, `/dev-reviewer` for the architecture checklist, `/dev-review` (the exhaustive bug-pass), then PR mechanics (commit, push, `gh pr create`, brief status update). For 100+ briefs in `docs/briefs/`, this dispatch overhead dominates the human's day even though every step is mechanical.

Catalyst (a sibling project at `/Users/thg/conductor/workspaces/agent-crm/kyoto`) ships three skills that solve exactly this problem in its own conventions:

- `/dev-review` — five-pass exhaustive audit of changed files (already installed here, identical content)
- `/autobuild` — within-brief autopilot: implement → verify → self-review → push → PR → mark `_review-`
- `/drain-queue` — cross-brief autopilot: claim oldest eligible `approved-` brief via atomic git push to a shared base branch (the mutex), run `/autobuild`, recursively run `/dev-review --fix` up to 3 passes, then move on

The intent transfers cleanly to Ditto. The mechanics do not — Catalyst encodes brief state in **filename prefixes** (`approved-`, `active-`, `_review-`, `_blocked-`) on a shared `project/agentcrm-app-dev` integration branch, while Ditto encodes brief state in **markdown bold-prefix lines** at the top of each brief file (`**Status:** ready | in_progress | complete`) on numbered briefs in `docs/briefs/` with `main` as the integration branch. **There is no YAML frontmatter — there are no `---` delimiters.** A bold-line edit is text, but it is still a content-only file change, and git's non-fast-forward push rejection still produces an atomic compare-and-swap on the file's content.

## Objective

Two new skills (`/drain-queue`, `/autobuild`) at `.catalyst/skills/` and pointer files at `.claude/skills/`, adapted to Ditto's brief model. Running `/drain-queue all` walks away with the human; the human returns to a stack of open PRs, each already self-reviewed, each landed under one of Ditto's existing role contracts. Merge remains the human gate.

## Non-Goals

- Not auto-merge. PR merge stays the human taste gate.
- Not auto-promotion of `Status: draft` → `Status: ready`. That's `/dev-pm`'s job (and ultimately a human one). `/drain-queue` only operates on briefs already marked `ready`.
- Not a rewrite of any `/dev-*` role. `/autobuild` orchestrates `/dev-builder`, `/dev-reviewer`, and `/dev-review` rather than re-implementing their contracts. Whatever those roles MUST do, the autopilot inherits.
- Not autonomous database migrations. Any brief whose §What Changes table touches `drizzle/migrations/`, `drizzle/meta/_journal.json`, `packages/core/src/db/schema/`, or `src/db/schema/` is rejected pre-flight by `/autobuild`.
- Not a replacement for `/dev-review` (the exhaustive bug audit) — it stays installed; gets called by `/autobuild`'s self-review step and by `/drain-queue`'s recursive `--fix` pass.
- Not a replacement for `/dev-reviewer` (the architecture-checklist review) — `/autobuild` invokes it as a separate fresh-context subagent, because the two reviewers catch different classes of issue.
- Not a Catalyst-shape conversion of Ditto's brief directory. `docs/briefs/` and the numeric naming convention stay; only the `**Status:**` bold-line and a new optional `**PR:**` bold-line are mutated.
- Not a freeform parser of `**Depends on:**` prose. Only `Brief NNN` references are extracted; ADR/Phase/infrastructure references are informational and not enforced (see §Constraints).

## Inputs

What to read before starting:

1. `/Users/thg/conductor/workspaces/agent-crm/kyoto/.catalyst/skills/drain-queue/SKILL.md` — source skill to adapt; understand the atomic-push mutex, the per-iteration loop A→F, the recursive `--fix` pass with 3-attempt cap and non-convergence guard, and the concurrency model
2. `/Users/thg/conductor/workspaces/agent-crm/kyoto/.catalyst/skills/autobuild/SKILL.md` — source skill to adapt; understand the 9-step pipeline, the gstack-style "cognitive gearing via artifact handoff" pattern, and the failure-mode table
3. `.catalyst/skills/dev-review/SKILL.md` and `.catalyst/skills/dev-review/references/dev-review-checklist.md` — already installed; the 5-pass audit `/autobuild` and `/drain-queue` will call (must be patched per §What Changes)
4. `CLAUDE.md` — Ditto conventions; especially §Engine Core boundary (so `/autobuild` calling `/dev-builder` inherits the engine-first rule), §How Work Gets Done, §Critical separation, and §Conventions (pnpm, TypeScript strict, drizzle migration journal handling per Insight-190)
5. `docs/briefs/000-template.md` — the Ditto brief shape; pay attention to how `**Status:**` and `**Depends on:**` are written as markdown bold lines, NOT YAML frontmatter
6. `.claude/commands/dev-builder.md` — the role contract `/autobuild` invokes for Implement+Verify; pay attention to lines 81-86 (full required script set: `type-check`, `test`, `test:e2e`, `test:e2e:auto`, smoke test) and the engine-first MUST list
7. `.claude/commands/dev-reviewer.md` — the role contract `/autobuild` spawns as a fresh subagent for the 12-point architecture review
8. `docs/state.md` — current state to ensure no `Status: in_progress` briefs are orphaned before first run; if any exist, run a one-shot GC pass manually before installing
9. `docs/insights/` — at minimum: `017-security-is-architectural-not-a-role.md` (security is architectural), `043-knowledge-maintenance-at-point-of-contact.md` (Builder flags / Architect fixes; Reference docs line required), `180-spike-test-every-new-api.md` (spike-test new external APIs), `180-steprun-guard-for-side-effecting-functions.md` (stepRunId guard), `190-migration-journal-concurrency.md` (Drizzle journal hard-stop). Also `docs/insights/archived/004-brief-sizing.md` (brief sizing — archived but still applicable as design guidance) and `docs/insights/archived/038-testing-is-a-quality-dimension-not-always-a-role.md` (Builder owns smoke-test execution — archived but still applicable as the smoke-test ownership rule).
10. `AGENTS.md` — the existing Catalyst-bridging file already in this repo

## Constraints

### Brief-state model (this is the load-bearing change vs Catalyst)

- **Brief state lives in markdown bold-prefix lines, NOT YAML frontmatter.** Ditto briefs have no `---` delimiters. The state line looks like `**Status:** ready` (or `draft | in_progress | complete`). The skills MUST parse via line-prefix regex (e.g. `^\*\*Status:\*\*\s+(\w+)`), not via a YAML library. A YAML parser will return zero matches and the queue will appear permanently empty.
- **The atomic claim is a bold-line edit.** `/drain-queue` step C edits `**Status:** ready` → `**Status:** in_progress` in the chosen brief, commits, and pushes the local `claim-tmp` branch to `origin/main`. Git's non-fast-forward rejection on the push is the mutex — exactly as in Catalyst, but on file content instead of a filename rename. The claim is a single commit (single edit, single `git commit`); do not chain multiple commits inside the claim, because race-loss recovery via `git checkout -B claim-tmp origin/main` discards them all and would leave inconsistent intermediate state in the loser's worktree.
- **PR-open state is signaled by adding a `**PR:** <url>` bold-line** under `**Status:**`, and this edit MUST be pushed atomically to `origin/main` as a separate commit — NOT to the feature branch. This is a third atomic-push in the brief's lifecycle (after the claim and before GC's complete-flip). Race-loss on this push uses the same recovery as the claim race-loss: `git checkout -B claim-tmp origin/main`, re-edit, retry. **Why the third push to `origin/main` matters:** the dependency-eligibility logic and the GC pass both read `origin/main`, and downstream briefs marked `ready` cannot become eligible if the `**PR:**` signal sits only on the feature branch. Without this third push, AC #5 case (c) is dead code — the entire build window between claim and merge would falsely block downstream work. The brief stays at `**Status:** in_progress` (Status itself is unchanged in this third push; only the `**PR:**` line is added). When the PR is merged, the GC pass flips Status to `complete` and removes the `**PR:**` line — see §GC pass spec below.
- **`Depends on:` algorithm is intentionally narrow.** `/drain-queue` extracts only `Brief (\d+)` regex matches from the `**Depends on:**` line. ADRs (`ADR-NNN`), phases (`Phase 14 Network Agent complete`), infrastructure references (`credentials table`), and parenthetical descriptions are treated as **informational and not enforced** — the human is responsible for marking only briefs whose non-brief blockers are resolved as `Status: ready`. A `Brief NNN` blocker is **satisfied** iff (a) no file `docs/briefs/NNN-*.md` exists on `origin/main`, OR (b) the file exists with `Status: complete`, OR (c) the file exists with `Status: in_progress` AND a `**PR:**` line is present (the Catalyst `_review-` equivalent). Otherwise the blocker is **unsatisfied** and the brief is skipped at claim time. The `Status: ready` flip remains the human gate confirming non-brief blockers are actually resolved.

### Substrate

- **Integration branch is `main`.** `/drain-queue` and `/autobuild` never check out `main` (Conductor worktrees can't share a checkout); they operate against `origin/main` for reads and push feature branches that target `main` for PRs. Same no-checkout rule as Catalyst's `project/agentcrm-app-dev`. AC #2 requires zero `git checkout main` invocations across the three skills.
- **Script names must be Ditto's actual ones.** `pnpm run type-check` (hyphenated; `pnpm typecheck` does not exist in `package.json`). `pnpm test` (note the `--exclude src/engine/journey-smoke.test.ts` baked into the package.json definition; `pnpm test:journey` is a separate command if needed). `pnpm test:e2e`, `pnpm test:e2e:auto`. **No `pnpm lint` script exists** — `/dev-review`'s checklist references must be updated to reflect this.
- **`origin/master` does not exist on this repo.** The currently-installed `.catalyst/skills/dev-review/SKILL.md` line 26 reads `git diff --name-only origin/master...HEAD`; this MUST be patched to `origin/main`. AC #15 catches this.

### Role-contract preservation

- **`/autobuild` does NOT enumerate or short-circuit `/dev-builder`'s verify steps.** `/dev-builder.md` lines 81-86 already mandate `pnpm run type-check`, `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:auto`, and the brief's smoke test. `/autobuild` Step 3 is "invoke `/dev-builder`" — full stop. Whatever `/dev-builder` does internally, `/autobuild` inherits. Do NOT write a verify step inside `/autobuild` that re-runs a subset; that would silently weaken the contract and create the maker-checker bypass that this brief is designed to prevent.
- **Maker-checker is procedurally enforced via fresh subagents, not "separate steps in the same conversation."** `/autobuild` Step 4 (architecture review) MUST spawn a NEW agent via the Agent / Task tool and pass it the `/dev-reviewer` role contract + the diff + `docs/review-checklist.md`. Step 5 (exhaustive bug audit) MUST do the same with `/dev-review`. The Builder agent does NOT invoke either reviewer in its own context — that would carry over assumptions from the build phase and defeat the maker-checker invariant per CLAUDE.md §Critical separation. Catalyst's pattern of inlining `/dev-review` after `/autobuild`'s build step is not adopted here; Ditto's stricter separation wins.
- **Engine-first rule survives by delegation.** Because `/autobuild` invokes `/dev-builder` rather than re-implementing build logic, `/dev-builder`'s engine-first MUST (changes to engine primitives go to `packages/core/` first; root + core typecheck both run when engine touched) is preserved automatically. Do NOT inline build logic into `/autobuild`.
- **`/dev-builder` caller-impact analysis MUST survives.** `/autobuild` MUST pass the full brief and the entire codebase context to `/dev-builder`, not a narrowed snippet. If the autopilot scopes the Builder's view too tightly (e.g. only the §What Changes table), the Builder can't run caller-impact analysis on gates/guards/early-returns. (Source of the MUST: `.claude/commands/dev-builder.md` line 27. Insight-190 is referenced from there but is itself about migration journal concurrency, not caller-impact analysis — see Pre-flight hard stops below for Insight-190's actual application.)

### Pre-flight hard stops (BEFORE invoking `/dev-builder`)

These run as `/autobuild` Step 2, after Step 1 (resolve brief) and BEFORE Step 3 (invoke `/dev-builder`):

- **Drizzle journal hard-stop (Insight-190).** Scan the brief's §What Changes table for any of: `drizzle/meta/_journal.json`, `drizzle/migrations/`, `packages/core/src/db/schema/`, `src/db/schema/`. If any match, hard-stop immediately with the brief left at `**Status:** in_progress` (claim already happened in `/drain-queue` step C) and surface to the human. The journal is a concurrency bottleneck; autonomous edits would clobber. Detection happens pre-Build so no work is wasted.
- **DB migration hard-stop.** Scan the brief's §What Changes and §Smoke Test for `pnpm db:push`, `pnpm db:migrate`, `drizzle-kit push`, `drizzle-kit migrate`, `supabase db push`. Hard-stop if found.
- **External-side-effect spike-test note** (`docs/insights/180-spike-test-every-new-api.md`). Scan §What Changes for new functions in `src/engine/integration-spike.test.ts` or new external API integration. Do not hard-stop — `/dev-builder` already enforces the spike-test requirement — but log a flag in the autopilot's final report so the human knows to verify the spike was run.
- **Side-effecting functions need `stepRunId` guard** (`docs/insights/180-steprun-guard-for-side-effecting-functions.md`). `/dev-builder` enforces this on functions producing publishing/payment/webhook side effects. The autopilot does not gate on this directly; relies on `/dev-builder`'s contract.

### Guardrails (carried over verbatim from Catalyst, no Ditto-specific change)

- **No `--force`, `--no-verify`, `reset --hard`.** Race-loss recovery uses ONLY `git checkout -B claim-tmp origin/main` (capital `-B`); this discards the prior claim attempt's local commit and rebuilds `claim-tmp` on top of whatever the winning workspace pushed. This is the only legitimate "discard local state" operation in either skill.
- **`/drain-queue`'s recursive `/dev-review --fix` pass stays scoped to the feature branch's diff.** Findings outside the diff get surfaced as a final-report note and as a PR comment; they never trigger autonomous edits to unrelated files.
- **Stop on first real failure.** Race-loss is recoverable (loop back, fetch, retry). Build/test/review failure is not — leave the brief at `Status: in_progress`, name the feature branch in the failure report, and let the human pick it up.

### Security boundary (Insight-017)

- **`Status: ready` IS the trust boundary.** Anything marked ready will be implemented autonomously, with PR opened against `main`. A malicious or careless brief that passes `/dev-pm`'s human gate becomes a write-capable agent invocation. This is no different from running `/dev-builder` manually on a brief — the autopilot does not introduce a new privilege; it only removes the per-step dispatch friction. Because this changes the surface area of the trust boundary in a way the existing architecture spec does not document, an ADR (`ADR-035`, see §What Changes) records the doctrine; this brief is its first reference.
- **No credential exfiltration surface.** The skills do not read `.env`, do not hit the network beyond `git fetch`/`git push`/`gh pr create`/`gh pr view`/`gh pr comment`, and do not transmit brief contents to external services. Inherits `gh` auth scope (already-authenticated user) with no token broadening.
- **Trust-tier integrity preserved.** `/autobuild` does not modify trust-tier configuration in `packages/core/src/trust/`. If a brief's implementation changes trust constants, that's the Builder's choice under `/dev-builder`'s normal constraints — the autopilot does not bypass trust gates.
- **Audit trail is the git history + PR comments.** Every claim, every fix-pass commit, the GC pass's complete-flips, and every escalation is recorded as a normal git commit on `origin/main` (for state mutations) or on the feature branch / PR (for build artifacts).
- **Single-process scope.** The autopilot operates on the dev-process pipeline only — it does not interact with any user-facing process, the Self, network agents, personas, or the harness pipeline at runtime. There is no path by which `/drain-queue` can be triggered from a process step.

### Architecture-layer impact

This is **meta-process tooling**, not an architectural-layer change. It does not add to or modify any of the six layers (Process, Agent, Harness, Awareness, Learning, Human). It sits *alongside* the role pipeline documented in `docs/dev-process.md` as a dispatch-automation layer.

### Engine Core (`@ditto/core`) boundary

These are Claude Code skills (filesystem-resident SKILL.md files at `.catalyst/skills/` and `.claude/skills/`) — not engine code. They do not import from `packages/core/` or `src/`. The "could ProcessOS use this?" test answers maybe-eventually but **not via `@ditto/core`**: ProcessOS would copy the skills into its own `.catalyst/skills/` if it wanted them. Do NOT add any TypeScript glue under `packages/core/` or `src/` for this brief. If the future demands programmatic invocation of the autopilot (e.g. from a network-side Brief 181 release pipeline), that's a separate brief.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `/drain-queue` skill | Catalyst `/Users/thg/conductor/workspaces/agent-crm/kyoto/.catalyst/skills/drain-queue/SKILL.md` | adopt | The atomic-push mutex, the per-iteration loop, the recursive `--fix` pass with 3-cap and non-convergence guard, and the concurrency model are battle-tested in Catalyst. Adapt the brief-state mechanism (filename rename → bold-line edit) and the dependency model (filename-prefix → narrow `Brief NNN` regex), keep the algorithm. |
| `/autobuild` skill | Catalyst `/Users/thg/conductor/workspaces/agent-crm/kyoto/.catalyst/skills/autobuild/SKILL.md` | adopt | The pipeline shape and failure-mode table are sound. Replace inlined Implement/Verify/Self-review with a single `/dev-builder` invocation (which carries its own MUST list including all e2e tests) plus separate fresh-subagent invocations of `/dev-reviewer` and `/dev-review`. |
| `/dev-review` exhaustive audit (5-pass) | Catalyst `/Users/thg/conductor/workspaces/agent-crm/kyoto/.catalyst/skills/dev-review/` | depend (already installed identically, two patches needed) | Already in `.catalyst/skills/dev-review/` byte-identical to source. Patches: `pnpm typecheck` → `pnpm run type-check` (multiple sites), and `origin/master` → `origin/main` (one site, line 26). |
| Cognitive gearing via artifact handoff | gstack (referenced in Catalyst `/autobuild` source) | pattern | Each phase reads previous phase's output from disk (brief, diff, review report); no in-memory state. Already how Ditto's role pipeline works — preserve it. |
| Brief bold-line state model | Ditto `docs/briefs/000-template.md` | depend | Existing Ditto convention; the skills adapt to it. |
| Maker-checker via fresh subagent | Ditto `CLAUDE.md` §Critical separation | depend | Reviewer is a separate agent with fresh context. `/autobuild` enforces by spawning Task / Agent subagents, not by inlining review in the build conversation. |
| Trust-boundary doctrine | Insight-017 (security is architectural) | depend | Justifies promoting `Status: ready` to a documented architectural trust boundary via ADR-035 instead of leaving it as a brief-internal claim. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `.catalyst/skills/drain-queue/SKILL.md` | **Create**: adapted from Catalyst source. Bold-line `**Status:** ready → in_progress` claim instead of filename rename; `main` as integration branch; per-iteration GC pass at step start (see Smoke Test §GC pass for spec); `Brief NNN` regex extraction from `**Depends on:**`; calls `/autobuild`; recursive `/dev-review --fix` pass with 3-attempt cap and non-convergence guard preserved (algorithm verbatim; substrate updated for Ditto scripts). |
| `.catalyst/skills/autobuild/SKILL.md` | **Create**: adapted from Catalyst source. 10-step pipeline: (1) Resolve brief, (2) Pre-flight hard-stops (drizzle journal scan + DB migration scan), (3) Invoke `/dev-builder` (full role contract; includes its own `pnpm test:e2e`/`test:e2e:auto`/smoke-test set), (4) Spawn fresh-subagent `/dev-reviewer`, (5) Spawn fresh-subagent `/dev-review`, (6) Fix P0/P1 from both; document P2/P3 in PR body, (7) Commit + push feature branch, (8) Open PR against `main` with `brief:NNN-<short-slug>` token, (9) **Atomic-push the `**PR:** <url>` line edit to `origin/main`** (separate commit on its own `claim-tmp`-style branch; rebuild from `origin/main`, edit only the brief file, commit, push to `origin/main`; race-loss recovery via `git checkout -B claim-tmp origin/main` and retry). NOT a commit on the feature branch. (10) Report. |
| `.claude/skills/drain-queue/SKILL.md` | **Create**: pointer file. YAML frontmatter: four keys — `name`, `description`, `argument-hint`, `disable-model-invocation: true` (the four-key shape comes from Catalyst's source pointer at `/Users/thg/conductor/workspaces/agent-crm/kyoto/.claude/skills/drain-queue/SKILL.md`; `disable-model-invocation: true` prevents the LLM from auto-triggering this skill). Body is a single `@.catalyst/skills/drain-queue/SKILL.md` line. The existing `.claude/skills/dev-review/SKILL.md` is a 3-key pointer (no `disable-model-invocation`) — that's the correct shape for `dev-review` (which CAN be auto-invoked) and stays unchanged. |
| `.claude/skills/autobuild/SKILL.md` | **Create**: pointer file with same four-key frontmatter shape as `drain-queue`; body is `@.catalyst/skills/autobuild/SKILL.md`. |
| `.catalyst/skills/dev-review/SKILL.md` | **Modify**: replace `pnpm typecheck` → `pnpm run type-check` at all three current sites (line 9 in "Why This Skill Exists" prose, line 40 in Guardrails, plus any other site grep finds). Line 26: `origin/master...HEAD` → `origin/main...HEAD`. After the patch, `grep -n "pnpm typecheck"` and `grep -n "origin/master"` against the file MUST both return zero. |
| `.catalyst/skills/dev-review/references/dev-review-checklist.md` | **Modify**: replace `pnpm typecheck` → `pnpm run type-check` at line 176 (§Final Steps) and any other site grep finds. Verify no `origin/master` reference exists in this file. |
| `docs/dev-process.md` | **Modify**: add a §Autopilot section explaining when to use `/drain-queue` vs invoking roles directly, the maker-checker invariants `/autobuild` enforces (fresh subagents for both reviewers), the security-boundary note (`Status: ready` is the trust gate; cross-reference ADR-035), and the pre-flight hard-stop list. Reference this brief. |
| `docs/adrs/035-brief-status-as-dispatch-mutex.md` | **Create** (use `docs/adrs/000-template.md`): document the doctrine that (a) brief `**Status:**` bold-line mutation on `origin/main` is the cross-workspace dispatch mutex, (b) `Status: ready` is the architectural trust boundary for autonomous build, (c) the narrow `Brief NNN` dependency model intentionally treats ADR/Phase/infrastructure references as informational. ADR-035 is the canonical home for these claims; the brief is just the implementation. |
| `docs/state.md` | **Modify** (per CLAUDE.md mandate): record skill installation + new dispatch-automation capability + ADR-035 + cross-link to Brief 181 as the network-scale follow-up. |
| `docs/insights/` | **Create new insight if discoveries emerge** during build (likely candidate: "Bold-line content edit on a shared branch is sufficient as a distributed mutex; non-fast-forward rejection makes git the lock manager"). Capture in `docs/insights/NNN-mutex-via-bold-line-edit.md` per `000-template.md`. Not mandatory — only if the build surfaces something genuinely new. |
| `docs/briefs/188-cross-brief-autopilot.md` | **Modify**: `Status: draft → ready` after architect/human review; → `in_progress` (with `**PR:**` line) when `/drain-queue` claims it (eating its own dogfood); → `complete` when the GC pass observes the merge. |

## User Experience

- **Jobs affected:** Delegate (the human delegates dispatch to the autopilot rather than driving each role invocation), Decide (the human still decides at the merge gate). Orient is unchanged — `/dev-pm` still surfaces what's worth working on; `/drain-queue` only acts on what `/dev-pm` (or the human directly) has marked `ready`.
- **Primitives involved:** None of the 16 human-layer primitives (this is dev-process tooling, not user-facing product surface).
- **Process-owner perspective:** The human marks one or more briefs `Status: ready` (via `/dev-pm` or directly), opens N Conductor workspaces, runs `/drain-queue all` in each, walks away. Returns to a stack of open PRs to review. The merge decision (and any architectural pushback on a PR) is the human's. After merge, the next `/drain-queue` invocation in any workspace observes the merge and flips the brief to `Status: complete` automatically (GC pass).
- **Interaction states:** N/A — no UI surface. Skill output is terminal text. Final report includes per-brief outcome (PR URL, `--fix` pass count, escalation flags, any pre-flight hard-stops triggered) so the human can triage at a glance.
- **Designer input:** Not invoked — meta-process tooling, no human-layer UX.

## Acceptance Criteria

1. [ ] `.catalyst/skills/drain-queue/SKILL.md` and `.catalyst/skills/autobuild/SKILL.md` exist. The two new pointer files at `.claude/skills/drain-queue/SKILL.md` and `.claude/skills/autobuild/SKILL.md` use the four-key Catalyst-source frontmatter shape: `name`, `description`, `argument-hint`, `disable-model-invocation: true`, followed by a single `@.catalyst/skills/<skill>/SKILL.md` line. The existing `.claude/skills/dev-review/SKILL.md` (3-key shape, no `disable-model-invocation`) is NOT modified — that's the correct shape for `/dev-review` since it's safe to auto-invoke.
2. [ ] Both new skills target `main` as the integration branch and never check it out. Verify by `grep -rE "git checkout( -B [^ ]+)?\s+main(\s|$)" .catalyst/skills/{drain-queue,autobuild} .claude/skills/{drain-queue,autobuild}` returning zero matches (the only allowed checkout is `git checkout -B claim-tmp origin/main`, which is a different ref).
3. [ ] `/drain-queue` parses brief eligibility from markdown bold-prefix lines using regex (`^\*\*Status:\*\*\s+(\w+)`). Verify no `import yaml`, `parseYaml(`, `front-matter`, or `gray-matter` reference appears in either new skill's body (in any code blocks or inline examples).
4. [ ] `/drain-queue` extracts dependencies via the regex `\bBrief\s+(\d+)\b` from the `**Depends on:**` line and treats only those as enforced. ADR/Phase/infrastructure references in the same line do NOT cause the brief to be skipped. Spec is documented in the skill body so a Builder reading the skill alone can verify.
5. [ ] A `Brief NNN` blocker is treated as **satisfied** iff one of: (a) no `docs/briefs/NNN-*.md` file exists on `origin/main`, (b) the file has `**Status:** complete`, or (c) the file has `**Status:** in_progress` AND a `**PR:** <url>` line. Otherwise unsatisfied; brief is skipped at claim time.
6. [ ] `/drain-queue`'s atomic claim works: when two simultaneous workspaces race to claim the same brief, exactly one push succeeds (the loser gets `non-fast-forward`) and the loser's recovery via `git checkout -B claim-tmp origin/main` discards its in-progress claim commit and re-runs eligibility. Verified by the concurrency smoke test below.
7. [ ] `/drain-queue`'s per-iteration GC pass: at step A (after `git fetch origin main`), for every brief on `origin/main` with `**Status:** in_progress` AND a `**PR:** <url>` line, query `gh pr view <url> --json state,mergedAt`. Behavior by PR state:
   - **MERGED**: atomically (claim-style edit + commit + push to `origin/main`) flip the brief to `**Status:** complete` and remove the `**PR:**` line.
   - **CLOSED** (not merged): do NOT flip; log a warning to the autopilot's final report listing the brief slug and the closed PR URL so the human can decide whether to reopen, re-mark `ready`, or mark `complete` manually.
   - **OPEN**: do nothing (build is in progress somewhere; let it finish).
   - **`gh pr view` fails** (network glitch, deleted PR, permission change): retry once with a 2-second backoff. If it still fails, skip that brief (do NOT flip), log a warning, continue.
   GC race-loss on the push is treated like a normal claim race-loss (no error; the loser fetches and re-runs the GC pass on the next iteration). Per-iteration cap: process at most 10 briefs in the GC pass; if more candidates exist, leave them for the next iteration.
8. [ ] `/autobuild` invokes `/dev-builder` as a single role-contract delegation for Implement+Verify (Step 3 in the 10-step pipeline). `/autobuild` does NOT enumerate `pnpm run type-check`, `pnpm test`, `pnpm test:e2e`, or `pnpm test:e2e:auto` in its own body — those are `/dev-builder`'s responsibility per `.claude/commands/dev-builder.md` lines 81-86 and the autopilot inherits them by delegation.
9. [ ] `/autobuild` Step 4 (architecture review via `/dev-reviewer`) and Step 5 (exhaustive bug audit via `/dev-review`) MUST each spawn a fresh subagent (Task / Agent tool) with the relevant role-contract file passed as input, NOT inline the review in the Builder's conversation. Specified explicitly in the skill body.
10. [ ] `/autobuild` Step 2 (Pre-flight hard-stops) detects: any of `drizzle/meta/_journal.json`, `drizzle/migrations/`, `packages/core/src/db/schema/`, `src/db/schema/` in the brief's §What Changes table → hard-stop with brief left at `Status: in_progress`. Detection runs BEFORE `/dev-builder` is invoked (no work wasted).
11. [ ] `/autobuild` Step 2 also detects `pnpm db:push`, `pnpm db:migrate`, `drizzle-kit push`, `drizzle-kit migrate`, or `supabase db push` in §What Changes or §Smoke Test → hard-stop.
12. [ ] `/autobuild` Step 8 opens a PR targeting `main` with body containing a `brief:NNN-<short-slug>` token on its own line (for `/drain-queue`'s belt-and-braces dedup check at claim time).
13. [ ] `/autobuild` Step 9 atomically pushes the `**PR:** <url>` bold-line edit (placed directly under the brief's `**Status:**` line, Status itself unchanged at `in_progress`) **to `origin/main`** as a third atomic-push commit — NOT to the feature branch. Algorithm: rebuild from `origin/main` via `git checkout -B claim-tmp origin/main`, edit only the brief file, commit, push to `origin/main`. Race-loss recovery is identical to the claim race-loss: re-fetch, re-build claim-tmp, re-edit, retry. This makes the `**PR:**` line visible to GC and to dependency-eligibility checks immediately, satisfying AC #5 case (c) during the build window.
14. [ ] `/drain-queue`'s recursive `/dev-review --fix` pass preserves Catalyst's algorithm: 3-attempt cap, non-convergence guard (same finding set in two consecutive passes triggers escalation), PR-comment escalation when capped or non-convergent. Substrate substitutions: regression checks call `pnpm run type-check` (no `pnpm typecheck`); lint check is omitted (no `pnpm lint` script in this repo). All other behavior verbatim.
15. [ ] All script invocations across the three skills use the correct Ditto names. `grep -rn "pnpm typecheck" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review}` returns zero. `grep -rn "pnpm lint" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review}` returns zero. `grep -rn "origin/master" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review}` returns zero. `grep -rn "project/agentcrm-app-dev" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review}` returns zero.
16. [ ] No skill uses `--force`, `--no-verify`, or `reset --hard`. The only "discard local state" operation is `git checkout -B claim-tmp origin/main`, scoped to race-loss recovery (and re-used identically for GC race-loss).
17. [ ] `docs/dev-process.md` includes a §Autopilot section covering: when to use `/drain-queue` vs invoking roles, the maker-checker invariants (fresh subagents for reviewers), the trust-boundary note (cross-reference ADR-035), the pre-flight hard-stop list. `docs/state.md` records the new capability per CLAUDE.md.
18. [ ] `docs/adrs/035-brief-status-as-dispatch-mutex.md` exists, follows `000-template.md`, documents the three claims (mutex, trust boundary, narrow dependency model).
19. [ ] Existing `/dev-review` skill remains usable standalone (invoking it directly works) and is updated only for the two patches in §What Changes (`pnpm typecheck` → `pnpm run type-check`; `origin/master` → `origin/main`).
20. [ ] Builder ran the smoke test in §Smoke Test below and pasted the output into the handoff (Insight-038). Includes the concurrency race smoke test if the Builder has a second Conductor workspace available; if not, explicitly notes that and asks the human to run it before merging this brief.

## Review Process

How to validate the work after completion:

1. Spawn `/dev-reviewer` against this brief (fresh subagent) with `docs/architecture.md` + `docs/review-checklist.md` + the 20 ACs above as context. Reviewer specifically checks:
   - Brief-state model: does the skill parse `**Status:**` via regex, NOT via a YAML library?
   - `Depends on:` algorithm: is the `Brief NNN` regex extraction explicit in the skill body? Does the skill documentation say what is and isn't enforced?
   - Maker-checker fresh-subagent enforcement: does `/autobuild` Step 4/5 use the Task/Agent tool with role-contract input, or does it inline review?
   - Engine-first rule preservation: when `/autobuild` calls `/dev-builder`, does it pass the brief and full codebase context (no narrowing that would prevent caller-impact analysis)?
   - Concurrency safety: trace the atomic-claim flow on a bold-line edit and confirm the non-fast-forward rejection still produces the mutex; trace the GC race scenario.
   - Pre-flight hard-stops: trace what `/autobuild` does when the brief's §What Changes lists `drizzle/meta/_journal.json`.
   - Script-name drift: AC #15 grep checks all return zero.
2. Run `/dev-review` (the exhaustive bug audit) on the SKILL.md files themselves to catch any internal-consistency, regex-correctness, or guardrail-evasion issues.
3. Present work + both review reports + the smoke-test output to human for approval.

## Smoke Test

This proves the skills work end-to-end. Run after the Builder finishes; mandatory per `docs/insights/archived/038-testing-is-a-quality-dimension-not-always-a-role.md` (Builder owns smoke-test execution).

### Bootstrap note (the chicken and the egg)

Brief 188 itself cannot be built by `/drain-queue` because `/drain-queue` doesn't exist yet at build time. The implementing builder (human or `/dev-builder` invoked manually) creates the autopilot. After the implementing PR merges, brief 188 lands at `**Status:** complete` (via the manual `/dev-documenter` flip in §After Completion, since the autopilot's own GC pass is what's just been installed). After that, if anyone re-marks 188 as `**Status:** ready` for any reason (testing, re-build), `/drain-queue` WILL try to autoclaim it — that's expected behavior, not a paradox; just don't do it without intent.

### Setup verification (one terminal in this Conductor workspace)

```bash
# Verify three skills resolve
ls .catalyst/skills/{drain-queue,autobuild,dev-review}/SKILL.md
ls .claude/skills/{drain-queue,autobuild,dev-review}/SKILL.md

# Verify no stale script names or refs (scoped to the three relevant skills only;
# unscoped grep would hit the design-skill catalog under .claude/skills)
grep -rn "pnpm typecheck" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review} && echo FAIL || echo OK
grep -rn "pnpm lint" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review} && echo FAIL || echo OK
grep -rn "origin/master" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review} && echo FAIL || echo OK
grep -rn "project/agentcrm-app-dev" .catalyst/skills/{drain-queue,autobuild,dev-review} .claude/skills/{drain-queue,autobuild,dev-review} && echo FAIL || echo OK

# Verify no YAML library reference (the bold-line model)
grep -rEn "import yaml|parseYaml|front-matter|gray-matter" .catalyst/skills/{drain-queue,autobuild} .claude/skills/{drain-queue,autobuild} && echo FAIL || echo OK
```

### Single-workspace functional test (seed via PR, no `git push origin main`)

This test seeds a throwaway brief 999 onto `origin/main` via the same PR mechanism the autopilot uses. The seeding requires one human-merged PR (the autopilot is the system under test; seeding is acknowledged manual setup).

```bash
# Step 1: create brief 999 on a feature branch and open a seeding PR
git checkout -b seed/999-autopilot-smoke-test origin/main
mkdir -p docs/briefs
cat > docs/briefs/999-autopilot-smoke-test.md <<'EOF'
# Brief 999: Autopilot Smoke Test

**Date:** 2026-04-17
**Status:** ready
**Depends on:** none
**Unlocks:** removal of brief 999 (one-shot smoke test, not a real brief)

## Goal
Trivial doc-only edit to prove /drain-queue + /autobuild work end-to-end. Not a real roadmap item.

## Acceptance Criteria
1. [ ] Append a single line "<!-- autopilot smoke test marker -->" to docs/state.md.

## Smoke Test
N/A — this brief IS the smoke test for the autopilot.
EOF
git add docs/briefs/999-autopilot-smoke-test.md
git commit -m "test: seed brief 999 for autopilot smoke test"
git push -u origin seed/999-autopilot-smoke-test
gh pr create --base main --title "test: seed brief 999 for autopilot smoke test" --body "Seeding brief 999 onto main so /drain-queue can claim it. Merge then run /drain-queue 1."
# *** HUMAN ACTION: review and merge the seeding PR ***

# Step 2: after seeding PR merges, the smoke test
git fetch origin main
/drain-queue 1
```

**Expected behavior:**
- `/drain-queue` step A fetches `origin/main` and runs the GC pass (no `**PR:**` lines yet, so no-op)
- `/drain-queue` step B/C lists candidate briefs, picks 999 (only one with `Status: ready`), edits its `**Status:**` line to `in_progress`, commits, pushes to `origin/main` atomically
- Claim branch renamed to `feature/999-autopilot-smoke-test`
- `/autobuild` step 2 (pre-flight) finds no drizzle/migration hits → continues
- `/autobuild` step 3 invokes `/dev-builder`, which runs `pnpm run type-check`, `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:auto`, the brief's smoke test, then makes the trivial doc edit
- `/autobuild` step 4 spawns fresh-subagent `/dev-reviewer`; step 5 spawns fresh-subagent `/dev-review`
- Both reviewers come back clean on a one-line trivial diff
- `/autobuild` step 6 (no fixes needed), step 7 commits + pushes feature branch, step 8 opens PR against main with `brief:999-autopilot-smoke-test` token
- Step 9 adds `**PR:** <url>` line to brief 999, commits, pushes
- `/drain-queue` step F runs recursive `/dev-review --fix`; converges in pass 1 (clean diff)
- Final report names PR URL

### Concurrency smoke test (two Conductor workspaces, strongly recommended)

To test a real same-brief race, the queue must contain a `Status: ready` brief that BOTH workspaces will target. Because the single-workspace test above already consumed brief 999, this test requires a second seed:

```bash
# Step 1: re-seed brief 999 to Status: ready (this is the "reset" step — the only repeatable
# way to get a fresh ready brief without inventing a 998, 997, ... naming chain)
git checkout -b reseed/999-for-concurrency-test origin/main
# Edit docs/briefs/999-autopilot-smoke-test.md: flip **Status:** complete → ready, remove **PR:** line
git commit -am "test: re-seed brief 999 for concurrency smoke test"
git push -u origin reseed/999-for-concurrency-test
gh pr create --base main --title "test: re-seed brief 999 for concurrency smoke test" --body "Reset brief 999 to Status: ready so /drain-queue race can be retried."
# *** HUMAN ACTION: merge ***

# Step 2: in workspace A:
/drain-queue 1
# In workspace B (start within 1-2 seconds of A):
/drain-queue 1
```

**Expected behavior:**
- Exactly one workspace's `**Status:** in_progress` push succeeds for brief 999
- The other gets `non-fast-forward` on its push, runs `git fetch`, runs `git checkout -B claim-tmp origin/main` (which discards its in-progress claim commit), re-runs eligibility, and either picks the next eligible brief or stops with "queue empty / queue blocked"
- Neither workspace force-pushes, resets, or corrupts the other's local state

**If a Builder cannot run a two-workspace test in their environment**, the brief still ships — the Builder MUST explicitly note this in the handoff (per AC #20) and ask the human to run the concurrency test before merging. The single-workspace test alone is insufficient evidence the mutex works.

### GC-pass smoke test (after the autopilot's PR is merged by a human)

```bash
# Human merges the autopilot's PR for brief 999
# In any workspace:
/drain-queue 1
```

**Expected:** GC pass observes brief 999's `**PR:**` URL is now `MERGED`, atomically flips brief to `**Status:** complete`, removes the `**PR:**` line, commits + pushes. (After this, brief 999's job is done; cleanup below removes it.)

### Cleanup (no `git checkout main`)

Order matters: the autopilot's PR (call it PR-A — the one that implemented brief 999) must be MERGED first so the GC pass can flip brief 999 to `Status: complete` BEFORE the cleanup PR removes the file. If PR-A is closed without merging, the GC pass will log a CLOSED warning per AC #7 and the brief stays at `Status: in_progress`; that's a soft failure to handle manually.

```bash
# *** Verify PR-A merged and the GC pass has run (brief 999 should be Status: complete on origin/main) ***
git fetch origin main
git show origin/main:docs/briefs/999-autopilot-smoke-test.md | grep '^\*\*Status:\*\*'
# Expect: **Status:** complete

# Now remove the throwaway brief
git checkout -b cleanup/remove-999-smoke-test origin/main
rm docs/briefs/999-autopilot-smoke-test.md
git commit -m "chore: remove brief 999 (autopilot smoke test complete)"
git push -u origin cleanup/remove-999-smoke-test
gh pr create --base main --title "chore: remove brief 999 (autopilot smoke test complete)" --body "Smoke test passed; remove the throwaway brief."
# *** HUMAN ACTION: merge the cleanup PR ***
```

## After Completion

1. Update `docs/state.md` with the new capability (autopilot dispatch automation now available; recommend `/drain-queue 1` for the next ready brief; escalate to `all` once trust is established; cross-reference Brief 181 as the network-scale follow-up).
2. Update `docs/roadmap.md` only if a phase boundary moved — this brief is meta and probably doesn't shift roadmap rows.
3. Phase retrospective:
   - What worked: did the bold-line-mutex pattern hold under concurrent racing? Did the GC pass correctly observe merges?
   - What surprised us: any class of brief that broke `/autobuild` (e.g. ones that need DB migrations, or ones with external API spikes per Insight-180, or ones whose `**Depends on:**` line confused the `Brief NNN` regex)?
   - What to change: tune the 3-pass `--fix` cap if it routinely caps out or routinely converges in 1.
4. ADR-035 is part of the work products — write it as the doctrine record (not a follow-up).
5. Capture insights — likely candidates: "Bold-line content mutation as a distributed mutex," "Narrow regex over freeform prose deps as a safe-by-default ignore policy," or "Fresh-subagent reviewers as the procedural realization of maker-checker."

---

**Reference docs checked / updated** (per `docs/insights/043-knowledge-maintenance-at-point-of-contact.md`):
- Read: `docs/architecture.md` (no drift relevant to meta-tooling — but see §Open Question on whether the trust-boundary doctrine should also land in architecture.md, not just ADR-035), `docs/review-checklist.md` (12-point checklist + extensions 13-15), `docs/personas.md` (no UX surface, not directly applicable), `docs/dev-process.md` (will be modified — see §What Changes), `docs/briefs/000-template.md`, `.claude/commands/dev-builder.md` (line 27 = caller-impact MUST; lines 81-86 = full verify list), `.claude/commands/dev-reviewer.md`, `.claude/skills/dev-review/SKILL.md` (existing 3-key pointer file format), `.catalyst/skills/dev-review/SKILL.md` (3 sites of `pnpm typecheck` + 1 of `origin/master` to patch), `docs/adrs/030-deployment-mode-flag.md` and `docs/adrs/031-oauth-credential-platform.md` (closest existing ADRs; no conflict)
- Insights consulted (with full filenames to disambiguate Insight-180 collision and archived locations):
  - `docs/insights/archived/004-brief-sizing.md` — sizing budget (20 ACs is at upper bound; one integration seam keeps within bounds)
  - `docs/insights/017-security-is-architectural-not-a-role.md` — drove ADR-035
  - `docs/insights/archived/038-testing-is-a-quality-dimension-not-always-a-role.md` — drove AC #20 (Builder owns smoke test)
  - `docs/insights/043-knowledge-maintenance-at-point-of-contact.md` — drove this Reference docs line
  - `docs/insights/180-spike-test-every-new-api.md` — drove pre-flight spike-test note
  - `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — referenced for `/dev-builder`'s contract; not gated directly by autopilot
  - `docs/insights/190-migration-journal-concurrency.md` — drove pre-flight hard-stop AC #10
- ADRs to be created: ADR-035 (this brief is its first reference; co-shipping). Number 035 is the next free ADR number — 032 is already claimed by Brief 182's Browser Integration Protocol; 033 (network-scale RSI architecture) and 034 (release distribution model) are real files. Verified by `ls docs/adrs/`.
- ADRs needing update: none

**Open Question for human approval:**
- Should the trust-boundary doctrine (`Status: ready` IS an autonomous-build trigger) ALSO land in `docs/architecture.md` (e.g. as a §Cross-Cutting Governance addendum), or is ADR-035 alone sufficient? Round-2 reviewer flagged that Insight-043 prefers architecture-spec updates when scope changes; the brief currently does ADR-only. Human's call.
