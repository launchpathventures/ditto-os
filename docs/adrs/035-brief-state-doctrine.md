# ADR-035: Brief State Doctrine — Status as Dispatch Mutex, Trust Boundary, and Narrow Dependency Model

**Date:** 2026-04-18
**Status:** accepted

## Context

Ditto's brief queue (`docs/briefs/NNN-*.md`) has grown past 100 entries. Manual dispatch through `/dev-pm` → `/dev-architect` → `/dev-builder` → `/dev-reviewer` → `/dev-review` → PR mechanics dominates the human's day even though every step is mechanical. Brief 188 (Cross-Brief Autopilot) ports Catalyst's `/drain-queue` + `/autobuild` skill pair to Ditto so the dispatch becomes machine work.

That port forced three architectural decisions that don't fit cleanly inside the brief itself or any pre-existing ADR:

1. **What is the cross-workspace dispatch mutex?** Catalyst encodes brief state in filename prefixes (`approved-`, `active-`, `_review-`, `_blocked-`) and uses a filename rename as the atomic claim. Ditto encodes brief state in a markdown bold-prefix line (`**Status:** ready`) inside the brief file and has 100+ briefs whose names follow a numeric `NNN-name` convention. The mutex needs a different mechanism on the same git substrate.
2. **What is the trust boundary for autonomous build?** Once `/drain-queue` exists, marking a brief `**Status:** ready` is no longer just a triage signal — it becomes an authorization for autonomous code execution and PR opening. This is an architectural surface change that the existing trust-tier doctrine (`docs/architecture.md` §Trust Tiers) does not cover, because that doctrine concerns *agent execution* trust, not *dispatch authorization* trust.
3. **What dependencies are enforced?** Ditto briefs use a freeform `**Depends on:**` prose line that mixes `Brief NNN` references, ADRs (`ADR-NNN`), phase mentions (`Phase 14 Network Agent complete`), infrastructure callouts (`credentials table`), and parenthetical descriptions. Catalyst's blocker model (`blocked_by: [feature_test-e2e-infrastructure]` — a YAML list of short-slugs in frontmatter) does not apply. The autopilot needs an explicit, narrow extraction policy.

These three decisions constrain `/drain-queue`, `/autobuild`, the brief template, and any future tooling that pattern-matches on brief state. Documenting them inside Brief 188 alone would bury the doctrine. ADR-035 is the canonical home.

## Decision

### 1. Brief Status as Cross-Workspace Dispatch Mutex

Brief state lives in **markdown bold-prefix lines** in the brief file (`**Status:** ready | draft | in_progress | complete`), NOT in YAML frontmatter (Ditto briefs have no `---` delimiters). The atomic claim is a single-line edit pushed to `origin/main`:

- Workspace edits `**Status:** ready` → `**Status:** in_progress` in the chosen brief
- Single-commit on a throwaway `claim-tmp` branch built from `origin/main`
- `git push origin claim-tmp:main`
- Git's non-fast-forward push rejection is the mutex — exactly one workspace wins per brief

This works on the standard git substrate without filenames, schemas, or external locks. Race-loss recovery rebuilds `claim-tmp` from the just-fetched `origin/main` and re-runs eligibility selection — no `--force`, no `reset --hard`, no shared-checkout requirement. Conductor worktrees can therefore run multiple `/drain-queue` instances in parallel safely.

The `**PR:** <url>` line that `/autobuild` adds when opening a PR is **informational documentation on the feature branch only** — NOT a load-bearing signal on `origin/main`. The authoritative in-flight signal for both the GC pass and dependency-eligibility checks is `gh pr list --state all --limit 200` (queried once per `/drain-queue` iteration, results cached in-memory). The PR-API source-of-truth is necessary because GitHub's squash-merge strategy would silently DELETE any marker pushed to `origin/main` directly.

### 2. `**Status:** ready` IS the Trust Boundary for Autonomous Build

Once `/drain-queue` is installed and running, marking a brief `**Status:** ready` is functionally equivalent to authorizing `/dev-builder` to implement it autonomously and open a PR. The autopilot does not introduce a new privilege — running `/dev-builder` manually on a brief is the same authorization. The autopilot only removes the per-step dispatch friction.

