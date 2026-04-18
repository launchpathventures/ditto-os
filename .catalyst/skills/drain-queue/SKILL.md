---
name: drain-queue
description: Cross-brief autopilot — claim the oldest ready brief whose Brief NNN deps are satisfied via atomic push, run /autobuild on each, stop when the queue is empty, blocked, or hits a failure.
argument-hint: "[max-briefs | all]"
disable-model-invocation: true
---

## Why This Skill Exists

`/dev-pm` triages and `/dev-architect` designs, but dispatching each `**Status:** ready` brief through `/dev-builder` → `/dev-reviewer` → `/dev-review` → PR open → status flip is mechanical work. `/drain-queue` treats `docs/briefs/*.md` files marked `**Status:** ready` as a self-draining queue. One brief at a time, on its own feature branch, each ending in an open PR. The queue stops on first failure so problems don't cascade.

This is the **cross-brief autopilot**. It composes `/autobuild` (within-brief autopilot) in a loop.

**Safe to run in parallel across Conductor workspaces** — see Concurrency below.

Companion brief: `docs/briefs/188-cross-brief-autopilot.md`. Doctrine: `docs/adrs/035-brief-state-doctrine.md`.

## Repo Context

- Read `@CLAUDE.md` — Ditto conventions, especially §How Work Gets Done and §Critical separation
- Read `@docs/dev-process.md` §Autopilot — the canonical guide to when to use this vs invoking roles directly
- Read `@docs/state.md` — current state, blockers, in-flight briefs
- Read `@AGENTS.md` — repo conventions

## Base Branch

The integration branch is **`main`**. All of the following reference that branch:

- Claims are pushed to `origin/main`
- Feature branches are created from `origin/main`
- PRs target `main`

**The base branch is never checked out by this skill.** Conductor workspaces are git worktrees, and a worktree cannot check out a branch that another worktree already has — so requiring a base-branch checkout would break parallel execution. All operations against base happen via `origin/main` (a fetched ref) and `git push origin <local>:main` (push to remote ref by name).

## Brief State Model (load-bearing)

Brief state lives in **markdown bold-prefix lines**, NOT YAML frontmatter. Ditto briefs have no `---` delimiters. The state line looks like `**Status:** ready` (or `draft | in_progress | complete`). Parse via line-prefix regex (e.g. `grep -E '^\*\*Status:\*\*\s+(\w+)'`), not via a YAML library. A YAML parser will return zero matches and the queue will appear permanently empty.

The atomic claim is a bold-line edit: `**Status:** ready` → `**Status:** in_progress`, committed and pushed to `origin/main`. Git's non-fast-forward push rejection is the mutex.

## Arguments

- No arg or `1` → drain exactly one brief
- `N` (positive integer) → drain up to N briefs
- `all` → drain until queue is empty or something fails

Default is `1`. Higher values require explicit intent.

## Pre-conditions

All must hold before draining starts:

1. Working tree clean (`git status --porcelain` empty)
2. `git fetch origin main` succeeds (remote is reachable)
3. At least one `docs/briefs/NNN-*.md` exists on `origin/main` with `**Status:** ready` (check via `git ls-tree origin/main docs/briefs/` then `git show origin/main:docs/briefs/<file>` filtered by Status line — NOT the local working tree, which may be on an unrelated branch)
4. `gh auth status` is logged in with at least `repo` scope
5. `pnpm install` is current (if unsure, run `pnpm install`)

If any fails, report and exit. Never attempt to repair pre-conditions autonomously.

**Starting branch doesn't matter.** This skill never checks out `main`. It creates its own throwaway claim branch from `origin/main` for each iteration.

## Execution — Per-iteration loop

Repeat up to the max-briefs limit.

### A. Refresh + populate PR maps + GC pass

1. `git fetch origin main` — if fetch fails, stop (remote unreachable or auth broken)
2. Single `gh pr list --state all --json number,state,title,body,mergedAt --limit 200` call — parse the result and populate two in-memory maps for this iteration:
   - **openMap**: `{slug → {url, number}}` for PRs in state `OPEN`, where `slug` is extracted from the PR body via regex `brief:(\d+-[a-z0-9-]+)` (the token autobuild step 8 inserts)
   - **mergedMap**: `{slug → {url, number, mergedAt}}` for PRs in state `MERGED`
   - PRs in state `CLOSED` (not merged) and PRs without a `brief:NNN-<slug>` token are ignored
