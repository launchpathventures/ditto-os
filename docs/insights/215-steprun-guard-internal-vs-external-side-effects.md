# Insight-215: Step-Run Guard — Internal vs External Side-Effecting Functions

**Date:** 2026-04-27
**Trigger:** Brief 227 Reviewer pass — promote/demote/dismiss memory-scope tools required Insight-180 guard but the brief's intent ("internal DB writes") didn't fit Insight-180's stated target ("external side effects: social publishing, payments, webhook dispatches").
**Layers affected:** L3 Harness
**Status:** active

## The Insight

Insight-180's `stepRunId` parameter guard was originally written for **externally-observable side effects** — `publishPost()` to LinkedIn, payment dispatch, webhook fan-out. The proof-of-harness-context invariant matters there because trust gates, outbound-quality-gate, and audit logging depend on the call traversing the harness pipeline.

Brief 227 introduced three Self tools — `promote_memory_scope`, `demote_memory_scope`, `dismiss_promotion_proposal` — that produce **internal DB-only side effects**: `UPDATE memories SET scopeType=…`, `INSERT INTO activities …`. The brief mandated the guard anyway. But these tools are user-direct actions (tap "[Promote to all projects]" in a memory detail surface); the user's web session has no real harness `stepRunId` to supply.

The pattern that ships: **the guard is enforced uniformly, but the proof-of-context can be a sentinel string** for user-direct flows. The web API route synthesises `web-direct-action:<userEmail>` and passes it as `stepRunId`. The guard's truthy check passes; the audit trail records the actor; no programmatic backdoor exists (any future caller still has to provide *some* stepRunId, which is enough friction to prevent accidental invocation from outside an explicit user-or-harness context).

## Implications

- **Guard preserved as universal contract.** Don't carve out exceptions per tool — every tool that writes DB rows or external side effects requires the guard. This keeps the discipline auditable.
- **Sentinel pattern for user-direct flows.** When a user-direct API route invokes a guarded tool, the route synthesises a sentinel string (`web-direct-action:<userEmail>`, `cli-action:<actor>`, etc.). The sentinel is **not** a real `stepRuns.id` — it doesn't validate against the table — but it satisfies the truthy check.
- **Audit trail carries the actor identity separately.** Pair the sentinel with `activities.actorId` (also added in Brief 227 per Reviewer IMP-2) — `actorId` is the load-bearing audit field; `stepRunId` is the proof-of-context guard. Don't conflate them.
- **External side effects still need REAL stepRunId.** `publishPost`, payment dispatch, webhook fan-out — these traverse the trust gate + outbound-quality-gate. They MUST run inside step execution; sentinels are not appropriate.
- **Test mode bypass remains.** `DITTO_TEST_MODE=true` skips the guard for unit tests. Unchanged.

## Where It Should Land

Insight-180 itself should be amended (or this insight referenced from it) to document the two regimes:

1. **External side-effecting functions** (`publishPost`, payment, webhook dispatch) — require real `stepRunId` from harness context. No sentinel acceptable. Trust + outbound-quality enforcement depends on it.
2. **Internal DB-only side-effecting functions** (memory scope changes, work-item state transitions, activity logging) — accept sentinel `stepRunId` from authenticated user-direct API routes. Audit identity comes from `actorId`, not `stepRunId`.

Architect to absorb on next ADR-003 / Insight-180 maintenance pass. Until then, Brief 227's promote/demote/dismiss tools are the canonical pattern.
