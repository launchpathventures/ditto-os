# Insight-022: Knowledge Needs Active Pruning

**Date:** 2026-03-20
**Trigger:** Insight directory growing to 20+ files with no pruning — some are absorbed, some likely superseded, but all remain active. Parallels how humans learn: old beliefs get corrected, not just accumulated alongside new ones.
**Layers affected:** L5 Learning (self-improvement meta-process mirrors this pattern)
**Status:** active

## The Insight

Insights, like human understanding, should have an active lifecycle: emerge, mature, get absorbed into durable knowledge (architecture spec, ADRs), or get superseded when understanding changes. The current system only accumulates — the insight template has `absorbed` and `superseded` statuses but nothing triggers their use.

This mirrors a core Agent OS principle: the harness learns from corrections. When the Documenter runs, insights that have been fully absorbed into architecture docs or ADRs should be marked as such and moved out of the active set. Insights that contradict newer understanding should be marked superseded with a pointer to what replaced them.

The test: if a new session reads only the active insights, do they get an accurate picture of current design thinking? If stale or absorbed insights remain active, they create noise or worse, contradictions.

## Implications

- The Documenter skill should include an "insight audit" step: review active insights against current architecture.md and ADRs; mark absorbed ones
- Insights that were provisional and turned out wrong should be superseded, not deleted — the history of why we changed our mind is valuable
- The reorganization task (Insight-021) should include moving absorbed/superseded insights to a subdirectory so the active set is immediately visible
- This pattern directly informs L5 (Learning Layer): the same prune-and-update cycle applies to agent memories and correction patterns

## Where It Should Land

`docs/dev-process.md` — add insight lifecycle management to the Documenter's responsibilities. Also informs the L5 Learning Layer design: memory pruning should follow the same principle (active memories that contradict newer corrections should be superseded, not just accumulated).
