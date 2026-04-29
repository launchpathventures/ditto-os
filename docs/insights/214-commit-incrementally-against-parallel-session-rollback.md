# Insight-214: Commit Incrementally Against Parallel-Session Rollback Risk

**Date:** 2026-04-27
**Trigger:** During Brief 217 (Managed Agents dispatcher) build, ~6 hours of uncommitted work was rolled back when a parallel session's workspace sync overwrote the working tree. Files I had created and edited (managed-agent adapter, status decoder, runner-poll-cron, instrumentation wiring, admin UI) were reverted to their pre-Brief-217 state. Only the spike-test commit (`a2f2777`, committed early per Insight-180 spike-first discipline) survived. Recovery cost: ~90 minutes redoing the rolled-back work.
**Layers affected:** L1 Process (development workflow — Builder role, parallel-session coordination).
**Status:** active

## The Insight

When multiple Conductor sessions edit the same workspace concurrently, an uncommitted working tree is exposed to rollback if a parallel session's sync overwrites file state. The protection is to commit each task-sized chunk to git the moment it's verified — even if the chunk is partial, even if commit messages will need cleanup later. Anything not committed is one workspace-sync away from being lost.

The Brief 217 build had a natural commit cadence available (one commit per task in the Builder's task list), but the Builder ran 8+ tasks under a single uncommitted working tree before discovering the rollback. After the recovery, every subsequent task was committed immediately on green. The net cost was ~90 minutes of redo plus the cognitive overhead of re-deriving the same code; it would have been zero if the Builder had committed after each task completed.

## Implications

1. **Commit per task, not per session.** When the Builder marks a task `completed`, the corresponding files should be committed in the same turn. This applies even when the task is small — five commits with messages like "Brief X — wire registry" / "Brief X — admin UI" are better than one big commit, and they're far better than zero commits (the rollback case).

2. **Spike-first survives because it commits first.** Insight-180's spike-test discipline produced the only Brief 217 commit that survived the rollback. The discipline isn't accidental: spikes commit before any other AC code. This is also a rollback-resistance pattern, not just a verify-the-API pattern.

3. **Rebase concerns are smaller than rollback concerns.** Builders sometimes hold off committing because they want to clean up history (squash, amend, reorder) before pushing. With parallel sessions, the cost of holding uncommitted work is unbounded; the cost of a slightly-noisy commit history is bounded and easy to clean up post-hoc. Default to commit early; clean up history only if needed.

4. **Branch protection doesn't help here.** The rollback wasn't a `git reset` — it was a workspace file overwrite from another session. Branch policies, force-push rules, and remote-side hooks have no leverage. Only local commits in the branch's `.git/objects` provide durability.

5. **Stash is not a substitute for commit.** During Brief 217 the Builder used `git stash` to preserve parallel-session changes during a rename. That stash had to be popped later with conflict resolution. Stash entries are NOT durable across workspace sync events the way commits are.

## Where It Should Land

Adopt into `docs/dev-process.md` §"Dev Builder" role contract as a Constraint: "Commit per task. When you mark a task complete, commit the corresponding files in the same turn. Uncommitted work is one parallel-session sync away from rollback. Squash later if needed; commit now." Also worth a one-line addition to the `dev-builder` skill prompt at `.claude/commands/dev-builder.md`.
