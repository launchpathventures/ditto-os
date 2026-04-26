## Insight-206: Shared Audit Tables Need a Writer Discriminator Column

**Date:** 2026-04-26
**Trigger:** Brief 215 review M2 — multiple subsystems (trust gate, runner dispatcher, future cloud-runner adapters, future deploy gate) all write to `harness_decisions`; without a discriminator column, callers had to grep `reviewDetails` JSON to tell whose row they were looking at.
**Layers affected:** L3 Harness, L5 Learning (audit consumers)
**Status:** active

## The Insight

When several writers share a single audit table, each one needs a small, queryable "tag" column the writer claims as its own — distinct from the JSON detail blob the writer also fills in. The detail blob is rich but opaque to indexes and joins; the tag is queryable and lets consumers filter without parsing JSON or guessing from shape.

In Brief 215 we found this concretely: the runner dispatcher writes one `harness_decisions` row per dispatch, alongside the existing review-pattern handler that writes rows for trust-gate decisions. Without a tag, "give me all dispatcher rows for this stepRun" requires scanning every row's `reviewDetails.runner` JSON field. With `reviewPattern: ["runner-dispatch"]` claimed by the dispatcher, the same query is a flat WHERE.

The pattern generalises beyond audit tables: any time multiple subsystems write into a single shared table whose primary purpose is "I happened" (audit, activity log, feedback, signals), reserve a small column for the writer's identity. Don't make it the JSON blob — that defeats indexes.

## Implications

- **Establish naming convention now.** Brief 215 used `reviewPattern: ["runner-dispatch"]` because `reviewPattern` is an existing array column. Future writers should claim a value rather than a new column. Candidate values to reserve: `"trust-gate"`, `"runner-dispatch"`, `"deploy-gate"` (Brief 220), `"managed-agent-checkpoint"` (Brief 217).
- **Index the discriminator if read patterns warrant.** `harness_decisions` doesn't need it yet (low row count), but on `activities` — already high-volume — a similar tag column should be indexed.
- **Don't repeat the discriminator inside the JSON blob.** That's belt-and-suspenders that only causes drift. The column is the source of truth.
- **Tests should assert the tag.** Brief 215's dispatcher tests now assert `reviewPattern === ["runner-dispatch"]` so the discriminator can't silently regress.

## Where It Should Land

`docs/architecture.md` §L3 Harness — under the audit-discipline section, document the discriminator column as a constraint on shared-audit writes. Candidate addition to the architecture review checklist (`docs/review-checklist.md`): "If your code writes to a shared audit table, does it claim a writer discriminator?"
