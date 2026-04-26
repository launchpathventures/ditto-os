# Insight-207: Audit-row Targeting Depends on the Actor's Step Context

**Date:** 2026-04-26
**Trigger:** Brief 223 builder + reviewer pass — the brief asked for `harness_decisions` rows with `actorType='admin-cookie'` (bearer rotation) and `actorType='runner-webhook'` (status callback). Two structural problems surfaced: (a) `actorType` lives on `activities` not `harness_decisions`; (b) `harness_decisions.stepRunId` is NOT NULL FK, so the bounded-waiver case (NULL stepRunId per Insight-180) cannot write there at all. The Builder substituted `activities` (which has both `actorType` and `metadata`) and the implementation works, but the brief drifted from the schema.
**Layers affected:** L3 Harness (audit), L5 Learning (audit consumers)
**Status:** active

## The Insight

The choice of audit table is not just "where does the row best fit semantically" — it's gated by the actor's step-run context. `harness_decisions` is for events that arose from harness pipeline step execution: every row is anchored to a `stepRunId` (NOT NULL FK) and a `processRunId`. That anchor is the audit's claim that the action originated from a governed step.

When the actor has NO step-run context — admin-cookie operations (bearer rotations, manual actions from the UI), runner-webhook callbacks under the Insight-180 bounded waiver, cron-driven seed jobs — there is no `stepRunId` to anchor the row to. The choice becomes:

1. **Write to `activities`** (NULL-able actorId, free-form metadata, no stepRunId requirement). This preserves queryability and the discriminator benefit (Insight-206) via `actorType`.
2. **Skip the audit row entirely** — loses the trail.
3. **Synthesise a step-run** — overkill, and pollutes the harness pipeline state.

The right answer is (1): `activities` is the canonical audit destination for events that don't originate from a governed step.

## Implications

- **Brief writers:** when specifying audit destinations, name `activities` for events triggered outside step execution (admin actions, webhooks under waiver, cron jobs). Name `harness_decisions` only when a step-run is the originator.
- **Schema invariants:** `harness_decisions.stepRunId` SHOULD stay NOT NULL — this is the audit's anchor and removing it would dilute the table's meaning.
- **Insight-180 interaction:** the bounded-waiver row cannot live on `harness_decisions` (missing FK target). It must live on `activities` with `metadata.guardWaived = true`. This is consistent with Brief 212's `reviewDetails.bridge.orphaned = true` precedent — the post-hoc-signal pattern lands on whichever table can hold a NULL-stepRunId row.
- **Tag discipline (Insight-206 echo):** activities-table writers should still claim a discriminator via `actorType` ("admin-cookie", "runner-webhook", "system-cron", …) AND optionally a structured `action` value ("project_bearer_rotated", "work_item_status_update").

## Where It Should Land

`docs/architecture.md` §L3 Harness — extend the audit-discipline guidance with a "which table when" rule: harness_decisions for step-originated events, activities for everything else. The review-checklist should add: "If your code writes an audit row, can the actor produce a stepRunId? If not, the row belongs on `activities`, not `harness_decisions`."
