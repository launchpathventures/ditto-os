# Brief: Budget Spend-Check Ordering (P0 safety)

**Date:** 2026-04-16
**Status:** complete
**Depends on:** Brief 169 (parent), Brief 107 (budget infrastructure)

> **Scope adjustment (2026-04-16):** On implementation the audit premise was
> found to be subtly different from the reality: `recordSpend` is not yet
> called from any production path — budgets are currently decorative. The
> brief's original reservation design is still the right target once LLM
> step-costs get wired to `recordSpend`. For now, this brief delivered a
> focused subset: a pre-dispatch budget guard that prevents staged outbound
> actions from shipping on a goal whose budget is already marked exhausted.
> Full reserve/commit/release lifecycle deferred to when spend recording
> gets wired.
**Unlocks:** Budget can be trusted as a hard stop on outbound action spend.

## Goal

- **Roadmap phase:** Phase 11 — network agent / budget infrastructure
- **Capabilities:** Closes P0 risk: a step can execute and dispatch an outbound action (email, payment) before the spend check runs, causing user-visible cost overrun on an "exhausted" budget.

## Context

Brief 107 established `budgets` and `budgetTransactions` tables, with `recordSpend()` throwing on overspend. The guard fires after the action has already executed and any external side-effect (email sent, API call made) has happened — `recordSpend` throws on the DB write, but the email is already in flight. `heartbeat.ts` around `lines 968-1005` pauses the goal after detecting exhaustion, but this is *reactive*: the specific step that tipped the budget has already shipped its side-effect.

This is a classic *check-then-act* vs *act-then-check* ordering bug. For network agents operating at critical tier this can be the difference between a $200 cap and a $230 bill — small in absolute terms, large in trust.

## Objective

No outbound-cost step dispatches its external side-effect if completing it would exceed the remaining budget. The check happens before dispatch, and the dispatch is atomic with the spend record.

## Non-Goals

- Per-step cost estimation for arbitrary LLM calls (covered by provider cost tracking).
- Budget reservation across multi-step atomic batches (future concern).
- Refund / partial-credit flows.

## Inputs

1. `src/engine/budget.ts` — `recordSpend`, `getBudgetStatus`, `checkBudgetExhausted`
2. `packages/core/src/harness/handlers/outbound-quality-gate.ts` — where staged outbound actions dispatch
3. `src/engine/heartbeat.ts` around the budget integration (`recordSpend` call site)
4. `docs/briefs/complete/107-budget-infrastructure.md` if archived, else state.md section

## Constraints

- Must not break existing budget tests.
- Must not require schema change — work with current `budgets.totalCents` / `spentCents`.
- Cost estimate is already available per staged action (Brief 129 staged outbound actions carry estimated cost).

## Provenance

| What | Source | Level | Why |
|------|--------|-------|-----|
| Reserve-then-commit pattern | Payment processor norms (Stripe PaymentIntent `requires_capture`) | pattern | Industry-standard two-phase spend guard |
| Pre-check in outbound-quality-gate | `outbound-quality-gate.ts` existing structure | adopt | Already the last pipeline stop before dispatch |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/budget.ts` | Modify: add `reserveSpend(goalId, cents)` that atomically checks + increments in a DB transaction; add `commitSpend(reservationId)` and `releaseReservation(reservationId)` |
| `packages/core/src/db/schema.ts` | Modify: add `budgetReservations` table (reservationId PK, goalId, amountCents, createdAt, state: reserved\|committed\|released, expiresAt) |
| `drizzle/NNNN_budget_reservations.sql` | Create: migration (follow Insight-190 journal protocol) |
| `packages/core/src/harness/handlers/outbound-quality-gate.ts` | Modify: before dispatching each staged action, `reserveSpend` estimated cost; dispatch only if reserved. On dispatch success → `commitSpend`. On failure → `releaseReservation`. |
| `src/engine/heartbeat.ts` | Modify: remove the post-hoc `recordSpend` try/catch pattern at the budget integration point; spend recording now happens via commit |
| `src/engine/budget.test.ts` | Modify: add reserve/commit/release lifecycle tests, including concurrency (two reservations racing on a tight budget) |
| `packages/core/src/harness/handlers/outbound-quality-gate.test.ts` | Modify: test "batch of 5 actions, budget allows 3, actions 4-5 are flagged not dispatched" |

## User Experience

- **Jobs affected:** Decide (trust budget caps as hard).
- **Process-owner perspective:** "Top up" notifications arrive *before* the cap is breached, not after.

## Acceptance Criteria

1. [ ] `reserveSpend` atomically checks + increments `spentCents` (including pending reservations) in a transaction; throws if reservation would exceed `totalCents`.
2. [ ] Outbound-quality-gate reserves per action before dispatch; only dispatches actions whose reservation succeeded.
3. [ ] Dispatch failure releases the reservation (no leaked reserved cents).
4. [ ] Reservation TTL: unused reservations auto-release after 5 minutes (prevents leakage if handler crashes between reserve and commit).
5. [ ] Concurrency test: two handlers reserving simultaneously against a tight budget — exactly one succeeds, the other is rejected, no double-spend.
6. [ ] Existing budget tests pass unchanged.
7. [ ] Migration journal index is next available (Insight-190).

## Review Process

1. Review agent checks: no remaining `recordSpend`-after-dispatch in the codebase; all outbound cost paths go through reserve → commit.
2. Verify TTL cleanup job runs (document trigger — heartbeat or cron).

## Smoke Test

```bash
pnpm db:generate   # verify migration generates cleanly
pnpm test -- budget outbound-quality-gate
```

## After Completion

Update `docs/state.md`: "Brief 172 — budget spend-check ordering (2026-04-16, complete): reserve-then-commit via new `budgetReservations` table. Outbound-quality-gate reserves before dispatch; no step can tip the budget post-hoc."
