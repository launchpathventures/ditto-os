# Insight-139: Parallel Worktree Builds for Independent Briefs

**Date:** 2026-04-01
**Trigger:** Building Briefs 072, 073, 074 simultaneously via isolated git worktrees
**Layers affected:** Dev process (meta)
**Status:** active

## The Insight

When multiple briefs have no file-level dependencies between them, they can be built in parallel using isolated git worktrees. Each agent operates on a full copy of the repo, makes its changes independently, and produces a commit. The orchestrating session then merges all worktrees sequentially — git handles the combination.

This session built three briefs (072: engine types + UI, 074: engine heartbeat + orchestrator, 073: composition + Self context) in parallel. All three merged cleanly with only one auto-resolved conflict (self-stream.ts, modified by both 072 and 073). Total wall-clock time was dominated by the slowest agent (~11 min), not the sum of all three (~20+ min sequential).

The key constraint: briefs must not modify the same lines. The parent brief (071) already organized sub-briefs into parallel phases, which made this natural.

## Implications

- Brief sequencing (the PM's job) should explicitly mark which briefs can build in parallel vs which have file-level conflicts
- The Builder can launch N parallel agents when briefs are independent — merge is the synchronization point
- Reviewer still runs once on the merged result, not per-worktree

## Where It Should Land

`docs/dev-process.md` — Builder role section, parallel build pattern.
