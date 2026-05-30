# Insight-236: A shared multi-kind helper must resolve a cross-cutting filter once and apply it uniformly

**Date:** 2026-05-18
**Trigger:** Brief 281 `/dev-review` 5-pass audit — Finding 2: `recallWorkspace()` resolved and applied `projectSlug` differently per kind, so a project-scoped recall correctly scoped processes but could still leak a memory belonging to a different project.
**Layers affected:** L6 Human (recall/archive surfaces), L4 Awareness (workspace recall as a context primitive)
**Status:** absorbed into `docs/architecture.md` "Workspace recall as a shared scoped primitive" (Brief 281, Insight-236), `docs/review-checklist.md` item 19. Archived 2026-05-19.

## The Insight

When one helper fans out across heterogeneous kinds (projects, processes, memories, work, reviews, activity) and accepts a cross-cutting filter that applies to *some but not all* of them, the filter must be **resolved exactly once** into a single typed object and **threaded into every collector**, which each apply it the same way. Re-deriving the filter inside each collector is the defect class: the derivations drift, and the asymmetry hides on the happy path. It only surfaces when the filter is exercised across kinds at once — exactly the case unit tests under-cover until a multi-pass audit forces the question "is this applied *uniformly*?"

The contract must be explicit at three points: (1) an **unresolved filter short-circuits to empty** (a `projectSlug` that resolves to no project returns nothing, never an unscoped fallback); (2) **kinds the filter cannot scope are omitted**, not silently returned unfiltered (activity has no reliable project linkage → excluded when a project filter is active); (3) the resolved object carries enough to apply the filter through *indirect* ownership paths (a memory's project is via its process scope or `appliedProjectIds`, not a direct column) so every collector reaches the same answer.

## Implications

- Prefer `resolve once → pass a `ProjectFilter`-style object → each collector branches on the same flags` over `each collector re-parses the raw input`. The single resolution point is also the single place to add a new scopable kind.
- Tests for fan-out helpers must include a **cross-kind filtered case**, not just per-kind cases — the leak is invisible to single-kind tests.
- "Filter cannot scope this kind" is a first-class outcome (omit + zero its count), distinct from "filter matched nothing here."
- This is the read-side analogue of the null-path audit (Insight-190): when a branch is added to a fan-out, verify every kind honors it, not just the one in front of you.

## Where It Should Land

`docs/architecture.md` Layer-4/Layer-6 recall description (workspace recall as a shared scoped primitive), and a `docs/review-checklist.md` line for fan-out helpers ("cross-cutting filter resolved once and applied uniformly across all kinds; unscopable kinds omitted; unresolved → empty"). Fold into the pending Architect reconciliation pass alongside Insight-235.
