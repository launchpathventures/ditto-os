# Insight-021: Project Artifacts Need Lifecycle Organization

**Date:** 2026-03-20
**Trigger:** Briefs directory grew to 10+ files with no visual indicator of status — all in a flat folder. The same issue affects insights (duplicate numbering, no lifecycle grouping).
**Layers affected:** None (dev process, not architecture)
**Status:** absorbed into `docs/dev-process.md` (Artifact Lifecycle Management section)

## The Insight

As the project accumulates briefs, insights, debts, and research docs, flat directories with numbered files stop scaling. The `docs/briefs/` directory now has 10 briefs spanning 4 statuses (complete, ready, in_progress, template). You have to open each file to see its status. The `docs/insights/` directory has worse problems: duplicate numbers (002, 010, 013, 014, 015, 017) and no grouping.

The organizing principle should match how these artifacts are consumed: briefs by lifecycle stage (what's active vs done), insights by absorption status (active vs absorbed), debts by resolution state.

## Implications

- Briefs: sub-folders by status (`complete/`, `active/`, `ready/`) or a similar grouping that makes the working set obvious at a glance
- Insights: deduplicate numbering, consider grouping active vs absorbed
- This is a one-time reorganization task, not an ongoing process change — once the structure exists, the dev process skills should maintain it (e.g., Builder moves brief to `complete/` after approval)
- Git history gets noisier from moves but the tradeoff favors readability at the current scale

## Where It Should Land

`docs/dev-process.md` — add a section on artifact lifecycle management. The reorganization itself is a single task the Builder can do without a brief.
