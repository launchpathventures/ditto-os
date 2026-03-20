# Insight-006: Debt Needs First-Class Capture

**Date:** 2026-03-19
**Trigger:** Phase 2b review — reviewer flagged minor issues, builder dismissed as "acceptable at dogfood scale", human challenged why we'd carry debt forward silently
**Layers affected:** L1 Process, L3 Harness, L5 Learning
**Status:** absorbed into docs/briefs/006-debt-tracking.md

## The Insight

Technical and process debt currently lands in fragile, non-queryable places: `docs/state.md` "Known Issues" (manual, drifts), inline `// TODO` comments (invisible to the system), and reviewer notes that get acknowledged then forgotten. None of these have a lifecycle, re-entry conditions, or visibility to future sessions.

Every organisation creates debt. The question isn't whether debt exists — it's whether the system knows about it. Agent OS needs a first-class mechanism for capturing debt with:
- **What** — the specific compromise or gap
- **Why** — the reasoning for deferral (not just "dogfood scale")
- **When to revisit** — a concrete re-entry condition, not "later"
- **Scope** — which component, layer, or process is affected
- **Lifecycle** — identified → acknowledged → deferred → resolved (or escalated)

This is distinct from improvements (positive proposals) and captures (unstructured notes). Debt is a known deviation from the intended design that has been consciously accepted.

## Implications

- The `improvements` table is close but not right — it frames everything as a positive proposal. Debt is a negative acknowledgment.
- The harness could track debt the same way it tracks harness decisions — as structured records with metadata, queryable for patterns.
- Reviewer findings that are "accepted but not fixed" should automatically become debt records, not disappear into the conversation.
- The daily brief (Phase 4 CLI / Phase 9 dashboard) should surface accumulated debt alongside review queue items.
- Process-scoped debt (e.g., "this process's cost tracking uses hardcoded pricing") should be visible when working on that process.

## Where It Should Land

- Architecture spec — possibly a new table or an extension of the `improvements` table with a `type` field (improvement | debt)
- Phase 4 CLI — `pnpm cli debt` to list and manage
- Dev process — reviewer findings that are deferred should be captured automatically
- ADR if the design is non-obvious