This means:

- **Reviewers approving briefs for `ready` SHOULD scan §What Changes for high-blast-radius patterns** (`package.json` `dependencies`/`devDependencies`, `.github/workflows/*.yml`, `.env*`, `next.config.*`, `vite.config.*`, `tsconfig.*`, new scripts in `package.json` "scripts" field) and either reject the flip or hand-build instead of leaving for the autopilot.
- **The autopilot's pre-flight hard-stops cover DB-related risk only** (`drizzle/meta/_journal.json`, `drizzle/migrations/`, `packages/core/src/db/schema/`, `src/db/schema/`, `pnpm db:*`, `drizzle-kit push/migrate`, `supabase db push`). Everything else is the human's responsibility at the `Status: ready` gate.
- **No autonomous path bypasses this gate.** `/drain-queue` only operates on `Status: ready` briefs. `/dev-pm` does not auto-promote `draft` → `ready` (that's a human triage decision). `/autobuild` does not auto-merge PRs (that's a human merge gate).
- **Trust-tier integrity is preserved.** This dispatch-trust boundary is orthogonal to the agent-execution trust tiers documented in `docs/architecture.md` §Trust Tiers. The autopilot does not modify trust-tier configuration; brief implementations that change trust constants do so under `/dev-builder`'s normal constraints.

### 3. Narrow `Brief NNN` Dependency Model

`/drain-queue` extracts dependencies via the regex `\bBrief\s+(\d+)\b` from the `**Depends on:**` line. Only those references are enforced. Everything else in the line — ADRs (`ADR-NNN`), phase mentions, infrastructure references, parenthetical descriptions — is treated as **informational and not enforced**.

A `Brief NNN` blocker is **satisfied** iff one of:

