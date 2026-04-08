# Brief 107: Budget Infrastructure — Per-Goal Spend Tracking with Stripe

**Date:** 2026-04-08
**Status:** draft
**Depends on:** Brief 102 (goal-level reasoning — defines `workspace_budgeted` action boundary and `GoalDecomposition` type)
**Unlocks:** Full budget-driven goal execution, `workspace_budgeted` action boundary activation

## Goal

- **Roadmap phase:** Phase 11+ (Goal-Seeking Orchestration — budget layer)
- **Capabilities:** Per-goal budget ledger, Stripe payment integration for loading funds, spend tracking per sub-goal, budget exhaustion handling (report + top-up request)

## Context

The goal-seeking orchestration (Briefs 101-104) defines three action boundaries: `front_door`, `workspace`, and `workspace_budgeted`. The first two work without money. The third requires Alex to track and allocate a real budget — the user loads money via Stripe, Alex allocates it across sub-goals, tracks spend, and reports back when the budget is exhausted requesting a top-up.

This is how a real advisor works: the client provides a budget, the advisor allocates and reports on spend, and asks for more when needed.

## Objective

Build the budget infrastructure that enables per-goal budgeted execution: Stripe payment integration for loading funds, a budget ledger tracking allocation and spend per sub-goal, and exhaustion handling where Alex reports status and requests a top-up.

## Non-Goals

- **Subscription billing** — this is per-goal budget loading, not monthly SaaS billing
- **Automated ad platform spend** — Alex can recommend ad spend but this brief doesn't integrate with Meta/Google Ads. The budget tracks what the user authorises Alex to spend, not programmatic ad buying.
- **Multi-currency** — USD only for V1. Currency support is a future extension.
- **Refunds** — if a goal is cancelled, remaining budget stays as credit. No Stripe refund flow in V1.
- **Per-workspace budgets** — budgets are per-goal only. Workspace-level spending limits are future work.

## Inputs

1. `docs/briefs/101-find-or-build-orchestration.md` — defines `workspace_budgeted` action boundary
2. `docs/briefs/102-goal-level-reasoning.md` — defines `ActionBoundary` type and `getToolSetForContext()`
3. `src/engine/heartbeat.ts` — goal heartbeat loop needs budget checks
4. `src/engine/system-agents/orchestrator.ts` — orchestrator needs budget context for allocation
5. `src/db/schema.ts` — budget table
6. `packages/web/app/api/v1/network/admin/login/route.ts` — existing auth pattern

## Constraints

