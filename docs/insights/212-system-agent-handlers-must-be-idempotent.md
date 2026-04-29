# Insight-212: System-agent handlers with side effects must be idempotent

**Date:** 2026-04-27
**Trigger:** Brief 225 dev-review pass — `runSurfaceReport` had no idempotency guard. The heartbeat retries failed steps via `review-pattern.ts:295`'s retry path; each retry would have inserted another `workItems` row + `harness_decisions` row, polluting the surface-report contract ("one artefact per project") with duplicate stubs.
**Layers affected:** L1 Process (system process steps), L3 Harness (retry path)
**Status:** active

## The Insight

System-agent handlers that produce DB writes — workItems rows, harness_decisions rows, status flips — must be idempotent. The harness pipeline's retry loop is allowed to invoke the same handler multiple times for the same `(processRunId, stepRunId)` tuple; a non-idempotent handler turns a transient failure into a stream of duplicate side effects.

The Insight-180 step-run guard solves *who can call this function* (only the harness pipeline). It does not solve *what happens when the harness calls it twice*. Those are orthogonal concerns; both have to be addressed for any handler that writes.

## Implications

- For any system-agent handler that inserts a row, check for an existing row first (select-then-insert under transaction, or use `INSERT ... ON CONFLICT DO NOTHING`, or rely on a UNIQUE constraint that returns the existing row's id).
- The natural idempotency key is `(projectId, source='system_generated', step-or-purpose-discriminator)`. For Brief 225's `surface-report` step, the natural key is `(projectId, source='system_generated')` since there's exactly one onboarding report per project.
- When the body of the artefact evolves (sub-brief #2 fills in real findings on a re-run), idempotency means "reuse the row id and update the body" rather than "insert a fresh row." The choice between update-in-place vs append-new depends on the artefact's lifecycle contract — document it in the brief.
- For harness_decisions audit rows: idempotency is less critical because each decision is intentionally a fresh audit event. But check the brief — if a step is logically "one decision per step run," guard against duplicate stepRunId entries.
- Reviewer checklist item: "Does this handler insert a row? If yes, is there a select-first guard or a UNIQUE constraint that makes the insert idempotent on retry?"

## Where It Should Land

- Pair this with Insight-180 in the architecture spec L3 §"Harness-governed side effects" — the two together describe the contract for any side-effecting handler: (1) require stepRunId at entry, (2) be idempotent on retry.
- Add to the §Constraints section of any future brief that introduces a new system-agent handler: "Handler must be idempotent on retry — heartbeat retries are allowed."
- Sub-brief #2 (Brief 226) inherits this responsibility for the real analyser logic.