3. **GC pass.** List briefs on `origin/main` with `**Status:** in_progress` (via `git ls-tree origin/main docs/briefs/` + `git show` on each + grep). Sort by the merge timestamp of their corresponding mergedMap entry (oldest first; no entry → sort last). Process up to **10 briefs** per iteration; remainder waits for the next iteration. For each brief in the processed batch:
   - **Slug found in mergedMap**: atomic flip — `git checkout -B claim-tmp origin/main`, edit the brief file in place changing `**Status:** in_progress` → `**Status:** complete` (a single sed or text edit), `git commit -am "chore(brief): mark <slug> complete (PR #N merged)"`, `git push origin claim-tmp:main`. On non-fast-forward rejection: silently retry on the next iteration (race-loss). The `**PR:** <url>` line on the brief file (added by autobuild step 9 to the feature branch and arrived on `origin/main` via the merge) is left in place as informational history.
   - **Slug found in openMap**: do nothing (build is in progress somewhere; let it finish)
   - **Slug not found in either map**: log a warning ("brief X is `Status: in_progress` but no matching PR found — orphan; manual cleanup needed"); do NOT flip
4. If `gh pr list` failed: retry once with a 2-second backoff. If still failing, skip the GC pass for this iteration (do NOT flip anything), log a warning, continue to step B.

No checkout of `main`, no pull. All reads from `origin/main` directly.

### B. Claim the next brief via atomic push (THE MUTEX)

This is the critical step. The push to the shared base branch is a distributed compare-and-swap: only one workspace can successfully push a given claim.

1. Create a fresh throwaway claim branch from the just-fetched base:
   - `git checkout -B claim-tmp origin/main`
   - `-B` (capital) resets the branch if it already exists from a prior iteration — this is the only legitimate "discard local state" operation in the skill, and it only ever discards a previous failed claim attempt or a previous GC commit

2. List candidate briefs on base — `git ls-tree origin/main docs/briefs/` → for each `NNN-*.md` file, `git show origin/main:docs/briefs/<file>` and grep `^\*\*Status:\*\*\s+(\w+)` (use **first match only** — briefs may legitimately embed `**Status:**` strings inside HEREDOCs or example blocks, but the canonical state line is always the first occurrence at the top of the file under the `**Date:**` line) → keep those returning `ready`. Sort by filename (oldest numeric prefix first — `001-` before `002-` before `100-`). If empty, stop — **queue empty**.

3. **Pick the first eligible brief.** Iterate the sorted list and pick the oldest brief whose `Brief NNN` deps are all satisfied. For each candidate:
   - Read its `**Depends on:**` line (single bold-line, may span continuation; treat the line as the prose immediately after the bold prefix)
   - Extract dependencies via regex `\bBrief\s+(\d+)\b` (case-insensitive). ADRs (`ADR-NNN`), phases (`Phase 14 ...`), infrastructure references (`credentials table`), and parenthetical descriptions are **informational and not enforced** — ignored. The human gates non-brief blockers via the `Status: ready` flip.
   - For each extracted `Brief NNN`, **first compute the dependency's full slug** by listing `docs/briefs/NNN-*.md` on `origin/main` (`git ls-tree origin/main docs/briefs/ | grep -E "^[^	]*	docs/briefs/NNN-"`); the (single) match's filename without the `.md` extension is the dependency's slug (e.g. `092-credentials-table`). If zero matches → case (a) below. If multiple matches → ambiguous; log a warning and treat as unsatisfied for safety.
   - Then check satisfaction. The blocker is **satisfied** iff one of:
     - (a) no file `docs/briefs/NNN-*.md` exists on `origin/main`, OR
     - (b) the file has `**Status:** complete`, OR
     - (c) the file has `**Status:** in_progress` AND the slug is in this iteration's `openMap` (someone is actively building it; downstream can proceed because that PR will eventually merge), OR
     - (d) the file has `**Status:** in_progress` AND the slug is in `mergedMap` (race window between merge and GC)
   - Otherwise the blocker is **unsatisfied** → skip this candidate, try the next
   - The first brief with all blockers satisfied is the claim target. Call its full slug `<slug>` (e.g. `188-cross-brief-autopilot`).
   - If no brief in the list is eligible, stop — **queue blocked**. Report which briefs are waiting on which unsatisfied blockers so the human can unblock or re-prioritise.

4. **Belt-and-braces:** check the iteration's `openMap` for `<slug>` → if a PR already exists (somehow), skip and continue iterating from step 3.

5. Make the claim commit on `claim-tmp`:
   - In-place edit the brief file: change the line `^\*\*Status:\*\* ready$` to `**Status:** in_progress`
   - `git add docs/briefs/<slug>.md`
   - `git commit -m "chore(brief): claim <slug>"`

6. `git push origin claim-tmp:main` — pushes the local `claim-tmp` branch to update remote `main`. Git's non-fast-forward check is what makes this atomic.
   - **Push accepted** → you own this brief. Proceed to step C.
   - **Push rejected** (non-fast-forward) → another workspace won the race. Recover: go back to step A. The race-loss recovery is automatic — the next iteration's `git fetch` + `git checkout -B claim-tmp origin/main` rebuilds the claim branch on top of whatever the winner pushed, the GC + PR-map step re-runs (catches any new merges), and step 3's eligibility check re-runs (so blocker shifts are re-evaluated).
   - **More than 5 consecutive lost races** → stop and report. Something is wrong (too many workers, or queue is nearly empty).

