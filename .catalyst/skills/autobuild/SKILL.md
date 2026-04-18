---
name: autobuild
description: End-to-end autopilot for a single brief — pre-flight, /dev-builder, fresh-subagent reviewers, push, open PR, mark **PR:** line on feature branch. Stops at the human merge gate.
argument-hint: "[brief-name]"
disable-model-invocation: true
---

## Why This Skill Exists

Driving each `**Status:** ready` brief to a reviewable PR is mechanical work: read brief → pre-flight check → implement → review → fix → push → PR → flip status. `/autobuild` chains those steps so the user's leverage stays on planning and merge-time taste, not dispatching commands between phases.

This is the **within-brief autopilot**. Pair with `/drain-queue` for cross-brief autopilot.

Inspired by gstack's "cognitive gearing via artifact handoff" — each phase reads the output of the previous phase from disk (the brief file, the diff, the dev-review output). No in-memory state to lose.

Companion brief: `docs/briefs/188-cross-brief-autopilot.md`. Doctrine: `docs/adrs/035-brief-state-doctrine.md`.

## Repo Context

- Read `@CLAUDE.md` — Ditto conventions, especially §How Work Gets Done, §Critical separation, §Engine Core
- Read `@docs/dev-process.md` §Autopilot — usage and invariants
- Read `@docs/state.md` — current state, in-flight work
- Read `@docs/insights/` — at minimum 017 (security architectural), 043 (Builder flags / Architect fixes), 180-spike-test, 180-steprun-guard, 190 (migration journal)
- Read `@AGENTS.md` — repo conventions

## Pre-conditions

Hard requirements before `/autobuild` proceeds:

