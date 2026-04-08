/**
 * Ditto — Budget Infrastructure (Brief 107)
 *
 * Per-goal budget ledger with Stripe payment integration.
 * Tracks allocation and spend per sub-goal. Budget exhaustion
 * triggers a soft stop — Alex reports status and requests top-up.
 *
 * All amounts in integer cents — no floating-point arithmetic.
 * Transactions are immutable — once recorded, never edited.
 *
 * Provenance: Brief 107, professional services engagement model,
 * simplified double-entry bookkeeping.
 */

import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import type { BudgetStatus } from "../db/schema";

// ============================================================
// Types
// ============================================================

export interface BudgetStatusResult {
  budgetId: string;
  goalWorkItemId: string;
  totalCents: number;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  status: BudgetStatus;
}

// ============================================================
// Budget Lifecycle
// ============================================================

/**
 * Create a budget for a goal work item.
 * Initial status is "created" — transitions to "funded" after Stripe payment.
 */
export async function createBudget(
  goalWorkItemId: string,
  totalCents: number,
  userId: string,
): Promise<{ id: string }> {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("totalCents must be a positive integer");
  }

  const [budget] = await db
    .insert(schema.budgets)
    .values({
      goalWorkItemId,
      userId,
      totalCents,
      status: "created",
    })
    .returning({ id: schema.budgets.id });

  return budget;
}

/**
 * Record a fund load (Stripe payment confirmed).
 * Creates an immutable "load" transaction and sets budget status to "funded".
 */
export async function recordLoad(
  budgetId: string,
  amountCents: number,
  stripePaymentId: string,
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  await db.insert(schema.budgetTransactions).values({
    budgetId,
    type: "load",
    amountCents,
    description: "Stripe payment",
    stripePaymentId,
  });

  await db
    .update(schema.budgets)
    .set({ status: "funded", updatedAt: new Date() })
    .where(eq(schema.budgets.id, budgetId));
}

/**
 * Record spend against a budget.
 * Creates an immutable "spend" transaction and increments spentCents.
 * Fails if the spend would exceed totalCents.
 * Wrapped in a transaction to prevent race conditions (Flag 3).
 */
export async function recordSpend(
  budgetId: string,
  amountCents: number,
  description: string,
  subGoalId?: string,
): Promise<void> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  db.transaction((tx) => {
    // Load current budget state
    const [budget] = tx
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, budgetId))
      .limit(1)
      .all();

    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const newSpent = budget.spentCents + amountCents;
    if (newSpent > budget.totalCents) {
      throw new Error(
        `Spend of ${amountCents} cents would exceed budget. ` +
        `Current: ${budget.spentCents}/${budget.totalCents} cents.`
      );
    }

    // Create immutable transaction record
    tx.insert(schema.budgetTransactions).values({
      budgetId,
      type: "spend",
      amountCents,
      description,
      subGoalId: subGoalId ?? null,
    }).run();

    // Update running total
    const newStatus: BudgetStatus = newSpent >= budget.totalCents ? "exhausted" : "active";
    tx
      .update(schema.budgets)
      .set({
        spentCents: newSpent,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.budgets.id, budgetId))
      .run();
  });
}

/**
 * Get budget status for a goal work item.
 * Returns null if no budget exists for this goal.
 */
export async function getBudgetStatus(
  goalWorkItemId: string,
): Promise<BudgetStatusResult | null> {
  const [budget] = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.goalWorkItemId, goalWorkItemId))
    .limit(1);

  if (!budget) return null;

  const remainingCents = budget.totalCents - budget.spentCents;
  const percentUsed = budget.totalCents > 0
    ? Math.round((budget.spentCents / budget.totalCents) * 100)
    : 0;

  return {
    budgetId: budget.id,
    goalWorkItemId: budget.goalWorkItemId,
    totalCents: budget.totalCents,
    spentCents: budget.spentCents,
    remainingCents,
    percentUsed,
    status: budget.status as BudgetStatus,
  };
}

/**
 * Format budget status for LLM context.
 * No financial details (transaction IDs, card info) — just the summary.
 * AC13: Alex sees only "Budget: $X remaining of $Y"
 */
export function formatBudgetForLlm(status: BudgetStatusResult): string {
  const remaining = (status.remainingCents / 100).toFixed(2);
  const total = (status.totalCents / 100).toFixed(2);
  return `Budget: $${remaining} remaining of $${total} (${status.percentUsed}% used)`;
}

/**
 * Check if a goal's budget is at the warning threshold (90%+).
 * Returns null if no budget exists or not at warning level.
 */
export async function checkBudgetWarning(
  goalWorkItemId: string,
): Promise<BudgetStatusResult | null> {
  const status = await getBudgetStatus(goalWorkItemId);
  if (!status) return null;
  if (status.percentUsed >= 90 && status.status !== "exhausted" && status.status !== "closed") {
    return status;
  }
  return null;
}

/**
 * Check if a goal's budget is exhausted (100% spent).
 * Returns null if no budget or not exhausted.
 */
export async function checkBudgetExhausted(
  goalWorkItemId: string,
): Promise<BudgetStatusResult | null> {
  const status = await getBudgetStatus(goalWorkItemId);
  if (!status) return null;
  if (status.percentUsed >= 100 || status.status === "exhausted") {
    return status;
  }
  return null;
}

// ============================================================
// Exhaustion Notification (AC9, Flag 4+6)
// ============================================================

export interface TopUpRequest {
  subject: string;
  body: string;
  checkoutUrl: string;
}

/**
 * Build exhaustion notification content for notifyUser().
 * Includes spend summary, goal description, and top-up link.
 * AC9: "Budget update: $X of $Y spent. [sub-goal progress]. Top up to continue?"
 */
export function buildExhaustionNotification(
  budgetStatus: BudgetStatusResult,
  goalDescription: string,
): TopUpRequest {
  const spent = (budgetStatus.spentCents / 100).toFixed(2);
  const total = (budgetStatus.totalCents / 100).toFixed(2);
  const baseUrl = process.env.NETWORK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const checkoutUrl = `${baseUrl}/admin?budget=topup&budgetId=${budgetStatus.budgetId}`;

  return {
    subject: `Budget update: ${goalDescription}`,
    body:
      `Your budget for "${goalDescription}" has been fully used.\n\n` +
      `Spent: $${spent} of $${total}\n\n` +
      `Here's what was accomplished so far. To continue working on this goal, ` +
      `you can top up the budget.\n\n` +
      `Top up: ${checkoutUrl}`,
    checkoutUrl,
  };
}

/**
 * Request a top-up for an exhausted budget.
 * Sends an exhaustion notification to the user via notifyUser().
 * Returns the notification content for the caller to send.
 *
 * AC9: Exhaustion notification with spend summary and top-up link.
 * Flag 6: requestTopUp() — brief-specified function.
 */
export async function requestTopUp(
  goalWorkItemId: string,
): Promise<TopUpRequest | null> {
  const budgetStatus = await getBudgetStatus(goalWorkItemId);
  if (!budgetStatus || budgetStatus.status !== "exhausted") return null;

  // Look up goal description
  const [goalItem] = await db
    .select({ content: schema.workItems.content })
    .from(schema.workItems)
    .where(eq(schema.workItems.id, goalWorkItemId))
    .limit(1);

  const goalDescription = goalItem?.content || "your goal";

  return buildExhaustionNotification(budgetStatus, goalDescription);
}
