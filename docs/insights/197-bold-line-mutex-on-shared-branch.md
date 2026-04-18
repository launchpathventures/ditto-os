# Insight-197: Bold-Line Content Mutation as a Distributed Mutex

**Date:** 2026-04-18
**Trigger:** Brief 188 (cross-brief autopilot) — needed a cross-workspace coordination primitive for claiming `**Status:** ready` briefs from `docs/briefs/`. Catalyst's source skill encoded brief state in filename prefixes and used `git mv` as the atomic claim; Ditto's brief format puts state in markdown bold-prefix lines inside the file content with no filename state encoding. The port had to invent a different mechanism on the same git substrate.
**Layers affected:** Meta (dev-process); generalizable to any L3 (Harness) primitive that needs distributed coordination on shared branch state.
**Status:** active

## The Insight

**Any single-line content edit to a tracked file on a shared git branch can serve as a distributed mutex via git's non-fast-forward push rejection.** The mechanism does not require filename changes, schema changes, external locks, or coordination services. The push to a shared base branch IS the compare-and-swap.

Concretely for Brief 188's autopilot: workspace A and workspace B both fetch `origin/main`, both build a `claim-tmp` branch from the same SHA, both edit one brief file's `**Status:** ready` → `**Status:** in_progress`, both commit, both `git push origin claim-tmp:main`. Git accepts exactly one push (the first to arrive) and rejects the other with `non-fast-forward`. The loser rebuilds `claim-tmp` from the just-fetched `origin/main` and tries the next eligible brief. No `--force`, no `reset --hard`, no shared checkout required.

The Catalyst source uses `git mv approved-X.md → active-X.md` as its claim — same primitive (atomic-push to base) on a different file operation. The insight is that the file operation is interchangeable as long as it's a single content-affecting change. Filename rename, single-line text edit, single-block deletion — all work identically.

## Implications

- **No-checkout coordination is possible across Conductor worktrees.** Conductor workspaces can't share a checkout of the same branch, but they can all push to `origin/<branch>` independently. The mutex pattern works entirely without ever checking out the shared branch (`git fetch` + `git push origin local:remote`).
- **Race-loss recovery is automatic and idempotent.** `git checkout -B claim-tmp origin/<branch>` discards the prior claim attempt's local commit and rebuilds from the just-fetched base. The loser's recovery is symmetric to its initial attempt — no special-case handling.
- **The atomic operation must be a single commit.** Chaining multiple commits inside the claim is fragile because race-loss recovery via `-B` discards all of them and would leave inconsistent intermediate state in the loser's worktree if any external observer queried mid-chain. Single-commit atomicity is the invariant.
- **The signal must live on the shared branch (origin/main here), not on a feature branch.** Markers pushed only to feature branches are invisible to other workspaces until those branches merge. This was the round-3 dev-review CRITICAL finding for Brief 188 (see Insight-199): a `**PR:** <url>` marker pushed only to the feature branch was destroyed by squash-merge.

## Where It Should Land

- **ADR-035** (`docs/adrs/035-brief-state-doctrine.md`) is the first application; doctrine 1 documents the bold-line mutex for brief state specifically.
- **Generalizable** to future tooling: any system needing cross-workspace coordination on a small piece of shared state (lock files, pipeline checkpoints, deployment manifests) can use this pattern. When the next such system is designed, this insight is the prior art reference.
- **Promote to architecture.md §Cross-Cutting Governance** if a second concrete application emerges. Until then, ADR-035 is the canonical home.