### C. Rename the claim branch to the feature branch

The claim is now committed on `claim-tmp` and pushed to base. Rename in place — no new checkout needed.

- `git branch -m claim-tmp feature/<slug>`
- The branch already has the `**Status:** in_progress` flip committed and is based on the updated base — `/autobuild` runs from this branch

### D. Run the within-brief autopilot

- Invoke the `/autobuild` skill
- `/autobuild` handles: pre-flight hard-stops → `/dev-builder` → fresh-subagent `/dev-reviewer` + `/dev-review` → fix P0/P1 → commit + push feature branch → open PR → add `**PR:** <url>` line to the feature branch → report

### E. Handle result

- **Success:** PR is open. Feature branch contains the implementation + the `**PR:** <url>` line on the brief file. Proceed to step F before continuing the loop.
- **Failure:** `/autobuild` stopped. Brief is at `**Status:** in_progress` on `origin/main` (claim already happened in step B). Do NOT continue the queue and do NOT run step F. Report the failure including the feature branch name so a human can recover.
- **Pre-flight hard-stop** (drizzle journal or DB migration in §What Changes): same as failure — brief stays `in_progress`, queue stops, report.

### F. Final-pass `/dev-review --fix` (mandatory on success, up to 3 recursions)

`/autobuild`'s step 5 runs `/dev-review` as a pre-PR gate via fresh subagent, fixing P0/P1 findings — but P2/P3 may accumulate. This step closes that loop: run `/dev-review --fix` recursively until the branch is clean, or escalate to human review after 3 passes.

Why recursion: a single `--fix` pass can introduce new findings as a side-effect of the fix, or leave residual P2/P3 issues that need another pass to surface once the top-level noise is cleared. Three passes is almost always enough; more usually means architectural and needs a human.

Still on the just-shipped feature branch:

1. Set `attempt = 1`, `max_attempts = 3`. Track the finding set across attempts to detect non-convergence.
2. **Loop:**
   a. Invoke `/dev-review --fix` against the branch's diff vs `origin/main` (Ditto uses `main` as the integration branch — different from the Catalyst-default base; the patched `/dev-review` skill already targets `origin/main`)
   b. Re-run **the full `/dev-builder` verify list per `.claude/commands/dev-builder.md` lines 81-86** (type-check + `pnpm test` + `pnpm test:e2e` + `pnpm test:e2e:auto`). Re-running only type-check would silently weaken the contract — fixes that break runtime behavior would slip through. Lint is omitted (this repo has no lint script). If any verify step regresses and `/dev-review --fix` can't resolve it in this same pass, stop the drain — treat as a failure per the failure branch of step E.
   c. If `/dev-review --fix` made changes:
      - Stage only the files it touched
      - Commit: `chore(review): apply /dev-review --fix findings (pass <attempt>)`
      - Push to the same feature branch so the open PR updates
   d. Re-invoke `/dev-review` (report-only, no `--fix`) to check residual findings
      - **Clean (no findings):** exit the loop
      - **Only unfixable findings remain** (ambiguous, architectural, out-of-scope): exit the loop and go to step 3
      - **Fixable findings remain AND `attempt < max_attempts`:** increment `attempt`, go to 2a
      - **Fixable findings remain AND `attempt == max_attempts`:** exit the loop, go to step 4 (human escalation)
   e. **Non-convergence guard:** if the exact same finding set appears in two consecutive passes with no reduction, treat as non-convergent — go to step 4 even if attempts remain
3. If unfixable findings remain after a clean convergence, post them as a single comment on the PR via `gh pr comment <url> --body "..."` so the human reviewer sees them. Continue the drain loop normally.
4. **Human escalation** (max attempts reached or non-convergent):
   - Do NOT continue the drain
   - Post a PR comment listing unresolved findings, number of passes attempted, and whether the failure mode was "didn't converge" or "capped at 3 passes with findings still present"
   - Add a note to the brief file (still at `**Status:** in_progress`) under a `## Drain-queue escalation` section
   - Report to the user in the final drain output. Soft stop — not a failure that corrupts state, but enough of a signal that a human should intervene before more briefs pile on top.

Only after step F exits cleanly (step 2d "Clean" or step 3 "unfixable only") does the loop continue to the next brief. Step 4 stops the drain.

The skill never returns to or checks out `main` — it stays on the most recent feature branch when the loop ends.

### Stop conditions

