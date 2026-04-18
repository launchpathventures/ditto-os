# Insight-199: Squash-Merge Silently Destroys Metadata Pushed Only to the Base Branch

**Date:** 2026-04-18
**Trigger:** Round-3 dev-review of Brief 188 (cross-brief autopilot). The brief's first design pushed a `**PR:** <url>` marker to `origin/main` directly (a third atomic-push commit) so the GC pass and dependency-eligibility logic could read the in-flight signal from `origin/main`. The 5-pass dev-review caught a CRITICAL defect: under GitHub's squash-merge strategy (a common default), the squashed merge commit applies the feature branch's diff over `origin/main`, REPLACING the brief file with the feature branch's version (which never had the `**PR:**` line). Squash merge silently removes the marker — meaning the GC pass cannot find the brief and the dependency-eligibility model breaks invisibly.
**Layers affected:** Meta (dev-process); applies to any L3 (Harness) tooling that needs metadata to survive PR merges.
**Status:** active

## The Insight

**Any metadata pushed only to a base branch (e.g. `origin/main`) is fragile under PR merges.** Specifically:

- **Squash merge** (GitHub default for many repos): the squashed commit is built from the feature branch's diff vs the merge base. The feature branch's version of the file REPLACES the base branch's version on merge. Any line that exists only on base — pushed there independently of the feature branch — is destroyed.
- **Rebase merge:** depends on git's three-way merge logic. Lines that exist only on base may or may not survive depending on whether the feature branch touched the same file.
- **Merge commit (true merge):** three-way merge typically preserves base-only lines because the feature branch didn't modify them. Most resilient of the three strategies.

The fragility is **merge-strategy-dependent and silent** — the metadata works in test under merge-commit, fails in production under squash-merge. The failure mode is invisible until the metadata stops doing its job.

## Implications

- **For mutex/coordination metadata: keep it on the base branch and avoid PR-merge interference.** State that needs to survive merges (e.g. `**Status:** in_progress`) is fine on `origin/main` because the feature branch carries the same edit through the PR. State that conflicts with the feature branch's version (e.g. a `**PR:** <url>` line not present on the feature branch) will be destroyed by squash-merge.
- **For per-PR metadata, prefer the GitHub PR API or feature-branch-resident annotations.** Brief 188's resolution: query `gh pr list --state all --limit 200` once per `/drain-queue` iteration to discover open/merged PRs, parse `brief:NNN-<slug>` tokens from PR bodies. The `**PR:** <url>` line is added to the feature branch only as informational documentation; it survives the merge naturally because it's part of the feature branch's diff.
- **Generalizable to any future tooling that pushes metadata to a shared branch.** Before adding a "marker" line to `origin/main`, ask: will this line survive a squash-merge of a feature branch that doesn't include it? If no, use the API or feature-branch-resident metadata instead.

## Where It Should Land

- **ADR-035 §Consequences §New constraints** — already documents the implication for Brief 188's autopilot specifically.
- **Promote to a general principle in `docs/dev-process.md`** or a future `docs/landscape.md` "git tooling considerations" subsection if a second application emerges.
- **Insight stays active** as a cross-cutting trap-warning for any future Builder/Architect designing tooling that interacts with PR merges.