1. Working tree is clean (`git status --porcelain` empty)
2. Exactly one brief at `**Status:** in_progress` exists in `docs/briefs/`, OR `$ARGUMENTS` names a specific brief file (with `**Status:** ready` or `in_progress`)
3. Current branch is NOT `main` — must be on a feature branch dedicated to this brief (caller's responsibility; `/drain-queue` handles this automatically by renaming `claim-tmp` → `feature/<slug>` after a successful claim)
4. Remote is reachable (`git fetch` succeeds)

If any pre-condition fails, stop and report — do not try to "fix it up." Autonomous work depends on crisp pre-conditions.

## Execution — 10-step pipeline

Steps run in order. On any failure, stop and leave state intact for human inspection — the brief stays at `**Status:** in_progress` so a human can pick it up.

### 1. Resolve the brief

- If `$ARGUMENTS` provided, match against `docs/briefs/*.md`
- Otherwise find the single `**Status:** in_progress` brief
- Read the brief in full. Treat its §What Changes table and §Acceptance Criteria as the contract
- Extract the brief's slug (e.g. `188-cross-brief-autopilot`) — this is the filename without `.md`

### 2. Pre-flight hard-stops

Scan the brief BEFORE invoking `/dev-builder`. If any of these match, hard-stop immediately with brief left at `**Status:** in_progress`:

**Drizzle journal hard-stop** (`docs/insights/190-migration-journal-concurrency.md`). Scan §What Changes for any of:
- `drizzle/meta/_journal.json`
- `drizzle/migrations/`
- `packages/core/src/db/schema/`
- `src/db/schema/`

If matched, surface to human: "Brief touches DB schema/migration; the Drizzle journal is a concurrency bottleneck. Manual build required."

**DB migration hard-stop.** Scan §What Changes and §Smoke Test for:
- `pnpm db:push`
- `pnpm db:migrate`
- `drizzle-kit push`
- `drizzle-kit migrate`
- `supabase db push`

If matched, surface to human: "Brief requires DB migration; autonomous migration is forbidden. Manual build required."

**External-side-effect spike-test note** (`docs/insights/180-spike-test-every-new-api.md`). Scan §What Changes for additions to `src/engine/integration-spike.test.ts` or new external API integration. Do not hard-stop — `/dev-builder` already enforces the spike-test requirement — but record a flag for the final report so the human knows to verify the spike was run.

**Pre-flight scope note:** these hard-stops cover **DB-related risk only**. Other classes of dangerous brief content (`package.json` `dependencies`/`devDependencies` mods, `.github/workflows/*.yml`, `.env*` mods, `next.config.*`, `vite.config.*`, `tsconfig.*`) rely entirely on the `**Status:** ready` human gate (the trust boundary; see `docs/adrs/035-brief-state-doctrine.md`).

### 3. Invoke `/dev-builder`

Single role-contract delegation for Implement+Verify. `/dev-builder.md` lines 81-86 already mandate `pnpm run type-check`, `pnpm test`, `pnpm test:e2e`, `pnpm test:e2e:auto`, and the brief's smoke test. **Do NOT enumerate or short-circuit** these in `/autobuild`'s body — that would silently weaken the contract and create the maker-checker bypass this skill is designed to prevent.

Pass `/dev-builder` the full brief and the entire codebase context (no narrowed snippet) so its caller-impact analysis MUST (`.claude/commands/dev-builder.md` line 27) is preserved.

If `/dev-builder` fails (test failure, smoke-test failure, ambiguity flagged): stop, leave brief at `Status: in_progress`, report.

### 4. Spawn fresh-subagent `/dev-reviewer` (architecture review)

MUST spawn a NEW agent via the Agent / Task tool. NOT inline in the Builder's conversation. Pass the subagent:
- The role contract: `.claude/commands/dev-reviewer.md`
- The diff: `git diff origin/main` output
- `docs/architecture.md`
- `docs/review-checklist.md`
- The brief

The subagent runs the 12-point architecture checklist + extensions and returns a structured PASS/FLAG/FAIL report. Do NOT carry over assumptions from the Builder's context — the fresh-context Reviewer is the maker-checker invariant per CLAUDE.md §Critical separation.

### 5. Spawn fresh-subagent `/dev-review` (exhaustive bug audit)

MUST spawn a SECOND new agent via the Agent / Task tool. Pass:
- The role contract: `.catalyst/skills/dev-review/SKILL.md` + `.catalyst/skills/dev-review/references/dev-review-checklist.md`
- The diff
- The brief

The subagent runs the 5-pass exhaustive audit and returns CRITICAL/HIGH/MEDIUM/LOW findings. The two reviewers (Step 4 architecture + Step 5 exhaustive) catch different classes of issue — both are mandatory.

### 6. Fix P0/P1 findings; document P2/P3 in PR body

P0/P1 (CRITICAL/HIGH from /dev-review; FAIL from /dev-reviewer) MUST be fixed before opening the PR. Do this in the same conversation (the Builder, not a fresh agent — fixes are not architectural decisions). After fixes, **re-run the full `/dev-builder` verify list per `.claude/commands/dev-builder.md` lines 81-86** (type-check + `pnpm test` + `pnpm test:e2e` + `pnpm test:e2e:auto` + smoke test). Do NOT re-run a subset — partial verification after fixes is exactly the contract weakening the §Role-contract preservation constraint forbids.

P2/P3 (MEDIUM/LOW; FLAG) go into the PR body under a `### Known follow-ups` heading so they're tracked.

If a P0/P1 finding cannot be fixed in this pass (architectural, ambiguous): stop, leave brief at `Status: in_progress`, report with the finding and PR-not-yet-open.

### 7. Commit and push the feature branch

- Stage only files relevant to the brief (never `git add -A` blindly)
- Commit message: one-line summary matching the brief, followed by the brief filename
  ```
  <type>(<scope>): <summary>

  Brief: docs/briefs/<slug>.md
  ```
- Push with `-u origin feature/<slug>` to set upstream

### 8. Open PR

- Base: `main`
- Head: `feature/<slug>`
- Title: under 70 chars, matches brief summary
- Body MUST contain (in order):
  1. **Summary** — 1–3 bullets
  2. **Test plan** — bulleted markdown checklist
  3. `brief:<slug>` token on its own line — load-bearing for `/drain-queue`'s GC pass and dependency-eligibility query (parsed via regex from PR body)
  4. `Brief: docs/briefs/<slug>.md` line — link to the brief
  5. `### Known follow-ups` (if any P2/P3 findings exist)
- Use `gh pr create --base main` with HEREDOC body

### 9. Add `**PR:** <url>` line to the brief on the FEATURE BRANCH

This is informational documentation, NOT a load-bearing signal. The authoritative in-flight signal is `gh pr list` (queried by `/drain-queue`'s GC pass). The `**PR:**` line survives any merge strategy because it's part of the feature branch's diff.

- In-place edit `docs/briefs/<slug>.md`: insert a new line `**PR:** <url>` directly under the `**Status:**` line. Status itself stays `in_progress`.
- `git add docs/briefs/<slug>.md`
- `git commit -m "chore(brief): add PR link to <slug>"`
- `git push origin feature/<slug>` — feature branch only, NOT to `main`

**Branch hygiene:** the autopilot stays on `feature/<slug>` after this step. No checkout dance to `claim-tmp` or anywhere else. Step 10 (Report) runs from the feature branch context.

### 10. Report

Output to the user (last message, since intermediate messages collapse):
- PR URL
- Brief now at `**Status:** in_progress` with `**PR:** <url>` line on the feature branch
- Reviewer findings: count by severity per reviewer
- P2/P3 follow-ups noted in the PR body (if any)
- Any spike-test flag from step 2 ("Builder added external API integration; verify spike test ran")
- Any questions parked in the brief (if `/dev-builder` flagged ambiguities mid-build)

## Guardrails

- **Never merge the PR.** The merge is the human taste gate — it's where `Status: in_progress` becomes `complete` (via `/drain-queue`'s next GC pass).
- **Never run migrations** (`pnpm db:push`, `drizzle-kit migrate`, `supabase db push`) — pre-flight step 2 hard-stops.
- **Never modify files outside the brief's scope.** If you notice drift, record it in `docs/insights/` (per `docs/insights/043-knowledge-maintenance-at-point-of-contact.md`: Builder flags, Architect fixes) and move on.
- **Never `--force`, `--no-verify`, or `reset --hard`.** If you're tempted, stop and ask.
- **Stop on first real failure.** Cascading past a broken state corrupts the queue.
- **Maker-checker is procedurally enforced via fresh subagents.** Steps 4 and 5 MUST use the Agent / Task tool, NOT inline review in the Builder's conversation.
- **`/autobuild` does NOT enumerate `/dev-builder`'s verify steps.** Step 3 invokes `/dev-builder` and trusts its MUST list. Adding a redundant verify step here weakens the contract.
- **`/autobuild` does NOT push to `origin/main`.** Step 9 pushes to the feature branch. The only push to `origin/main` in the autopilot system is `/drain-queue`'s claim and GC pass.

## Failure Modes

| Symptom | Action |
|---------|--------|
| Pre-condition fails | Report and exit without touching anything |
| Pre-flight hard-stop (drizzle/migration) | Brief stays `Status: in_progress`; report; exit |
| `/dev-builder` ambiguity-flagged | Question parked in brief by Builder; brief stays `Status: in_progress`; exit |
| Tests/build fail (per `/dev-builder`'s contract) | Brief stays `Status: in_progress`; report with failure detail; exit |
| Reviewer finds unfixable P0/P1 | Brief stays `Status: in_progress`; PR NOT opened; report; exit |
| `gh pr create` fails | Branch is pushed; report and exit so user can open PR manually |
| Multiple `Status: in_progress` briefs (no `$ARGUMENTS`) | Ask user to pick one; never guess |