- Queue empty (no `**Status:** ready` briefs on base)
- Queue blocked (every remaining ready brief has at least one unsatisfied `Brief NNN` dep)
- `max-briefs` reached
- Any `/autobuild` invocation fails (including pre-flight hard-stops)
- Step F `/dev-review --fix` introduces unresolvable type-check regressions
- Step F escalates to human review (3 passes without convergence, or non-convergent finding set)
- More than 5 consecutive lost claim races
- Any pre-condition breaks mid-loop

## Concurrency — Running Multiple Workspaces in Parallel

Safe. This is the headline feature of the atomic-push claim, and the no-checkout design is what makes it work across Conductor's worktree model.

- N Conductor workspaces each running `/drain-queue` will each build a `claim-tmp` from `origin/main` and try to push it back to base
- Git's non-fast-forward rejection ensures exactly one winner per brief
- Losers loop back to step A, fetch the winner's claim, rebuild `claim-tmp`, and pick the next brief — no `reset --hard` needed because the loser was never on a shared branch
- Each workspace stays on its own branch the whole time, so worktrees never compete for the same checkout
- The single `gh pr list` call per iteration is one rate-limit token per iteration per workspace — comfortable within GitHub's 5000/hour limit even at N=8 workspaces
- Expected throughput: near-linear in N, limited by CI concurrency, GH PR API rate limit, and claim-race retries

**Known limitation: crash recovery.** If a workspace pushes a claim but crashes before opening a PR, the brief is stuck at `**Status:** in_progress` on `origin/main` with no owner. The GC pass will catch this on the next iteration (slug not in either PR map → "orphan" warning logged). Manual recovery: human edits the brief back to `**Status:** ready` (or `complete` / `draft` as appropriate) via a PR.

## Cost & throughput

A single `/autobuild` run has substantial wall-clock and LLM-token cost: `/dev-builder` (multiple LLM turns + `pnpm test:e2e` Playwright run + `pnpm test:e2e:auto`) + fresh-subagent `/dev-reviewer` + fresh-subagent `/dev-review` + up to 3 `/dev-review --fix` recursions. Empirical estimate: **30–60 minutes wall-clock per brief**; LLM token cost on the order of $5–$30 per brief depending on complexity.

`/drain-queue all` against a 50-brief queue therefore commits to **25–50 compute-hours** plus **$250–$1500 in LLM spend**, plus ~50 PRs requiring human merge review. Recommend starting with `/drain-queue 1` for the first session and only escalating to `/drain-queue all` once trust and rate-limit headroom are confirmed.

## Guardrails

- **Never check out `main`.** It would block other workspaces from running this skill. Use `origin/main` (fetched ref) for reads and `git push origin <local>:main` for writes.
- **Never merge PRs.** `/autobuild` enforces this. Merge is the human taste gate.
- **Never auto-promote `Status: draft` → `Status: ready`.** That's `/dev-pm`'s job (and ultimately a human's). `/drain-queue` only operates on briefs already marked `ready`.
- **Never edit briefs other than `**Status:**` and the GC pass's `complete` flip.** Step C edits exactly one line. The GC pass edits exactly one line. No other brief mutations from this skill.
- **No `--force`, `--no-verify`, or `reset --hard` anywhere in this skill.** Race-loss recovery is handled by `git checkout -B claim-tmp origin/main`, which discards only the prior claim attempt or GC commit.
- **Stop on first real failure** (as opposed to race-loss, which is recoverable). Broken builds in one brief can mask real failures in the next.
- **Cap your run** — default 1. `all` and `N>1` are explicit opt-ins.
- **Step F `/dev-review --fix` stays scoped to the feature branch's diff** (`git diff origin/main`). It must not touch files unrelated to the brief. If `/dev-review` flags issues outside the diff, surface them in the final report — don't fix them.
- **Trust boundary:** `**Status:** ready` IS the trust boundary for autonomous build. Anything marked ready will be implemented and PR-opened by this skill. Pre-flight hard-stops (in `/autobuild` step 2) cover DB-related risk only; everything else (`package.json` deps, `.github/workflows/`, `.env`, configs) relies on the `Status: ready` human gate. See `docs/adrs/035-brief-state-doctrine.md`.

## After draining

Report to user:
- How many briefs successfully shipped (PR open)
- Open PR URLs
- Per brief: step F outcome — number of `--fix` passes (1–3), what each pass fixed (one-line summary), final state (clean / unfixable-only / escalated)
- Any brief where step F hit the 3-pass cap or a non-convergent finding set — name the brief, the PR, and the unresolved findings
- Any brief that stopped the drain and why (build failure, pre-flight hard-stop, etc.)
- Any orphan warnings from the GC pass (briefs `in_progress` with no matching PR)
- How many `**Status:** ready` briefs remain on `origin/main`, and how many are currently blocked by unsatisfied `Brief NNN` deps (name the blockers)
- How many lost claim races occurred (high numbers suggest too many parallel workers)

Suggest the user review the PRs. The merge decision is theirs.