- **Stripe Checkout** for loading funds — redirect to Stripe-hosted page, webhook for confirmation. No custom payment form (PCI compliance).
- Budget is per-goal — created when user says "here's $X for this goal"
- Spend records are immutable — once recorded, cannot be edited (audit trail)
- Budget exhaustion is a **soft stop** — Alex reports status, pauses execution, requests top-up. Does NOT hard-stop mid-action.
- Budget status must be visible in goal progress views and briefings
- All financial data (amounts, transactions) stored in cents (integer) to avoid floating-point issues
- Stripe webhook must be signature-validated (same pattern as AgentMail inbound webhook)
- No financial data in LLM context — Alex sees "budget remaining: $1,200" not transaction details

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Stripe Checkout integration | Stripe docs (checkout sessions) | depend | Industry standard, PCI-compliant, well-documented |
| Webhook signature validation | Existing AgentMail inbound webhook pattern | adopt | Same HMAC validation pattern |
| Budget ledger pattern | Double-entry bookkeeping (simplified) | pattern | Immutable spend records, running balance |
| Per-goal budget | Professional services engagement model | pattern | Client funds a specific engagement, advisor reports on spend |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/db/schema.ts` | Modify: Add `budgets` table (id, goalWorkItemId, totalCents, spentCents, status), `budgetTransactions` table (id, budgetId, type, amountCents, description, stripePaymentId, createdAt) |
| `src/engine/budget.ts` | Create: `createBudget()`, `recordSpend()`, `getBudgetStatus()`, `requestTopUp()`. Budget lifecycle management. |
| `src/engine/budget.test.ts` | Create: Unit tests for budget lifecycle, spend tracking, exhaustion detection |
| `packages/web/app/api/v1/network/budget/checkout/route.ts` | Create: POST — creates Stripe Checkout session for loading funds into a goal budget |
| `packages/web/app/api/v1/network/budget/webhook/route.ts` | Create: POST — Stripe webhook handler, signature-validated, records successful payment as budget transaction |
| `src/engine/heartbeat.ts` | Modify: Goal heartbeat checks budget before executing sub-goals. If exhausted, pauses and triggers report-back. |
| `src/engine/notify-user.ts` | Modify: Budget exhaustion notification uses existing `notifyUser()` — "Budget update: $1,800 of $2,000 spent. [sub-goal progress]. Top up to continue?" with review page link |
| `src/test-utils.ts` | Modify: Add `budgets` and `budgetTransactions` tables to `createTables()` |

## User Experience

- **Jobs affected:** Delegate (assign budget to goal), Orient (see spend status), Decide (top up or stop)
- **Primitives involved:** StatusCardBlock (budget status in goal view), AlertBlock (budget exhaustion warning)
- **Process-owner perspective:** User says "Here's $2,000 for getting Auckland clients." Alex shows budget allocation plan via review page. User clicks "Fund this" → Stripe Checkout → payment confirmed → Alex starts working. Weekly pipeline briefing includes spend status. When budget hits 90%, Alex sends proactive warning. At exhaustion, Alex pauses and sends full report: "Here's what I've done, here's the ROI so far, top up $X to continue."
- **Interaction states:** Budget created (unfunded) → Funded (Stripe confirmed) → Active (spend being tracked) → Warning (90% spent) → Exhausted (paused, top-up requested) → Topped up (resumed)
- **Designer input:** Not invoked. Budget status integrates into existing goal progress views. Stripe Checkout is Stripe-hosted (no custom UI needed). Top-up request uses existing email/review-page surface.

## Acceptance Criteria

1. [ ] `budgets` table: id, goalWorkItemId (unique), totalCents (integer), spentCents (integer, default 0), status (created/funded/active/exhausted/closed), createdAt, updatedAt
2. [ ] `budgetTransactions` table: id, budgetId, type (load/spend/refund), amountCents (integer), description, subGoalId (nullable), stripePaymentId (nullable), createdAt
3. [ ] `createBudget(goalWorkItemId, totalCents)` creates a budget in `created` status
4. [ ] Stripe Checkout session created via `/api/v1/network/budget/checkout` — redirects user to Stripe-hosted payment page, returns to Ditto on success
5. [ ] Stripe webhook validates signature (HMAC, same pattern as inbound webhook), records payment as `load` transaction, sets budget status to `funded`
6. [ ] `recordSpend(budgetId, amountCents, description, subGoalId)` creates a `spend` transaction and increments `spentCents`. Fails if would exceed `totalCents`.
7. [ ] `getBudgetStatus(goalWorkItemId)` returns: totalCents, spentCents, remainingCents, percentUsed, status
8. [ ] Goal heartbeat checks budget before executing each sub-goal. If `percentUsed >= 100`, pauses goal and triggers exhaustion notification.
9. [ ] Exhaustion notification via `notifyUser()`: includes spend summary, sub-goal progress, ROI metrics if available, and "top up to continue" with Stripe link
10. [ ] Proactive warning at 90% spend — Alex mentions in next briefing: "Budget is 90% spent. Here's what's been done so far."
11. [ ] All amounts stored as integer cents — no floating-point arithmetic
12. [ ] Budget transactions are immutable — no update or delete operations
13. [ ] No financial details (transaction IDs, amounts, card info) passed to LLM context. Alex sees only: "Budget: $1,200 remaining of $2,000"
14. [ ] Unit tests cover: budget creation, spend recording, exhaustion detection, overspend rejection, webhook signature validation

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Stripe security (webhook signature, no PCI data stored), budget arithmetic (integer cents, no float), exhaustion handling, existing heartbeat integration
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Unit tests
pnpm test -- --grep "budget"

# Schema migration
pnpm cli sync

# Type check
pnpm run type-check

# Manual: create budget, record spend, verify exhaustion detection
```

## After Completion

1. Update `docs/state.md` with budget infrastructure
2. Update `docs/architecture.md` — budget as a harness constraint
3. `workspace_budgeted` action boundary becomes activatable (Brief 102 dependency satisfied)

Reference docs updated: `docs/architecture.md` (budget layer)