- (a) no `docs/briefs/NNN-*.md` file exists on `origin/main`
- (b) the file has `**Status:** complete`
- (c) the file has `**Status:** in_progress` AND a PR with `brief:NNN-<slug>` token exists in the iteration's open-PR map (someone is actively building it; downstream can proceed because that PR will eventually merge)
- (d) the file has `**Status:** in_progress` AND a PR with `brief:NNN-<slug>` token exists in the merged-PR map (race window between merge and GC's `complete` flip)

Otherwise the blocker is unsatisfied and the brief is skipped at claim time.

The narrow model is intentional. The freeform `**Depends on:**` prose was designed for human reading, not machine parsing. A best-effort regex over prose would be brittle and would either false-positive (skipping briefs that should ship) or false-negative (claiming briefs that aren't actually unblocked). The narrow model says: machines enforce only what they can parse reliably; humans enforce everything else by virtue of marking only fully-unblocked briefs as `Status: ready`.

## Provenance

- **Source project:** Catalyst (sibling project at `/Users/thg/conductor/workspaces/agent-crm/kyoto`)
- **Source files:** `.catalyst/skills/drain-queue/SKILL.md` (atomic-push mutex, race-loss recovery, dependency-blocker model), `.catalyst/skills/autobuild/SKILL.md` (within-brief pipeline)
- **What we took:** the atomic-push mutex pattern using a shared base branch, the race-loss recovery via `git checkout -B`, the no-merge / human-gate constraint, the recursive `/dev-review --fix` pass with non-convergence guard
- **What we changed:** (1) brief-state mechanism from filename rename to markdown bold-line edit (Ditto brief convention has no filename state prefixes); (2) dependency-eligibility from filename-based blocker scan to PR-API-based open/merged map (the freeform `**Depends on:**` field can't be reliably parsed as filenames); (3) GC mechanism from rename-on-merge to `gh pr list` query (squash-merge would destroy any marker on `origin/main`); (4) maker-checker enforcement from inline `/dev-review` to fresh-subagent `/dev-reviewer` AND `/dev-review` (Ditto's stricter separation per CLAUDE.md §Critical separation); (5) script names (`pnpm run type-check` vs Catalyst's `pnpm typecheck`); (6) `main` as the integration branch; (7) explicit pre-flight hard-stops on Drizzle journal + DB migrations (Insight-190).

The trust-boundary doctrine (decision 2) is partially original to Ditto — Catalyst's source skills imply but don't formalize the equivalent boundary (`approved-` filename prefix is the Catalyst trust gate). Promoting it to an architectural doctrine in Ditto is the contribution of this ADR.

The narrow `Brief NNN` regex model (decision 3) is original to Ditto — Catalyst's structured `blocked_by` YAML field doesn't translate to Ditto's freeform `**Depends on:**` prose, so the regex-narrow model is a Ditto-specific solution.

## Consequences

### What becomes easier

- **N parallel Conductor workspaces can drain the queue concurrently.** The atomic-push mutex makes this safe with no shared-checkout requirement. Throughput scales near-linearly in N (limited by GitHub Actions CI concurrency, GH PR API rate limit, and claim-race retries).
- **Brief authors don't change anything.** The bold-line `**Status:**` is the existing convention from `docs/briefs/000-template.md`. No template edits required.
- **Dependency declarations remain human-readable.** The `**Depends on:**` line stays freeform prose; only the narrow `Brief NNN` subset is machine-enforced.
- **Reviewers approving briefs for `ready` have a clear mental model.** The flip is a code-execution authorization; treat it accordingly.

### What becomes harder

- **Adding a new pre-flight hard-stop class** requires editing `/autobuild` Step 2. The current set (DB-related) is the floor; growing the set as new high-blast-radius patterns emerge is expected.
- **Dependency satisfaction relies on `gh pr list` liveness.** A `gh` outage or rate-limit hit during `/drain-queue` step A degrades to "skip GC for this iteration" plus "no eligibility check possible" — the queue effectively pauses. Recovery is automatic on the next iteration once `gh` recovers.
- **Brief authors who want machine-enforced cross-brief deps must use `Brief NNN` syntax.** Saying "depends on the credentials migration" instead of "depends on Brief 092" is informational only. This is intentional — see decision 3 — but is a change from the round-1 brief format that allowed any string in `**Depends on:**`.

### New constraints introduced

- **All briefs MUST use the `**Status:** ready | draft | in_progress | complete` value set.** Other status values are not recognized. Brief template (`docs/briefs/000-template.md`) lifecycle comment confirms this set; the autopilot enforces it by parsing.
- **PR bodies opened by `/autobuild` MUST include a `brief:NNN-<slug>` token on its own line.** This is the load-bearing signal `/drain-queue` parses to populate the open/merged PR maps. Manual PRs that omit the token are invisible to the autopilot's GC pass and dependency-eligibility checks.
- **The integration branch is `main`. The autopilot never checks it out.** Conductor's worktree model can't share a checkout. Future tooling that wants to operate on `main` must follow the same `origin/main`-only pattern.
- **Pre-flight hard-stop scope is DB-only by design.** Other classes of risk rely on the `Status: ready` human gate. Closing additional gaps requires either (a) expanding pre-flight or (b) tightening the human review process when flipping briefs to `ready`.
- **`gh pr list --limit 200` is an assumed-fits ceiling.** The current implementation parses up to 200 PRs (open + merged + closed + draft) per `/drain-queue` iteration to populate the openMap/mergedMap. If lifetime PR volume exceeds this, the GC pass and dependency-eligibility checks start missing matches silently. Revisit pagination (or a `--search "brief: in:body"` filter) when PR volume approaches the ceiling. At a typical 1 PR/day cadence, this becomes a concern around the 6-month mark.

### Follow-up decisions

- **None blocking.** ADR-035 is self-contained and doesn't open new design questions for Brief 188's implementation.
- **Architecture spec update.** `docs/architecture.md` gains a §Cross-Cutting Governance addendum that cross-references this ADR (per the human's decision on Brief 188's Open Question).
- **Future:** if a brief shipped via `/drain-queue` introduces a regression that the `Status: ready` review missed, that's evidence to either (a) tighten human review at the `ready` flip or (b) expand pre-flight hard-stops. Capture as an insight when it happens.
